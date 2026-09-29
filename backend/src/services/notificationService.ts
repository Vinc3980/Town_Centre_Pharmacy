import { NotificationCategory } from "@prisma/client";
import { prisma } from "../config/prisma";
import { emitToManagers, emitToUser, SOCKET_EVENTS } from "../sockets";
import { serialize } from "../utils/serialize";

interface NotifyOptions {
  title: string;
  message: string;
  priority?: "info" | "warning" | "critical";
  category: NotificationCategory;
  referenceId?: string;
  user?: string;
  targetRoles?: string[];
}

const MANAGER_ROLES = ["branch_manager", "admin"];

export async function createNotification(opts: NotifyOptions): Promise<void> {
  const existing = await prisma.notification.findFirst({
    where: {
      category: opts.category,
      referenceId: opts.referenceId,
      userId: opts.user ? opts.user.toString() : undefined,
      isRead: false,
    },
  });

  if (existing) {
    const updated = await prisma.notification.update({
      where: { id: existing.id },
      data: {
        message: opts.message,
        priority: opts.priority ?? "info",
      },
    });
    const payload = serialize("notification", updated);
    if (opts.user) {
      emitToUser(opts.user.toString(), SOCKET_EVENTS.NOTIFICATION_CREATED, payload);
    } else {
      emitToManagers(SOCKET_EVENTS.NOTIFICATION_CREATED, payload);
    }
    return;
  }

  const notification = await prisma.notification.create({
    data: {
      title: opts.title,
      message: opts.message,
      priority: opts.priority ?? "info",
      category: opts.category,
      referenceId: opts.referenceId,
      userId: opts.user ? opts.user.toString() : undefined,
      targetRoles: opts.targetRoles ?? MANAGER_ROLES,
    },
  });

  const payload = serialize("notification", notification);
  if (opts.user) {
    emitToUser(opts.user.toString(), SOCKET_EVENTS.NOTIFICATION_CREATED, payload);
  } else {
    emitToManagers(SOCKET_EVENTS.NOTIFICATION_CREATED, payload);
  }
}

export async function notifyLowStock(
  medicineId: string,
  medicineName: string,
  stock: number,
  reorderLevel: number,
) {
  const priority = stock === 0 ? "critical" : "warning";
  const message = stock === 0
    ? `${medicineName} is out of stock`
    : `${medicineName} is down to ${stock} units (reorder level: ${reorderLevel})`;

  await createNotification({
    title: "Low stock",
    message,
    priority,
    category: "low_stock",
    referenceId: medicineId.toString(),
    targetRoles: MANAGER_ROLES,
  });
}

export async function notifyExpiringMedicine(
  medicineId: string,
  medicineName: string,
  batchNumber: string,
  daysToExpiry: number,
) {
  const priority = daysToExpiry <= 7 ? "critical" : daysToExpiry <= 14 ? "warning" : "info";
  const message = `${medicineName} (batch ${batchNumber}) expires in ${daysToExpiry} day${daysToExpiry === 1 ? "" : "s"}`;

  await createNotification({
    title: "Expiring medicine",
    message,
    priority,
    category: "expiring_medicine",
    referenceId: medicineId.toString(),
    targetRoles: MANAGER_ROLES,
  });
}

export async function notifyDailyReportSubmitted(
  reportId: string,
  submitterName: string,
  date: Date,
  variance: number,
) {
  const message = `${submitterName} submitted a daily report for ${date.toDateString()} — variance: GHS ${Math.abs(variance).toFixed(2)}`;
  await createNotification({
    title: "Daily report submitted",
    message,
    priority: variance !== 0 ? "warning" : "info",
    category: "daily_report",
    referenceId: reportId,
    targetRoles: MANAGER_ROLES,
  });
}

export async function notifyDailyReportApproved(
  reportId: string,
  reviewerName: string,
  date: Date,
  staffUserId: string,
) {
  await createNotification({
    title: "Daily report approved",
    message: `Your daily report for ${date.toDateString()} has been approved by ${reviewerName}`,
    priority: "info",
    category: "daily_report",
    referenceId: reportId,
    user: staffUserId,
    targetRoles: [],
  });
}

