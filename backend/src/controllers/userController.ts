import crypto from "crypto";
import bcrypt from "bcryptjs";
import { Request, Response } from "express";
import { z } from "zod";
import { Prisma, Role } from "@prisma/client";
import { prisma } from "../config/prisma";
import { serialize, serializeMany } from "../utils/serialize";
import { recordAudit } from "../services/auditService";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";
import { ROLE_PERMISSIONS, ROLES } from "../utils/permissions";
import { generateStaffId } from "../utils/staffId";

const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(ROLES as [string, ...string[]]),
  branch: z.string().optional(),
  phone: z.string().optional(),
  permissions: z.array(z.string()).optional(),
  salary: z.number().nonnegative().optional(),
  salaryStartDate: z.string().optional(),
  salaryReminderDays: z.number().int().min(1).max(365).optional(),
  dateOfBirth: z.string().optional(),
  gender: z.string().optional(),
  address: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  emergencyContactRelation: z.string().optional(),
  nationalId: z.string().optional(),
  employmentDate: z.string().optional(),
});

const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  role: z.enum(ROLES as [string, ...string[]]).optional(),
  permissions: z.array(z.string()).optional(),
  branch: z.string().optional(),
  isActive: z.boolean().optional(),
  phone: z.string().optional(),
  salary: z.number().nonnegative().optional(),
  salaryStartDate: z.string().optional(),
  salaryReminderDays: z.number().int().min(1).max(365).optional(),
  dateOfBirth: z.string().optional(),
  gender: z.string().optional(),
  address: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  emergencyContactRelation: z.string().optional(),
  nationalId: z.string().optional(),
  employmentDate: z.string().optional(),
});

const adminResetPasswordSchema = z.object({
  newPassword: z.string().min(6),
});

const requestPasswordResetSchema = z.object({
  email: z.string().email(),
});

export const listUsers = asyncHandler(async (_req: Request, res: Response) => {
  const users = await prisma.user.findMany({ orderBy: { name: "asc" }, omit: { refreshTokenVersion: true } });
  res.json(serializeMany("user", users));
});

export const getUserById = asyncHandler(async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id }, omit: { refreshTokenVersion: true } });
  if (!user) throw new ApiError(404, "User not found");
  res.json(serialize("user", user));
});

export const createUser = asyncHandler(async (req: Request, res: Response) => {
  const data = createUserSchema.parse(req.body);

  const existing = await prisma.user.findFirst({ where: { email: data.email.toLowerCase() } });
  if (existing) throw new ApiError(409, "A user with this email already exists");

  const passwordHash = await bcrypt.hash(data.password, 10);
  const staffId = await generateStaffId(data.role);

  let user;
  try {
    user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email.toLowerCase(),
        phone: data.phone,
        passwordHash,
        role: data.role as Role,
        permissions: data.permissions ?? ROLE_PERMISSIONS[data.role] ?? [],
        branch: data.branch,
        staffId,
        salary: data.salary,
        salaryStartDate: data.salaryStartDate ? new Date(data.salaryStartDate) : undefined,
        salaryReminderDays: data.salaryReminderDays,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
        gender: data.gender,
        address: data.address,
        emergencyContactName: data.emergencyContactName,
        emergencyContactPhone: data.emergencyContactPhone,
        emergencyContactRelation: data.emergencyContactRelation,
        nationalId: data.nationalId,
        employmentDate: data.employmentDate ? new Date(data.employmentDate) : undefined,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const target = err.meta?.target;
      const raw = Array.isArray(target) ? String(target[0] ?? "") : String(target ?? "");
      const field = raw.replace(/^users_/, "").replace(/_key$/, "") || "field";
      throw new ApiError(409, `A user with this ${field} already exists`);
    }
    throw err;
  }

  await recordAudit({
    req, action: "USER_CREATED", module: "users",
    description: `${req.user!.name} created user "${user.name}" (${user.role})`,
    entity: "User", entityId: user.id,
    after: { name: user.name, email: user.email, role: user.role, branch: user.branch, staffId: user.staffId, salary: user.salary },
  });

  res.status(201).json({
    id: user.id, name: user.name, email: user.email, role: user.role,
    permissions: user.permissions, branch: user.branch, isActive: user.isActive,
    staffId: user.staffId, phone: user.phone, profilePicture: user.profilePicture,
    salary: user.salary, salaryStartDate: user.salaryStartDate, salaryReminderDays: user.salaryReminderDays,
    dateOfBirth: user.dateOfBirth, gender: user.gender, address: user.address,
    emergencyContactName: user.emergencyContactName, emergencyContactPhone: user.emergencyContactPhone,
    emergencyContactRelation: user.emergencyContactRelation, nationalId: user.nationalId,
    employmentDate: user.employmentDate,
  });
});

