import { Request } from "express";
import { prisma } from "../config/prisma";
import { emitEvent, SOCKET_EVENTS } from "../sockets";
import { serialize } from "../utils/serialize";

interface AuditInput {
  req: Request;
  action: string;
  module: string;
  description: string;
  entity?: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
}

export async function recordAudit({ req, action, module, description, entity, entityId, before, after }: AuditInput) {
  if (!req.user) return;
  const entry = await prisma.auditLog.create({
    data: {
      userId: req.user.sub,
      userName: req.user.name,
      action,
      module,
      description,
      entity,
      entityId,
      before: (before ?? undefined) as never,
      after: (after ?? undefined) as never,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    },
  });
  emitEvent(SOCKET_EVENTS.AUDIT_CREATED, serialize("auditLog", entry));
  return entry;
}
