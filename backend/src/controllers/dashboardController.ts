import { Prisma } from "@prisma/client";
import { Request, Response } from "express";
import { prisma } from "../config/prisma";
import { syncInventoryAlertsToNotifications } from "../services/notificationService";
import { asyncHandler } from "../utils/asyncHandler";
import { serializeMany } from "../utils/serialize";

function parseDateRange(query: Record<string, string | undefined>) {
  const to = query.to ? new Date(query.to) : new Date();
  const from = query.from ? new Date(query.from) : new Date(to);
  if (!query.from) {
    from.setDate(from.getDate() - 6);
  }
  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

function buildSaleMatch(
  query: Record<string, string | undefined>,
  extra?: Prisma.SaleWhereInput,
) {
  const { from, to } = parseDateRange(query);
  const match: Prisma.SaleWhereInput = {
    createdAt: { gte: from, lte: to },
    status: { in: ["completed", "partially_refunded", "refunded"] },
    ...extra,
  };
  if (query.branch) match.branch = query.branch;
  if (query.cashier) match.cashierId = query.cashier;
  return match;
}

function buildExpenseMatch(query: Record<string, string | undefined>): Prisma.ExpenseWhereInput {
  const { from, to } = parseDateRange(query);
  return { date: { gte: from, lte: to }, status: "approved" };
}

export const dashboardSummary = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as Record<string, string>;
  const { from, to } = parseDateRange(query);

  const saleMatch = buildSaleMatch(query);
  const expenseMatch = buildExpenseMatch(query);

  const [salesAgg, salesByMethod, cashRows, expensesByMethod, medicines] = await Promise.all([
    prisma.sale.aggregate({
      where: saleMatch,
      _count: { _all: true },
      _sum: { total: true, costOfGoods: true, discount: true, tax: true, refundedAmount: true },
    }),
    prisma.sale.groupBy({
      by: ["paymentMethod"],
      where: saleMatch,
      _sum: { total: true },
    }),
    prisma.sale.findMany({
      where: { ...saleMatch, paymentMethod: "cash" },
      select: { total: true, amountReceived: true, changeAmount: true },
    }),
    prisma.expense.groupBy({
      by: ["paymentMethod"],
      where: expenseMatch,
      _sum: { amount: true },
    }),
    prisma.medicine.findMany({
      select: {
        sellingPrice: true,
        reorderLevel: true,
        batches: { select: { quantity: true } },
      },
    }),
  ]);

  const [expiringSoon, expired, activeStaff, openSessions] = await Promise.all([
    prisma.medicineBatch.count({
      where: { quantity: { gt: 0 }, expiryDate: { gt: new Date(), lte: new Date(Date.now() + 30 * 86400000) } },
    }),
    prisma.medicineBatch.count({ where: { quantity: { gt: 0 }, expiryDate: { lt: new Date() } } }),
    prisma.user.count({ where: { isActive: true } }),
    prisma.dailySession.count({ where: { status: "open" } }),
  ]);

  const methodTotals: Record<string, number | null> = {};
  for (const group of salesByMethod) {
    methodTotals[group.paymentMethod] = group._sum.total;
  }

  let cashReceived = 0;
  let cashChange = 0;
  for (const row of cashRows) {
    cashReceived += row.amountReceived ?? row.total;
    cashChange += row.changeAmount ?? 0;
  }

  let totalExpenses = 0;
  let cashExpenses = 0;
  for (const group of expensesByMethod) {
    totalExpenses += group._sum.amount ?? 0;
    if (group.paymentMethod === "cash") cashExpenses += group._sum.amount ?? 0;
  }

  let inventoryValue = 0;
  let lowStockCount = 0;
  let totalMedicines = 0;
  for (const medicine of medicines) {
    if (medicine.batches.length === 0) continue;
    const totalStock = medicine.batches.reduce((sum, batch) => sum + batch.quantity, 0);
    inventoryValue += totalStock * medicine.sellingPrice;
    if (totalStock <= medicine.reorderLevel) lowStockCount += 1;
    totalMedicines += 1;
  }

  const s = {
    totalRevenue: salesAgg._sum.total,
    totalCost: salesAgg._sum.costOfGoods,
    totalDiscount: salesAgg._sum.discount,
    totalTax: salesAgg._sum.tax,
    transactionCount: salesAgg._count._all,
    cashTotal: methodTotals["cash"],
    mobileMoneyTotal: methodTotals["mobile_money"],
    cardTotal: methodTotals["card"],
    bankTransferTotal: methodTotals["bank_transfer"],
    otherTotal: methodTotals["other"],
    refundTotal: salesAgg._sum.refundedAmount,
  };
  const cashData = { cashReceived, cashChange };
  const exp = { totalExpenses, cashExpenses };
  const inv = { inventoryValue, lowStockCount, totalMedicines };

  const grossProfit = (s.totalRevenue || 0) - (s.totalCost || 0);
  const netProfit = grossProfit - (exp.totalExpenses || 0);

  res.json({
    totalRevenue: s.totalRevenue || 0,
    transactionCount: s.transactionCount || 0,
    grossProfit,
    netProfit,
    cashTotal: s.cashTotal || 0,
    mobileMoneyTotal: s.mobileMoneyTotal || 0,
    cardTotal: s.cardTotal || 0,
    bankTransferTotal: s.bankTransferTotal || 0,
    otherTotal: s.otherTotal || 0,
    totalDiscount: s.totalDiscount || 0,
    totalTax: s.totalTax || 0,
    cashReceived: cashData.cashReceived || 0,
    cashChange: cashData.cashChange || 0,
    totalExpenses: exp.totalExpenses || 0,
    cashExpenses: exp.cashExpenses || 0,
    inventoryValue: inv.inventoryValue || 0,
    lowStockCount: inv.lowStockCount || 0,
    totalMedicines: inv.totalMedicines || 0,
    expiringSoon,
    expired,
    activeStaff,
    openSessions,
    dateRange: { from: from.toISOString(), to: to.toISOString() },
  });
});

