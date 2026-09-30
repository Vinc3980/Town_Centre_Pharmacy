import { PaymentMethod, Prisma, SaleStatus } from "@prisma/client";
import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { recordAudit } from "../services/auditService";
import { notifyLowStock, notifyRefundRequested, notifyRefundApproved, notifyRefundRejected } from "../services/notificationService";
import { emitEvent, SOCKET_EVENTS } from "../sockets";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";
import { addMoney, multiplyMoney, roundMoney, subtractMoney } from "../utils/money";
import { isValidUuid } from "../utils/security";
import { serialize, serializeMany } from "../utils/serialize";
import { withOptionalSession } from "../utils/withTransaction";

const PAYMENT_METHODS = ["cash", "mobile_money", "card", "bank_transfer", "credit", "other", "insurance"] as const;

const saleItemInput = z.object({
  medicine: z.string(),
  quantity: z.number().positive(),
  discount: z.number().nonnegative().optional(),
});

const paymentInput = z.object({
  method: z.enum(PAYMENT_METHODS),
  amount: z.number().positive(),
  reference: z.string().optional(),
});

const createSaleSchema = z.object({
  items: z.array(saleItemInput).min(1),
  customer: z.string().optional(),
  payments: z.array(paymentInput).min(1),
  amountReceived: z.number().nonnegative().optional(),
  tax: z.number().nonnegative().optional(),
  discount: z.number().nonnegative().optional(),
  holdId: z.string().optional(),
  dueDate: z.string().optional(),
  saleType: z.enum(["retail", "insurance"]).default("retail"),
  insuranceProvider: z.string().trim().min(1).max(120).optional(),
  policyOrNhisNumber: z.string().trim().min(1).max(60).optional(),
  prescriptionReference: z.string().trim().min(1).max(120).optional(),
});

const holdSaleSchema = z.object({
  items: z.array(saleItemInput).min(1),
  customer: z.string().optional(),
  discount: z.number().nonnegative().optional(),
  tax: z.number().nonnegative().optional(),
  saleType: z.enum(["retail", "insurance"]).optional(),
  insuranceProvider: z.string().trim().min(1).max(120).optional(),
  policyOrNhisNumber: z.string().trim().min(1).max(60).optional(),
});

const resumeSaleSchema = z.object({
  payments: z.array(paymentInput).min(1),
  amountReceived: z.number().nonnegative().optional(),
  prescriptionReference: z.string().trim().min(1).max(120).optional(),
});

const returnItemSchema = z.object({
  medicine: z.string(),
  batch: z.string(),
  returnQuantity: z.number().positive(),
  condition: z.enum(["resaleable", "damaged"]),
  reason: z.string().min(1),
});

const refundSaleSchema = z.object({
  items: z.array(returnItemSchema).min(1),
});

const approveRefundSchema = z.object({
  rejectionReason: z.string().optional(),
});

async function nextTransactionNumber() {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
  const count = await prisma.sale.count({
    where: { transactionNumber: { startsWith: `INV-${dateStr}-` } },
  });
  return `INV-${dateStr}-${String(count + 1).padStart(4, "0")}`;
}

async function nextReturnNumber() {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
  const count = await prisma.saleReturn.count({
    where: { transactionNumber: { startsWith: `RET-${dateStr}-` } },
  });
  return `RET-${dateStr}-${String(count + 1).padStart(4, "0")}`;
}

async function nextPaymentReference(method: string): Promise<string | undefined> {
  const prefixes: Record<string, string> = {
    mobile_money: "MMO",
    card: "CARD",
    bank_transfer: "BTR",
    credit: "CRD",
    other: "REF",
    insurance: "INS",
  };
  const prefix = prefixes[method];
  if (!prefix) return undefined;
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
  const count = await prisma.salePayment.count({
    where: { reference: { startsWith: `${prefix}-${dateStr}-` } },
  });
  return `${prefix}-${dateStr}-${String(count + 1).padStart(4, "0")}`;
}

const saleChildrenInclude = {
  items: { orderBy: { seq: "asc" as const } },
  payments: { orderBy: { seq: "asc" as const } },
};

async function deductInventory(
  items: { medicine: string; quantity: number; discount: number }[],
  tx: Prisma.TransactionClient,
  performedBy?: string,
  opts?: { prescriptionReference?: string; permissions?: string[] },
) {
  const resolvedItems: {
    medicine: string; batch: string; name: string; quantity: number;
    unitPrice: number; discount: number; subtotal: number; costOfGoods: number;
  }[] = [];

  for (const item of items) {
    const medicine = await tx.medicine.findUnique({ where: { id: item.medicine } });
    if (!medicine) throw new ApiError(404, `Medicine not found: ${item.medicine}`);
    if (medicine.status === "discontinued") {
      throw new ApiError(400, `${medicine.name} has been discontinued and cannot be sold`);
    }
    if ((medicine.prescriptionRequired || medicine.isControlledSubstance) && !opts?.prescriptionReference) {
      throw new ApiError(403, `${medicine.name} requires a valid prescription before it can be sold`);
    }
    if (medicine.isControlledSubstance && !(opts?.permissions ?? []).includes("dispense_controlled_substances")) {
      throw new ApiError(403, "You don't have permission to dispense controlled substances");
    }

    const batches = await tx.medicineBatch.findMany({
      where: { medicineId: medicine.id, quantity: { gt: 0 } },
      orderBy: { expiryDate: "asc" },
    });
    const now = new Date();
    const validBatches = batches.filter((b) => b.expiryDate > now);
    let remaining = item.quantity;
    const itemDiscount = item.discount ?? 0;

    for (const batch of validBatches) {
      if (remaining <= 0) break;
      const take = Math.min(batch.quantity, remaining);
      await tx.medicineBatch.update({
        where: { id: batch.id },
        data: { quantity: { decrement: take } },
      });
      remaining -= take;

      resolvedItems.push({
        medicine: medicine.id,
        batch: batch.id,
        name: medicine.name,
        quantity: take,
        unitPrice: medicine.sellingPrice,
        discount: roundMoney(itemDiscount * (take / item.quantity)),
        subtotal: roundMoney(multiplyMoney(medicine.sellingPrice, take) - itemDiscount * (take / item.quantity)),
        costOfGoods: roundMoney(multiplyMoney(batch.purchasePrice, take)),
      });

      await tx.inventoryMovement.create({
        data: {
          medicineId: medicine.id,
          batchId: batch.id,
          type: "sale",
          quantityChange: -take,
          performedById: performedBy as string,
        },
      });
    }

    if (remaining > 0) {
      throw new ApiError(409, `Not enough stock for ${medicine.name} (short by ${remaining})`);
    }
  }

  return resolvedItems;
}

