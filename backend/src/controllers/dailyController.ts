import { Prisma, ReportStatus, SessionStatus } from "@prisma/client";
import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { recordAudit } from "../services/auditService";
import { notifyDailyReportSubmitted, notifyDailyReportApproved, notifyDailyReportRejected, notifyDailySessionOpened, notifyDailySessionClosed } from "../services/notificationService";
import { emitEvent, SOCKET_EVENTS } from "../sockets";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";
import { serialize, serializeMany } from "../utils/serialize";

const MANAGER_ROLES = ["branch_manager", "admin"];

const openSessionSchema = z.object({
  openingCash: z.number().nonnegative(),
});

const closeSessionSchema = z.object({
  actualCash: z.number().nonnegative(),
  actualMobileMoney: z.number().nonnegative().optional().default(0),
  actualCard: z.number().nonnegative().optional().default(0),
  actualBankTransfer: z.number().nonnegative().optional().default(0),
  notes: z.string().optional(),
});

const approveSessionSchema = z.object({
  reviewNotes: z.string().optional(),
});

const rejectSessionSchema = z.object({
  reviewNotes: z.string().min(1),
});

const submitReportSchema = z.object({
  actualCash: z.number().nonnegative(),
  notes: z.string().optional(),
});

const approveReportSchema = z.object({
  reviewNotes: z.string().optional(),
});

const rejectReportSchema = z.object({
  reviewNotes: z.string().min(1),
});

async function aggregateSessionData(userId: string, since: Date) {
  const sales = await prisma.sale.findMany({
    where: {
      cashierId: userId,
      createdAt: { gte: since },
      status: { in: ["completed", "partially_refunded"] },
      payments: { some: {} },
    },
    select: {
      total: true,
      discount: true,
      payments: { select: { method: true, amount: true }, orderBy: { seq: "asc" } },
    },
  });

  let totalSales = 0;
  let cashSales = 0;
  let mobileMoneySales = 0;
  let cardSales = 0;
  let bankTransferSales = 0;
  let discounts = 0;
  for (const sale of sales) {
    totalSales += sale.total;
    discounts += sale.discount;
    for (const payment of sale.payments) {
      if (payment.method === "cash") cashSales += payment.amount;
      else if (payment.method === "mobile_money") mobileMoneySales += payment.amount;
      else if (payment.method === "card") cardSales += payment.amount;
      else if (payment.method === "bank_transfer") bankTransferSales += payment.amount;
    }
  }

  const completedReturns = await prisma.saleReturn.aggregate({
    where: {
      requestedById: userId,
      createdAt: { gte: since },
      status: { in: ["completed", "approved"] },
    },
    _sum: { refundAmount: true },
  });

  const approvedExpenses = await prisma.expense.groupBy({
    by: ["paymentMethod"],
    where: { date: { gte: since }, status: "approved" },
    _sum: { amount: true },
  });

  const saleData = { totalSales, cashSales, mobileMoneySales, cardSales, bankTransferSales, discounts };
  const returnData = { refunds: completedReturns._sum.refundAmount ?? 0 };
  const expenseData = { expenses: 0, cashExpenses: 0 };
  for (const group of approvedExpenses) {
    expenseData.expenses += group._sum.amount ?? 0;
    if (group.paymentMethod === "cash") expenseData.cashExpenses += group._sum.amount ?? 0;
  }

  return {
    totalSales: saleData.totalSales,
    cashSales: saleData.cashSales,
    mobileMoneySales: saleData.mobileMoneySales,
    cardSales: saleData.cardSales,
    bankTransferSales: saleData.bankTransferSales,
    refunds: returnData.refunds,
    cashRefunds: returnData.refunds,
    discounts: saleData.discounts,
    expenses: expenseData.expenses,
    cashExpenses: expenseData.cashExpenses,
  };
}

