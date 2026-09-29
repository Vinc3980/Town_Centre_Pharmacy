import { Prisma, PurchaseOrderStatus } from "@prisma/client";
import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { recordAudit } from "../services/auditService";
import { emitEvent, SOCKET_EVENTS } from "../sockets";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";
import { serialize, serializeMany } from "../utils/serialize";

const productSchema = z.object({
  medicine: z.string().min(1),
  quantity: z.number().int().min(1),
  unitPrice: z.number().min(0),
});

const createPurchaseOrderSchema = z.object({
  supplier: z.string().min(1),
  products: z.array(productSchema).min(1),
  expectedDeliveryDate: z.string().optional(),
  notes: z.string().optional(),
});

const updatePurchaseOrderSchema = z.object({
  supplier: z.string().min(1).optional(),
  products: z.array(productSchema).min(1).optional(),
  expectedDeliveryDate: z.string().optional(),
  notes: z.string().optional(),
});

const statusSchema = z.object({
  status: z.enum(["draft", "sent", "partially_received", "received", "cancelled"]),
});

const userSelect = { id: true, name: true };
const productsInclude = {
  orderBy: { seq: "asc" as const },
  include: { medicine: { select: { id: true, name: true, sku: true } } },
  omit: { medicineId: true },
};

async function generateReferenceNumber(): Promise<string> {
  const now = new Date();
  const datePart =
    now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0");

  const count = await prisma.purchaseOrder.count({
    where: { referenceNumber: { startsWith: `PO-${datePart}-` } },
  });

  const seq = String(count + 1).padStart(4, "0");
  return `PO-${datePart}-${seq}`;
}

export const createPurchaseOrder = asyncHandler(async (req: Request, res: Response) => {
  const data = createPurchaseOrderSchema.parse(req.body);
  const totalAmount = data.products.reduce((sum, p) => sum + p.quantity * p.unitPrice, 0);
  const referenceNumber = await generateReferenceNumber();

  const order = await prisma.purchaseOrder.create({
    data: {
      referenceNumber,
      supplier: data.supplier,
      totalAmount,
      orderedById: req.user!.sub,
      expectedDeliveryDate: data.expectedDeliveryDate ? new Date(data.expectedDeliveryDate) : undefined,
      notes: data.notes,
      status: "draft",
      products: {
        create: data.products.map((product, index) => ({
          seq: index,
          medicineId: product.medicine,
          quantity: product.quantity,
          unitPrice: product.unitPrice,
        })),
      },
    },
    include: {
      orderedBy: { select: userSelect },
      products: productsInclude,
    },
    omit: { orderedById: true, receivedById: true },
  });

  const populated = serialize("purchaseOrder", order);

  await recordAudit({
    req,
    action: "PURCHASE_ORDER_CREATED",
    module: "purchase_orders",
    description: `${req.user!.name} created purchase order ${referenceNumber}`,
    entity: "PurchaseOrder",
    entityId: order.id,
  });
  emitEvent(SOCKET_EVENTS.PURCHASE_ORDER_CREATED, populated);
  res.status(201).json(populated);
});

export const listPurchaseOrders = asyncHandler(async (req: Request, res: Response) => {
  const { search, status, page = "1", limit = "20" } = req.query as Record<string, string>;
  const filter: Prisma.PurchaseOrderWhereInput = {};

  if (status) {
    if ((Object.values(PurchaseOrderStatus) as string[]).includes(status)) filter.status = status as PurchaseOrderStatus;
    else filter.id = { in: [] };
  }
  if (search) {
    filter.OR = [
      { referenceNumber: { contains: search, mode: "insensitive" } },
      { supplier: { contains: search, mode: "insensitive" } },
    ];
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const [orders, total] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where: filter,
      orderBy: { createdAt: "desc" },
      skip,
      take: limitNum,
      include: {
        orderedBy: { select: userSelect },
        receivedBy: { select: userSelect },
        products: productsInclude,
      },
      omit: { orderedById: true, receivedById: true },
    }),
    prisma.purchaseOrder.count({ where: filter }),
  ]);

  res.json({
    data: serializeMany("purchaseOrder", orders),
    pagination: { page: pageNum, limit: limitNum, total },
  });
});

export const getPurchaseOrder = asyncHandler(async (req: Request, res: Response) => {
  const order = await prisma.purchaseOrder.findUnique({
    where: { id: req.params.id },
    include: {
      orderedBy: { select: userSelect },
      receivedBy: { select: userSelect },
      products: productsInclude,
    },
    omit: { orderedById: true, receivedById: true },
  });
  if (!order) throw new ApiError(404, "Purchase order not found");
  res.json(serialize("purchaseOrder", order));
});