function computeTotals(resolvedItems: { unitPrice: number; quantity: number; discount: number; costOfGoods: number }[], tax: number, saleDiscount: number) {
  const subtotal = roundMoney(resolvedItems.reduce((s, it) => addMoney(s, multiplyMoney(it.unitPrice, it.quantity)), 0));
  const itemDiscount = roundMoney(resolvedItems.reduce((s, it) => addMoney(s, it.discount), 0));
  const costOfGoods = roundMoney(resolvedItems.reduce((s, it) => addMoney(s, it.costOfGoods), 0));
  const discountTotal = addMoney(itemDiscount, saleDiscount);
  const total = roundMoney(subtractMoney(addMoney(subtotal, tax), discountTotal));
  return { subtotal, itemDiscount, costOfGoods, discountTotal, total };
}

export const createSale = asyncHandler(async (req: Request, res: Response) => {
  const data = createSaleSchema.parse(req.body);
  const userHasDiscount = req.user!.permissions.includes("apply_discounts");

  const saleDiscount = data.discount ?? 0;
  if (saleDiscount > 0 && !userHasDiscount) {
    throw new ApiError(403, "You don't have permission to apply discounts");
  }
  for (const item of data.items) {
    if ((item.discount ?? 0) > 0 && !userHasDiscount) {
      throw new ApiError(403, "You don't have permission to apply item discounts");
    }
  }

  if (data.saleType === "insurance") {
    if (!data.customer) throw new ApiError(400, "A registered customer is required for insurance sales");
    if (!data.insuranceProvider) throw new ApiError(400, "Insurance provider is required for insurance sales");
    if (!data.policyOrNhisNumber) throw new ApiError(400, "Policy or NHIS number is required for insurance sales");
  }

  let result;
  try {
    const cashier = await prisma.user.findUnique({
      where: { id: req.user!.sub },
      select: { branch: true },
    });
    const saleBranch = cashier?.branch || "Main Branch";
    result = await withOptionalSession(async (tx) => {
    const itemsToDeduct = data.items.map((it) => ({
      medicine: it.medicine, quantity: it.quantity, discount: it.discount ?? 0,
    }));

    const resolvedItems = await deductInventory(itemsToDeduct, tx, req.user!.sub, {
      prescriptionReference: data.prescriptionReference,
      permissions: req.user!.permissions,
    });

    const tax = data.tax ?? 0;
    const { subtotal, discountTotal, costOfGoods, total } = computeTotals(resolvedItems, tax, saleDiscount);

    if (total < 0) throw new ApiError(400, "Total cannot be negative");

    const totalPaid = roundMoney(data.payments.reduce((s, p) => addMoney(s, p.amount), 0));
    const amountReceived = data.amountReceived ?? totalPaid;
    const change = roundMoney(subtractMoney(amountReceived, total));

    const isCreditSale = data.payments.length === 1 && data.payments[0].method === "credit";

    if (isCreditSale) {
      if (!data.customer) throw new ApiError(400, "Customer is required for credit sales");
    } else if (totalPaid < total && !data.holdId) {
      throw new ApiError(400, `Insufficient payment. Total: ${total.toFixed(2)}, Paid: ${totalPaid.toFixed(2)}`);
    }

    const outstandingAmount = isCreditSale ? total : Math.max(0, roundMoney(subtractMoney(total, totalPaid)));

    const payments = data.payments.map((p) => ({
      method: p.method,
      amount: p.amount,
      reference: p.reference,
      date: new Date(),
    }));

    for (const p of payments) {
      if (p.method !== "cash" && !p.reference) {
        p.reference = await nextPaymentReference(p.method);
      }
    }

    let createdSale;
    const dueDateParsed = data.dueDate ? new Date(data.dueDate) : undefined;
    const creditDueDate = isCreditSale && dueDateParsed && !isNaN(dueDateParsed.getTime())
      ? dueDateParsed
      : isCreditSale
        ? (() => { const d = new Date(); d.setDate(d.getDate() + 14); return d; })()
        : undefined;

    const itemRows = resolvedItems.map((it, seq) => ({
      medicineId: it.medicine, batchId: it.batch, name: it.name, quantity: it.quantity,
      unitPrice: it.unitPrice, discount: it.discount, subtotal: it.subtotal, seq,
    }));
    const paymentRows = payments.map((p, seq) => ({ ...p, seq }));

    if (data.holdId) {
      const heldSale = await tx.sale.findUnique({ where: { id: data.holdId }, select: { id: true } });
      if (heldSale) {
        await tx.saleItem.deleteMany({ where: { saleId: data.holdId } });
        await tx.salePayment.deleteMany({ where: { saleId: data.holdId } });
        await tx.saleItem.createMany({ data: itemRows.map((it) => ({ ...it, saleId: data.holdId! })) });
        await tx.salePayment.createMany({ data: paymentRows.map((p) => ({ ...p, saleId: data.holdId! })) });
        createdSale = await tx.sale.update({
          where: { id: data.holdId },
          data: {
            transactionNumber: `INV-${Date.now()}`,
            customerId: data.customer || undefined,
            cashierId: req.user!.sub,
            branch: saleBranch,
            subtotal, discount: discountTotal, tax, total, costOfGoods,
            paymentMethod: payments[0]?.method ?? "cash",
            amountReceived, changeAmount: change, outstandingAmount,
            dueDate: creditDueDate,
            status: "completed",
            saleType: data.saleType,
            insuranceProvider: data.insuranceProvider || undefined,
            policyOrNhisNumber: data.policyOrNhisNumber || undefined,
            prescriptionReference: data.prescriptionReference || undefined,
            dispensedById: data.prescriptionReference ? req.user!.sub : undefined,
          },
          include: saleChildrenInclude,
        });
      } else {
        createdSale = await tx.sale.findUnique({ where: { id: data.holdId }, include: saleChildrenInclude });
      }
    } else {
      createdSale = await tx.sale.create({
        data: {
          transactionNumber: await nextTransactionNumber(),
          customerId: data.customer || undefined,
          cashierId: req.user!.sub,
          branch: saleBranch,
          subtotal, discount: discountTotal, tax, total, costOfGoods,
          paymentMethod: payments[0]?.method ?? "cash",
          amountReceived, changeAmount: change, outstandingAmount,
          dueDate: creditDueDate,
          status: "completed",
          saleType: data.saleType,
          insuranceProvider: data.insuranceProvider || undefined,
          policyOrNhisNumber: data.policyOrNhisNumber || undefined,
          prescriptionReference: data.prescriptionReference || undefined,
          dispensedById: data.prescriptionReference ? req.user!.sub : undefined,
          items: { create: itemRows },
          payments: { create: paymentRows },
        },
        include: saleChildrenInclude,
      });
    }

    if (!createdSale) throw new ApiError(500, "Failed to create sale");

    for (const item of resolvedItems) {
      const movement = await tx.inventoryMovement.findFirst({
        where: {
          medicineId: item.medicine, batchId: item.batch,
          type: "sale", quantityChange: -item.quantity,
        },
      });
      if (movement) {
        await tx.inventoryMovement.update({
          where: { id: movement.id },
          data: { performedById: req.user!.sub },
        });
      }
    }

    await recordAudit({
      req, action: "SALE_CREATED", module: "sales",
      description: `${req.user!.name} sold ${resolvedItems.map((i) => `${i.quantity} x ${i.name}`).join(", ")} — GHS ${total.toFixed(2)}`,
      entity: "Sale", entityId: createdSale.id,
    });

    if (isCreditSale && data.customer) {
      await tx.customer.update({
        where: { id: data.customer },
        data: { outstandingBalance: { increment: outstandingAmount } },
      });
    }

    if (isCreditSale && creditDueDate) {
      try {
        const { notifyCreditDue } = await import("../services/notificationService");
        const cust = await prisma.customer.findUnique({
          where: { id: data.customer! },
          select: { name: true, phone: true },
        });
        notifyCreditDue({
          saleId: createdSale.id,
          transactionNumber: createdSale.transactionNumber,
          customerName: cust?.name ?? "Customer",
          amount: outstandingAmount,
          dueDate: creditDueDate,
        }).catch(() => {});
      } catch { /* non-blocking */ }
    }

    emitEvent(SOCKET_EVENTS.SALE_CREATED, {
      id: createdSale.id, transactionNumber: createdSale.transactionNumber, cashierName: req.user!.name,
      items: resolvedItems, total, payments, createdAt: createdSale.createdAt,
    });

    for (const item of resolvedItems) {
      const med = await tx.medicine.findUnique({ where: { id: item.medicine } });
      if (!med) continue;
      const remainingStock = await tx.medicineBatch.aggregate({
        where: { medicineId: item.medicine },
        _sum: { quantity: true },
      });
      const stockTotal = remainingStock._sum.quantity ?? 0;
      if (stockTotal <= med.reorderLevel) {
        await notifyLowStock(med.id, med.name, stockTotal, med.reorderLevel);
      }
    }

    return createdSale;
  });
  } catch (err) {
    console.error("[createSale] Error:", err);
    if (err instanceof ApiError) throw err;
    throw new ApiError(500, "Failed to complete sale. Please try again.");
  }

  res.status(201).json(serialize("sale", result));
});