export const revenueTrend = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as Record<string, string>;
  const days = Number(query.days ?? 7);
  const since = new Date();
  since.setDate(since.getDate() - days + 1);
  since.setHours(0, 0, 0, 0);

  const match: Prisma.SaleWhereInput = {
    createdAt: { gte: since },
    status: { in: ["completed", "partially_refunded", "refunded"] },
  };
  if (query.branch) match.branch = query.branch;
  if (query.cashier) match.cashierId = query.cashier;

  const sales = await prisma.sale.findMany({
    where: match,
    select: { createdAt: true, total: true, costOfGoods: true },
  });

  const grouped = new Map<string, { revenue: number; transactions: number; profit: number }>();
  for (const sale of sales) {
    const key = sale.createdAt.toISOString().slice(0, 10);
    const bucket = grouped.get(key);
    if (bucket) {
      bucket.revenue += sale.total;
      bucket.transactions += 1;
      bucket.profit += sale.total - sale.costOfGoods;
    } else {
      grouped.set(key, { revenue: sale.total, transactions: 1, profit: sale.total - sale.costOfGoods });
    }
  }

  const result = [...grouped.entries()]
    .map(([date, data]) => ({ _id: date, ...data }))
    .sort((a, b) => (a._id < b._id ? -1 : a._id > b._id ? 1 : 0));

  const buckets: Record<string, { revenue: number; transactions: number; profit: number }> = {};
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    buckets[key] = { revenue: 0, transactions: 0, profit: 0 };
  }
  result.forEach((r) => {
    if (buckets[r._id]) {
      buckets[r._id] = { revenue: r.revenue, transactions: r.transactions, profit: r.profit };
    }
  });

  res.json(Object.entries(buckets).map(([date, data]) => ({ date, ...data })));
});

export const paymentBreakdown = asyncHandler(async (req: Request, res: Response) => {
  const match = buildSaleMatch(req.query as Record<string, string>);

  const sales = await prisma.sale.findMany({
    where: match,
    select: { payments: { orderBy: { seq: "asc" } } },
  });

  const grouped = new Map<string, { total: number; count: number }>();
  for (const sale of sales) {
    for (const payment of sale.payments) {
      const bucket = grouped.get(payment.method);
      if (bucket) {
        bucket.total += payment.amount;
        bucket.count += 1;
      } else {
        grouped.set(payment.method, { total: payment.amount, count: 1 });
      }
    }
  }

  const result = [...grouped.entries()]
    .map(([method, data]) => ({ _id: method, ...data }))
    .sort((a, b) => b.total - a.total);

  res.json(result.map((r) => ({ method: r._id, total: r.total, count: r.count })));
});

