import { Request, Response } from "express";
import fs from "fs";
import path from "path";
import { z } from "zod";
import { MedicineStatus, Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { serialize, serializeMany } from "../utils/serialize";
import { recordAudit } from "../services/auditService";
import { notifyLowStock, notifyExpiringMedicine } from "../services/notificationService";
import { emitEvent, SOCKET_EVENTS } from "../sockets";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";
import { MEDICINE_UPDATABLE_FIELDS, stripProtectedFields } from "../utils/security";

export const listMedicines = asyncHandler(async (req: Request, res: Response) => {
  const { search, category, status } = req.query as Record<string, string>;
  const filter: Prisma.MedicineWhereInput = {};
  if (search) filter.name = { contains: search, mode: "insensitive" };
  if (category) filter.categoryId = category;
  if (status) filter.status = status as MedicineStatus;

  const medicines = await prisma.medicine.findMany({
    where: filter,
    include: {
      batches: { where: { quantity: { gt: 0 } }, select: { quantity: true, expiryDate: true } },
      category: { select: { id: true, name: true } },
      supplier: { select: { id: true, name: true } },
    },
    omit: { categoryId: true, supplierId: true },
    orderBy: { name: "asc" },
    take: 200,
  });

  const withStock = medicines.map(({ batches, ...medicine }) => {
    const totalStock = batches.reduce((sum, b) => sum + b.quantity, 0);
    const nearestExpiry = batches.length
      ? new Date(Math.min(...batches.map((b) => b.expiryDate.getTime())))
      : null;
    return {
      ...medicine,
      totalStock,
      batchCount: batches.length,
      nearestExpiry,
    };
  });

  res.json(serializeMany("medicine", withStock));
});

const medicineSchema = z.object({
  name: z.string().min(2),
  genericName: z.string().optional(),
  brand: z.string().optional(),
  category: z.string(),
  manufacturer: z.string().optional(),
  dosage: z.string().optional(),
  strength: z.string().optional(),
  form: z.string().optional(),
  barcode: z.string().optional(),
  sku: z.string(),
  prescriptionRequired: z.boolean().optional(),
  isControlledSubstance: z.boolean().optional(),
  controlledSubstanceClass: z.string().trim().min(1).max(60).nullish(),
  description: z.string().optional(),
  supplier: z.string().optional(),
  purchasePrice: z.number().nonnegative(),
  sellingPrice: z.number().nonnegative(),
  minStock: z.number().nonnegative().optional(),
  maxStock: z.number().nonnegative().optional(),
  reorderLevel: z.number().nonnegative().optional(),
});

export const createMedicine = asyncHandler(async (req: Request, res: Response) => {
  const data = medicineSchema.parse(req.body);
  const { category, supplier, ...rest } = data;
  const existing = await prisma.medicine.findFirst({ where: { sku: data.sku } });
  if (existing) throw new ApiError(409, "A medicine with this SKU already exists");
  const medicine = await prisma.medicine.create({
    data: { ...rest, categoryId: category, supplierId: supplier },
  });
  await recordAudit({
    req, action: "MEDICINE_CREATED", module: "medicines",
    description: `${req.user!.name} added new medicine "${medicine.name}"`, entity: "Medicine", entityId: medicine.id, after: data,
  });
  res.status(201).json(serialize("medicine", medicine));
});

export const updateMedicine = asyncHandler(async (req: Request, res: Response) => {
  const medicine = await prisma.medicine.findUnique({ where: { id: req.params.id } });
  if (!medicine) throw new ApiError(404, "Medicine not found");
  const previous = medicine;

  const allowedData = stripProtectedFields(req.body, MEDICINE_UPDATABLE_FIELDS);
  const priceChanged = allowedData.sellingPrice !== undefined && allowedData.sellingPrice !== medicine.sellingPrice;

  const updateData: Prisma.MedicineUncheckedUpdateInput = {};
  for (const [key, value] of Object.entries(allowedData)) {
    if (key === "category") updateData.categoryId = value as string;
    else if (key === "supplier") updateData.supplierId = value as string | null;
    else Object.assign(updateData, { [key]: value });
  }

  const updated = await prisma.medicine.update({ where: { id: medicine.id }, data: updateData });

  await recordAudit({
    req,
    action: priceChanged ? "PRICE_CHANGED" : "MEDICINE_UPDATED",
    module: "medicines",
    description: priceChanged
      ? `${req.user!.name} changed the selling price of ${updated.name} from GHS ${previous.sellingPrice} to GHS ${updated.sellingPrice}`
      : `${req.user!.name} updated ${updated.name}`,
    before: previous,
    after: updated,
    entity: "Medicine",
    entityId: medicine.id,
  });

  res.json(serialize("medicine", updated));
});

export const deleteMedicine = asyncHandler(async (req: Request, res: Response) => {
  const medicine = await prisma.medicine.findUnique({ where: { id: req.params.id } });
  if (!medicine) throw new ApiError(404, "Medicine not found");
  await prisma.medicine.delete({ where: { id: medicine.id } });
  await recordAudit({ req, action: "MEDICINE_DELETED", module: "medicines", description: `${req.user!.name} deleted ${medicine.name}`, entity: "Medicine", entityId: medicine.id });
  res.json({ message: "Medicine deleted" });
});

export const discontinueMedicine = asyncHandler(async (req: Request, res: Response) => {
  const medicine = await prisma.medicine.findUnique({ where: { id: req.params.id } });
  if (!medicine) throw new ApiError(404, "Medicine not found");
  if (medicine.status === "discontinued") throw new ApiError(400, "Medicine already discontinued");

  const before = medicine;
  const updated = await prisma.medicine.update({
    where: { id: medicine.id },
    data: { status: "discontinued" },
  });

  await recordAudit({
    req, action: "MEDICINE_DISCONTINUED", module: "medicines",
    description: `${req.user!.name} discontinued ${updated.name}`,
    before, after: updated,
    entity: "Medicine", entityId: medicine.id,
  });

  res.json(serialize("medicine", updated));
});

const receiveStockSchema = z.object({
  medicine: z.string(),
  batchNumber: z.string(),
  quantity: z.number().positive(),
  purchasePrice: z.number().nonnegative(),
  sellingPrice: z.number().nonnegative(),
  expiryDate: z.string(),
  manufacturingDate: z.string().optional(),
  supplier: z.string().optional(),
});

export const receiveStock = asyncHandler(async (req: Request, res: Response) => {
  const data = receiveStockSchema.parse(req.body);
  const medicine = await prisma.medicine.findUnique({ where: { id: data.medicine } });
  if (!medicine) throw new ApiError(404, "Medicine not found");

  const batch = await prisma.medicineBatch.create({
    data: {
      medicineId: medicine.id,
      batchNumber: data.batchNumber,
      quantity: data.quantity,
      purchasePrice: data.purchasePrice,
      sellingPrice: data.sellingPrice,
      expiryDate: new Date(data.expiryDate),
      manufacturingDate: data.manufacturingDate ? new Date(data.manufacturingDate) : undefined,
      supplierId: data.supplier,
    },
  });

  await prisma.inventoryMovement.create({
    data: {
      medicineId: medicine.id,
      batchId: batch.id,
      type: "receive",
      quantityChange: data.quantity,
      performedById: req.user!.sub,
    },
  });

  await recordAudit({
    req, action: "STOCK_RECEIVED", module: "inventory",
    description: `${req.user!.name} received ${data.quantity} units of ${medicine.name} (batch ${data.batchNumber})`,
    entity: "MedicineBatch", entityId: batch.id,
  });

  emitEvent(SOCKET_EVENTS.INVENTORY_UPDATED, { medicineId: medicine.id, medicineName: medicine.name, change: data.quantity, type: "receive" });

  const pharmacy = await prisma.pharmacy.findFirst({ include: { settings: true } });
  const expiryDays = pharmacy?.settings?.expiryWarningDays ?? 30;
  const daysToExpiry = Math.ceil((new Date(data.expiryDate).getTime() - Date.now()) / 86400000);
  if (daysToExpiry <= expiryDays) {
    await notifyExpiringMedicine(medicine.id, medicine.name, data.batchNumber, daysToExpiry);
  }

  const totalStock = await prisma.medicineBatch.aggregate({
    where: { medicineId: medicine.id },
    _sum: { quantity: true },
  });
  const currentStock = totalStock._sum.quantity ?? 0;
  if (currentStock <= medicine.reorderLevel) {
    await notifyLowStock(medicine.id, medicine.name, currentStock, medicine.reorderLevel);
  }

  res.status(201).json(serialize("medicineBatch", batch));
});

const adjustStockSchema = z.object({
  batch: z.string(),
  quantityChange: z.number(),
  reason: z.string(),
});

export const adjustStock = asyncHandler(async (req: Request, res: Response) => {
  const { batch: batchId, quantityChange, reason } = adjustStockSchema.parse(req.body);
  const batch = await prisma.medicineBatch.findUnique({ where: { id: batchId } });
  if (!batch) throw new ApiError(404, "Batch not found");

  const updated = await prisma.medicineBatch.update({
    where: { id: batch.id },
    data: { quantity: Math.max(0, batch.quantity + quantityChange) },
  });

  await prisma.inventoryMovement.create({
    data: {
      medicineId: batch.medicineId,
      batchId: batch.id,
      type: "adjustment",
      quantityChange,
      reason,
      performedById: req.user!.sub,
    },
  });

  await recordAudit({
    req, action: "STOCK_ADJUSTED", module: "inventory",
    description: `${req.user!.name} adjusted stock by ${quantityChange > 0 ? "+" : ""}${quantityChange} — ${reason}`,
    entity: "MedicineBatch", entityId: batch.id,
    before: { quantity: updated.quantity - quantityChange },
    after: { quantity: updated.quantity },
  });

  emitEvent(SOCKET_EVENTS.INVENTORY_UPDATED, { medicineId: batch.medicineId, change: quantityChange, type: "adjustment" });

  res.json(serialize("medicineBatch", updated));
});

export const lowStockReport = asyncHandler(async (_req: Request, res: Response) => {
  const medicines = await prisma.medicine.findMany({
    where: { status: "active" },
    include: { batches: { select: { quantity: true } } },
    orderBy: { name: "asc" },
  });

  const results = medicines
    .map(({ batches, ...medicine }) => ({
      ...medicine,
      totalStock: batches.reduce((sum, b) => sum + b.quantity, 0),
    }))
    .filter((medicine) => medicine.totalStock <= medicine.reorderLevel);

  res.json(serializeMany("medicine", results));
});

export const expiryReport = asyncHandler(async (req: Request, res: Response) => {
  const days = Number(req.query.days ?? 30);
  const threshold = new Date();
  threshold.setDate(threshold.getDate() + days);
  const batches = await prisma.medicineBatch.findMany({
    where: { expiryDate: { lte: threshold }, quantity: { gt: 0 } },
    include: { medicine: { select: { id: true, name: true, sku: true } } },
    omit: { medicineId: true },
    orderBy: { expiryDate: "asc" },
  });
  res.json(serializeMany("medicineBatch", batches));
});

export const lookupBarcode = asyncHandler(async (req: Request, res: Response) => {
  const { barcode } = req.params;
  const medicine = await prisma.medicine.findFirst({
    where: { barcode },
    include: { category: { select: { id: true, name: true } } },
    omit: { categoryId: true },
  });
  if (!medicine) throw new ApiError(404, "No medicine found with that barcode");

  const batches = await prisma.medicineBatch.findMany({
    where: { medicineId: medicine.id, quantity: { gt: 0 } },
    orderBy: { expiryDate: "asc" },
  });
  const totalStock = batches.reduce((sum, b) => sum + b.quantity, 0);

  res.json({ ...serialize("medicine", medicine), totalStock, batchCount: batches.length });
});

export const uploadMedicineImageHandler = asyncHandler(async (req: Request, res: Response) => {
  const medicine = await prisma.medicine.findUnique({ where: { id: req.params.id } });
  if (!medicine) throw new ApiError(404, "Medicine not found");

  const file = req.file;
  if (!file) throw new ApiError(400, "No image file provided");

  if (medicine.imageUrl) {
    const oldPath = path.join(__dirname, "../..", medicine.imageUrl);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }

  const updated = await prisma.medicine.update({
    where: { id: medicine.id },
    data: { imageUrl: `/uploads/medicines/${file.filename}` },
  });

  res.json({ imageUrl: updated.imageUrl });
});

export const removeMedicineImage = asyncHandler(async (req: Request, res: Response) => {
  const medicine = await prisma.medicine.findUnique({ where: { id: req.params.id } });
  if (!medicine) throw new ApiError(404, "Medicine not found");

  if (medicine.imageUrl) {
    const filePath = path.join(__dirname, "../..", medicine.imageUrl);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await prisma.medicine.update({
      where: { id: medicine.id },
      data: { imageUrl: null },
    });
  }

  res.json({ message: "Image removed" });
});