export const updateUser = asyncHandler(async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) throw new ApiError(404, "User not found");

  const data = updateUserSchema.parse(req.body);
  const before = { name: user.name, email: user.email, role: user.role, branch: user.branch, isActive: user.isActive };

  const updateData: Prisma.UserUncheckedUpdateInput = {};

  if (data.name !== undefined) { updateData.name = data.name; user.name = data.name; }
  if (data.phone !== undefined) { updateData.phone = data.phone; user.phone = data.phone; }
  if (data.email !== undefined) {
    const email = data.email.toLowerCase();
    const existing = await prisma.user.findFirst({ where: { email, id: { not: user.id } } });
    if (existing) throw new ApiError(409, "Email already in use");
    updateData.email = email;
    user.email = email;
  }
  if (data.branch !== undefined) { updateData.branch = data.branch; user.branch = data.branch; }
  if (data.isActive !== undefined) { updateData.isActive = data.isActive; user.isActive = data.isActive; }
  if (data.salary !== undefined) { updateData.salary = data.salary; user.salary = data.salary; }
  if (data.salaryStartDate !== undefined) {
    const value = new Date(data.salaryStartDate);
    updateData.salaryStartDate = value;
    user.salaryStartDate = value;
  }
  if (data.salaryReminderDays !== undefined) { updateData.salaryReminderDays = data.salaryReminderDays; user.salaryReminderDays = data.salaryReminderDays; }
  if (data.dateOfBirth !== undefined) {
    const value = data.dateOfBirth ? new Date(data.dateOfBirth) : null;
    updateData.dateOfBirth = value;
    user.dateOfBirth = value;
  }
  if (data.gender !== undefined) { updateData.gender = data.gender; user.gender = data.gender; }
  if (data.address !== undefined) { updateData.address = data.address; user.address = data.address; }
  if (data.emergencyContactName !== undefined) { updateData.emergencyContactName = data.emergencyContactName; user.emergencyContactName = data.emergencyContactName; }
  if (data.emergencyContactPhone !== undefined) { updateData.emergencyContactPhone = data.emergencyContactPhone; user.emergencyContactPhone = data.emergencyContactPhone; }
  if (data.emergencyContactRelation !== undefined) { updateData.emergencyContactRelation = data.emergencyContactRelation; user.emergencyContactRelation = data.emergencyContactRelation; }
  if (data.nationalId !== undefined) { updateData.nationalId = data.nationalId; user.nationalId = data.nationalId; }
  if (data.employmentDate !== undefined) {
    const value = data.employmentDate ? new Date(data.employmentDate) : null;
    updateData.employmentDate = value;
    user.employmentDate = value;
  }

  if (data.role !== undefined && data.role !== user.role) {
    if (user.role === "admin") {
      throw new ApiError(403, "Cannot change the owner's role");
    }
    const oldRole = user.role;
    const callerRole = req.user!.role;

    const HIERARCHY: Record<string, number> = { admin: 3, branch_manager: 2, staff: 1 };
    const callerLevel = HIERARCHY[callerRole] ?? 0;
    const targetLevel = HIERARCHY[data.role] ?? 0;

    if (targetLevel >= callerLevel) {
      throw new ApiError(403, "Cannot assign a role equal to or higher than your own");
    }

    const role = data.role as Role;
    const permissions = ROLE_PERMISSIONS[data.role] ?? [];
    updateData.role = role;
    updateData.permissions = permissions;
    user.role = role;
    user.permissions = permissions;

    await prisma.user.update({ where: { id: user.id }, data: updateData });

    await recordAudit({
      req, action: "USER_ROLE_CHANGED", module: "users",
      description: `${req.user!.name} changed ${user.name}'s role from ${oldRole} to ${data.role}`,
      before: { role: oldRole },
      after: { role: data.role, permissions: user.permissions },
      entity: "User", entityId: user.id,
    });
  }

  if (data.permissions !== undefined) {
    const oldPermissions = [...user.permissions];
    updateData.permissions = data.permissions;
    user.permissions = data.permissions;

    await recordAudit({
      req, action: "USER_PERMISSIONS_CHANGED", module: "users",
      description: `${req.user!.name} changed ${user.name}'s permissions`,
      before: { permissions: oldPermissions },
      after: { permissions: user.permissions },
      entity: "User", entityId: user.id,
    });
  }

  if (Object.keys(updateData).length > 0) {
    await prisma.user.update({ where: { id: user.id }, data: updateData });
  }

  await recordAudit({
    req, action: "USER_UPDATED", module: "users",
    description: `${req.user!.name} updated user "${user.name}"`,
    before, after: { name: user.name, email: user.email, role: user.role, branch: user.branch, isActive: user.isActive },
    entity: "User", entityId: user.id,
  });

  res.json({
    id: user.id, name: user.name, email: user.email, role: user.role,
    permissions: user.permissions, branch: user.branch, isActive: user.isActive,
    staffId: user.staffId, phone: user.phone, profilePicture: user.profilePicture,
    salary: user.salary, salaryStartDate: user.salaryStartDate, salaryReminderDays: user.salaryReminderDays,
    dateOfBirth: user.dateOfBirth, gender: user.gender, address: user.address,
    emergencyContactName: user.emergencyContactName, emergencyContactPhone: user.emergencyContactPhone,
    emergencyContactRelation: user.emergencyContactRelation, nationalId: user.nationalId,
    employmentDate: user.employmentDate,
  });
});