export const getSaleReceipt = asyncHandler(async (req: Request, res: Response) => {
  const sale = await prisma.sale.findUnique({
    where: { id: req.params.id },
    include: {
      cashier: { select: { id: true, name: true, email: true } },
      customer: { select: { id: true, name: true, phone: true, outstandingBalance: true } },
      ...saleChildrenInclude,
    },
  });

  if (!sale) throw new ApiError(404, "Sale not found");

  const pharmacy = await prisma.pharmacy.findFirst();
  const pharmacyName = pharmacy?.name || "Adom Pharmacy";
  const pharmacyAddress = pharmacy
    ? [pharmacy.address, pharmacy.city, pharmacy.region, pharmacy.country].filter(Boolean).join(", ")
    : "123 Liberation Road, Accra, Ghana";
  const pharmacyPhone = pharmacy?.phone || "+233 30 200 1234";
  const pharmacyLogo = pharmacy?.logoUrl || null;

  res.json({
    name: pharmacyName,
    address: pharmacyAddress,
    phone: pharmacyPhone,
    logoUrl: pharmacyLogo,
    receipt: sale.transactionNumber,
    date: sale.createdAt,
    cashier: (sale.cashier as unknown as { name: string })?.name ?? "",
    customer: (sale.customer as unknown as { name?: string })?.name ?? null,
    items: sale.items.map((it) => ({
      name: it.name,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      discount: it.discount,
      subtotal: it.subtotal,
    })),
    subtotal: sale.subtotal,
    discount: sale.discount,
    tax: sale.tax,
    total: sale.total,
    payments: sale.payments.map((p) => ({
      method: p.method,
      amount: p.amount,
      reference: p.reference,
    })),
    paymentMethod: sale.paymentMethod,
    amountReceived: sale.amountReceived,
    change: sale.changeAmount,
    status: sale.status,
  });
});

