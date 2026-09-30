import fs from "fs";
import path from "path";
import { PharmacySettings, Prisma } from "@prisma/client";
import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { recordAudit } from "../services/auditService";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";

// Optional text fields accept "" so forms can round-trip empty values
// (columns are NOT NULL; a fresh database seeds them as "").
const optionalText = z.string().min(2).optional().or(z.literal(""));

const updatePharmacyInfoSchema = z.object({
  name: z.string().min(2).optional(),
  registrationNumber: z.string().min(2).optional(),
  phone: optionalText,
  email: z.string().email().optional().or(z.literal("")),
  address: optionalText,
  city: optionalText,
  region: optionalText,
  country: optionalText,
  logoUrl: z.string().nullable().optional(),
  currency: optionalText,
  timezone: optionalText,
  branches: z.array(z.string()).optional(),
  paymentMethods: z.array(z.string()).optional(),
});

const updateInventorySettingsSchema = z.object({
  lowStockThreshold: z.number().nonnegative().optional(),
  expiryWarningDays: z.number().positive().optional(),
  allowNegativeStock: z.boolean().optional(),
  requireManagerApprovalForStockAdjustment: z.boolean().optional(),
});

const updateSalesSettingsSchema = z.object({
  requireManagerApprovalForRefund: z.boolean().optional(),
  discountAuthorizationRequired: z.boolean().optional(),
  receiptFooter: z.string().optional(),
  taxRate: z.number().min(0).max(100).optional(),
  taxEnabled: z.boolean().optional(),
});

const updateSecuritySettingsSchema = z.object({
  minPasswordLength: z.number().min(4).max(128).optional(),
  sessionExpirationMinutes: z.number().min(5).optional(),
  maxLoginAttempts: z.number().min(1).optional(),
  lockoutDurationMinutes: z.number().min(1).optional(),
});

const DEFAULT_PHARMACY = {
  name: "Adom Pharmacy",
  registrationNumber: "ADOM-001",
  phone: "",
  email: "",
  address: "",
  city: "",
  region: "",
  country: "Ghana",
  currency: "GH₵",
  timezone: "Africa/Accra",
};

type PharmacyWithSettings = Omit<Prisma.PharmacyGetPayload<{ include: { settings: true } }>, "settings"> & {
  settings: PharmacySettings;
};

export async function getPharmacy(): Promise<PharmacyWithSettings> {
  const pharmacy = await prisma.pharmacy.findFirst({ include: { settings: true } });
  if (pharmacy?.settings) return pharmacy as PharmacyWithSettings;
  if (pharmacy) {
    const settings = await prisma.pharmacySettings.create({ data: { pharmacyId: pharmacy.id } });
    return { ...pharmacy, settings };
  }
  const created = await prisma.pharmacy.create({
    data: {
      ...DEFAULT_PHARMACY,
      branchNames: ["Main Branch"],
      paymentMethods: ["Cash", "Mobile Money", "Card", "Credit"],
      settings: { create: {} },
    },
    include: { settings: true },
  });
  return created as PharmacyWithSettings;
}

export const getPharmacyInfo = asyncHandler(async (_req: Request, res: Response) => {
  const pharmacy = await getPharmacy();
  res.json({
    id: pharmacy.id,
    name: pharmacy.name,
    registrationNumber: pharmacy.registrationNumber,
    phone: pharmacy.phone,
    email: pharmacy.email,
    address: pharmacy.address,
    city: pharmacy.city,
    region: pharmacy.region,
    country: pharmacy.country,
    logoUrl: pharmacy.logoUrl,
    currency: pharmacy.currency,
    timezone: pharmacy.timezone,
    status: pharmacy.status,
    branches: pharmacy.branchNames ?? ["Main Branch"],
    paymentMethods: pharmacy.paymentMethods ?? ["Cash", "Mobile Money", "Card", "Credit"],
  });
});

