import { NotificationCategory, Prisma } from "@prisma/client";
import { Request, Response } from "express";
import { prisma } from "../config/prisma";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";
import { isValidUuid } from "../utils/security";
import { serialize, serializeMany } from "../utils/serialize";

const MANAGER_ROLES = ["branch_manager", "admin"];
const INVENTORY_CATEGORIES: NotificationCategory[] = ["low_stock", "expiring_medicine"];

export const listNotifications = asyncHandler(async (req: Request, res: Response) => {
  const { unreadOnly, category } = req.query as Record<string, string>;
  const isManager = MANAGER_ROLES.includes(req.user!.role);

  const where: Prisma.NotificationWhereInput = {};
  if (isManager) {
    where.OR = [
      { targetRoles: { has: req.user!.role }, userId: null },
      { userId: req.user!.sub },
    ];
  } else {
    where.OR = [
      { userId: req.user!.sub },
      { category: { in: INVENTORY_CATEGORIES }, userId: null },
    ];
  }

  if (unreadOnly === "true") where.isRead = false;
  if (category) where.category = category as NotificationCategory;

  const notifications = await prisma.notification.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  res.json(serializeMany("notification", notifications));
});

export const getUnreadCount = asyncHandler(async (req: Request, res: Response) => {
  const isManager = MANAGER_ROLES.includes(req.user!.role);

  const where: Prisma.NotificationWhereInput = { isRead: false };
  if (isManager) {
    where.OR = [
      { targetRoles: { has: req.user!.role }, userId: null },
      { userId: req.user!.sub },
    ];
  } else {
    where.OR = [
      { userId: req.user!.sub },
      { category: { in: INVENTORY_CATEGORIES }, userId: null },
    ];
  }

  const count = await prisma.notification.count({ where });
  res.json({ count });
});

export const markAsRead = asyncHandler(async (req: Request, res: Response) => {
  if (!isValidUuid(req.params.id)) throw new ApiError(404, "Notification not found");
  const notification = await prisma.notification.findUnique({ where: { id: req.params.id } });
  if (!notification) throw new ApiError(404, "Notification not found");

  const isManager = MANAGER_ROLES.includes(req.user!.role);
  if (!isManager && notification.userId !== req.user!.sub) {
    throw new ApiError(403, "You can only mark your own notifications as read");
  }

  const updated = await prisma.notification.update({
    where: { id: notification.id },
    data: { isRead: true },
  });

  res.json(serialize("notification", updated));
});

export const markAllAsRead = asyncHandler(async (req: Request, res: Response) => {
  const isManager = MANAGER_ROLES.includes(req.user!.role);

  const where: Prisma.NotificationWhereInput = { isRead: false };
  if (isManager) {
    where.OR = [
      { targetRoles: { has: req.user!.role }, userId: null },
      { userId: req.user!.sub },
    ];
  } else {
    where.OR = [
      { userId: req.user!.sub },
      { category: { in: INVENTORY_CATEGORIES }, userId: null },
    ];
  }

  await prisma.notification.updateMany({ where, data: { isRead: true } });

  res.json({ message: "All notifications marked as read" });
});