export async function notifyDailyReportRejected(
  reportId: string,
  reviewerName: string,
  date: Date,
  reason: string,
  staffUserId: string,
) {
  await createNotification({
    title: "Daily report rejected",
    message: `Your daily report for ${date.toDateString()} was rejected by ${reviewerName}: ${reason}`,
    priority: "warning",
    category: "daily_report",
    referenceId: reportId,
    user: staffUserId,
    targetRoles: [],
  });
}

export async function notifyRefundRequested(
  returnId: string,
  transactionNumber: string,
  requesterName: string,
  refundAmount: number,
) {
  await createNotification({
    title: "Refund approval required",
    message: `${requesterName} requested refund #${transactionNumber} — GHS ${refundAmount.toFixed(2)}`,
    priority: "warning",
    category: "refund",
    referenceId: returnId,
    targetRoles: MANAGER_ROLES,
  });
}

export async function notifyRefundApproved(
  returnId: string,
  transactionNumber: string,
  reviewerName: string,
  refundAmount: number,
  staffUserId: string,
) {
  await createNotification({
    title: "Refund approved",
    message: `Your refund #${transactionNumber} (GHS ${refundAmount.toFixed(2)}) has been approved by ${reviewerName}`,
    priority: "info",
    category: "refund",
    referenceId: returnId,
    user: staffUserId,
    targetRoles: [],
  });
}

export async function notifyRefundRejected(
  returnId: string,
  transactionNumber: string,
  reviewerName: string,
  reason: string,
  staffUserId: string,
) {
  await createNotification({
    title: "Refund rejected",
    message: `Your refund #${transactionNumber} was rejected by ${reviewerName}: ${reason}`,
    priority: "warning",
    category: "refund",
    referenceId: returnId,
    user: staffUserId,
    targetRoles: [],
  });
}

export async function notifyDailySessionOpened(
  sessionId: string,
  openerName: string,
  openingCash: number,
) {
  await createNotification({
    title: "Daily session request",
    message: `${openerName} requested to open daily session with GHS ${openingCash.toFixed(2)} opening cash`,
    priority: "info",
    category: "daily_report",
    referenceId: sessionId,
    targetRoles: MANAGER_ROLES,
  });
}

export async function notifyDailySessionClosed(
  sessionId: string,
  closerName: string,
  expectedCash: number,
  actualCash: number,
  variance: number,
) {
  await createNotification({
    title: "Daily closing request",
    message: `${closerName} requested to close daily session — Expected GHS ${expectedCash.toFixed(2)}, Actual GHS ${actualCash.toFixed(2)}, Variance GHS ${Math.abs(variance).toFixed(2)}`,
    priority: variance !== 0 ? "warning" : "info",
    category: "daily_report",
    referenceId: sessionId,
    targetRoles: MANAGER_ROLES,
  });
}