export const updatePharmacyInfo = asyncHandler(async (req: Request, res: Response) => {
  const data = updatePharmacyInfoSchema.parse(req.body);
  const pharmacy = await getPharmacy();
  const before = {
    name: pharmacy.name, registrationNumber: pharmacy.registrationNumber,
    phone: pharmacy.phone, email: pharmacy.email, address: pharmacy.address,
    city: pharmacy.city, region: pharmacy.region, country: pharmacy.country,
    currency: pharmacy.currency, timezone: pharmacy.timezone,
    branches: pharmacy.branchNames, paymentMethods: pharmacy.paymentMethods,
  };

  const { branches, ...rest } = data;
  const updated = await prisma.pharmacy.update({
    where: { id: pharmacy.id },
    data: {
      ...rest,
      ...(branches !== undefined ? { branchNames: branches } : {}),
    },
  });

  await recordAudit({
    req, action: "SETTINGS_UPDATED", module: "settings",
    description: `${req.user!.name} updated pharmacy information`,
    before, after: {
      name: updated.name, registrationNumber: updated.registrationNumber,
      phone: updated.phone, email: updated.email, address: updated.address,
      city: updated.city, region: updated.region, country: updated.country,
      currency: updated.currency, timezone: updated.timezone,
      branches: updated.branchNames, paymentMethods: updated.paymentMethods,
    },
    entity: "Pharmacy", entityId: pharmacy.id,
  });

  res.json({
    name: updated.name, registrationNumber: updated.registrationNumber,
    phone: updated.phone, email: updated.email, address: updated.address,
    city: updated.city, region: updated.region, country: updated.country,
    logoUrl: updated.logoUrl, currency: updated.currency, timezone: updated.timezone,
    branches: updated.branchNames, paymentMethods: updated.paymentMethods,
  });
});

export const getInventorySettings = asyncHandler(async (_req: Request, res: Response) => {
  const pharmacy = await getPharmacy();
  res.json({
    lowStockThreshold: pharmacy.settings.lowStockThreshold,
    expiryWarningDays: pharmacy.settings.expiryWarningDays,
    allowNegativeStock: pharmacy.settings.allowNegativeStock,
    requireManagerApprovalForStockAdjustment: pharmacy.settings.requireManagerApprovalForStockAdjustment,
  });
});

export const updateInventorySettings = asyncHandler(async (req: Request, res: Response) => {
  const data = updateInventorySettingsSchema.parse(req.body);
  const pharmacy = await getPharmacy();
  const before = {
    lowStockThreshold: pharmacy.settings.lowStockThreshold,
    expiryWarningDays: pharmacy.settings.expiryWarningDays,
    allowNegativeStock: pharmacy.settings.allowNegativeStock,
    requireManagerApprovalForStockAdjustment: pharmacy.settings.requireManagerApprovalForStockAdjustment,
  };

  const settings: Prisma.PharmacySettingsUpdateInput = {};
  if (data.lowStockThreshold !== undefined) settings.lowStockThreshold = data.lowStockThreshold;
  if (data.expiryWarningDays !== undefined) settings.expiryWarningDays = data.expiryWarningDays;
  if (data.allowNegativeStock !== undefined) settings.allowNegativeStock = data.allowNegativeStock;
  if (data.requireManagerApprovalForStockAdjustment !== undefined) settings.requireManagerApprovalForStockAdjustment = data.requireManagerApprovalForStockAdjustment;
  const updatedSettings = await prisma.pharmacySettings.update({
    where: { pharmacyId: pharmacy.id },
    data: settings,
  });

  await recordAudit({
    req, action: "SETTINGS_UPDATED", module: "settings",
    description: `${req.user!.name} updated inventory settings`,
    before, after: {
      lowStockThreshold: updatedSettings.lowStockThreshold,
      expiryWarningDays: updatedSettings.expiryWarningDays,
      allowNegativeStock: updatedSettings.allowNegativeStock,
      requireManagerApprovalForStockAdjustment: updatedSettings.requireManagerApprovalForStockAdjustment,
    },
    entity: "Pharmacy", entityId: pharmacy.id,
  });

  res.json({
    lowStockThreshold: updatedSettings.lowStockThreshold,
    expiryWarningDays: updatedSettings.expiryWarningDays,
    allowNegativeStock: updatedSettings.allowNegativeStock,
    requireManagerApprovalForStockAdjustment: updatedSettings.requireManagerApprovalForStockAdjustment,
  });
});

