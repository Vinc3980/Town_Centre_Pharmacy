import { ExpenseCategory, ExpenseStatus, Prisma } from "@prisma/client";
import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { recordAudit } from "../services/auditService";
import { emitEvent, SOCKET_EVENTS } from "../sockets";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";
import { isValidUuid } from "../utils/security";
import { serialize, serializeMany } from "../utils/serialize";

const EXPENSE_CATEGORIES = ["rent", "utilities", "salaries", "transport", "supplier_payment", "maintenance", "marketing", "insurance", "taxes", "misc"] as const;

const createExpenseSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES),
  description: z.string().min(2),
  amount: z.number().positive(),
  paymentMethod: z.enum(["cash", "mobile_money", "card", "bank_transfer", "other"]).optional(),
  date: z.string().optional(),
});

const updateExpenseSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES).optional(),
  description: z.string().min(2).optional(),
  amount: z.number().positive().optional(),
  paymentMethod: z.enum(["cash", "mobile_money", "card", "bank_transfer", "other"]).optional(),
  date: z.string().optional(),
});

const approveRejectSchema = z.object({
  rejectionReason: z.string().min(1).optional(),
});

export const listExpenses = asyncHandler(async (req: Request, res: Response) => {
  const { status, category, from, to, search } = req.query as Record<string, string>;
  const where: Prisma.ExpenseWhereInput = {};
  if (status) where.status = status as ExpenseStatus;
  if (category) where.category = category as ExpenseCategory;
  if (search) {
    where.description = { contains: search, mode: "insensitive" };
  }
  if (from || to) {
    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to);
    where.date = dateFilter;
  }
  const expenses = await prisma.expense.findMany({
    where,
    include: {
      recordedBy: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true } },
    },
    omit: { recordedById: true, approvedById: true },
    orderBy: { date: "desc" },
    take: 200,
  });
  res.json(serializeMany("expense", expenses));
});

export const getExpenseById = asyncHandler(async (req: Request, res: Response) => {
  if (!isValidUuid(req.params.id)) throw new ApiError(404, "Expense not found");
  const expense = await prisma.expense.findUnique({
    where: { id: req.params.id },
    include: {
      recordedBy: { select: { id: true, name: true, email: true } },
      approvedBy: { select: { id: true, name: true, email: true } },
    },
    omit: { recordedById: true, approvedById: true },
  });
  if (!expense) throw new ApiError(404, "Expense not found");
  res.json(serialize("expense", expense));
});

export const createExpense = asyncHandler(async (req: Request, res: Response) => {
  const data = createExpenseSchema.parse(req.body);
  const receiptUrl = req.file ? `/uploads/receipts/${req.file.filename}` : undefined;

  const expense = await prisma.expense.create({
    data: {
      category: data.category,
      description: data.description,
      amount: data.amount,
      paymentMethod: data.paymentMethod,
      date: data.date ? new Date(data.date) : new Date(),
      recordedById: req.user!.sub,
      status: "pending",
      receiptUrl,
    },
    include: { recordedBy: { select: { id: true, name: true } } },
    omit: { recordedById: true, approvedById: true },
  });

  await recordAudit({
    req, action: "EXPENSE_CREATED", module: "expenses",
    description: `${req.user!.name} recorded a ${data.category} expense of GHS ${data.amount}`,
    entity: "Expense", entityId: expense.id,
  });
  emitEvent(SOCKET_EVENTS.EXPENSE_CREATED, serialize("expense", expense));
  res.status(201).json(serialize("expense", expense));
});

export const updateExpense = asyncHandler(async (req: Request, res: Response) => {
  if (!isValidUuid(req.params.id)) throw new ApiError(404, "Expense not found");
  const expense = await prisma.expense.findUnique({ where: { id: req.params.id } });
  if (!expense) throw new ApiError(404, "Expense not found");
  if (expense.status !== "pending") throw new ApiError(400, "Can only edit pending expenses");

  const data = updateExpenseSchema.parse(req.body);
  const updates: Prisma.ExpenseUpdateInput = {};
  if (data.category !== undefined) updates.category = data.category;
  if (data.description !== undefined) updates.description = data.description;
  if (data.amount !== undefined) updates.amount = data.amount;
  if (data.paymentMethod !== undefined) updates.paymentMethod = data.paymentMethod;
  if (data.date !== undefined) updates.date = new Date(data.date);

  if (req.file) {
    updates.receiptUrl = `/uploads/receipts/${req.file.filename}`;
  }

  const updated = await prisma.expense.update({
    where: { id: expense.id },
    data: updates,
    include: { recordedBy: { select: { id: true, name: true } } },
    omit: { recordedById: true, approvedById: true },
  });

  await recordAudit({
    req, action: "EXPENSE_UPDATED", module: "expenses",
    description: `${req.user!.name} updated expense #${expense.id}`,
    before: { category: expense.category, amount: expense.amount, description: expense.description },
    after: { ...data },
    entity: "Expense", entityId: expense.id,
  });

  res.json(serialize("expense", updated));
});

export const approveExpense = asyncHandler(async (req: Request, res: Response) => {
  const data = approveRejectSchema.parse(req.body);
  if (!isValidUuid(req.params.id)) throw new ApiError(404, "Expense not found");
  const expense = await prisma.expense.findUnique({ where: { id: req.params.id } });
  if (!expense) throw new ApiError(404, "Expense not found");
  if (expense.status !== "pending") throw new ApiError(400, "Expense is not pending");

  if (data.rejectionReason) {
    const rejected = await prisma.expense.update({
      where: { id: expense.id },
      data: {
        status: "rejected",
        rejectionReason: data.rejectionReason,
        approvedById: req.user!.sub,
      },
      include: { approvedBy: { select: { id: true, name: true } } },
      omit: { approvedById: true },
    });

    await recordAudit({
      req, action: "EXPENSE_REJECTED", module: "expenses",
      description: `${req.user!.name} rejected ${expense.category} expense (GHS ${expense.amount}): ${data.rejectionReason}`,
      entity: "Expense", entityId: expense.id,
    });
    emitEvent(SOCKET_EVENTS.EXPENSE_REJECTED, serialize("expense", rejected));
    return res.json(serialize("expense", rejected));
  }

  const approved = await prisma.expense.update({
    where: { id: expense.id },
    data: { status: "approved", approvedById: req.user!.sub },
    include: { approvedBy: { select: { id: true, name: true } } },
    omit: { approvedById: true },
  });

  await recordAudit({
    req, action: "EXPENSE_APPROVED", module: "expenses",
    description: `${req.user!.name} approved ${expense.category} expense of GHS ${expense.amount}`,
    entity: "Expense", entityId: expense.id,
  });
  emitEvent(SOCKET_EVENTS.EXPENSE_APPROVED, serialize("expense", approved));
  res.json(serialize("expense", approved));
});

