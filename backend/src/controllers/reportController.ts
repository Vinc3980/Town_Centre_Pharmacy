import { ClaimStatus, PaymentMethod, Prisma, SaleStatus } from "@prisma/client";
import { Response } from "express";
import { prisma } from "../config/prisma";
import { asyncHandler } from "../utils/asyncHandler";
import { sendCsv, sendExcel, sendPdf, ReportMeta } from "../utils/exporter";
import { serializeMany } from "../utils/serialize";

function parseDates(query: Record<string, string | undefined>) {
  const from = query.from ? new Date(query.from) : new Date(new Date().setDate(new Date().getDate() - 30));
  const to = query.to ? new Date(query.to) : new Date();
  to.setHours(23, 59, 59, 999);
  from.setHours(0, 0, 0, 0);
  return { from, to };
}

function parsePagination(query: Record<string, string | undefined>) {
  const page = Math.max(1, parseInt(query.page ?? "1", 10));
  const limit = Math.min(200, Math.max(1, parseInt(query.limit ?? "50", 10)));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

function setEnumFilter(match: Record<string, unknown>, key: string, value: string | undefined, allowed: readonly string[]) {
  if (!value) return;
  if (allowed.includes(value)) match[key] = value;
  else match.id = { in: [] };
}

function buildBaseMatch(query: Record<string, string | undefined>, supportsBranch = true) {
  const { from, to } = parseDates(query);
  const match: Record<string, unknown> = { createdAt: { gte: from, lte: to } };
  if (query.branch) {
    if (supportsBranch) match.branch = query.branch;
    else match.id = { in: [] };
  }
  return { match, from, to };
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

async function getReportMeta(): Promise<ReportMeta> {
  const pharmacy = await prisma.pharmacy.findFirst();
  const info = [
    pharmacy?.address,
    pharmacy?.city,
    pharmacy?.phone,
    pharmacy?.email,
  ].filter(Boolean).join(" · ");
  return {
    pharmacyName: pharmacy?.name || "Adom Pharmacy",
    pharmacyInfo: info || undefined,
    generatedAt: new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }),
  };
}

async function jsonOrExport(res: Response, query: Record<string, string | undefined>, title: string, headers: string[], rows: unknown[][], filename: string) {
  const format = query.format;
  if (!format) return false;
  const meta = await getReportMeta();
  if (format === "csv") { sendCsv(res, `${filename}.csv`, headers, rows, meta); return true; }
  if (format === "xlsx") { sendExcel(res, `${filename}.xlsx`, title, headers, rows, meta); return true; }
  if (format === "pdf") { sendPdf(res, `${filename}.pdf`, title, headers, rows, meta); return true; }
  return false;
}

// ── Sales Report ──

export const salesReport = asyncHandler(async (req, res) => {
  const query = req.query as Record<string, string>;
  const { match } = buildBaseMatch(query);
  const { page, limit, skip } = parsePagination(query);

  if (query.cashier) match.cashierId = query.cashier;
  setEnumFilter(match, "paymentMethod", query.paymentMethod, Object.values(PaymentMethod));
  setEnumFilter(match, "status", query.status, Object.values(SaleStatus));
  const where = match as Prisma.SaleWhereInput;

  const [rows, total, agg] = await Promise.all([
    prisma.sale.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: { cashier: { select: { name: true } }, items: { orderBy: { seq: "asc" } } },
    }),
    prisma.sale.count({ where }),
    prisma.sale.aggregate({
      where,
      _sum: { total: true, costOfGoods: true, discount: true, tax: true },
      _count: { _all: true },
    }),
  ]);

  const results = rows.map((r) => ({
    _id: r.id,
    transactionNumber: r.transactionNumber,
    date: r.createdAt,
    cashier: r.cashier.name,
    items: serializeMany("saleItem", r.items),
    subtotal: r.subtotal,
    discount: r.discount,
    tax: r.tax,
    total: r.total,
    costOfGoods: r.costOfGoods,
    paymentMethod: r.paymentMethod,
    status: r.status,
  }));

  const s = agg._count._all > 0
    ? {
        _id: null,
        totalRevenue: agg._sum.total ?? 0,
        totalCost: agg._sum.costOfGoods ?? 0,
        totalDiscount: agg._sum.discount ?? 0,
        totalTax: agg._sum.tax ?? 0,
        count: agg._count._all,
      }
    : { totalRevenue: 0, totalCost: 0, totalDiscount: 0, totalTax: 0, count: 0 };
  const summaryData = { ...s, profit: s.totalRevenue - s.totalCost };

  if (await jsonOrExport(res, query, "Sales Report", ["Transaction #", "Date", "Cashier", "Items", "Subtotal", "Discount", "Tax", "Total", "Payment", "Status"],
    results.map((r) => [r.transactionNumber, new Date(r.date).toLocaleDateString("en-GB"), r.cashier, r.items?.length ?? 0, r.subtotal, r.discount, r.tax, r.total, r.paymentMethod, r.status]),
    "sales-report")) return;

  res.json({ data: results, summary: summaryData, pagination: { page, limit, total } });
});