export const topMedicines = asyncHandler(async (req: Request, res: Response) => {
  const match = buildSaleMatch(req.query as Record<string, string>);
  const limit = Math.min(Number(req.query.limit ?? 10), 50);

  const sales = await prisma.sale.findMany({
    where: match,
    select: { items: { select: { medicineId: true, name: true, quantity: true, subtotal: true }, orderBy: { seq: "asc" } } },
  });

  const grouped = new Map<string, { name: string; totalQuantity: number; totalRevenue: number; transactionCount: number }>();
  for (const sale of sales) {
    for (const item of sale.items) {
      const bucket = grouped.get(item.medicineId);
      if (bucket) {
        bucket.totalQuantity += item.quantity;
        bucket.totalRevenue += item.subtotal;
        bucket.transactionCount += 1;
      } else {
        grouped.set(item.medicineId, { name: item.name, totalQuantity: item.quantity, totalRevenue: item.subtotal, transactionCount: 1 });
      }
    }
  }

  const groupedResult = [...grouped.entries()]
    .map(([medicineId, data]) => ({ _id: medicineId, ...data }))
    .sort((a, b) => b.totalQuantity - a.totalQuantity)
    .slice(0, limit);

  const medicines = await prisma.medicine.findMany({
    where: { id: { in: groupedResult.map((r) => r._id) } },
    select: { id: true, category: { select: { name: true } } },
  });
  const categoryByMedicine = new Map(medicines.map((medicine) => [medicine.id, medicine.category.name]));

  const result = groupedResult.map((r) => ({
    _id: r._id,
    name: r.name,
    totalQuantity: r.totalQuantity,
    totalRevenue: r.totalRevenue,
    transactionCount: r.transactionCount,
    category: categoryByMedicine.get(r._id) ?? null,
  }));

  res.json(result);
});

export const salesByStaff = asyncHandler(async (req: Request, res: Response) => {
  const match = buildSaleMatch(req.query as Record<string, string>);

  const sales = await prisma.sale.findMany({
    where: match,
    select: { cashierId: true, total: true, costOfGoods: true, refundedAmount: true },
  });

  const grouped = new Map<string, { totalSales: number; totalCost: number; transactionCount: number; totalRefunded: number }>();
  for (const sale of sales) {
    const bucket = grouped.get(sale.cashierId);
    if (bucket) {
      bucket.totalSales += sale.total;
      bucket.totalCost += sale.costOfGoods;
      bucket.transactionCount += 1;
      bucket.totalRefunded += sale.refundedAmount;
    } else {
      grouped.set(sale.cashierId, { totalSales: sale.total, totalCost: sale.costOfGoods, transactionCount: 1, totalRefunded: sale.refundedAmount });
    }
  }

  const groupedResult = [...grouped.entries()]
    .map(([cashierId, data]) => ({ _id: cashierId, ...data, profit: data.totalSales - data.totalCost }))
    .sort((a, b) => b.totalSales - a.totalSales);

  const users = await prisma.user.findMany({
    where: { id: { in: groupedResult.map((r) => r._id) } },
    select: { id: true, name: true, email: true, role: true },
  });
  const userById = new Map(users.map((user) => [user.id, user]));

  const result = groupedResult.map((r) => {
    const user = userById.get(r._id);
    return {
      _id: r._id,
      name: user?.name ?? null,
      email: user?.email ?? null,
      role: user?.role ?? null,
      totalSales: r.totalSales,
      totalCost: r.totalCost,
      profit: r.profit,
      transactionCount: r.transactionCount,
      totalRefunded: r.totalRefunded,
    };
  });

  res.json(result);
});

export const inventoryAlerts = asyncHandler(async (req: Request, res: Response) => {
  const lowStockThreshold = Number(req.query.threshold ?? 20);

  const now = new Date();
  const soon = new Date(Date.now() + 30 * 86400000);

  const [batchStock, activeMedicines, expiringRows, expiredRows] = await Promise.all([
    prisma.medicineBatch.findMany({ select: { medicineId: true, quantity: true } }),
    prisma.medicine.findMany({
      where: { status: "active" },
      select: { id: true, name: true, reorderLevel: true, minStock: true },
    }),
    prisma.medicineBatch.findMany({
      where: { quantity: { gt: 0 }, expiryDate: { gt: now, lte: soon } },
      select: {
        batchNumber: true,
        quantity: true,
        expiryDate: true,
        medicine: { select: { name: true } },
      },
    }),
    prisma.medicineBatch.findMany({
      where: { quantity: { gt: 0 }, expiryDate: { lt: now } },
      select: {
        batchNumber: true,
        quantity: true,
        expiryDate: true,
        medicine: { select: { name: true } },
      },
    }),
  ]);

  const stockByMedicine = new Map<string, number>();
  for (const batch of batchStock) {
    stockByMedicine.set(batch.medicineId, (stockByMedicine.get(batch.medicineId) ?? 0) + batch.quantity);
  }

  const lowStock: { medicineId: string; name: string; currentStock: number; reorderLevel: number; minStock: number }[] = [];
  for (const medicine of activeMedicines) {
    const currentStock = stockByMedicine.get(medicine.id);
    if (currentStock === undefined || currentStock > medicine.reorderLevel) continue;
    lowStock.push({
      medicineId: medicine.id,
      name: medicine.name,
      currentStock,
      reorderLevel: medicine.reorderLevel,
      minStock: medicine.minStock,
    });
  }
  lowStock.sort((a, b) => a.currentStock - b.currentStock);

  const expiringSoon = expiringRows.map((batch) => ({
    batchNumber: batch.batchNumber,
    medicine: batch.medicine.name,
    quantity: batch.quantity,
    expiryDate: batch.expiryDate,
    daysUntilExpiry: (batch.expiryDate.getTime() - now.getTime()) / 86400000,
  }));
  expiringSoon.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);

  const expired = expiredRows.map((batch) => ({
    batchNumber: batch.batchNumber,
    medicine: batch.medicine.name,
    quantity: batch.quantity,
    expiryDate: batch.expiryDate,
    daysExpired: (now.getTime() - batch.expiryDate.getTime()) / 86400000,
  }));
  expired.sort((a, b) => b.daysExpired - a.daysExpired);

  res.json({ lowStock, expiringSoon, expired });
});