export const getSalesSettings = asyncHandler(async (_req: Request, res: Response) => {
  const pharmacy = await getPharmacy();
  res.json({
    requireManagerApprovalForRefund: pharmacy.settings.requireManagerApprovalForRefund,
    discountAuthorizationRequired: pharmacy.settings.discountAuthorizationRequired,
    receiptFooter: pharmacy.settings.receiptFooter,
    taxRate: pharmacy.settings.taxRate,
    taxEnabled: pharmacy.settings.taxEnabled,
  });
});

export const updateSalesSettings = asyncHandler(async (req: Request, res: Response) => {
  const data = updateSalesSettingsSchema.parse(req.body);
  const pharmacy = await getPharmacy();
  const before = {
    requireManagerApprovalForRefund: pharmacy.settings.requireManagerApprovalForRefund,
    discountAuthorizationRequired: pharmacy.settings.discountAuthorizationRequired,
    receiptFooter: pharmacy.settings.receiptFooter,
    taxRate: pharmacy.settings.taxRate,
    taxEnabled: pharmacy.settings.taxEnabled,
  };

  const settings: Prisma.PharmacySettingsUpdateInput = {};
  if (data.requireManagerApprovalForRefund !== undefined) settings.requireManagerApprovalForRefund = data.requireManagerApprovalForRefund;
  if (data.discountAuthorizationRequired !== undefined) settings.discountAuthorizationRequired = data.discountAuthorizationRequired;
  if (data.receiptFooter !== undefined) settings.receiptFooter = data.receiptFooter;
  if (data.taxRate !== undefined) settings.taxRate = data.taxRate;
  if (data.taxEnabled !== undefined) settings.taxEnabled = data.taxEnabled;
  const updatedSettings = await prisma.pharmacySettings.update({
    where: { pharmacyId: pharmacy.id },
    data: settings,
  });

  await recordAudit({
    req, action: "SETTINGS_UPDATED", module: "settings",
    description: `${req.user!.name} updated sales settings`,
    before, after: {
      requireManagerApprovalForRefund: updatedSettings.requireManagerApprovalForRefund,
      discountAuthorizationRequired: updatedSettings.discountAuthorizationRequired,
      receiptFooter: updatedSettings.receiptFooter,
      taxRate: updatedSettings.taxRate,
      taxEnabled: updatedSettings.taxEnabled,
    },
    entity: "Pharmacy", entityId: pharmacy.id,
  });

  res.json({
    requireManagerApprovalForRefund: updatedSettings.requireManagerApprovalForRefund,
    discountAuthorizationRequired: updatedSettings.discountAuthorizationRequired,
    receiptFooter: updatedSettings.receiptFooter,
    taxRate: updatedSettings.taxRate,
    taxEnabled: updatedSettings.taxEnabled,
  });
});

export const getSecuritySettings = asyncHandler(async (_req: Request, res: Response) => {
  const pharmacy = await getPharmacy();
  res.json({
    minPasswordLength: pharmacy.settings.minPasswordLength,
    sessionExpirationMinutes: pharmacy.settings.sessionExpirationMinutes,
    maxLoginAttempts: pharmacy.settings.maxLoginAttempts,
    lockoutDurationMinutes: pharmacy.settings.lockoutDurationMinutes,
  });
});

