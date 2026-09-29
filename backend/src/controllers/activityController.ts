import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { serializeMany } from "../utils/serialize";
import { asyncHandler } from "../utils/asyncHandler";

const performanceQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  user: z.string().optional(),
});

export const getStaffPerformance = asyncHandler(async (req: Request, res: Response) => {
  const data = performanceQuerySchema.parse(req.query);
  const matchFilter: Prisma.SaleWhereInput = { status: "completed" };
  if (data.from || data.to) {
    matchFilter.createdAt = {
      gte: data.from ? new Date(data.from) : undefined,
      lte: data.to ? new Date(data.to) : undefined,
    };
  }
  if (data.user) matchFilter.cashierId = data.user;

  const salesAgg = await prisma.sale.groupBy({
    by: ["cashierId"],
    where: matchFilter,
    _count: { _all: true },
    _sum: { total: true },
  });

  const refundFilter: Prisma.SaleReturnWhereInput = { status: { in: ["completed", "approved"] } };
  if (data.from || data.to) {
    refundFilter.createdAt = {
      gte: data.from ? new Date(data.from) : undefined,
      lte: data.to ? new Date(data.to) : undefined,
    };
  }
  if (data.user) refundFilter.requestedById = data.user;

  const refundsAgg = await prisma.saleReturn.groupBy({
    by: ["requestedById"],
    where: refundFilter,
    _count: { _all: true },
    _sum: { refundAmount: true },
  });

  const sessionFilter: Prisma.DailySessionWhereInput = {};
  if (data.from || data.to) {
    sessionFilter.createdAt = {
      gte: data.from ? new Date(data.from) : undefined,
      lte: data.to ? new Date(data.to) : undefined,
    };
  }
  if (data.user) sessionFilter.userId = data.user;

  const sessionsAgg = await prisma.dailySession.groupBy({
    by: ["userId"],
    where: sessionFilter,
    _count: { _all: true },
  });
  const sessionsClosedAgg = await prisma.dailySession.groupBy({
    by: ["userId"],
    where: { ...sessionFilter, status: "closed" },
    _count: { _all: true },
  });

  const reportFilter: Prisma.DailyReportWhereInput = {};
  if (data.from || data.to) {
    reportFilter.createdAt = {
      gte: data.from ? new Date(data.from) : undefined,
      lte: data.to ? new Date(data.to) : undefined,
    };
  }
  if (data.user) reportFilter.userId = data.user;

  const reportsAgg = await prisma.dailyReport.groupBy({
    by: ["userId"],
    where: reportFilter,
    _count: { _all: true },
  });
  const reportsApprovedAgg = await prisma.dailyReport.groupBy({
    by: ["userId"],
    where: { ...reportFilter, status: "approved" },
    _count: { _all: true },
  });

  const allUserIds = new Set<string>();
  salesAgg.forEach((a) => allUserIds.add(a.cashierId));
  refundsAgg.forEach((a) => allUserIds.add(a.requestedById));
  sessionsAgg.forEach((a) => allUserIds.add(a.userId));
  reportsAgg.forEach((a) => allUserIds.add(a.userId));

  const salesMap = new Map(salesAgg.map((a) => [a.cashierId, a]));
  const refundsMap = new Map(refundsAgg.map((a) => [a.requestedById, a]));
  const sessionsMap = new Map(sessionsAgg.map((a) => [a.userId, a]));
  const sessionsClosedMap = new Map(sessionsClosedAgg.map((a) => [a.userId, a._count._all]));
  const reportsMap = new Map(reportsAgg.map((a) => [a.userId, a]));
  const reportsApprovedMap = new Map(reportsApprovedAgg.map((a) => [a.userId, a._count._all]));

  const performance = Array.from(allUserIds).map((userId) => {
    const sales = salesMap.get(userId);
    const refunds = refundsMap.get(userId);
    const sessions = sessionsMap.get(userId);
    const reports = reportsMap.get(userId);
    return {
      user: userId,
      salesCount: sales?._count._all ?? 0,
      salesValue: sales?._sum.total ?? 0,
      refundCount: refunds?._count._all ?? 0,
      refundValue: refunds?._sum.refundAmount ?? 0,
      sessionsOpened: sessions?._count._all ?? 0,
      sessionsClosed: sessionsClosedMap.get(userId) ?? 0,
      reportsSubmitted: reports?._count._all ?? 0,
      reportsApproved: reportsApprovedMap.get(userId) ?? 0,
    };
  });

  const users = await prisma.user.findMany({
    where: { id: { in: Array.from(allUserIds) } },
    select: { id: true, name: true, email: true, role: true },
  });
  const userMap = new Map(users.map((u) => [u.id, { name: u.name, email: u.email, role: u.role }]));

  const result = performance.map((p) => ({
    ...p,
    userInfo: userMap.get(p.user) ?? null,
  }));

  res.json(result);
});

export const getRecentActivity = asyncHandler(async (req: Request, res: Response) => {
  const { limit } = req.query as Record<string, string>;
  const n = Math.min(parseInt(limit ?? "50", 10) || 50, 200);
  const logs = await prisma.auditLog.findMany({
    include: { user: { select: { id: true, name: true, email: true, role: true } } },
    omit: { userId: true },
    orderBy: { createdAt: "desc" },
    take: n,
  });
  res.json(serializeMany("auditLog", logs));
});
