import { Prisma } from "@prisma/client";
import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { recordAudit } from "../services/auditService";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";
import { isValidUuid } from "../utils/security";
import { serialize, serializeMany } from "../utils/serialize";

const customerSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(5),
  email: z.string().email().optional().or(z.literal("")),
  dateOfBirth: z.string().optional().or(z.literal("")),
  gender: z.enum(["male", "female", "other"]).optional(),
  bloodGroup: z.string().optional(),
  address: z.string().optional(),
  emergencyContact: z.string().optional(),
  emergencyPhone: z.string().optional(),
  ghanaCardNumber: z.string().trim().max(40).optional().or(z.literal("")),
  allergies: z.array(z.string()).optional(),
  medicalConditions: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

const vitalsSchema = z.object({
  bloodPressure: z.string().optional(),
  heartRate: z.number().optional(),
  temperature: z.number().optional(),
  weight: z.number().optional(),
  height: z.number().optional(),
  notes: z.string().optional(),
});

const visitSchema = z.object({
  reason: z.string().min(1),
  tests: z.string().optional(),
  results: z.string().optional(),
  notes: z.string().optional(),
});

const customerInclude: Prisma.CustomerInclude = {
  vitals: { orderBy: { seq: "asc" } },
  visits: { orderBy: { seq: "asc" } },
};

export const listCustomers = asyncHandler(async (req: Request, res: Response) => {
  const { search } = req.query as Record<string, string>;
  const where: Prisma.CustomerWhereInput = {};
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { phone: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
    ];
  }
  const customers = await prisma.customer.findMany({
    where,
    include: customerInclude,
    orderBy: { name: "asc" },
    take: 50,
  });
  res.json(serializeMany("customer", customers));
});

export const getCustomer = asyncHandler(async (req: Request, res: Response) => {
  if (!isValidUuid(req.params.id)) throw new ApiError(404, "Customer not found");
  const customer = await prisma.customer.findUnique({ where: { id: req.params.id }, include: customerInclude });
  if (!customer) throw new ApiError(404, "Customer not found");
  res.json(serialize("customer", customer));
});

export const createCustomer = asyncHandler(async (req: Request, res: Response) => {
  const data = customerSchema.parse(req.body);
  const existing = await prisma.customer.findFirst({ where: { phone: data.phone } });
  if (existing) throw new ApiError(409, "A customer with that phone number already exists");

  const payload: Prisma.CustomerUncheckedCreateInput = { name: data.name, phone: data.phone };
  if (data.email) payload.email = data.email;
  if (data.dateOfBirth) payload.dateOfBirth = new Date(data.dateOfBirth);
  if (data.gender) payload.gender = data.gender;
  if (data.bloodGroup) payload.bloodGroup = data.bloodGroup;
  if (data.address) payload.address = data.address;
  if (data.emergencyContact) payload.emergencyContact = data.emergencyContact;
  if (data.emergencyPhone) payload.emergencyPhone = data.emergencyPhone;
  if (data.ghanaCardNumber) payload.ghanaCardNumber = data.ghanaCardNumber;
  if (data.allergies) payload.allergies = data.allergies;
  if (data.medicalConditions) payload.medicalConditions = data.medicalConditions;
  if (data.notes) payload.notes = data.notes;

  const customer = await prisma.customer.create({ data: payload, include: customerInclude });
  await recordAudit({
    req, action: "CUSTOMER_CREATED", module: "customers",
    description: `${req.user!.name} added customer "${customer.name}"`,
    entity: "Customer", entityId: customer.id,
  });
  res.status(201).json(serialize("customer", customer));
});