// ── Insurance Claims Report ──

export const insuranceReport = asyncHandler(async (req, res) => {
  const query = req.query as Record<string, string>;
  const { match } = buildBaseMatch(query);
  const { page, limit, skip } = parsePagination(query);

  match.saleType = "insurance";
  setEnumFilter(match, "claimStatus", query.claimStatus, Object.values(ClaimStatus));
  if (query.cashier) match.cashierId = query.cashier;
  const where = match as Prisma.SaleWhereInput;

  const [rows, total, agg, statusCounts] = await Promise.all([
    prisma.sale.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        cashier: { select: { name: true } },
        customer: { select: { name: true, phone: true } },
      },
    }),
    prisma.sale.count({ where }),
    prisma.sale.aggregate({ where, _sum: { total: true }, _count: { _all: true } }),
    prisma.sale.groupBy({ by: ["claimStatus"], where, _count: { _all: true } }),
  ]);

  const results = rows.map((r) => ({
    _id: r.id,
    transactionNumber: r.transactionNumber,
    date: r.createdAt,
    customer: r.customer?.name ?? "—",
    phone: r.customer?.phone ?? "",
    insuranceProvider: r.insuranceProvider ?? "",
    policyOrNhisNumber: r.policyOrNhisNumber ?? "",
    total: r.total,
    claimStatus: r.claimStatus,
    cashier: r.cashier.name,
  }));

  const countsByStatus: Record<string, number> = { pending: 0, submitted: 0, approved: 0, rejected: 0 };
  for (const g of statusCounts) countsByStatus[g.claimStatus] = g._count._all;
  const summaryData = {
    _id: null,
    count: agg._count._all,
    totalClaimValue: agg._sum.total ?? 0,
    pendingCount: countsByStatus.pending,
    submittedCount: countsByStatus.submitted,
    approvedCount: countsByStatus.approved,
    rejectedCount: countsByStatus.rejected,
  };

  if (await jsonOrExport(res, query, "Insurance Claims Register",
    ["Transaction #", "Date", "Customer", "Phone", "Provider", "Policy/NHIS #", "Total", "Claim Status", "Cashier"],
    results.map((r) => [r.transactionNumber, new Date(r.date).toLocaleDateString("en-GB"), r.customer, r.phone, r.insuranceProvider, r.policyOrNhisNumber, r.total, r.claimStatus, r.cashier]),
    "insurance-claims")) return;

  res.json({ data: results, summary: summaryData, pagination: { page, limit, total } });
});