export const salesByCategory = asyncHandler(async (req: Request, res: Response) => {
  const match = buildSaleMatch(req.query as Record<string, string>);

  const sales = await prisma.sale.findMany({
    where: match,
    select: { items: { select: { medicineId: true, quantity: true, subtotal: true }, orderBy: { seq: "asc" } } },
  });

  const medicineIds = [...new Set(sales.flatMap((sale) => sale.items.map((item) => item.medicineId)))];
  const medicines = await prisma.medicine.findMany({
    where: { id: { in: medicineIds } },
    select: { id: true, category: { select: { name: true } } },
  });
  const categoryByMedicine = new Map(medicines.map((medicine) => [medicine.id, medicine.category.name]));

  const grouped = new Map<string | null, { totalRevenue: number; totalQuantity: number; transactionCount: number }>();
  for (const sale of sales) {
    for (const item of sale.items) {
      const key = categoryByMedicine.get(item.medicineId) ?? null;
      const bucket = grouped.get(key);
      if (bucket) {
        bucket.totalRevenue += item.subtotal;
        bucket.totalQuantity += item.quantity;
        bucket.transactionCount += 1;
      } else {
        grouped.set(key, { totalRevenue: item.subtotal, totalQuantity: item.quantity, transactionCount: 1 });
      }
    }
  }

  const result = [...grouped.entries()]
    .map(([category, data]) => ({ _id: category, ...data }))
    .sort((a, b) => b.totalRevenue - a.totalRevenue);

  res.json(
    result.map((r) => ({
      category: r._id || "Uncategorized",
      totalRevenue: r.totalRevenue,
      totalQuantity: r.totalQuantity,
      transactionCount: r.transactionCount,
    })),
  );
});

export const staffDashboard = asyncHandler(async (req: Request, res: Response) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const userId = req.user!.sub;

  const [todaySales, todayCashSales, pendingRefunds, currentSession, todayReport] = await Promise.all([
    prisma.sale.aggregate({
      where: { cashierId: userId, createdAt: { gte: today }, status: { in: ["completed", "partially_refunded", "refunded"] } },
      _count: { _all: true },
      _sum: { total: true },
    }),
    prisma.sale.aggregate({
      where: { cashierId: userId, createdAt: { gte: today }, status: { in: ["completed", "partially_refunded", "refunded"] }, paymentMethod: "cash" },
      _sum: { total: true },
    }),
    prisma.saleReturn.count({ where: { requestedById: userId, status: "pending" } }),
    prisma.dailySession.findFirst({ where: { userId, status: "open" } }),
    prisma.dailyReport.findFirst({ where: { userId, date: { gte: today } } }),
  ]);

  res.json({
    todaySales: todaySales._sum.total || 0,
    todayTransactions: todaySales._count._all || 0,
    todayCashSales: todayCashSales._sum.total || 0,
    pendingRefunds,
    currentSession: currentSession
      ? { id: currentSession.id, openingCash: currentSession.openingCash, status: currentSession.status, date: currentSession.createdAt }
      : null,
    todayReport: todayReport
      ? { id: todayReport.id, status: todayReport.status, totalSales: todayReport.totalSales, variance: todayReport.variance }
      : null,
  });
});

export const recentActivity = asyncHandler(async (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit ?? 20), 100);
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { user: { select: { id: true, name: true, email: true, role: true } } },
    omit: { userId: true },
  });
  res.json(serializeMany("auditLog", logs));
});

export const syncAlerts = asyncHandler(async (req: Request, res: Response) => {
  const result = await syncInventoryAlertsToNotifications();
  res.json({ message: "Inventory alerts synced to notifications", ...result });
});