export const updateCustomer = asyncHandler(async (req: Request, res: Response) => {
  if (!isValidUuid(req.params.id)) throw new ApiError(404, "Customer not found");
  const customer = await prisma.customer.findUnique({ where: { id: req.params.id } });
  if (!customer) throw new ApiError(404, "Customer not found");

  const data = customerSchema.partial().parse(req.body);
  const updates: Prisma.CustomerUpdateInput = {};
  if (data.name !== undefined) updates.name = data.name;
  if (data.phone !== undefined) updates.phone = data.phone;
  if (data.email !== undefined) updates.email = data.email || undefined;
  if (data.dateOfBirth !== undefined) updates.dateOfBirth = data.dateOfBirth ? new Date(data.dateOfBirth) : undefined;
  if (data.gender !== undefined) updates.gender = data.gender;
  if (data.bloodGroup !== undefined) updates.bloodGroup = data.bloodGroup;
  if (data.address !== undefined) updates.address = data.address;
  if (data.emergencyContact !== undefined) updates.emergencyContact = data.emergencyContact;
  if (data.emergencyPhone !== undefined) updates.emergencyPhone = data.emergencyPhone;
  if (data.ghanaCardNumber !== undefined) updates.ghanaCardNumber = data.ghanaCardNumber || null;
  if (data.allergies !== undefined) updates.allergies = data.allergies;
  if (data.medicalConditions !== undefined) updates.medicalConditions = data.medicalConditions;
  if (data.notes !== undefined) updates.notes = data.notes;

  const updated = await prisma.customer.update({ where: { id: customer.id }, data: updates, include: customerInclude });
  await recordAudit({
    req, action: "CUSTOMER_CREATED", module: "customers",
    description: `${req.user!.name} updated customer "${updated.name}"`,
    entity: "Customer", entityId: customer.id,
  });
  res.json(serialize("customer", updated));
});

export const deleteCustomer = asyncHandler(async (req: Request, res: Response) => {
  if (!isValidUuid(req.params.id)) throw new ApiError(404, "Customer not found");
  const customer = await prisma.customer.findUnique({ where: { id: req.params.id } });
  if (!customer) throw new ApiError(404, "Customer not found");

  await prisma.customer.delete({ where: { id: customer.id } });
  await recordAudit({
    req, action: "CUSTOMER_CREATED", module: "customers",
    description: `${req.user!.name} deleted customer "${customer.name}"`,
    entity: "Customer", entityId: customer.id,
  });
  res.json({ message: "Customer deleted" });
});

export const generateCustomerReport = asyncHandler(async (req: Request, res: Response) => {
  if (!isValidUuid(req.params.id)) throw new ApiError(404, "Customer not found");
  const customer = await prisma.customer.findUnique({ where: { id: req.params.id }, include: customerInclude });
  if (!customer) throw new ApiError(404, "Customer not found");

  res.json({
    customer: {
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      dateOfBirth: customer.dateOfBirth,
      gender: customer.gender,
      bloodGroup: customer.bloodGroup,
      address: customer.address,
      emergencyContact: customer.emergencyContact,
      emergencyPhone: customer.emergencyPhone,
      allergies: customer.allergies,
      medicalConditions: customer.medicalConditions,
      notes: customer.notes,
    },
    vitals: serializeMany("customerVital", customer.vitals),
    visits: serializeMany("customerVisit", customer.visits),
    generatedAt: new Date().toISOString(),
  });
});

export const addVitals = asyncHandler(async (req: Request, res: Response) => {
  if (!isValidUuid(req.params.id)) throw new ApiError(404, "Customer not found");
  const customer = await prisma.customer.findUnique({ where: { id: req.params.id }, include: customerInclude });
  if (!customer) throw new ApiError(404, "Customer not found");

  const data = vitalsSchema.parse(req.body);
  const vital = await prisma.customerVital.create({
    data: {
      customerId: customer.id,
      seq: customer.vitals.length,
      date: new Date(),
      ...data,
      recordedById: req.user!.sub,
    },
  });

  res.json(serialize("customer", { ...customer, vitals: [...customer.vitals, vital] }));
});

export const addVisit = asyncHandler(async (req: Request, res: Response) => {
  if (!isValidUuid(req.params.id)) throw new ApiError(404, "Customer not found");
  const customer = await prisma.customer.findUnique({ where: { id: req.params.id }, include: customerInclude });
  if (!customer) throw new ApiError(404, "Customer not found");

  const data = visitSchema.parse(req.body);
  const visit = await prisma.customerVisit.create({
    data: {
      customerId: customer.id,
      seq: customer.visits.length,
      date: new Date(),
      ...data,
      recordedById: req.user!.sub,
    },
  });

  res.json(serialize("customer", { ...customer, visits: [...customer.visits, visit] }));
});

export const uploadCustomerImage = asyncHandler(async (req: Request, res: Response) => {
  if (!isValidUuid(req.params.id)) throw new ApiError(404, "Customer not found");
  const customer = await prisma.customer.findUnique({ where: { id: req.params.id } });
  if (!customer) throw new ApiError(404, "Customer not found");
  if (!req.file) throw new ApiError(400, "No image uploaded");
  const profileImage = `/uploads/customers/${req.file.filename}`;
  await prisma.customer.update({ where: { id: customer.id }, data: { profileImage } });
  res.json({ profileImage });
});