export const deactivateUser = asyncHandler(async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) throw new ApiError(404, "User not found");
  if (user.id === req.user!.sub) throw new ApiError(400, "Cannot deactivate your own account");

  const before = { isActive: user.isActive };
  await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });

  await recordAudit({
    req, action: "USER_DEACTIVATED", module: "users",
    description: `${req.user!.name} deactivated user "${user.name}"`,
    before, after: { isActive: false },
    entity: "User", entityId: user.id,
  });

  res.json({ message: "User deactivated" });
});

export const reactivateUser = asyncHandler(async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) throw new ApiError(404, "User not found");

  const before = { isActive: user.isActive };
  await prisma.user.update({ where: { id: user.id }, data: { isActive: true } });

  await recordAudit({
    req, action: "USER_UPDATED", module: "users",
    description: `${req.user!.name} reactivated user "${user.name}"`,
    before, after: { isActive: true },
    entity: "User", entityId: user.id,
  });

  res.json({ message: "User reactivated" });
});

export const adminResetPassword = asyncHandler(async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) throw new ApiError(404, "User not found");

  const data = adminResetPasswordSchema.parse(req.body);
  const passwordHash = await bcrypt.hash(data.newPassword, 10);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      refreshTokenVersion: { increment: 1 },
      resetPasswordToken: null,
      resetPasswordExpires: null,
      loginAttempts: 0,
      lockedUntil: null,
    },
  });

  await recordAudit({
    req, action: "PASSWORD_RESET", module: "users",
    description: `${req.user!.name} reset password for "${user.name}"`,
    entity: "User", entityId: user.id,
  });

  res.json({ message: "Password reset successfully" });
});

export const requestPasswordReset = asyncHandler(async (req: Request, res: Response) => {
  const data = requestPasswordResetSchema.parse(req.body);
  const user = await prisma.user.findFirst({ where: { email: data.email.toLowerCase(), isActive: true } });
  if (!user) {
    res.json({ message: "If your email is registered, you will receive a password reset request shortly." });
    return;
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await prisma.user.update({
    where: { id: user.id },
    data: { resetPasswordToken: token, resetPasswordExpires: expires },
  });

  await prisma.notification.create({
    data: {
      title: "Password Reset Request",
      message: `${user.name} (${user.email}) has requested a password reset. Please verify and update their password.`,
      priority: "warning",
      category: "security",
      targetRoles: ["admin"],
      referenceId: user.id,
    },
  });

  await recordAudit({
    req, action: "PASSWORD_RESET_REQUESTED", module: "users",
    description: `${user.name} requested a password reset`,
    entity: "User", entityId: user.id,
  });

  res.json({ message: "If your email is registered, you will receive a password reset request shortly." });
});

export const uploadStaffImage = asyncHandler(async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) throw new ApiError(400, "No image file provided");

  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) throw new ApiError(404, "User not found");

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { profilePicture: `/uploads/staff/${file.filename}` },
  });

  res.json({ profilePicture: updated.profilePicture });
});