export async function syncInventoryAlertsToNotifications(): Promise<{ created: number }> {
  const now = new Date();
  const horizon = new Date(now.getTime() + 30 * 86400000);

  const [medicineRows, expiringRows, expiredRows] = await Promise.all([
    prisma.medicine.findMany({
      where: { status: "active" },
      select: {
        id: true,
        name: true,
        reorderLevel: true,
        batches: { select: { quantity: true } },
      },
    }),
    prisma.medicineBatch.findMany({
      where: { quantity: { gt: 0 }, expiryDate: { gt: now, lte: horizon } },
      select: {
        medicineId: true,
        batchNumber: true,
        quantity: true,
        expiryDate: true,
        medicine: { select: { name: true } },
      },
      orderBy: { expiryDate: "asc" },
    }),
    prisma.medicineBatch.findMany({
      where: { quantity: { gt: 0 }, expiryDate: { lt: now } },
      select: {
        medicineId: true,
        batchNumber: true,
        quantity: true,
        medicine: { select: { name: true } },
      },
    }),
  ]);

  const lowStockMedicines = medicineRows
    .filter((m) => m.batches.length > 0)
    .map((m) => ({
      medicineId: m.id,
      name: m.name,
      currentStock: m.batches.reduce((sum, b) => sum + b.quantity, 0),
      reorderLevel: m.reorderLevel,
    }))
    .filter((m) => m.currentStock <= m.reorderLevel)
    .sort((a, b) => a.currentStock - b.currentStock);

  const expiringBatches = expiringRows.map((b) => ({
    medicineId: b.medicineId,
    name: b.medicine.name,
    batchNumber: b.batchNumber,
    quantity: b.quantity,
    daysUntilExpiry: (b.expiryDate.getTime() - now.getTime()) / 86400000,
  }));

  const expiredBatches = expiredRows.map((b) => ({
    medicineId: b.medicineId,
    name: b.medicine.name,
    batchNumber: b.batchNumber,
    quantity: b.quantity,
  }));

  let created = 0;

  for (const item of lowStockMedicines) {
    const priority = item.currentStock === 0 ? "critical" : "warning";
    const message = item.currentStock === 0
      ? `${item.name} is out of stock`
      : `${item.name} is down to ${item.currentStock} units (reorder level: ${item.reorderLevel})`;

    await createNotification({
      title: "Low stock",
      message,
      priority,
      category: "low_stock",
      referenceId: item.medicineId,
      targetRoles: MANAGER_ROLES,
    });
    created++;
  }

  for (const item of expiringBatches) {
    const days = Math.ceil(item.daysUntilExpiry);
    const priority = days <= 7 ? "critical" : days <= 14 ? "warning" : "info";
    const message = `${item.name} (batch ${item.batchNumber}) expires in ${days} day${days === 1 ? "" : "s"}`;

    await createNotification({
      title: "Expiring medicine",
      message,
      priority,
      category: "expiring_medicine",
      referenceId: item.medicineId,
      targetRoles: MANAGER_ROLES,
    });
    created++;
  }

  for (const item of expiredBatches) {
    await createNotification({
      title: "Expired product",
      message: `${item.name} (batch ${item.batchNumber}) has expired — ${item.quantity} units still in stock`,
      priority: "critical",
      category: "expiring_medicine",
      referenceId: item.medicineId,
      targetRoles: MANAGER_ROLES,
    });
    created++;
  }

  return { created };
}

export async function checkSalaryReminders(): Promise<void> {
  const usersWithSalary = await prisma.user.findMany({
    where: {
      isActive: true,
      salary: { gt: 0 },
      salaryReminderDays: { gt: 0 },
    },
    select: {
      id: true,
      name: true,
      salary: true,
      salaryReminderDays: true,
      lastSalaryReminderAt: true,
      salaryStartDate: true,
    },
  });

  const now = new Date();

  for (const user of usersWithSalary) {
    const lastReminder = user.lastSalaryReminderAt;
    const intervalDays = user.salaryReminderDays!;

    let shouldRemind = false;

    if (!lastReminder) {
      shouldRemind = true;
    } else {
      const daysSinceLastReminder = Math.floor((now.getTime() - lastReminder.getTime()) / (1000 * 60 * 60 * 24));
      if (daysSinceLastReminder >= intervalDays) {
        shouldRemind = true;
      }
    }

    if (shouldRemind) {
      const existing = await prisma.notification.findFirst({
        where: {
          category: "system",
          referenceId: user.id,
          title: "Salary Payment Reminder",
          createdAt: { gte: new Date(now.getTime() - intervalDays * 24 * 60 * 60 * 1000) },
        },
      });

      if (!existing) {
        await createNotification({
          title: "Salary Payment Reminder",
          message: `Salary of GHS ${user.salary!.toFixed(2)} is due for ${user.name}. Payment cycle: every ${intervalDays} days.`,
          priority: "warning",
          category: "system",
          referenceId: user.id,
          targetRoles: ["admin"],
        });
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { lastSalaryReminderAt: now },
      });
    }
  }
}