export const openSession = asyncHandler(async (req: Request, res: Response) => {
  const data = openSessionSchema.parse(req.body);

  const existingOpen = await prisma.dailySession.findFirst({
    where: {
      userId: req.user!.sub,
      status: { in: ["pending_approval", "open", "pending_close_approval"] },
    },
  });
  if (existingOpen) {
    throw new ApiError(409, "You already have a pending or open session. Close it before opening a new one.");
  }

  const session = await prisma.dailySession.create({
    data: {
      userId: req.user!.sub,
      date: new Date(),
      openingCash: data.openingCash,
      status: "pending_approval",
    },
  });

  await recordAudit({
    req, action: "DAILY_SESSION_OPENED", module: "daily",
    description: `${req.user!.name} requested to open daily session with GHS ${data.openingCash.toFixed(2)} opening cash`,
    entity: "DailySession", entityId: session.id,
  });

  emitEvent(SOCKET_EVENTS.DAILY_SESSION_OPENED, { sessionId: session.id, userId: req.user!.sub, openingCash: data.openingCash });

  await notifyDailySessionOpened(session.id, req.user!.name, data.openingCash);

  res.status(201).json(serialize("dailySession", session));
});

export const closeSession = asyncHandler(async (req: Request, res: Response) => {
  const data = closeSessionSchema.parse(req.body);

  const session = await prisma.dailySession.findFirst({
    where: {
      userId: req.user!.sub,
      status: "open",
    },
  });
  if (!session) throw new ApiError(404, "No open session found");

  const aggregated = await aggregateSessionData(
    req.user!.sub,
    session.createdAt,
  );

  const expectedCash = session.openingCash + aggregated.cashSales - aggregated.cashRefunds - aggregated.cashExpenses;
  const variance = data.actualCash - expectedCash;

  const updated = await prisma.dailySession.update({
    where: { id: session.id },
    data: {
      status: "pending_close_approval",
      ...aggregated,
      expectedCash,
      actualCash: data.actualCash,
      actualMobileMoney: data.actualMobileMoney,
      actualCard: data.actualCard,
      actualBankTransfer: data.actualBankTransfer,
      variance,
    },
  });

  await recordAudit({
    req, action: "DAILY_SESSION_CLOSED", module: "daily",
    description: `${req.user!.name} requested to close daily session — Expected GHS ${expectedCash.toFixed(2)}, Actual GHS ${data.actualCash.toFixed(2)}, Variance GHS ${variance.toFixed(2)}`,
    entity: "DailySession", entityId: updated.id,
  });

  emitEvent(SOCKET_EVENTS.DAILY_SESSION_CLOSED, {
    sessionId: updated.id, userId: req.user!.sub,
    expectedCash, actualCash: data.actualCash, variance,
  });

  await notifyDailySessionClosed(updated.id, req.user!.name, expectedCash, data.actualCash, variance);

  res.json(serialize("dailySession", updated));
});

export const approveSession = asyncHandler(async (req: Request, res: Response) => {
  const data = approveSessionSchema.parse(req.body);
  const session = await prisma.dailySession.findUnique({ where: { id: req.params.id } });
  if (!session) throw new ApiError(404, "Session not found");
  if (session.status !== "pending_approval") throw new ApiError(400, "Only pending sessions can be approved");
  if (!MANAGER_ROLES.includes(req.user!.role)) throw new ApiError(403, "Only managers can approve sessions");

  const updated = await prisma.dailySession.update({
    where: { id: session.id },
    data: {
      status: "open",
      approvedById: req.user!.sub,
      approvedAt: new Date(),
    },
  });

  await recordAudit({
    req, action: "DAILY_SESSION_APPROVED", module: "daily",
    description: `${req.user!.name} approved session open for ${session.date.toDateString()}`,
    entity: "DailySession", entityId: session.id,
  });

  emitEvent(SOCKET_EVENTS.DAILY_SESSION_OPENED, { sessionId: session.id, approved: true });

  res.json(serialize("dailySession", updated));
});