export const getSaleDetail = asyncHandler(async (req: Request, res: Response) => {
  const sale = await prisma.sale.findUnique({
    where: { id: req.params.id },
    include: {
      cashier: { select: { id: true, name: true, email: true } },
      customer: { select: { id: true, name: true, phone: true } },
      dispensedBy: { select: { id: true, name: true } },
      ...saleChildrenInclude,
    },
  });

  if (!sale) throw new ApiError(404, "Sale not found");

  const returns = await prisma.saleReturn.findMany({
    where: { saleId: sale.id },
    orderBy: { createdAt: "desc" },
    include: { items: { orderBy: { seq: "asc" } } },
  });

  res.json({ sale: serialize("sale", sale), returns: serializeMany("saleReturn", returns) });
});

export const listSales = asyncHandler(async (req: Request, res: Response) => {
  const { from, to, cashier, status, search, paymentMethod, sort } = req.query as Record<string, string>;
  const where: Prisma.SaleWhereInput = {};
  if (status) where.status = status as SaleStatus;
  if (cashier) where.cashierId = cashier;
  if (paymentMethod) where.paymentMethod = paymentMethod as PaymentMethod;
  if (search) {
    where.OR = [
      { transactionNumber: { contains: search, mode: "insensitive" } },
    ];
  }
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    };
  }
  const sales = await prisma.sale.findMany({
    where,
    include: {
      cashier: { select: { id: true, name: true } },
      ...saleChildrenInclude,
    },
    orderBy: { createdAt: sort === "oldest" ? "asc" : "desc" },
    take: 200,
  });
  res.json(serializeMany("sale", sales));
});

export const holdSale = asyncHandler(async (req: Request, res: Response) => {
  const data = holdSaleSchema.parse(req.body);
  const saleType = data.saleType ?? "retail";
  if (saleType === "insurance") {
    if (!data.customer) throw new ApiError(400, "A registered customer is required for insurance sales");
    if (!data.insuranceProvider) throw new ApiError(400, "Insurance provider is required for insurance sales");
    if (!data.policyOrNhisNumber) throw new ApiError(400, "Policy or NHIS number is required for insurance sales");
  }
  const holdCashier = await prisma.user.findUnique({
    where: { id: req.user!.sub },
    select: { branch: true },
  });

  const resolvedItems: {
    medicine: string; batch: string; name: string; quantity: number;
    unitPrice: number; discount: number; subtotal: number; costOfGoods: number;
  }[] = [];

  for (const item of data.items) {
    const medicine = await prisma.medicine.findUnique({ where: { id: item.medicine } });
    if (!medicine) throw new ApiError(404, `Medicine not found: ${item.medicine}`);
    if (medicine.status === "discontinued") {
      throw new ApiError(400, `${medicine.name} has been discontinued`);
    }

    const batches = await prisma.medicineBatch.findMany({
      where: { medicineId: medicine.id, quantity: { gt: 0 } },
      orderBy: { expiryDate: "asc" },
    });
    const now = new Date();
    const validBatches = batches.filter((b) => b.expiryDate > now);
    let remaining = item.quantity;
    const itemDiscount = item.discount ?? 0;

    for (const batch of validBatches) {
      if (remaining <= 0) break;
      const take = Math.min(batch.quantity, remaining);
      remaining -= take;

      resolvedItems.push({
        medicine: medicine.id,
        batch: batch.id,
        name: medicine.name,
        quantity: take,
        unitPrice: medicine.sellingPrice,
        discount: roundMoney(itemDiscount * (take / item.quantity)),
        subtotal: roundMoney(multiplyMoney(medicine.sellingPrice, take) - itemDiscount * (take / item.quantity)),
        costOfGoods: roundMoney(multiplyMoney(batch.purchasePrice, take)),
      });
    }

    if (remaining > 0) {
      throw new ApiError(409, `Not enough stock for ${medicine.name} (short by ${remaining}). Reduce quantity to hold.`);
    }
  }

  const subtotal = roundMoney(resolvedItems.reduce((s, it) => addMoney(s, multiplyMoney(it.unitPrice, it.quantity)), 0));
  const discountTotal = roundMoney(resolvedItems.reduce((s, it) => addMoney(s, it.discount), 0));
  const tax = data.tax ?? 0;
  const saleDiscount = data.discount ?? 0;
  const total = roundMoney(subtractMoney(addMoney(subtotal, tax), addMoney(discountTotal, saleDiscount)));

  const sale = await prisma.sale.create({
    data: {
      transactionNumber: `HOLD-${Date.now()}`,
      items: { create: resolvedItems.map((it, seq) => ({ medicineId: it.medicine, batchId: it.batch, name: it.name, quantity: it.quantity, unitPrice: it.unitPrice, discount: it.discount, subtotal: it.subtotal, seq })) },
      customerId: data.customer || undefined,
      cashierId: req.user!.sub,
      branch: holdCashier?.branch || "Main Branch",
      subtotal, discount: addMoney(discountTotal, saleDiscount), tax, total,
      costOfGoods: 0,
      paymentMethod: "cash",
      status: "held",
      saleType,
      insuranceProvider: data.insuranceProvider || undefined,
      policyOrNhisNumber: data.policyOrNhisNumber || undefined,
    },
    include: saleChildrenInclude,
  });

  await recordAudit({
    req, action: "SALE_HELD", module: "sales",
    description: `${req.user!.name} held sale with ${resolvedItems.length} item(s) — GHS ${total.toFixed(2)}`,
    entity: "Sale", entityId: sale.id,
  });

  res.status(201).json(serialize("sale", sale));
});