// ── Controlled Substances Register ──
export const controlledSubstancesReport = asyncHandler(async (req, res) => {
  const query = req.query as Record<string, string>;
  const { match } = buildBaseMatch(query);
  const { page, limit, skip } = parsePagination(query);

  const where: Prisma.SaleWhereInput = {
    ...match,
    status: { in: ["completed", "partially_refunded", "refunded"] as SaleStatus[] },
    items: { some: { medicine: { isControlledSubstance: true } } },
  };

  const [rows, total, agg, unitAgg] = await Promise.all([
    prisma.sale.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        cashier: { select: { name: true } },
        dispensedBy: { select: { name: true } },
        items: {
          include: {
            medicine: { select: { name: true, isControlledSubstance: true, controlledSubstanceClass: true } },
          },
        },
      },
    }),
    prisma.sale.count({ where }),
    prisma.sale.aggregate({ where, _sum: { total: true }, _count: { _all: true } }),
    prisma.saleItem.aggregate({
      where: { sale: where, medicine: { isControlledSubstance: true } },
      _sum: { quantity: true },
    }),
  ]);

  const results = rows.map((r) => {
    const ctrlItems = r.items.filter((it) => it.medicine.isControlledSubstance);
    return {
      _id: r.id,
      transactionNumber: r.transactionNumber,
      date: r.createdAt,
      medicines: ctrlItems.map((it) => `${it.name} x${it.quantity}`).join(", "),
      quantity: ctrlItems.reduce((s, it) => s + it.quantity, 0),
      controlledSubstanceClass:
        [...new Set(ctrlItems.map((it) => it.medicine.controlledSubstanceClass).filter(Boolean))].join(", ") || "—",
      prescriptionReference: r.prescriptionReference ?? "—",
      dispensedBy: r.dispensedBy?.name ?? "—",
      cashier: r.cashier.name,
      total: r.total,
    };
  });

  const summary = {
    _id: null,
    count: agg._count._all,
    totalValue: agg._sum.total ?? 0,
    unitsDispensed: unitAgg._sum.quantity ?? 0,
  };

  if (await jsonOrExport(res, query, "Controlled Substances Register",
    ["Date", "Transaction #", "Medicines", "Qty", "Class", "Prescription #", "Dispensed By", "Cashier", "Sale Total"],
    results.map((r) => [new Date(r.date).toLocaleDateString("en-GB"), r.transactionNumber, r.medicines, r.quantity,
      r.controlledSubstanceClass, r.prescriptionReference, r.dispensedBy, r.cashier, r.total]),
    "controlled-register")) return;

  res.json({ data: results, summary, pagination: { page, limit, total } });
});

// ── Inventory Report ──
export const inventoryReport = asyncHandler(async (req, res) => {
  const query = req.query as Record<string, string>;
  const { page, limit, skip } = parsePagination(query);

  const match: Record<string, unknown> = {};
  if (query.medicine) match.medicineId = query.medicine;
  const where = match as Prisma.MedicineBatchWhereInput;

  const [rows, total, totals] = await Promise.all([
    prisma.medicineBatch.findMany({
      where,
      orderBy: { expiryDate: "asc" },
      skip,
      take: limit,
      include: { medicine: { select: { name: true, category: { select: { name: true } } } } },
    }),
    prisma.medicineBatch.count({ where }),
    prisma.medicineBatch.findMany({ where, select: { quantity: true, purchasePrice: true, sellingPrice: true } }),
  ]);

  const totalStock = totals.reduce((sum, b) => sum + b.quantity, 0);
  const totalStockValue = totals.reduce((sum, b) => sum + b.quantity * b.sellingPrice, 0);
  const totalCostValue = totals.reduce((sum, b) => sum + b.quantity * b.purchasePrice, 0);

  const results = rows.map((r) => ({
    _id: r.id,
    medicine: r.medicine.name,
    category: r.medicine.category.name,
    batchNumber: r.batchNumber,
    quantity: r.quantity,
    purchasePrice: r.purchasePrice,
    sellingPrice: r.sellingPrice,
    expiryDate: r.expiryDate,
    stockValue: r.quantity * r.sellingPrice,
    costValue: r.quantity * r.purchasePrice,
  }));

  const summary = total > 0
    ? { _id: null, totalStock, totalStockValue, totalCostValue, batchCount: total }
    : { totalStock: 0, totalStockValue: 0, totalCostValue: 0, batchCount: 0 };

  if (await jsonOrExport(res, query, "Inventory Report", ["Medicine", "Category", "Batch #", "Qty", "Cost Price", "Sell Price", "Expiry", "Stock Value"],
    results.map((r) => [r.medicine, r.category, r.batchNumber, r.quantity, r.purchasePrice, r.sellingPrice, new Date(r.expiryDate).toLocaleDateString("en-GB"), r.stockValue]),
    "inventory-report")) return;

  res.json({ data: results, summary, pagination: { page, limit, total } });
});

// ── Expense Report ──