export const approveSessionClose = asyncHandler(async (req: Request, res: Response) => {
  const data = approveSessionSchema.parse(req.body);
  const session = await prisma.dailySession.findUnique({ where: { id: req.params.id } });
  if (!session) throw new ApiError(404, "Session not found");
  if (session.status !== "pending_close_approval") throw new ApiError(400, "Only pending close sessions can be approved");
  if (!MANAGER_ROLES.includes(req.user!.role)) throw new ApiError(403, "Only managers can approve session close");

  const updated = await prisma.dailySession.update({
    where: { id: session.id },
    data: {
      status: "closed",
      closedAt: new Date(),
      closedById: req.user!.sub,
    },
  });

  await recordAudit({
    req, action: "DAILY_SESSION_CLOSE_APPROVED", module: "daily",
    description: `${req.user!.name} approved session close for ${session.date.toDateString()}`,
    entity: "DailySession", entityId: session.id,
  });

  emitEvent(SOCKET_EVENTS.DAILY_SESSION_CLOSED, { sessionId: session.id, approved: true });

  res.json(serialize("dailySession", updated));
});

export const rejectSessionClose = asyncHandler(async (req: Request, res: Response) => {
  const data = rejectSessionSchema.parse(req.body);
  const session = await prisma.dailySession.findUnique({ where: { id: req.params.id } });
  if (!session) throw new ApiError(404, "Session not found");
  if (session.status !== "pending_close_approval") throw new ApiError(400, "Only pending close sessions can be rejected");
  if (!MANAGER_ROLES.includes(req.user!.role)) throw new ApiError(403, "Only managers can reject session close");

  const updated = await prisma.dailySession.update({
    where: { id: session.id },
    data: {
      status: "open",
      totalSales: null,
      cashSales: null,
      mobileMoneySales: null,
      cardSales: null,
      bankTransferSales: null,
      refunds: null,
      cashRefunds: null,
      discounts: null,
      expenses: null,
      cashExpenses: null,
      expectedCash: null,
      actualCash: null,
      actualMobileMoney: null,
      actualCard: null,
      actualBankTransfer: null,
      variance: null,
    },
  });

  await recordAudit({
    req, action: "DAILY_SESSION_CLOSE_REJECTED", module: "daily",
    description: `${req.user!.name} rejected session close for ${session.date.toDateString()}: ${data.reviewNotes}`,
    entity: "DailySession", entityId: session.id,
  });

  res.json(serialize("dailySession", updated));
});

export const rejectSession = asyncHandler(async (req: Request, res: Response) => {
  const data = rejectSessionSchema.parse(req.body);
  const session = await prisma.dailySession.findUnique({ where: { id: req.params.id } });
  if (!session) throw new ApiError(404, "Session not found");
  if (session.status !== "pending_approval") throw new ApiError(400, "Only pending sessions can be rejected");
  if (!MANAGER_ROLES.includes(req.user!.role)) throw new ApiError(403, "Only managers can reject sessions");

  await prisma.dailySession.delete({ where: { id: session.id } });

  await recordAudit({
    req, action: "DAILY_SESSION_REJECTED", module: "daily",
    description: `${req.user!.name} rejected session open for ${session.date.toDateString()}: ${data.reviewNotes}`,
    entity: "DailySession", entityId: session.id,
  });

  res.json({ message: "Session rejected and removed" });
});

export const listPendingSessions = asyncHandler(async (req: Request, res: Response) => {
  if (!MANAGER_ROLES.includes(req.user!.role)) throw new ApiError(403, "Only managers can view pending sessions");

  const sessions = await prisma.dailySession.findMany({
    where: { status: { in: ["pending_approval", "pending_close_approval"] } },
    include: { user: { select: { id: true, name: true, email: true, staffId: true } } },
    omit: { userId: true },
    orderBy: { createdAt: "desc" },
  });

  res.json(serializeMany("dailySession", sessions));
});

export const getCurrentSession = asyncHandler(async (req: Request, res: Response) => {
  const session = await prisma.dailySession.findFirst({
    where: {
      userId: req.user!.sub,
      status: { in: ["pending_approval", "open", "pending_close_approval"] },
    },
    orderBy: { createdAt: "desc" },
  });

  res.json(serialize("dailySession", session));
});

