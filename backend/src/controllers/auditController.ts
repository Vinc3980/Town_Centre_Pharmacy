import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { serialize, serializeMany } from "../utils/serialize";
import { asyncHandler } from "../utils/asyncHandler";

export const listAuditLogs = asyncHandler(async (req: Request, res: Response) => {
  const { user, action, module, entity, from, to, search, page, limit } = req.query as Record<string, string>;
  const filter: Prisma.AuditLogWhereInput = {};

  if (user) filter.userId = user;
  if (action) filter.action = action;
  if (module) filter.module = module;
  if (entity) filter.entity = entity;

  if (from || to) {
    filter.createdAt = {
      gte: from ? new Date(from) : undefined,
      lte: to ? new Date(to) : undefined,
    };
  }

  if (search) {
    filter.description = { contains: search, mode: "insensitive" };
  }

  const pageNum = Math.max(1, parseInt(page ?? "1", 10));
  const limitNum = Math.min(200, Math.max(1, parseInt(limit ?? "50", 10)));
  const skip = (pageNum - 1) * limitNum;

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where: filter,
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
      omit: { userId: true },
      orderBy: { createdAt: "desc" },
      skip,
      take: limitNum,
    }),
    prisma.auditLog.count({ where: filter }),
  ]);

  res.json({ data: serializeMany("auditLog", logs), pagination: { page: pageNum, limit: limitNum, total } });
});

export const listMyAuditLogs = asyncHandler(async (req: Request, res: Response) => {
  const { action, module, entity, from, to, search, page, limit } = req.query as Record<string, string>;
  const filter: Prisma.AuditLogWhereInput = { userId: req.user!.sub };

  if (action) filter.action = action;
  if (module) filter.module = module;
  if (entity) filter.entity = entity;

  if (from || to) {
    filter.createdAt = {
      gte: from ? new Date(from) : undefined,
      lte: to ? new Date(to) : undefined,
    };
  }

  if (search) {
    filter.description = { contains: search, mode: "insensitive" };
  }

  const pageNum = Math.max(1, parseInt(page ?? "1", 10));
  const limitNum = Math.min(200, Math.max(1, parseInt(limit ?? "50", 10)));
  const skip = (pageNum - 1) * limitNum;

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where: filter,
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
      omit: { userId: true },
      orderBy: { createdAt: "desc" },
      skip,
      take: limitNum,
    }),
    prisma.auditLog.count({ where: filter }),
  ]);

  res.json({ data: serializeMany("auditLog", logs), pagination: { page: pageNum, limit: limitNum, total } });
});

export const getAuditLogById = asyncHandler(async (req: Request, res: Response) => {
  const log = await prisma.auditLog.findUnique({
    where: { id: req.params.id },
    include: { user: { select: { id: true, name: true, email: true, role: true } } },
    omit: { userId: true },
  });
  if (!log) {
    res.status(404).json({ message: "Audit log not found" });
    return;
  }
  res.json(serialize("auditLog", log));
});