export const expenseReport = asyncHandler(async (req, res) => {
  const query = req.query as Record<string, string>;
  const { match } = buildBaseMatch(query, false);
  const { page, limit, skip } = parsePagination(query);

  setEnumFilter(match, "paymentMethod", query.paymentMethod, Object.values(PaymentMethod));
  const where = match as Prisma.ExpenseWhereInput;

  const [rows, total, totals] = await Promise.all([
    prisma.expense.findMany({
      where,
      orderBy: { date: "desc" },
      skip,
      take: limit,
      include: { recordedBy: { select: { name: true } } },
    }),
    prisma.expense.count({ where }),
    prisma.expense.findMany({ where, select: { amount: true, paymentMethod: true, status: true } }),
  ]);

  const totalExpenses = totals.reduce((sum, e) => sum + e.amount, 0);
  const cashExpenses = totals.reduce((sum, e) => sum + (e.paymentMethod === "cash" ? e.amount : 0), 0);
  const approvedExpenses = totals.reduce((sum, e) => sum + (e.status === "approved" ? e.amount : 0), 0);

  const results = rows.map((r) => ({
    _id: r.id,
    date: r.date,
    category: r.category,
    description: r.description,
    amount: r.amount,
    paymentMethod: r.paymentMethod,
    status: r.status,
    recordedBy: r.recordedBy.name,
  }));

  const summary = total > 0
    ? { _id: null, totalExpenses, count: total, cashExpenses, approvedExpenses }
    : { totalExpenses: 0, count: 0, cashExpenses: 0, approvedExpenses: 0 };

  if (await jsonOrExport(res, query, "Expense Report", ["Date", "Category", "Description", "Amount", "Payment", "Status", "Recorded By"],
    results.map((r) => [new Date(r.date).toLocaleDateString("en-GB"), r.category, r.description, r.amount, r.paymentMethod, r.status, r.recordedBy]),
    "expense-report")) return;

  res.json({ data: results, summary, pagination: { page, limit, total } });
});

// ── Profit Report ──

export const profitReport = asyncHandler(async (req, res) => {
  const query = req.query as Record<string, string>;
  const { match } = buildBaseMatch(query);
  const expenseMatch = buildBaseMatch(query, false).match;
  expenseMatch.status = "approved";

  const [salesAgg, expenseAgg] = await Promise.all([
    prisma.sale.findMany({
      where: match as Prisma.SaleWhereInput,
      select: { createdAt: true, total: true, costOfGoods: true, discount: true, tax: true },
    }),
    prisma.expense.findMany({
      where: expenseMatch as Prisma.ExpenseWhereInput,
      select: { date: true, amount: true },
    }),
  ]);

  const salesByDay: Record<string, { revenue: number; cost: number; discount: number; tax: number; transactions: number }> = {};
  for (const sale of salesAgg) {
    const key = dayKey(sale.createdAt);
    const day = salesByDay[key] ?? { revenue: 0, cost: 0, discount: 0, tax: 0, transactions: 0 };
    day.revenue += sale.total;
    day.cost += sale.costOfGoods;
    day.discount += sale.discount;
    day.tax += sale.tax;
    day.transactions += 1;
    salesByDay[key] = day;
  }

  const expenseMap: Record<string, number> = {};
  for (const expense of expenseAgg) {
    const key = dayKey(expense.date);
    expenseMap[key] = (expenseMap[key] ?? 0) + expense.amount;
  }

  const rows = Object.keys(salesByDay).sort().map((key) => {
    const day = salesByDay[key];
    const expenses = expenseMap[key] ?? 0;
    return {
      date: key,
      revenue: day.revenue,
      cost: day.cost,
      grossProfit: day.revenue - day.cost,
      expenses,
      netProfit: (day.revenue - day.cost) - expenses,
      transactions: day.transactions,
    };
  });

  const totals = rows.reduce((acc, r) => ({
    revenue: acc.revenue + r.revenue,
    cost: acc.cost + r.cost,
    grossProfit: acc.grossProfit + r.grossProfit,
    expenses: acc.expenses + r.expenses,
    netProfit: acc.netProfit + r.netProfit,
    transactions: acc.transactions + r.transactions,
  }), { revenue: 0, cost: 0, grossProfit: 0, expenses: 0, netProfit: 0, transactions: 0 });

  if (await jsonOrExport(res, query, "Profit Report", ["Date", "Revenue", "Cost", "Gross Profit", "Expenses", "Net Profit", "Transactions"],
    rows.map((r) => [r.date, r.revenue, r.cost, r.grossProfit, r.expenses, r.netProfit, r.transactions]),
    "profit-report")) return;

  res.json({ data: rows, summary: totals });
});

