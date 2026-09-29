import { Prisma, TransferStatus } from "@prisma/client";
import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { recordAudit } from "../services/auditService";
import { emitEvent, SOCKET_EVENTS } from "../sockets";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";
import { serialize, serializeMany } from "../utils/serialize";

const STATUS_FLOW: Record<string, string | null> = {
  pending: "in_transit",
  in_transit: "completed",
  completed: null,
  cancelled: null,
};

function generateReferenceNumber(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const seq = String(Math.floor(Math.random() * 9999) + 1).padStart(4, "0");
  return `ST-${y}${m}${d}-${seq}`;
}

const productSchema = z.object({
  medicine: z.string().min(1),
  quantity: z.number().int().min(1),
});

const createTransferSchema = z.object({
  fromLocation: z.string().min(1),
  toLocation: z.string().min(1),
  products: z.array(productSchema).min(1),
  notes: z.string().optional(),
});

const statusSchema = z.object({
  status: z.enum(["in_transit", "completed", "cancelled"]),
});

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ["in_transit", "cancelled"],
  in_transit: ["completed", "cancelled"],
};

export const createTransfer = asyncHandler(async (req: Request, res: Response) => {
  const data = createTransferSchema.parse(req.body);
  if (data.fromLocation === data.toLocation) {
    throw new ApiError(400, "Source and destination locations must be different");
  }

  const transfer = await prisma.stockTransfer.create({
    data: {
      referenceNumber: generateReferenceNumber(),
      fromLocation: data.fromLocation,
      toLocation: data.toLocation,
      products: {
        create: data.products.map((p, seq) => ({ medicineId: p.medicine, quantity: p.quantity, seq })),
      },
      notes: data.notes,
      requestedById: req.user!.sub,
      status: "pending",
    },
    include: {
      requestedBy: { select: { id: true, name: true } },
      products: { orderBy: { seq: "asc" } },
    },
  });

  await recordAudit({
    req,
    action: "STOCK_TRANSFER_CREATED",
    module: "inventory",
    description: `${req.user!.name} created stock transfer ${transfer.referenceNumber}`,
    entity: "StockTransfer",
    entityId: transfer.id,
  });
  emitEvent(SOCKET_EVENTS.INVENTORY_UPDATED, serialize("stockTransfer", transfer));
  res.status(201).json(serialize("stockTransfer", transfer));
});

export const listTransfers = asyncHandler(async (req: Request, res: Response) => {
  const { status, search, fromLocation, toLocation, page = "1", limit = "20" } = req.query as Record<string, string>;
  const where: Prisma.StockTransferWhereInput = {};

  if (status) where.status = status as TransferStatus;
  if (fromLocation) where.fromLocation = { contains: fromLocation, mode: "insensitive" };
  if (toLocation) where.toLocation = { contains: toLocation, mode: "insensitive" };
  if (search) {
    where.OR = [
      { referenceNumber: { contains: search, mode: "insensitive" } },
      { fromLocation: { contains: search, mode: "insensitive" } },
      { toLocation: { contains: search, mode: "insensitive" } },
    ];
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (pageNum - 1) * limitNum;

  const [transfers, total] = await Promise.all([
    prisma.stockTransfer.findMany({
      where,
      include: {
        requestedBy: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
        products: { orderBy: { seq: "asc" }, include: { medicine: { select: { id: true, name: true } } } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limitNum,
    }),
    prisma.stockTransfer.count({ where }),
  ]);

  res.json({
    data: serializeMany("stockTransfer", transfers),
    pagination: { page: pageNum, limit: limitNum, total },
  });
});

export const getTransfer = asyncHandler(async (req: Request, res: Response) => {
  const transfer = await prisma.stockTransfer.findUnique({
    where: { id: req.params.id },
    include: {
      requestedBy: { select: { id: true, name: true, email: true } },
      approvedBy: { select: { id: true, name: true, email: true } },
      products: { orderBy: { seq: "asc" }, include: { medicine: { select: { id: true, name: true, sku: true } } } },
    },
  });
  if (!transfer) throw new ApiError(404, "Stock transfer not found");
  res.json(serialize("stockTransfer", transfer));
});

export const updateTransferStatus = asyncHandler(async (req: Request, res: Response) => {
  const data = statusSchema.parse(req.body);
  const transfer = await prisma.stockTransfer.findUnique({ where: { id: req.params.id } });
  if (!transfer) throw new ApiError(404, "Stock transfer not found");

  const allowed = VALID_TRANSITIONS[transfer.status];
  if (!allowed || !allowed.includes(data.status)) {
    throw new ApiError(400, `Cannot change status from "${transfer.status}" to "${data.status}"`);
  }

  const populated = await prisma.stockTransfer.update({
    where: { id: transfer.id },
    data: {
      status: data.status,
      ...(data.status === "completed" ? { completedAt: new Date(), approvedById: req.user!.sub } : {}),
      ...(data.status === "cancelled" ? { approvedById: req.user!.sub } : {}),
    },
    include: {
      requestedBy: { select: { id: true, name: true } },
      products: { orderBy: { seq: "asc" } },
    },
  });

  await recordAudit({
    req,
    action: `STOCK_TRANSFER_${data.status.toUpperCase()}`,
    module: "inventory",
    description: `${req.user!.name} changed ${transfer.referenceNumber} to ${data.status}`,
    entity: "StockTransfer",
    entityId: transfer.id,
  });
  emitEvent(SOCKET_EVENTS.INVENTORY_UPDATED, serialize("stockTransfer", populated));
  res.json(serialize("stockTransfer", populated));
});

export const deleteTransfer = asyncHandler(async (req: Request, res: Response) => {
  const transfer = await prisma.stockTransfer.findUnique({ where: { id: req.params.id } });
  if (!transfer) throw new ApiError(404, "Stock transfer not found");
  if (transfer.status !== "pending") throw new ApiError(400, "Only pending transfers can be deleted");

  await prisma.stockTransfer.delete({ where: { id: req.params.id } });

  await recordAudit({
    req,
    action: "STOCK_TRANSFER_DELETED",
    module: "inventory",
    description: `${req.user!.name} deleted stock transfer ${transfer.referenceNumber}`,
    entity: "StockTransfer",
    entityId: transfer.id,
  });
  res.json({ message: "Transfer deleted" });
});
