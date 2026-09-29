import bcrypt from "bcryptjs";
import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { recordAudit } from "../services/auditService";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../services/tokenService";
import { checkSalaryReminders } from "../services/notificationService";
import { emitEvent, SOCKET_EVENTS } from "../sockets";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";

const loginSchema = z.object({
  email: z.string().min(1, "Email or Staff ID is required"),
  password: z.string().min(1),
});

async function getSecuritySettings() {
  const pharmacy = await prisma.pharmacy.findFirst({ include: { settings: true } });
  return pharmacy?.settings ?? {
    maxLoginAttempts: 5, lockoutDurationMinutes: 15,
    minPasswordLength: 6, sessionExpirationMinutes: 60,
  };
}

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = loginSchema.parse(req.body);
  const security = await getSecuritySettings();

  const loginIdentifier = email.trim().toLowerCase();
  const isStaffId = /^[A-Z]{2}-\d{4}$/i.test(loginIdentifier);

  const user = await prisma.user.findFirst({
    where: isStaffId
      ? { staffId: loginIdentifier.toUpperCase(), isActive: true }
      : { email: loginIdentifier, isActive: true },
  });
  if (!user) throw new ApiError(401, "Incorrect email or password");

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    throw new ApiError(423, `Account locked. Try again in ${minutesLeft} minute(s)`);
  }

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    const loginAttempts = user.loginAttempts + 1;
    if (loginAttempts >= security.maxLoginAttempts) {
      const lockedUntil = new Date(Date.now() + security.lockoutDurationMinutes * 60000);
      await prisma.user.update({
        where: { id: user.id },
        data: { lockedUntil, loginAttempts: 0 },
      });
      await recordAudit({
        req, action: "ACCOUNT_LOCKED", module: "auth",
        description: `Account locked after ${security.maxLoginAttempts} failed attempts`,
        entity: "User", entityId: user.id,
      });
      throw new ApiError(423, `Account locked for ${security.lockoutDurationMinutes} minutes due to too many failed attempts`);
    }
    await prisma.user.update({ where: { id: user.id }, data: { loginAttempts } });
    throw new ApiError(401, "Incorrect email or password");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { loginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  const accessToken = signAccessToken({
    sub: user.id, role: user.role, permissions: user.permissions as never, name: user.name,
  });
  const refreshToken = signRefreshToken(user.id, user.refreshTokenVersion);

  emitEvent(SOCKET_EVENTS.STAFF_LOGIN, { userId: user.id, name: user.name, role: user.role, time: new Date() });

  try {
    const { notifyStaffLogin, checkCreditDueReminders } = await import("../services/notificationService");
    notifyStaffLogin({ userId: user.id, name: user.name, role: user.role, time: new Date() }).catch(() => {});
    if (user.role === "admin" || user.role === "branch_manager") {
      checkCreditDueReminders().catch(() => {});
    }
  } catch { /* non-blocking */ }

  req.user = { sub: user.id, role: user.role, permissions: user.permissions as never, name: user.name };
  await recordAudit({ req, action: "USER_LOGIN", module: "auth", description: `${user.name} logged in`, entity: "User", entityId: user.id });

  res.json({
    accessToken, refreshToken,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, permissions: user.permissions, branch: user.branch, profilePicture: user.profilePicture, staffId: user.staffId },
  });

  if (user.role === "admin") {
    checkSalaryReminders().catch(() => {});
  }
});

const refreshSchema = z.object({ refreshToken: z.string() });

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = refreshSchema.parse(req.body);
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new ApiError(401, "Session expired, please log in again");
  }
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || user.refreshTokenVersion !== payload.v) throw new ApiError(401, "Session expired, please log in again");

  const accessToken = signAccessToken({
    sub: user.id, role: user.role, permissions: user.permissions as never, name: user.name,
  });
  res.json({ accessToken });
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  if (req.user) {
    await prisma.user.update({
      where: { id: req.user.sub },
      data: { refreshTokenVersion: { increment: 1 } },
    });
    emitEvent(SOCKET_EVENTS.STAFF_LOGOUT, { userId: req.user.sub, name: req.user.name, time: new Date() });
    await recordAudit({ req, action: "USER_LOGOUT", module: "auth", description: `${req.user.name} logged out`, entity: "User", entityId: req.user.sub });
  }
  res.json({ message: "Logged out" });
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
  if (!user) throw new ApiError(404, "User not found");
  res.json({ id: user.id, name: user.name, email: user.email, role: user.role, permissions: user.permissions, branch: user.branch, profilePicture: user.profilePicture, staffId: user.staffId });
});