export const resumeSale = asyncHandler(async (req: Request, res: Response) => {
  const data = resumeSaleSchema.parse(req.body);
  const sale = await prisma.sale.findUnique({
    where: { id: req.params.id },
    include: saleChildrenInclude,
  });
  if (!sale) throw new ApiError(404, "Sale not found");
  if (sale.status !== "held") throw new ApiError(400, "Can only resume held sales");
  if (sale.saleType === "insurance") {
    if (!sale.customerId) throw new ApiError(400, "A registered customer is required for insurance sales");
    if (!sale.insuranceProvider) throw new ApiError(400, "Insurance provider is required for insurance sales");
    if (!sale.policyOrNhisNumber) throw new ApiError(400, "Policy or NHIS number is required for insurance sales");
  }

  const result = await withOptionalSession(async (tx) => {
    const itemsToDeduct = sale.items.map((it) => ({
      medicine: it.medicineId,
      quantity: it.quantity,
      discount: it.discount,
    }));

    const resolvedItems = await deductInventory(itemsToDeduct, tx, req.user!.sub, {
      prescriptionReference: data.prescriptionReference,
      permissions: req.user!.permissions,
    });

    const computedItemDiscount = roundMoney(resolvedItems.reduce((s, it) => addMoney(s, it.discount), 0));
    const saleLevelDiscount = Math.max(0, sale.discount - computedItemDiscount);
    const { subtotal, costOfGoods, total } = computeTotals(resolvedItems, sale.tax, saleLevelDiscount);

    const totalPaid = roundMoney(data.payments.reduce((s, p) => addMoney(s, p.amount), 0));
    const amountReceived = data.amountReceived ?? totalPaid;
    const change = roundMoney(subtractMoney(amountReceived, total));

    if (totalPaid < total) {
      throw new ApiError(400, `Insufficient payment. Total: ${total.toFixed(2)}, Paid: ${totalPaid.toFixed(2)}`);
    }

    const payments = data.payments.map((p) => ({
      method: p.method,
      amount: p.amount,
      reference: p.reference,
      date: new Date(),
    }));

    const transactionNumber = `INV-${Date.now()}`;

    await tx.saleItem.deleteMany({ where: { saleId: sale.id } });
    await tx.salePayment.deleteMany({ where: { saleId: sale.id } });
    await tx.saleItem.createMany({
      data: resolvedItems.map((it, seq) => ({
        saleId: sale.id, medicineId: it.medicine, batchId: it.batch, name: it.name,
        quantity: it.quantity, unitPrice: it.unitPrice, discount: it.discount, subtotal: it.subtotal, seq,
      })),
    });
    await tx.salePayment.createMany({
      data: payments.map((p, seq) => ({ ...p, saleId: sale.id, seq })),
    });
    const updatedSale = await tx.sale.update({
      where: { id: sale.id },
      data: {
        transactionNumber,
        subtotal,
        discount: addMoney(computedItemDiscount, saleLevelDiscount),
        total,
        costOfGoods,
        paymentMethod: payments[0]?.method ?? "cash",
        amountReceived,
        changeAmount: change,
        status: "completed",
        prescriptionReference: data.prescriptionReference || undefined,
        dispensedById: data.prescriptionReference ? req.user!.sub : undefined,
      },
      include: saleChildrenInclude,
    });

    for (const item of resolvedItems) {
      await tx.inventoryMovement.create({
        data: {
          medicineId: item.medicine,
          batchId: item.batch,
          type: "sale",
          quantityChange: -item.quantity,
          performedById: req.user!.sub,
        },
      });
    }

    await recordAudit({
      req, action: "SALE_CREATED", module: "sales",
      description: `${req.user!.name} resumed and completed held sale #${transactionNumber} — GHS ${total.toFixed(2)}`,
      entity: "Sale", entityId: sale.id,
    });

    return updatedSale;
  });

  emitEvent(SOCKET_EVENTS.SALE_CREATED, {
    id: result.id, transactionNumber: result.transactionNumber,
    total: result.total, payments: serializeMany("salePayment", result.payments),
  });

  res.json(serialize("sale", result));
});

export const listHeldSales = asyncHandler(async (req: Request, res: Response) => {
  const sales = await prisma.sale.findMany({
    where: { status: "held" },
    include: {
      cashier: { select: { id: true, name: true } },
      customer: { select: { id: true, name: true, phone: true } },
      ...saleChildrenInclude,
    },
    orderBy: { createdAt: "desc" },
  });

  const medicineIds = [...new Set(sales.flatMap((s) => s.items.map((i) => i.medicineId)))];
  const medicines = medicineIds.length
    ? await prisma.medicine.findMany({
        where: { id: { in: medicineIds } },
        select: { id: true, prescriptionRequired: true, isControlledSubstance: true },
      })
    : [];
  const flagById = new Map(medicines.map((m) => [m.id, m]));

  const payload = sales.map((sale) => {
    const serialized = serialize("sale", sale) as Record<string, unknown>;
    const flags = sale.items.map((i) => flagById.get(i.medicineId));
    return {
      ...serialized,
      requiresPrescription: flags.some((f) => f && (f.prescriptionRequired || f.isControlledSubstance)),
      hasControlledItems: flags.some((f) => f?.isControlledSubstance),
    };
  });
  res.json(payload);
});