export const updatePurchaseOrder = asyncHandler(async (req: Request, res: Response) => {
  const order = await prisma.purchaseOrder.findUnique({ where: { id: req.params.id } });
  if (!order) throw new ApiError(404, "Purchase order not found");
  if (order.status !== "draft") throw new ApiError(400, "Can only edit draft purchase orders");

  const data = updatePurchaseOrderSchema.parse(req.body);
  const updates: Prisma.PurchaseOrderUpdateInput = {};

  if (data.supplier !== undefined) updates.supplier = data.supplier;
  if (data.products !== undefined) {
    updates.totalAmount = data.products.reduce((sum, p) => sum + p.quantity * p.unitPrice, 0);
  }
  if (data.expectedDeliveryDate !== undefined) {
    updates.expectedDeliveryDate = data.expectedDeliveryDate ? new Date(data.expectedDeliveryDate) : null;
  }
  if (data.notes !== undefined) updates.notes = data.notes;

  const updated = await prisma.$transaction(async (tx) => {
    if (data.products !== undefined) {
      await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: order.id } });
      await tx.purchaseOrderItem.createMany({
        data: data.products.map((product, index) => ({
          purchaseOrderId: order.id,
          seq: index,
          medicineId: product.medicine,
          quantity: product.quantity,
          unitPrice: product.unitPrice,
        })),
      });
    }
    return tx.purchaseOrder.update({
      where: { id: order.id },
      data: updates,
      include: {
        orderedBy: { select: userSelect },
        receivedBy: { select: userSelect },
        products: productsInclude,
      },
      omit: { orderedById: true, receivedById: true },
    });
  });

  const populated = serialize("purchaseOrder", updated);

  await recordAudit({
    req,
    action: "PURCHASE_ORDER_UPDATED",
    module: "purchase_orders",
    description: `${req.user!.name} updated purchase order ${order.referenceNumber}`,
    entity: "PurchaseOrder",
    entityId: order.id,
  });

  res.json(populated);
});

export const updateStatus = asyncHandler(async (req: Request, res: Response) => {
  const { status } = statusSchema.parse(req.body);
  const order = await prisma.purchaseOrder.findUnique({ where: { id: req.params.id } });
  if (!order) throw new ApiError(404, "Purchase order not found");

  const allowed: Record<string, string[]> = {
    draft: ["sent", "cancelled"],
    sent: ["partially_received", "received", "cancelled"],
    partially_received: ["received", "cancelled"],
    received: [],
    cancelled: [],
  };

  if (!allowed[order.status]?.includes(status)) {
    throw new ApiError(400, `Cannot change status from ${order.status} to ${status}`);
  }

  const updates: Prisma.PurchaseOrderUncheckedUpdateInput = { status };
  if (status === "received") {
    updates.receivedAt = new Date();
    updates.receivedById = req.user!.sub;
  }
  const updated = await prisma.purchaseOrder.update({
    where: { id: order.id },
    data: updates,
    include: {
      orderedBy: { select: userSelect },
      receivedBy: { select: userSelect },
      products: productsInclude,
    },
    omit: { orderedById: true, receivedById: true },
  });

  const populated = serialize("purchaseOrder", updated);

  await recordAudit({
    req,
    action: "PURCHASE_ORDER_STATUS_CHANGED",
    module: "purchase_orders",
    description: `${req.user!.name} changed ${order.referenceNumber} status to ${status}`,
    entity: "PurchaseOrder",
    entityId: order.id,
  });
  emitEvent(SOCKET_EVENTS.PURCHASE_ORDER_STATUS_CHANGED, populated);
  res.json(populated);
});

export const receiveOrder = asyncHandler(async (req: Request, res: Response) => {
  const order = await prisma.purchaseOrder.findUnique({
    where: { id: req.params.id },
    include: { products: { orderBy: { seq: "asc" } } },
  });
  if (!order) throw new ApiError(404, "Purchase order not found");
  if (!["sent", "partially_received"].includes(order.status)) {
    throw new ApiError(400, "Order must be sent or partially received before receiving");
  }

  for (const item of order.products) {
    const medicine = await prisma.medicine.findUnique({ where: { id: item.medicineId } });
    if (!medicine) continue;

    const batchNumber = `PO-${order.referenceNumber}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 1);

    const batch = await prisma.medicineBatch.create({
      data: {
        medicineId: medicine.id,
        batchNumber,
        quantity: item.quantity,
        purchasePrice: item.unitPrice,
        sellingPrice: medicine.sellingPrice,
        expiryDate,
        dateReceived: new Date(),
      },
    });

    await prisma.inventoryMovement.create({
      data: {
        medicineId: medicine.id,
        batchId: batch.id,
        type: "receive",
        quantityChange: item.quantity,
        reason: `PO ${order.referenceNumber}`,
        performedById: req.user!.sub,
      },
    });
  }

  const updated = await prisma.purchaseOrder.update({
    where: { id: order.id },
    data: {
      status: "received",
      receivedAt: new Date(),
      receivedById: req.user!.sub,
    },
    include: {
      orderedBy: { select: userSelect },
      receivedBy: { select: userSelect },
      products: productsInclude,
    },
    omit: { orderedById: true, receivedById: true },
  });

  const populated = serialize("purchaseOrder", updated);

  await recordAudit({
    req,
    action: "PURCHASE_ORDER_RECEIVED",
    module: "purchase_orders",
    description: `${req.user!.name} received purchase order ${order.referenceNumber} — stock updated`,
    entity: "PurchaseOrder",
    entityId: order.id,
  });
  emitEvent(SOCKET_EVENTS.PURCHASE_ORDER_RECEIVED, populated);
  emitEvent(SOCKET_EVENTS.INVENTORY_UPDATED, { orderId: order.id });
  res.json(populated);
});

export const deletePurchaseOrder = asyncHandler(async (req: Request, res: Response) => {
  const order = await prisma.purchaseOrder.findUnique({ where: { id: req.params.id } });
  if (!order) throw new ApiError(404, "Purchase order not found");
  if (order.status !== "draft") throw new ApiError(400, "Can only delete draft purchase orders");

  await prisma.purchaseOrder.delete({ where: { id: order.id } });

  await recordAudit({
    req,
    action: "PURCHASE_ORDER_DELETED",
    module: "purchase_orders",
    description: `${req.user!.name} deleted purchase order ${order.referenceNumber}`,
    entity: "PurchaseOrder",
    entityId: order.id,
  });
  res.status(204).send();
});
