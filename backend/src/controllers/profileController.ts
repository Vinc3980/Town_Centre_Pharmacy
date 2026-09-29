import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { recordAudit } from "../services/auditService";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";

const updateProfileSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6),
});

export const getProfile = asyncHandler(async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
  if (!user) throw new ApiError(404, "User not found");
  res.json({
    id: user.id, name: user.name, email: user.email, phone: user.phone,
    role: user.role, permissions: user.permissions, branch: user.branch,
    staffId: user.staffId, profilePicture: user.profilePicture,
    lastLoginAt: user.lastLoginAt, createdAt: user.createdAt,
  });
});

export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  const data = updateProfileSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
  if (!user) throw new ApiError(404, "User not found");

  const before = { name: user.name, email: user.email, phone: user.phone };

  const updates: Prisma.UserUpdateInput = {};
  if (data.name !== undefined) updates.name = data.name;
  if (data.phone !== undefined) updates.phone = data.phone;
  if (data.email !== undefined) {
    const existing = await prisma.user.findFirst({
      where: { email: data.email.toLowerCase(), NOT: { id: user.id } },
    });
    if (existing) throw new ApiError(409, "Email already in use");
    updates.email = data.email.toLowerCase();
  }

  const updated = await prisma.user.update({ where: { id: user.id }, data: updates });

  await recordAudit({
    req, action: "USER_UPDATED", module: "users",
    description: `${updated.name} updated their profile`,
    before, after: { name: updated.name, email: updated.email, phone: updated.phone },
    entity: "User", entityId: updated.id,
  });

  res.json({
    id: updated.id, name: updated.name, email: updated.email, phone: updated.phone,
    role: updated.role, permissions: updated.permissions, branch: updated.branch,
    staffId: updated.staffId, profilePicture: updated.profilePicture,
  });
});

export const uploadProfile = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw new ApiError(400, "No file uploaded");

  const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
  if (!user) throw new ApiError(404, "User not found");

  const pictureUrl = `/uploads/profiles/${req.file.filename}`;
  await prisma.user.update({ where: { id: user.id }, data: { profilePicture: pictureUrl } });

  await recordAudit({
    req, action: "USER_UPDATED", module: "users",
    description: `${user.name} updated their profile picture`,
    entity: "User", entityId: user.id,
  });

  res.json({ profilePicture: pictureUrl });
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
  if (!user) throw new ApiError(404, "User not found");

  const match = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!match) throw new ApiError(401, "Current password is incorrect");

  if (currentPassword === newPassword) throw new ApiError(400, "New password must be different from current password");

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(newPassword, 10),
      refreshTokenVersion: { increment: 1 },
    },
  });

  await recordAudit({
    req, action: "PASSWORD_CHANGED", module: "auth",
    description: `${user.name} changed their password`,
    entity: "User", entityId: user.id,
  });

  res.json({ message: "Password changed successfully" });
});