export const voidSale = asyncHandler(async (req: Request, res: Response) => {
  const sale = await prisma.sale.findUnique({
    where: { id: req.params.id },
    include: saleChildrenInclude,
  });
  if (!sale) throw new ApiError(404, "Sale not found");
  if (sale.status === "voided") throw new ApiError(409, "Sale already voided");
  if (sale.status === "refunded") throw new ApiError(409, "Cannot void a refunded sale");

  const voidedSale = await withOptionalSession(async (tx) => {
    if (sale.status !== "held") {
      for (const item of sale.items) {
        await tx.medicineBatch.update({
          where: { id: item.batchId },
          data: { quantity: { increment: item.quantity } },
        });
        await tx.inventoryMovement.create({
          data: {
            medicineId: item.medicineId, batchId: item.batchId, type: "return",
            quantityChange: item.quantity, reason: "Sale voided", performedById: req.user!.sub,
          },
        });
      }
    }

    const updatedSale = await tx.sale.update({
      where: { id: sale.id },
      data: { status: "voided" },
      include: saleChildrenInclude,
    });

    await recordAudit({
      req, action: "SALE_VOIDED", module: "sales",
      description: `${req.user!.name} voided sale #${sale.transactionNumber} — GHS ${sale.total.toFixed(2)}`,
      entity: "Sale", entityId: sale.id,
    });

    return updatedSale;
  });

  emitEvent(SOCKET_EVENTS.SALE_REFUNDED, { id: voidedSale.id, transactionNumber: voidedSale.transactionNumber, total: voidedSale.total, reason: "voided" });
  res.json(serialize("sale", voidedSale));
});

export const requestRefund = asyncHandler(async (req: Request, res: Response) => {
  const data = refundSaleSchema.parse(req.body);
  const sale = await prisma.sale.findUnique({
    where: { id: req.params.id },
    include: { items: { orderBy: { seq: "asc" } } },
  });
  if (!sale) throw new ApiError(404, "Sale not found");
  if (sale.status === "held") throw new ApiError(400, "Cannot refund a held sale. Void it instead.");
  if (sale.status === "voided") throw new ApiError(400, "Cannot refund a voided sale");
  if (sale.status === "refunded") throw new ApiError(409, "Sale already fully refunded");

  const pharmacy = await prisma.pharmacy.findFirst({ include: { settings: true } });
  const requireApproval = pharmacy?.settings?.requireManagerApprovalForRefund ?? true;

  const result = await withOptionalSession(async (tx) => {
    const returnItems: {
      medicine: string; batch: string; name: string;
      originalQuantity: number; returnQuantity: number; unitPrice: number;
      subtotal: number; condition: "resaleable" | "damaged"; reason: string;
    }[] = [];
    let totalRefund = 0;

    for (const item of data.items) {
      const saleItem = sale.items.find(
        (si) => si.medicineId === item.medicine && si.batchId === item.batch
      );
      if (!saleItem) {
        throw new ApiError(400, `Item ${item.medicine} not found in this sale`);
      }

      const alreadyReturned = await tx.saleReturnItem.findMany({
        where: {
          medicineId: item.medicine,
          batchId: item.batch,
          saleReturn: { saleId: sale.id, status: { in: ["pending", "approved", "completed"] } },
        },
        select: { returnQuantity: true },
      });
      const previouslyReturned = alreadyReturned.reduce((sum, r) => sum + r.returnQuantity, 0);

      const availableToReturn = saleItem.quantity - previouslyReturned;
      if (item.returnQuantity > availableToReturn) {
        throw new ApiError(400, `Cannot return ${item.returnQuantity} of ${saleItem.name}. Only ${availableToReturn} available to return (originally sold: ${saleItem.quantity}, already returned: ${previouslyReturned})`);
      }

      const subtotal = roundMoney(multiplyMoney(saleItem.unitPrice, item.returnQuantity));
      totalRefund = addMoney(totalRefund, subtotal);

      returnItems.push({
        medicine: item.medicine,
        batch: item.batch,
        name: saleItem.name,
        originalQuantity: saleItem.quantity,
        returnQuantity: item.returnQuantity,
        unitPrice: saleItem.unitPrice,
        subtotal,
        condition: item.condition,
        reason: item.reason,
      });
    }

    const returnDoc = await tx.saleReturn.create({
      data: {
        saleId: sale.id,
        transactionNumber: await nextReturnNumber(),
        items: {
          create: returnItems.map((it, seq) => ({
            medicineId: it.medicine, batchId: it.batch, name: it.name,
            originalQuantity: it.originalQuantity, returnQuantity: it.returnQuantity,
            unitPrice: it.unitPrice, subtotal: it.subtotal, condition: it.condition,
            reason: it.reason, seq,
          })),
        },
        refundAmount: totalRefund,
        status: requireApproval ? "pending" : "completed",
        requestedById: req.user!.sub,
        processedAt: requireApproval ? undefined : new Date(),
      },
      include: { items: { orderBy: { seq: "asc" } } },
    });

    if (!requireApproval) {
      for (const item of returnItems) {
        if (item.condition === "resaleable") {
          await tx.medicineBatch.update({
            where: { id: item.batch },
            data: { quantity: { increment: item.returnQuantity } },
          });
        }
        await tx.inventoryMovement.create({
          data: {
            medicineId: item.medicine, batchId: item.batch,
            type: item.condition === "damaged" ? "damaged" : "return",
            quantityChange: item.condition === "damaged" ? 0 : item.returnQuantity,
            reason: `Refund: ${item.reason}${item.condition === "damaged" ? " (damaged)" : ""}`,
            performedById: req.user!.sub,
          },
        });
      }

      const newRefundedAmount = addMoney(sale.refundedAmount ?? 0, totalRefund);
      await tx.sale.update({
        where: { id: sale.id },
        data: {
          refundedAmount: newRefundedAmount,
          status: newRefundedAmount >= sale.total ? "refunded" : "partially_refunded",
          refundReason: returnItems.map((i) => i.reason).join("; "),
        },
      });

      await recordAudit({
        req, action: "SALE_REFUNDED", module: "sales",
        description: `${req.user!.name} processed refund #${returnDoc.transactionNumber} — GHS ${totalRefund.toFixed(2)} (${returnItems.map((i) => `${i.returnQuantity}x ${i.name}`).join(", ")})`,
        entity: "SaleReturn", entityId: returnDoc.id,
      });
    } else {
      await recordAudit({
        req, action: "SALE_REFUND_REQUESTED", module: "sales",
        description: `${req.user!.name} requested refund #${returnDoc.transactionNumber} — GHS ${totalRefund.toFixed(2)} (${returnItems.map((i) => `${i.returnQuantity}x ${i.name}`).join(", ")})`,
        entity: "SaleReturn", entityId: returnDoc.id,
      });

      emitEvent(SOCKET_EVENTS.SALE_REFUND_REQUESTED, {
        id: returnDoc.id, transactionNumber: returnDoc.transactionNumber,
        saleTransactionNumber: sale.transactionNumber, refundAmount: totalRefund,
        requestedBy: req.user!.name,
      });

      await notifyRefundRequested(
        returnDoc.id, returnDoc.transactionNumber,
        req.user!.name, totalRefund,
      );
    }

    return returnDoc;
  });

  res.status(201).json(serialize("saleReturn", result));
});

