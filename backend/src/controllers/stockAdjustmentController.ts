import { AdjustmentType, ApprovalStatus, Prisma } from "@prisma/client";
import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { recordAudit } from "../services/auditService";
import { emitEvent, SOCKET_EVENTS } from "../sockets";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";
import { serialize, serializeMany } from "../utils/serialize";
import { withOptionalSession } from "../utils/withTransaction";

const createAdjustmentSchema = z.object({
  medicine: z.string().min(1),
  type: z.enum(["increase", "decrease"]),
  quantity: z.number().int().min(1),
  reason: z.string().min(1),
  location: z.string().min(1),
  notes: z.string().optional(),
});

const reviewSchema = z.object({
  reviewNotes: z.string().optional(),
});

async function generateReferenceNumber(): Promise<string> {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `SA-${dateStr}-`;
  const last = await prisma.stockAdjustment.findFirst({
    where: { referenceNumber: { startsWith: prefix } },
    orderBy: { referenceNumber: "desc" },
    select: { referenceNumber: true },
  });
  let seq = 1;
  if (last) {
    const parts = last.referenceNumber.split("-");
    seq = parseInt(parts[parts.length - 1], 10) + 1;
  }
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

export const createAdjustment = asyncHandler(async (req: Request, res: Response) => {
  const data = createAdjustmentSchema.parse(req.body);

  const medicine = await prisma.medicine.findUnique({ where: { id: data.medicine } });
  if (!medicine) throw new ApiError(404, "Medicine not found");

  const referenceNumber = await generateReferenceNumber();

  const adjustment = await prisma.stockAdjustment.create({
    data: {
      referenceNumber,
      medicineId: data.medicine,
      type: data.type,
      quantity: data.quantity,
      reason: data.reason,
      location: data.location,
      notes: data.notes,
      status: "pending",
      requestedById: req.user!.sub,
    },
    include: {
      medicine: { select: { id: true, name: true, sku: true } },
      requestedBy: { select: { id: true, name: true } },
    },
  });

  await recordAudit({
    req,
    action: "STOCK_ADJUSTMENT_CREATED",
    module: "inventory",
    description: `${req.user!.name} requested stock ${data.type} for ${medicine.name} (${data.quantity} units)`,
    entity: "StockAdjustment",
    entityId: adjustment.id,
  });
  emitEvent(SOCKET_EVENTS.INVENTORY_UPDATED, serialize("stockAdjustment", adjustment));
  res.status(201).json(serialize("stockAdjustment", adjustment));
});

export const listAdjustments = asyncHandler(async (req: Request, res: Response) => {
  const { status, type, search, page = "1", limit = "20" } = req.query as Record<string, string>;
  const where: Prisma.StockAdjustmentWhereInput = {};

  if (status) where.status = status as ApprovalStatus;
  if (type) where.type = type as AdjustmentType;

  if (search) {
    const matchingMedicines = await prisma.medicine.findMany({
      where: { name: { contains: search, mode: "insensitive" } },
      select: { id: true },
    });
    const medicineIds = matchingMedicines.map((m) => m.id);
    where.OR = [
      { referenceNumber: { contains: search, mode: "insensitive" } },
      { medicineId: { in: medicineIds } },
    ];
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const [adjustments, total] = await Promise.all([
    prisma.stockAdjustment.findMany({
      where,
      include: {
        medicine: { select: { id: true, name: true, sku: true } },
        requestedBy: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limitNum,
    }),
    prisma.stockAdjustment.count({ where }),
  ]);

  res.json({
    data: serializeMany("stockAdjustment", adjustments),
    pagination: { page: pageNum, limit: limitNum, total },
  });
});

export const getAdjustment = asyncHandler(async (req: Request, res: Response) => {
  const adjustment = await prisma.stockAdjustment.findUnique({
    where: { id: req.params.id },
    include: {
      medicine: { select: { id: true, name: true, sku: true } },
      requestedBy: { select: { id: true, name: true, email: true } },
      approvedBy: { select: { id: true, name: true, email: true } },
    },
  });
  if (!adjustment) throw new ApiError(404, "Stock adjustment not found");
  res.json(serialize("stockAdjustment", adjustment));
});

export const approveAdjustment = asyncHandler(async (req: Request, res: Response) => {
  const data = reviewSchema.parse(req.body);
  const adjustment = await prisma.stockAdjustment.findUnique({ where: { id: req.params.id } });
  if (!adjustment) throw new ApiError(404, "Stock adjustment not found");
  if (adjustment.status !== "pending") throw new ApiError(400, "Adjustment is not pending");

  await withOptionalSession(async (tx) => {
    if (adjustment.type === "increase") {
      const batch = await tx.medicineBatch.findFirst({
        where: {
          medicineId: adjustment.medicineId,
          quantity: { gt: 0 },
        },
        orderBy: { expiryDate: "asc" },
      });

      if (batch) {
        await tx.medicineBatch.update({
          where: { id: batch.id },
          data: { quantity: { increment: adjustment.quantity } },
        });
      } else {
        await tx.medicineBatch.create({
          data: {
            medicineId: adjustment.medicineId,
            batchNumber: `ADJ-${adjustment.referenceNumber}`,
            quantity: adjustment.quantity,
            purchasePrice: 0,
            sellingPrice: 0,
            expiryDate: new Date("2099-12-31"),
            dateReceived: new Date(),
          },
        });
      }
    } else {
      let remaining = adjustment.quantity;
      const batches = await tx.medicineBatch.findMany({
        where: {
          medicineId: adjustment.medicineId,
          quantity: { gt: 0 },
        },
        orderBy: { expiryDate: "asc" },
      });

      for (const batch of batches) {
        if (remaining <= 0) break;
        const deduct = Math.min(batch.quantity, remaining);
        await tx.medicineBatch.update({
          where: { id: batch.id },
          data: { quantity: { decrement: deduct } },
        });
        remaining -= deduct;
      }

      if (remaining > 0) {
        throw new ApiError(400, `Insufficient stock. Cannot decrease ${remaining} more units.`);
      }
    }

    await tx.stockAdjustment.update({
      where: { id: adjustment.id },
      data: {
        status: "approved",
        approvedById: req.user!.sub,
        reviewNotes: data.reviewNotes,
      },
    });
  });

  const populated = await prisma.stockAdjustment.findUnique({
    where: { id: adjustment.id },
    include: {
      medicine: { select: { id: true, name: true, sku: true } },
      approvedBy: { select: { id: true, name: true } },
      requestedBy: { select: { id: true, name: true } },
    },
  });

  await recordAudit({
    req,
    action: "STOCK_ADJUSTMENT_APPROVED",
    module: "inventory",
    description: `${req.user!.name} approved stock ${adjustment.type} for ${adjustment.referenceNumber}`,
    entity: "StockAdjustment",
    entityId: adjustment.id,
  });
  emitEvent(SOCKET_EVENTS.INVENTORY_UPDATED, serialize("stockAdjustment", populated));
  res.json(serialize("stockAdjustment", populated));
});

export const rejectAdjustment = asyncHandler(async (req: Request, res: Response) => {
  const data = reviewSchema.parse(req.body);
  const adjustment = await prisma.stockAdjustment.findUnique({ where: { id: req.params.id } });
  if (!adjustment) throw new ApiError(404, "Stock adjustment not found");
  if (adjustment.status !== "pending") throw new ApiError(400, "Adjustment is not pending");

  await prisma.stockAdjustment.update({
    where: { id: adjustment.id },
    data: {
      status: "rejected",
      approvedById: req.user!.sub,
      reviewNotes: data.reviewNotes,
    },
  });

  const populated = await prisma.stockAdjustment.findUnique({
    where: { id: adjustment.id },
    include: {
      medicine: { select: { id: true, name: true, sku: true } },
      approvedBy: { select: { id: true, name: true } },
      requestedBy: { select: { id: true, name: true } },
    },
  });

  await recordAudit({
    req,
    action: "STOCK_ADJUSTMENT_REJECTED",
    module: "inventory",
    description: `${req.user!.name} rejected stock ${adjustment.type} for ${adjustment.referenceNumber}`,
    entity: "StockAdjustment",
    entityId: adjustment.id,
  });
  emitEvent(SOCKET_EVENTS.INVENTORY_UPDATED, serialize("stockAdjustment", populated));
  res.json(serialize("stockAdjustment", populated));
});

export const deleteAdjustment = asyncHandler(async (req: Request, res: Response) => {
  const adjustment = await prisma.stockAdjustment.findUnique({ where: { id: req.params.id } });
  if (!adjustment) throw new ApiError(404, "Stock adjustment not found");
  if (adjustment.status !== "pending") throw new ApiError(400, "Can only delete pending adjustments");

  await prisma.stockAdjustment.delete({ where: { id: adjustment.id } });

  await recordAudit({
    req,
    action: "STOCK_ADJUSTMENT_DELETED",
    module: "inventory",
    description: `${req.user!.name} deleted stock adjustment ${adjustment.referenceNumber}`,
    entity: "StockAdjustment",
    entityId: adjustment.id,
  });
  res.json({ message: "Stock adjustment deleted" });
});