export async function notifyCreditDue(opts: {
  saleId: string;
  transactionNumber: string;
  customerName: string;
  amount: number;
  dueDate: Date;
}): Promise<void> {
  const days = Math.ceil((opts.dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  const dueStr = opts.dueDate.toLocaleDateString("en-GB");
  let title: string;
  let message: string;
  let priority: "info" | "warning" | "critical";

  if (days < 0) {
    title = "Credit payment overdue";
    message = `${opts.customerName} — ${opts.transactionNumber} of GH₵ ${opts.amount.toFixed(2)} was due ${dueStr} (${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago).`;
    priority = "critical";
  } else if (days <= 3) {
    title = "Credit payment due soon";
    message = `${opts.customerName} — ${opts.transactionNumber} of GH₵ ${opts.amount.toFixed(2)} is due ${dueStr} (${days} day${days === 1 ? "" : "s"} left).`;
    priority = "warning";
  } else {
    title = "Credit sale created";
    message = `${opts.customerName} — ${opts.transactionNumber} of GH₵ ${opts.amount.toFixed(2)} due ${dueStr}.`;
    priority = "info";
  }

  await createNotification({
    title,
    message,
    priority,
    category: "sale",
    referenceId: `credit-${opts.saleId}`,
    targetRoles: MANAGER_ROLES,
  });
}

export async function checkCreditDueReminders(): Promise<void> {
  const soon = new Date();
  soon.setDate(soon.getDate() + 3);

  const sales = await prisma.sale.findMany({
    where: {
      status: "completed",
      outstandingAmount: { gt: 0 },
      dueDate: { lte: soon },
    },
    include: { customer: { select: { id: true, name: true } } },
    take: 50,
  });

  for (const sale of sales) {
    if (!sale.dueDate) continue;
    const days = Math.ceil((sale.dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    const customerName = (sale.customer as { name?: string } | null)?.name ?? "Customer";
    const amount = sale.outstandingAmount ?? 0;

    // One reminder per sale per day window
    const existing = await prisma.notification.findFirst({
      where: {
        category: "sale",
        referenceId: `credit-${sale.id}`,
        createdAt: { gte: new Date(Date.now() - 20 * 60 * 60 * 1000) },
      },
    });
    if (existing && days >= 0) continue;

    await notifyCreditDue({
      saleId: sale.id,
      transactionNumber: sale.transactionNumber,
      customerName,
      amount,
      dueDate: sale.dueDate,
    });
  }

  // Also mark fully overdue (dueDate passed) that may have been missed
  const overdue = await prisma.sale.findMany({
    where: {
      status: "completed",
      outstandingAmount: { gt: 0 },
      dueDate: { lt: new Date() },
    },
    include: { customer: { select: { id: true, name: true } } },
    take: 20,
  });

  for (const sale of overdue) {
    if (!sale.dueDate) continue;
    const existing = await prisma.notification.findFirst({
      where: {
        category: "sale",
        referenceId: `credit-${sale.id}`,
        priority: "critical",
        createdAt: { gte: new Date(Date.now() - 20 * 60 * 60 * 1000) },
      },
    });
    if (existing) continue;
    await notifyCreditDue({
      saleId: sale.id,
      transactionNumber: sale.transactionNumber,
      customerName: (sale.customer as { name?: string } | null)?.name ?? "Customer",
      amount: sale.outstandingAmount ?? 0,
      dueDate: sale.dueDate,
    });
  }
}

export async function notifyStaffLogin(opts: {
  userId: string;
  name: string;
  role: string;
  time: Date;
}): Promise<void> {
  const dateStr = opts.time.toLocaleDateString("en-GB");
  const timeStr = opts.time.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  await createNotification({
    title: "Staff login",
    message: `${opts.name} (${opts.role}) logged in on ${dateStr} at ${timeStr}.`,
    priority: "info",
    category: "security",
    referenceId: `login-${opts.userId}-${opts.time.getTime()}`,
    targetRoles: ["branch_manager", "admin"],
  });
}