export const approveRefund = asyncHandler(async (req: Request, res: Response) => {
  const data = approveRefundSchema.parse(req.body);
  const returnDoc = await prisma.saleReturn.findUnique({
    where: { id: req.params.returnId },
    include: { items: { orderBy: { seq: "asc" } } },
  });
  if (!returnDoc) throw new ApiError(404, "Return request not found");
  if (returnDoc.status !== "pending") throw new ApiError(400, "Return request is not pending");

  const sale = await prisma.sale.findUnique({ where: { id: returnDoc.saleId } });
  if (!sale) throw new ApiError(404, "Original sale not found");

  if (data.rejectionReason) {
    const rejected = await prisma.saleReturn.update({
      where: { id: returnDoc.id },
      data: {
        status: "rejected",
        rejectionReason: data.rejectionReason,
        approvedById: req.user!.sub,
      },
      include: { items: { orderBy: { seq: "asc" } } },
    });

    await recordAudit({
      req, action: "SALE_REFUND_REJECTED", module: "sales",
      description: `${req.user!.name} rejected refund #${returnDoc.transactionNumber} — ${data.rejectionReason}`,
      entity: "SaleReturn", entityId: returnDoc.id,
    });

    emitEvent(SOCKET_EVENTS.SALE_REFUND_REJECTED, {
      id: returnDoc.id, transactionNumber: returnDoc.transactionNumber,
      rejectionReason: data.rejectionReason,
    });

    const requestedByUser = returnDoc.requestedById;
    if (requestedByUser) {
      await notifyRefundRejected(
        returnDoc.id, returnDoc.transactionNumber,
        req.user!.name, data.rejectionReason!, requestedByUser as never,
      );
    }

    return res.json(serialize("saleReturn", rejected));
  }

  const approved = await withOptionalSession(async (tx) => {
    for (const item of returnDoc.items) {
      if (item.condition === "resaleable") {
        await tx.medicineBatch.update({
          where: { id: item.batchId },
          data: { quantity: { increment: item.returnQuantity } },
        });
      }
      await tx.inventoryMovement.create({
        data: {
          medicineId: item.medicineId, batchId: item.batchId,
          type: item.condition === "damaged" ? "damaged" : "return",
          quantityChange: item.condition === "damaged" ? 0 : item.returnQuantity,
          reason: `Refund approved: ${item.reason}${item.condition === "damaged" ? " (damaged)" : ""}`,
          performedById: req.user!.sub,
        },
      });
    }

    const newRefundedAmount = addMoney(sale.refundedAmount ?? 0, returnDoc.refundAmount);
    await tx.sale.update({
      where: { id: sale.id },
      data: {
        refundedAmount: newRefundedAmount,
        status: newRefundedAmount >= sale.total ? "refunded" : "partially_refunded",
      },
    });

    const completed = await tx.saleReturn.update({
      where: { id: returnDoc.id },
      data: {
        status: "completed",
        approvedById: req.user!.sub,
        processedAt: new Date(),
      },
      include: { items: { orderBy: { seq: "asc" } } },
    });

    await recordAudit({
      req, action: "SALE_REFUND_APPROVED", module: "sales",
      description: `${req.user!.name} approved refund #${returnDoc.transactionNumber} — GHS ${returnDoc.refundAmount.toFixed(2)}`,
      entity: "SaleReturn", entityId: returnDoc.id,
    });

    emitEvent(SOCKET_EVENTS.SALE_REFUND_APPROVED, {
      id: returnDoc.id, transactionNumber: returnDoc.transactionNumber,
      refundAmount: returnDoc.refundAmount, approvedBy: req.user!.name,
    });

    const requestedByUser = returnDoc.requestedById;
    if (requestedByUser) {
      await notifyRefundApproved(
        returnDoc.id, returnDoc.transactionNumber,
        req.user!.name, returnDoc.refundAmount, requestedByUser as never,
      );
    }

    return completed;
  });

  res.json(serialize("saleReturn", approved));
});