export const listSessions = asyncHandler(async (req: Request, res: Response) => {
  const { from, to, status } = req.query as Record<string, string>;
  const where: Prisma.DailySessionWhereInput = {};

  const isManager = MANAGER_ROLES.includes(req.user!.role);
  if (!isManager) {
    where.userId = req.user!.sub;
    where.status = { in: ["open", "pending_close_approval", "closed"] };
  }

  if (status) where.status = status as SessionStatus;
  if (from || to) {
    const createdAt: Prisma.DateTimeFilter<"DailySession"> = {};
    if (from) createdAt.gte = new Date(from);
    if (to) createdAt.lte = new Date(to);
    where.createdAt = createdAt;
  }

  const sessions = await prisma.dailySession.findMany({
    where,
    include: { user: { select: { id: true, name: true, email: true } } },
    omit: { userId: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  res.json(serializeMany("dailySession", sessions));
});

export const getSessionSales = asyncHandler(async (req: Request, res: Response) => {
  const session = await prisma.dailySession.findUnique({ where: { id: req.params.id } });
  if (!session) throw new ApiError(404, "Session not found");

  const isManager = MANAGER_ROLES.includes(req.user!.role);
  if (!isManager && session.userId !== req.user!.sub) {
    throw new ApiError(403, "You can only view your own session sales");
  }

  const sales = await prisma.sale.findMany({
    where: {
      cashierId: session.userId,
      ...(session.closedAt ? { createdAt: { lte: session.closedAt } } : { createdAt: { gte: session.createdAt } }),
      status: { in: ["completed", "partially_refunded"] },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      transactionNumber: true,
      total: true,
      payments: { orderBy: { seq: "asc" } },
      paymentMethod: true,
      createdAt: true,
      status: true,
      customer: { select: { id: true, name: true } },
    },
  });

  res.json(serializeMany("sale", sales));
});

export const submitReport = asyncHandler(async (req: Request, res: Response) => {
  const data = submitReportSchema.parse(req.body);

  const session = await prisma.dailySession.findFirst({
    where: {
      userId: req.user!.sub,
      status: "closed",
    },
    orderBy: { closedAt: "desc" },
  });
  if (!session) throw new ApiError(404, "No closed session found to report on");

  const existingReport = await prisma.dailyReport.findFirst({
    where: {
      sessionId: session.id,
      status: { in: ["submitted", "approved"] },
    },
  });
  if (existingReport) {
    throw new ApiError(409, "A report has already been submitted for this session");
  }

  const aggregated = await aggregateSessionData(
    req.user!.sub,
    session.createdAt,
  );

  const expectedCash = session.openingCash + aggregated.cashSales - aggregated.cashRefunds - aggregated.cashExpenses;
  const variance = data.actualCash - expectedCash;

  let report = await prisma.dailyReport.findFirst({
    where: {
      sessionId: session.id,
      status: "draft",
    },
  });

  if (report) {
    report = await prisma.dailyReport.update({
      where: { id: report.id },
      data: {
        ...aggregated,
        expectedCash,
        actualCash: data.actualCash,
        variance,
        notes: data.notes,
        status: "submitted",
      },
    });
  } else {
    report = await prisma.dailyReport.create({
      data: {
        sessionId: session.id,
        userId: req.user!.sub,
        date: session.date,
        ...aggregated,
        expectedCash,
        actualCash: data.actualCash,
        variance,
        notes: data.notes,
        status: "submitted",
      },
    });
  }

  const populated = await prisma.dailyReport.findUnique({
    where: { id: report.id },
    include: { user: { select: { id: true, name: true, email: true } } },
    omit: { userId: true },
  });

  await recordAudit({
    req, action: "DAILY_REPORT_SUBMITTED", module: "daily",
    description: `${req.user!.name} submitted daily report — Expected GHS ${expectedCash.toFixed(2)}, Actual GHS ${data.actualCash.toFixed(2)}, Variance GHS ${variance.toFixed(2)}`,
    entity: "DailyReport", entityId: report.id,
  });

  emitEvent(SOCKET_EVENTS.DAILY_REPORT_SUBMITTED, serialize("dailyReport", populated));

  await notifyDailyReportSubmitted(report.id, req.user!.name, session.date, variance);

  res.status(201).json(serialize("dailyReport", populated));
});

export const getReportById = asyncHandler(async (req: Request, res: Response) => {
  const report = await prisma.dailyReport.findUnique({
    where: { id: req.params.id },
    include: {
      user: { select: { id: true, name: true, email: true } },
      reviewedBy: { select: { id: true, name: true, email: true } },
      session: true,
    },
    omit: { userId: true, reviewedById: true, sessionId: true },
  });
  if (!report) throw new ApiError(404, "Report not found");
  res.json(serialize("dailyReport", report));
});

export const listPendingReports = asyncHandler(async (req: Request, res: Response) => {
  const reports = await prisma.dailyReport.findMany({
    where: { status: { in: ["submitted", "draft"] } },
    include: {
      user: { select: { id: true, name: true, email: true } },
      session: true,
    },
    omit: { userId: true, sessionId: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(serializeMany("dailyReport", reports));
});

export const listAllReports = asyncHandler(async (req: Request, res: Response) => {
  const { status } = req.query as Record<string, string>;
  const where: Prisma.DailyReportWhereInput = {};
  if (status) where.status = status as ReportStatus;

  const isManager = MANAGER_ROLES.includes(req.user!.role);
  if (!isManager) {
    where.userId = req.user!.sub;
  }

  const reports = await prisma.dailyReport.findMany({
    where,
    include: {
      user: { select: { id: true, name: true, email: true } },
      reviewedBy: { select: { id: true, name: true, email: true } },
    },
    omit: { userId: true, reviewedById: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  res.json(serializeMany("dailyReport", reports));
});

export const approveReport = asyncHandler(async (req: Request, res: Response) => {
  const data = approveReportSchema.parse(req.body);
  const report = await prisma.dailyReport.findUnique({ where: { id: req.params.id } });
  if (!report) throw new ApiError(404, "Report not found");
  if (report.status !== "submitted") throw new ApiError(400, "Only submitted reports can be approved");
  if (!MANAGER_ROLES.includes(req.user!.role)) throw new ApiError(403, "Only managers can approve reports");

  const updated = await prisma.dailyReport.update({
    where: { id: report.id },
    data: {
      status: "approved",
      reviewedById: req.user!.sub,
      reviewNotes: data.reviewNotes,
      reviewedAt: new Date(),
    },
  });

  await recordAudit({
    req, action: "DAILY_REPORT_APPROVED", module: "daily",
    description: `${req.user!.name} approved daily report for ${report.date.toDateString()}`,
    entity: "DailyReport", entityId: report.id,
  });

  emitEvent(SOCKET_EVENTS.DAILY_REPORT_APPROVED, { id: report.id, approvedBy: req.user!.name });

  const staffUser = updated.userId;
  if (staffUser) {
    await notifyDailyReportApproved(report.id, req.user!.name, report.date, staffUser);
  }

  res.json(serialize("dailyReport", updated));
});

export const rejectReport = asyncHandler(async (req: Request, res: Response) => {
  const data = rejectReportSchema.parse(req.body);
  const report = await prisma.dailyReport.findUnique({ where: { id: req.params.id } });
  if (!report) throw new ApiError(404, "Report not found");
  if (report.status !== "submitted") throw new ApiError(400, "Only submitted reports can be rejected");
  if (!MANAGER_ROLES.includes(req.user!.role)) throw new ApiError(403, "Only managers can reject reports");

  const updated = await prisma.dailyReport.update({
    where: { id: report.id },
    data: {
      status: "rejected",
      reviewedById: req.user!.sub,
      reviewNotes: data.reviewNotes,
      reviewedAt: new Date(),
    },
  });

  await recordAudit({
    req, action: "DAILY_REPORT_REJECTED", module: "daily",
    description: `${req.user!.name} rejected daily report for ${report.date.toDateString()}: ${data.reviewNotes}`,
    entity: "DailyReport", entityId: report.id,
  });

  emitEvent(SOCKET_EVENTS.DAILY_REPORT_REJECTED, { id: report.id, rejectedBy: req.user!.name, reason: data.reviewNotes });

  const staffUser = updated.userId;
  if (staffUser) {
    await notifyDailyReportRejected(report.id, req.user!.name, report.date, data.reviewNotes, staffUser);
  }

  res.json(serialize("dailyReport", updated));
});
