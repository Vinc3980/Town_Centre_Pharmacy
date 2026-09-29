import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { env } from "../config/env";
import { verifyAccessToken } from "../services/tokenService";

let io: Server | null = null;

export const SOCKET_EVENTS = {
  SALE_CREATED: "sale.created",
  SALE_REFUNDED: "sale.refunded",
  SALE_REFUND_REQUESTED: "sale.refund.requested",
  SALE_REFUND_APPROVED: "sale.refund.approved",
  SALE_REFUND_REJECTED: "sale.refund.rejected",
  INVENTORY_UPDATED: "inventory.updated",
  STOCK_LOW: "stock.low",
  STOCK_EXPIRING: "stock.expiring",
  STAFF_LOGIN: "staff.login",
  STAFF_LOGOUT: "staff.logout",
  EXPENSE_CREATED: "expense.created",
  EXPENSE_APPROVED: "expense.approved",
  EXPENSE_REJECTED: "expense.rejected",
  AUDIT_CREATED: "audit.created",
  NOTIFICATION_CREATED: "notification.created",
  DAILY_SESSION_OPENED: "daily.session.opened",
  DAILY_SESSION_CLOSED: "daily.session.closed",
  DAILY_REPORT_SUBMITTED: "daily.report.submitted",
  DAILY_REPORT_APPROVED: "daily.report.approved",
  DAILY_REPORT_REJECTED: "daily.report.rejected",
  PURCHASE_ORDER_CREATED: "purchase_order.created",
  PURCHASE_ORDER_STATUS_CHANGED: "purchase_order.status.changed",
  PURCHASE_ORDER_RECEIVED: "purchase_order.received",
} as const;

const MANAGER_ROLES = new Set(["branch_manager", "admin"]);

export function initSockets(server: HttpServer) {
  io = new Server(server, { cors: { origin: env.corsOrigin, credentials: true } });

  io.use((socket: Socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) return next(new Error("Missing auth token"));
      const payload = verifyAccessToken(token);
      socket.data.user = payload;
      next();
    } catch {
      next(new Error("Invalid or expired session"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const user = socket.data.user;

    socket.join("pharmacy:default");

    if (user && MANAGER_ROLES.has(user.role)) {
      socket.join("managers");
    }

    if (user) {
      socket.join(`user:${user.sub}`);
    }

    console.log(`[socket] ${user?.name ?? "unknown"} connected (${socket.id})`);

    socket.on("disconnect", () => {
      console.log(`[socket] ${user?.name ?? "unknown"} disconnected`);
    });
  });

  return io;
}

export function emitEvent(event: string, payload: unknown) {
  if (!io) return;
  io.to("pharmacy:default").emit(event, payload);
}

export function emitToManagers(event: string, payload: unknown) {
  if (!io) return;
  io.to("managers").emit(event, payload);
}

export function emitToUser(userId: string, event: string, payload: unknown) {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, payload);
}