export const listPendingRefunds = asyncHandler(async (req: Request, res: Response) => {
  const returns = await prisma.saleReturn.findMany({
    where: { status: "pending" },
    include: {
      sale: { select: { id: true, transactionNumber: true, total: true } },
      requestedBy: { select: { id: true, name: true } },
      items: { orderBy: { seq: "asc" } },
    },
    orderBy: { createdAt: "desc" },
  });
  res.json(serializeMany("saleReturn", returns));
});

export const deleteHeldSale = asyncHandler(async (req: Request, res: Response) => {
  const sale = await prisma.sale.findUnique({ where: { id: req.params.id } });
  if (!sale) throw new ApiError(404, "Sale not found");
  if (sale.status !== "held") throw new ApiError(400, "Can only delete held sales");

  await prisma.sale.delete({ where: { id: req.params.id } });

  await recordAudit({
    req, action: "SALE_VOIDED", module: "sales",
    description: `${req.user!.name} deleted held sale #${sale.transactionNumber}`,
    entity: "Sale", entityId: sale.id,
  });

  res.json({ message: "Held sale deleted" });
});

const collectPaymentSchema = z.object({
  payments: z.array(paymentInput).min(1),
  amountReceived: z.number().nonnegative().optional(),
});

export const collectPayment = asyncHandler(async (req: Request, res: Response) => {
  const data = collectPaymentSchema.parse(req.body);
  const sale = await prisma.sale.findUnique({
    where: { id: req.params.id },
    include: saleChildrenInclude,
  });
  if (!sale) throw new ApiError(404, "Sale not found");
  if (!sale.outstandingAmount || sale.outstandingAmount <= 0) {
    throw new ApiError(400, "This sale has no outstanding balance");
  }

  const totalPaid = roundMoney(data.payments.reduce((s, p) => addMoney(s, p.amount), 0));
  if (totalPaid > sale.outstandingAmount) {
    throw new ApiError(400, `Payment exceeds outstanding balance of GHS ${sale.outstandingAmount.toFixed(2)}`);
  }

  const newPayments = [
    ...sale.payments.map((p) => ({ method: p.method, amount: p.amount, reference: p.reference, date: p.date })),
    ...data.payments.map((p) => ({ method: p.method, amount: p.amount, reference: p.reference, date: new Date() })),
  ];

  const newOutstanding = roundMoney(subtractMoney(sale.outstandingAmount, totalPaid));

  const saleData: Prisma.SaleUpdateInput = { outstandingAmount: newOutstanding };
  if (newOutstanding <= 0) {
    saleData.paymentMethod = "credit";
  }

  await prisma.$transaction([
    prisma.salePayment.deleteMany({ where: { saleId: sale.id } }),
    prisma.salePayment.createMany({ data: newPayments.map((p, seq) => ({ ...p, saleId: sale.id, seq })) }),
    prisma.sale.update({ where: { id: sale.id }, data: saleData }),
  ]);

  if (sale.customerId) {
    await prisma.customer.update({
      where: { id: sale.customerId },
      data: { outstandingBalance: { increment: -totalPaid } },
    });
  }

  await recordAudit({
    req, action: "SALE_CREATED", module: "sales",
    description: `${req.user!.name} collected GHS ${totalPaid.toFixed(2)} for credit sale #${sale.transactionNumber}`,
    entity: "Sale", entityId: sale.id,
  });

  const updated = await prisma.sale.findUnique({
    where: { id: sale.id },
    include: saleChildrenInclude,
  });

  res.json(serialize("sale", updated));
});

const claimStatusSchema = z.object({
  claimStatus: z.enum(["submitted", "approved", "rejected"]),
});

const CLAIM_TRANSITIONS: Record<string, string[]> = {
  pending: ["submitted", "approved", "rejected"],
  submitted: ["approved", "rejected"],
};

export const updateClaimStatus = asyncHandler(async (req: Request, res: Response) => {
  if (!isValidUuid(req.params.id)) throw new ApiError(404, "Sale not found");
  const { claimStatus } = claimStatusSchema.parse(req.body);

  const sale = await prisma.sale.findUnique({ where: { id: req.params.id } });
  if (!sale) throw new ApiError(404, "Sale not found");
  if (sale.saleType !== "insurance") throw new ApiError(400, "Claim status can only be changed on insurance sales");

  const allowed = CLAIM_TRANSITIONS[sale.claimStatus] ?? [];
  if (!allowed.includes(claimStatus)) {
    throw new ApiError(400, `Cannot change claim status from ${sale.claimStatus} to ${claimStatus}`);
  }

  const permissions = req.user!.permissions;
  if (claimStatus === "submitted" && !permissions.includes("process_sales")) {
    throw new ApiError(403, "You don't have permission to do that");
  }
  if ((claimStatus === "approved" || claimStatus === "rejected") && !permissions.includes("process_refunds")) {
    throw new ApiError(403, "You don't have permission to do that");
  }

  const updated = await prisma.sale.update({
    where: { id: sale.id },
    data: { claimStatus },
    include: saleChildrenInclude,
  });

  await recordAudit({
    req, action: "CLAIM_STATUS_CHANGED", module: "sales",
    description: `${req.user!.name} changed claim ${sale.transactionNumber} from ${sale.claimStatus} to ${claimStatus}`,
    entity: "Sale", entityId: sale.id,
  });

  res.json(serialize("sale", updated));
});