// ── Staff Performance Report ──

export const staffReport = asyncHandler(async (req, res) => {
  const query = req.query as Record<string, string>;
  const { match, from, to } = buildBaseMatch(query);
  const sessionWhere = { createdAt: { gte: from, lte: to } };
  const reportWhere = { createdAt: { gte: from, lte: to } };

  const [salesData, sessionData, reportData] = await Promise.all([
    prisma.sale.groupBy({
      by: ["cashierId"],
      where: match as Prisma.SaleWhereInput,
      _sum: { total: true, costOfGoods: true },
      _count: { _all: true },
    }),
    prisma.dailySession.groupBy({
      by: ["userId", "status"],
      where: sessionWhere,
      _count: { _all: true },
    }),
    prisma.dailyReport.groupBy({
      by: ["userId", "status"],
      where: reportWhere,
      _count: { _all: true },
    }),
  ]);

  const sessionMap: Record<string, { sessionsOpened: number; sessionsClosed: number }> = {};
  sessionData.forEach((s) => {
    const entry = sessionMap[s.userId] ?? { sessionsOpened: 0, sessionsClosed: 0 };
    entry.sessionsOpened += s._count._all;
    if (s.status === "closed") entry.sessionsClosed += s._count._all;
    sessionMap[s.userId] = entry;
  });
  const reportMap: Record<string, { reportsSubmitted: number; reportsApproved: number }> = {};
  reportData.forEach((r) => {
    const entry = reportMap[r.userId] ?? { reportsSubmitted: 0, reportsApproved: 0 };
    entry.reportsSubmitted += r._count._all;
    if (r.status === "approved") entry.reportsApproved += r._count._all;
    reportMap[r.userId] = entry;
  });

  const userIds = salesData.map((s) => s.cashierId);
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true, role: true } });
  const userMap: Record<string, { name: string; email: string; role: string }> = {};
  users.forEach((u) => { userMap[u.id] = { name: u.name, email: u.email, role: u.role }; });

  const rows = salesData.map((s) => {
    const uid = s.cashierId;
    const u = userMap[uid] || { name: "Unknown", email: "", role: "" };
    const sess = sessionMap[uid] || { sessionsOpened: 0, sessionsClosed: 0 };
    const rep = reportMap[uid] || { reportsSubmitted: 0, reportsApproved: 0 };
    const totalSales = s._sum.total ?? 0;
    const totalCost = s._sum.costOfGoods ?? 0;
    return {
      staff: u.name,
      email: u.email,
      role: u.role,
      totalSales,
      totalCost,
      profit: totalSales - totalCost,
      transactions: s._count._all,
      sessionsOpened: sess.sessionsOpened,
      sessionsClosed: sess.sessionsClosed,
      reportsSubmitted: rep.reportsSubmitted,
      reportsApproved: rep.reportsApproved,
    };
  }).sort((a, b) => b.totalSales - a.totalSales);

  const totals = rows.reduce((acc, r) => ({
    totalSales: acc.totalSales + r.totalSales,
    totalCost: acc.totalCost + r.totalCost,
    profit: acc.profit + r.profit,
    transactions: acc.transactions + r.transactions,
  }), { totalSales: 0, totalCost: 0, profit: 0, transactions: 0 });

  if (await jsonOrExport(res, query, "Staff Report", ["Staff", "Email", "Role", "Sales", "Cost", "Profit", "Transactions", "Sessions Opened", "Sessions Closed", "Reports Submitted", "Reports Approved"],
    rows.map((r) => [r.staff, r.email, r.role, r.totalSales, r.totalCost, r.profit, r.transactions, r.sessionsOpened, r.sessionsClosed, r.reportsSubmitted, r.reportsApproved]),
    "staff-report")) return;

  res.json({ data: rows, summary: totals });
});

// ── Stock Movement Report ──

