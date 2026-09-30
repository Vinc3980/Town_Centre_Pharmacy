import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { recordAudit } from "../services/auditService";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";
import { getPharmacy } from "./pharmacyController";

const createBranchSchema = z.object({
  name: z.string().trim().min(2),
  code: z.string().trim().min(2).max(20),
  address: z.string().trim().min(2),
  phone: z.string().trim().min(2),
  managerId: z.string().trim().optional().or(z.literal("")),
});

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseDateParam(value: string | undefined): Date {
  if (!value) return startOfToday();
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) throw new ApiError(400, "Invalid date. Expected YYYY-MM-DD");
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (isNaN(d.getTime())) throw new ApiError(400, "Invalid date. Expected YYYY-MM-DD");
  return d;
}

function nextDay(d: Date): Date {
  const n = new Date(d);
  n.setDate(n.getDate() + 1);
  return n;
}

export const listBranches = asyncHandler(async (_req: Request, res: Response) => {
  const pharmacy = await getPharmacy();
  const branches = await prisma.branch.findMany({
    where: { pharmacyId: pharmacy.id },
    include: { manager: { select: { id: true, name: true, email: true, role: true } } },
    orderBy: { createdAt: "asc" },
  });

  const names = branches.map((b) => b.name);
  const staff = names.length
    ? await prisma.user.findMany({
        where: { branch: { in: names } },
        select: { id: true, name: true, email: true, role: true, isActive: true, lastLoginAt: true, branch: true },
      })
    : [];
  const sales = names.length
    ? await prisma.sale.findMany({
        where: { branch: { in: names }, createdAt: { gte: startOfToday() }, status: "completed" },
        select: { branch: true, total: true },
      })
    : [];

  const result = branches.map((b) => {
    const branchSales = sales.filter((s) => s.branch === b.name);
    return {
      id: b.id,
      name: b.name,
      code: b.code,
      address: b.address,
      phone: b.phone,
      status: b.status,
      createdAt: b.createdAt,
      manager: b.manager,
      staff: staff.filter((u) => u.branch === b.name),
      today: {
        salesCount: branchSales.length,
        revenue: branchSales.reduce((sum, s) => sum + s.total, 0),
      },
    };
  });

  res.json(result);
});

export const createBranch = asyncHandler(async (req: Request, res: Response) => {
  const data = createBranchSchema.parse(req.body);
  const pharmacy = await getPharmacy();

  const nameTaken = await prisma.branch.findFirst({
    where: { pharmacyId: pharmacy.id, name: data.name },
    select: { id: true },
  });
  if (nameTaken) throw new ApiError(409, "A branch with this name already exists");

  const codeTaken = await prisma.branch.findFirst({
    where: { pharmacyId: pharmacy.id, code: data.code },
    select: { id: true },
  });
  if (codeTaken) throw new ApiError(409, "A branch with this code already exists");

  const managerId = data.managerId || null;
  if (managerId) {
    const manager = await prisma.user.findUnique({ where: { id: managerId }, select: { id: true } });
    if (!manager) throw new ApiError(400, "Selected manager does not exist");
  }

  const branch = await prisma.branch.create({
    data: {
      pharmacyId: pharmacy.id,
      name: data.name,
      code: data.code,
      address: data.address,
      phone: data.phone,
      managerId,
    },
    include: { manager: { select: { id: true, name: true, email: true, role: true } } },
  });

  await recordAudit({
    req,
    action: "BRANCH_CREATED",
    module: "settings",
    description: `${req.user!.name} created branch "${branch.name}"`,
    entity: "Branch",
    entityId: branch.id,
    after: { name: branch.name, code: branch.code, address: branch.address, phone: branch.phone },
  });

  res.status(201).json({
    id: branch.id,
    name: branch.name,
    code: branch.code,
    address: branch.address,
    phone: branch.phone,
    status: branch.status,
    createdAt: branch.createdAt,
    manager: branch.manager,
    staff: [],
    today: { salesCount: 0, revenue: 0 },
  });
});

export const getBranchDaily = asyncHandler(async (req: Request, res: Response) => {
  const pharmacy = await getPharmacy();
  const branch = await prisma.branch.findFirst({
    where: { id: req.params.id, pharmacyId: pharmacy.id },
    select: { id: true, name: true, code: true },
  });
  if (!branch) throw new ApiError(404, "Branch not found");

  const dayStart = parseDateParam(req.query.date as string | undefined);
  const sales = await prisma.sale.findMany({
    where: {
      branch: branch.name,
      status: "completed",
      createdAt: { gte: dayStart, lt: nextDay(dayStart) },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      transactionNumber: true,
      total: true,
      paymentMethod: true,
      saleType: true,
      createdAt: true,
      cashier: { select: { id: true, name: true } },
    },
  });

  const dateStr = `${dayStart.getFullYear()}-${String(dayStart.getMonth() + 1).padStart(2, "0")}-${String(dayStart.getDate()).padStart(2, "0")}`;

  res.json({
    branch,
    date: dateStr,
    summary: {
      salesCount: sales.length,
      revenue: sales.reduce((sum, s) => sum + s.total, 0),
    },
    sales,
  });
});