export const updateSecuritySettings = asyncHandler(async (req: Request, res: Response) => {
  const data = updateSecuritySettingsSchema.parse(req.body);
  const pharmacy = await getPharmacy();
  const before = {
    minPasswordLength: pharmacy.settings.minPasswordLength,
    sessionExpirationMinutes: pharmacy.settings.sessionExpirationMinutes,
    maxLoginAttempts: pharmacy.settings.maxLoginAttempts,
    lockoutDurationMinutes: pharmacy.settings.lockoutDurationMinutes,
  };

  const settings: Prisma.PharmacySettingsUpdateInput = {};
  if (data.minPasswordLength !== undefined) settings.minPasswordLength = data.minPasswordLength;
  if (data.sessionExpirationMinutes !== undefined) settings.sessionExpirationMinutes = data.sessionExpirationMinutes;
  if (data.maxLoginAttempts !== undefined) settings.maxLoginAttempts = data.maxLoginAttempts;
  if (data.lockoutDurationMinutes !== undefined) settings.lockoutDurationMinutes = data.lockoutDurationMinutes;
  const updatedSettings = await prisma.pharmacySettings.update({
    where: { pharmacyId: pharmacy.id },
    data: settings,
  });

  await recordAudit({
    req, action: "SETTINGS_UPDATED", module: "settings",
    description: `${req.user!.name} updated security settings`,
    before, after: {
      minPasswordLength: updatedSettings.minPasswordLength,
      sessionExpirationMinutes: updatedSettings.sessionExpirationMinutes,
      maxLoginAttempts: updatedSettings.maxLoginAttempts,
      lockoutDurationMinutes: updatedSettings.lockoutDurationMinutes,
    },
    entity: "Pharmacy", entityId: pharmacy.id,
  });

  res.json({
    minPasswordLength: updatedSettings.minPasswordLength,
    sessionExpirationMinutes: updatedSettings.sessionExpirationMinutes,
    maxLoginAttempts: updatedSettings.maxLoginAttempts,
    lockoutDurationMinutes: updatedSettings.lockoutDurationMinutes,
  });
});

export const getAllSettings = asyncHandler(async (_req: Request, res: Response) => {
  const pharmacy = await getPharmacy();
  res.json({
    pharmacy: {
      id: pharmacy.id,
      name: pharmacy.name,
      registrationNumber: pharmacy.registrationNumber,
      phone: pharmacy.phone,
      email: pharmacy.email,
      address: pharmacy.address,
      city: pharmacy.city,
      region: pharmacy.region,
      country: pharmacy.country,
      logoUrl: pharmacy.logoUrl,
      currency: pharmacy.currency,
      timezone: pharmacy.timezone,
      branches: pharmacy.branchNames ?? ["Main Branch"],
      paymentMethods: pharmacy.paymentMethods ?? ["Cash", "Mobile Money", "Card", "Credit"],
    },
    inventory: {
      lowStockThreshold: pharmacy.settings.lowStockThreshold,
      expiryWarningDays: pharmacy.settings.expiryWarningDays,
      allowNegativeStock: pharmacy.settings.allowNegativeStock,
      requireManagerApprovalForStockAdjustment: pharmacy.settings.requireManagerApprovalForStockAdjustment,
    },
    sales: {
      requireManagerApprovalForRefund: pharmacy.settings.requireManagerApprovalForRefund,
      discountAuthorizationRequired: pharmacy.settings.discountAuthorizationRequired,
      receiptFooter: pharmacy.settings.receiptFooter,
      taxRate: pharmacy.settings.taxRate,
      taxEnabled: pharmacy.settings.taxEnabled,
    },
    security: {
      minPasswordLength: pharmacy.settings.minPasswordLength,
      sessionExpirationMinutes: pharmacy.settings.sessionExpirationMinutes,
      maxLoginAttempts: pharmacy.settings.maxLoginAttempts,
      lockoutDurationMinutes: pharmacy.settings.lockoutDurationMinutes,
    },
  });
});

export const uploadPharmacyLogo = asyncHandler(async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) throw new ApiError(400, "No logo file provided");

  const pharmacy = await getPharmacy();

  if (pharmacy.logoUrl) {
    const oldPath = path.join(__dirname, "../..", pharmacy.logoUrl);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }

  const updated = await prisma.pharmacy.update({
    where: { id: pharmacy.id },
    data: { logoUrl: `/uploads/logos/${file.filename}` },
  });

  res.json({ logoUrl: updated.logoUrl });
});

export const removePharmacyLogo = asyncHandler(async (req: Request, res: Response) => {
  const pharmacy = await getPharmacy();

  if (pharmacy.logoUrl) {
    const filePath = path.join(__dirname, "../..", pharmacy.logoUrl);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await prisma.pharmacy.update({
      where: { id: pharmacy.id },
      data: { logoUrl: null },
    });
  }

  res.json({ message: "Logo removed" });
});