export const stockMovementReport = asyncHandler(async (req, res) => {
  const query = req.query as Record<string, string>;
  const { match } = buildBaseMatch(query, false);
  const { page, limit, skip } = parsePagination(query);

  if (query.medicine) match.medicineId = query.medicine;
  const where = match as Prisma.InventoryMovementWhereInput;

  const [rows, total] = await Promise.all([
    prisma.inventoryMovement.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: { medicine: { select: { name: true } }, performedBy: { select: { name: true } } },
    }),
    prisma.inventoryMovement.count({ where }),
  ]);

  const results = rows.map((r) => ({
    _id: r.id,
    date: r.createdAt,
    medicine: r.medicine.name,
    type: r.type,
    quantityChange: r.quantityChange,
    reason: r.reason ?? undefined,
    performedBy: r.performedBy.name,
  }));

  if (await jsonOrExport(res, query, "Stock Movement Report", ["Date", "Medicine", "Type", "Qty Change", "Reason", "Performed By"],
    results.map((r) => [new Date(r.date).toLocaleDateString("en-GB"), r.medicine, r.type, r.quantityChange, r.reason ?? "", r.performedBy]),
    "stock-movement-report")) return;

  res.json({ data: results, pagination: { page, limit, total } });
});

// ── Expiry Report ──

export const expiryReport = asyncHandler(async (req, res) => {
  const query = req.query as Record<string, string>;
  const { page, limit, skip } = parsePagination(query);
  const expiryDays = parseInt(query.expiryDays ?? "90", 10);

  const threshold = new Date();
  threshold.setDate(threshold.getDate() + expiryDays);
  const now = new Date();
  const where: Prisma.MedicineBatchWhereInput = { quantity: { gt: 0 }, expiryDate: { lte: threshold } };

  const [rows, total, totals] = await Promise.all([
    prisma.medicineBatch.findMany({
      where,
      orderBy: { expiryDate: "asc" },
      skip,
      take: limit,
      include: { medicine: { select: { name: true, category: { select: { name: true } } } } },
    }),
    prisma.medicineBatch.count({ where }),
    prisma.medicineBatch.findMany({ where, select: { quantity: true, sellingPrice: true, expiryDate: true } }),
  ]);

  const results = rows.map((r) => ({
    _id: r.id,
    medicine: r.medicine.name,
    category: r.medicine.category.name,
    batchNumber: r.batchNumber,
    quantity: r.quantity,
    expiryDate: r.expiryDate,
    sellingPrice: r.sellingPrice,
    stockValue: r.quantity * r.sellingPrice,
    status: r.expiryDate < now ? "EXPIRED" : "EXPIRING SOON",
  }));

  const summary = total > 0
    ? {
        _id: null,
        totalCount: total,
        expiredCount: totals.filter((b) => b.expiryDate < now).length,
        totalValue: totals.reduce((sum, b) => sum + b.quantity * b.sellingPrice, 0),
        totalUnits: totals.reduce((sum, b) => sum + b.quantity, 0),
      }
    : { totalCount: 0, expiredCount: 0, totalValue: 0, totalUnits: 0 };

  if (await jsonOrExport(res, query, "Expiry Report", ["Medicine", "Category", "Batch #", "Qty", "Expiry", "Sell Price", "Stock Value", "Status"],
    results.map((r) => [r.medicine, r.category, r.batchNumber, r.quantity, new Date(r.expiryDate).toLocaleDateString("en-GB"), r.sellingPrice, r.stockValue, r.status]),
    "expiry-report")) return;

  res.json({ data: results, summary, pagination: { page, limit, total } });
});

// ── Low Stock Report ──

export const lowStockReport = asyncHandler(async (req, res) => {
  const query = req.query as Record<string, string>;
  const { page, limit, skip } = parsePagination(query);

  const medicines = await prisma.medicine.findMany({
    where: { status: "active" },
    select: {
      id: true,
      name: true,
      sku: true,
      reorderLevel: true,
      minStock: true,
      purchasePrice: true,
      sellingPrice: true,
      category: { select: { name: true } },
      batches: { select: { quantity: true } },
    },
  });

  const withStock = medicines
    .map((medicine) => ({ medicine, currentStock: medicine.batches.reduce((sum, batch) => sum + batch.quantity, 0) }))
    .filter((row) => row.currentStock <= row.medicine.reorderLevel)
    .sort((a, b) => a.currentStock - b.currentStock);

  const total = withStock.length;
  const results = withStock.slice(skip, skip + limit).map(({ medicine, currentStock }) => ({
    _id: medicine.id,
    name: medicine.name,
    sku: medicine.sku,
    category: medicine.category.name,
    currentStock,
    reorderLevel: medicine.reorderLevel,
    minStock: medicine.minStock,
    purchasePrice: medicine.purchasePrice,
    sellingPrice: medicine.sellingPrice,
    stockValue: currentStock * medicine.sellingPrice,
    status: currentStock <= medicine.minStock ? "CRITICAL" : "LOW",
  }));

  if (await jsonOrExport(res, query, "Low Stock Report", ["Name", "SKU", "Category", "Current Stock", "Reorder Level", "Min Stock", "Sell Price", "Stock Value", "Status"],
    results.map((r) => [r.name, r.sku, r.category, r.currentStock, r.reorderLevel, r.minStock, r.sellingPrice, r.stockValue, r.status]),
    "low-stock-report")) return;

  res.json({ data: results, pagination: { page, limit, total } });
});

// ── Daily Report ──

export const dailyReport = asyncHandler(async (req, res) => {
  const query = req.query as Record<string, string>;
  const { from, to } = parseDates(query);
  const { page, limit, skip } = parsePagination(query);
  const where: Prisma.DailyReportWhereInput = { date: { gte: from, lte: to } };

  const [rows, total] = await Promise.all([
    prisma.dailyReport.findMany({
      where,
      orderBy: { date: "desc" },
      skip,
      take: limit,
      include: { user: { select: { name: true } } },
    }),
    prisma.dailyReport.count({ where }),
  ]);

  const results = rows.map((r) => ({
    _id: r.id,
    date: r.date,
    staff: r.user.name,
    totalSales: r.totalSales,
    cashSales: r.cashSales,
    mobileMoneySales: r.mobileMoneySales,
    cardSales: r.cardSales,
    bankTransferSales: r.bankTransferSales,
    refunds: r.refunds,
    discounts: r.discounts,
    expenses: r.expenses,
    expectedCash: r.expectedCash,
    actualCash: r.actualCash,
    variance: r.variance,
    status: r.status,
  }));

  if (await jsonOrExport(res, query, "Daily Report", ["Date", "Staff", "Total Sales", "Cash", "Mobile", "Card", "Bank", "Refunds", "Discounts", "Expenses", "Expected", "Actual", "Variance", "Status"],
    results.map((r) => [new Date(r.date).toLocaleDateString("en-GB"), r.staff, r.totalSales, r.cashSales, r.mobileMoneySales, r.cardSales, r.bankTransferSales, r.refunds, r.discounts, r.expenses, r.expectedCash, r.actualCash, r.variance, r.status]),
    "daily-report")) return;

  res.json({ data: results, pagination: { page, limit, total } });
});

// ── Purchase Report (inventory movements of type "receive") ──

export const purchaseReport = asyncHandler(async (req, res) => {
  const query = req.query as Record<string, string>;
  const { match } = buildBaseMatch(query, false);
  const { page, limit, skip } = parsePagination(query);

  match.type = "receive";
  if (query.medicine) match.medicineId = query.medicine;
  const where = match as Prisma.InventoryMovementWhereInput;

  const [rows, total, agg] = await Promise.all([
    prisma.inventoryMovement.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: { medicine: { select: { name: true } }, performedBy: { select: { name: true } } },
    }),
    prisma.inventoryMovement.count({ where }),
    prisma.inventoryMovement.aggregate({
      where,
      _sum: { quantityChange: true },
      _count: { _all: true },
    }),
  ]);

  const results = rows.map((r) => ({
    _id: r.id,
    date: r.createdAt,
    medicine: r.medicine.name,
    quantity: r.quantityChange,
    reason: r.reason ?? undefined,
    receivedBy: r.performedBy.name,
  }));

  const summary = agg._count._all > 0
    ? { _id: null, totalReceived: agg._sum.quantityChange ?? 0, totalTransactions: agg._count._all }
    : { totalReceived: 0, totalTransactions: 0 };

  if (await jsonOrExport(res, query, "Purchase Report", ["Date", "Medicine", "Qty Received", "Reason", "Received By"],
    results.map((r) => [new Date(r.date).toLocaleDateString("en-GB"), r.medicine, r.quantity, r.reason ?? "", r.receivedBy]),
    "purchase-report")) return;

  res.json({ data: results, summary, pagination: { page, limit, total } });
});
