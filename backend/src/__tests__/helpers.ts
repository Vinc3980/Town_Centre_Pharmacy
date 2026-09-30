import bcrypt from "bcryptjs";
import { connectDB } from "../config/db";
import { prisma } from "../config/prisma";
import { signAccessToken } from "../services/tokenService";
import { ROLE_PERMISSIONS } from "../utils/permissions";

export interface TestUser {
  _id: string;
  name: string;
  email: string;
  role: string;
  token: string;
}

export interface TestMedicine {
  _id: string;
  name: string;
  sellingPrice: number;
  purchasePrice: number;
  barcode: string;
  sku: string;
  prescriptionRequired: boolean;
}

export interface TestBatch {
  _id: string;
  medicine: string;
  quantity: number;
  purchasePrice: number;
  expiryDate: Date;
  batchNumber: string;
}

export interface TestCustomer {
  _id: string;
  name: string;
  phone: string;
}

let ownerUser: TestUser;
let cashierUser: TestUser;
let pharmacistUser: TestUser;
let testMedicine: TestMedicine;
let testBatch: TestBatch;
let testCustomer: TestCustomer;

export function getOwnerToken() { return ownerUser.token; }
export function getCashierToken() { return cashierUser.token; }
export function getPharmacistToken() { return pharmacistUser.token; }
export function getTestMedicine() { return testMedicine; }
export function getTestBatch() { return testBatch; }
export function getTestCustomer() { return testCustomer; }

export async function truncateAll() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length > 0) {
    const list = tables.map((t) => `"${t.tablename}"`).join(", ");
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  }
}

export async function setupTestData() {
  await connectDB();
  await truncateAll();

  const passwordHash = await bcrypt.hash("Test123!", 10);

  const owner = await prisma.user.create({
    data: {
      name: "Test Owner",
      email: "testowner@test.com",
      passwordHash,
      role: "admin",
      permissions: ROLE_PERMISSIONS.admin,
      staffId: "OW-0001",
    },
  });

  const cashier = await prisma.user.create({
    data: {
      name: "Test Cashier",
      email: "testcashier@test.com",
      passwordHash,
      role: "staff",
      permissions: ROLE_PERMISSIONS.staff,
      staffId: "CH-0001",
    },
  });

  const pharmacist = await prisma.user.create({
    data: {
      name: "Test Pharmacist",
      email: "testpharmacist@test.com",
      passwordHash,
      role: "branch_manager",
      permissions: ROLE_PERMISSIONS.branch_manager,
      staffId: "PH-0001",
    },
  });

  ownerUser = {
    _id: owner.id,
    name: owner.name,
    email: owner.email,
    role: owner.role,
    token: signAccessToken({ sub: owner.id, role: owner.role, permissions: ROLE_PERMISSIONS.admin, name: owner.name }),
  };

  cashierUser = {
    _id: cashier.id,
    name: cashier.name,
    email: cashier.email,
    role: cashier.role,
    token: signAccessToken({ sub: cashier.id, role: cashier.role, permissions: ROLE_PERMISSIONS.staff, name: cashier.name }),
  };

  pharmacistUser = {
    _id: pharmacist.id,
    name: pharmacist.name,
    email: pharmacist.email,
    role: pharmacist.role,
    token: signAccessToken({ sub: pharmacist.id, role: pharmacist.role, permissions: ROLE_PERMISSIONS.branch_manager, name: pharmacist.name }),
  };

  const category = await prisma.category.create({ data: { name: "Test Category" } });

  const medicine = await prisma.medicine.create({
    data: {
      name: "Paracetamol 500mg",
      categoryId: category.id,
      sku: "TEST-001",
      barcode: "TESTBARCODE001",
      form: "Tablet",
      purchasePrice: 3,
      sellingPrice: 5,
      prescriptionRequired: false,
      minStock: 10,
      maxStock: 500,
      reorderLevel: 25,
    },
  });

  testMedicine = {
    _id: medicine.id,
    name: medicine.name,
    sellingPrice: medicine.sellingPrice,
    purchasePrice: medicine.purchasePrice,
    barcode: medicine.barcode ?? "",
    sku: medicine.sku,
    prescriptionRequired: medicine.prescriptionRequired,
  };

  const expiredBatch = await prisma.medicineBatch.create({
    data: {
      medicineId: medicine.id,
      batchNumber: "EXP-001",
      quantity: 20,
      purchasePrice: 3,
      sellingPrice: 5,
      expiryDate: new Date(Date.now() - 86400000),
    },
  });

  const batch = await prisma.medicineBatch.create({
    data: {
      medicineId: medicine.id,
      batchNumber: "TEST-BATCH-001",
      quantity: 50,
      purchasePrice: 3,
      sellingPrice: 5,
      expiryDate: new Date(Date.now() + 365 * 86400000),
    },
  });

  testBatch = {
    _id: batch.id,
    medicine: batch.medicineId,
    quantity: batch.quantity,
    purchasePrice: batch.purchasePrice,
    expiryDate: batch.expiryDate,
    batchNumber: batch.batchNumber,
  };

  const secondBatch = await prisma.medicineBatch.create({
    data: {
      medicineId: medicine.id,
      batchNumber: "TEST-BATCH-002",
      quantity: 30,
      purchasePrice: 3,
      sellingPrice: 5,
      expiryDate: new Date(Date.now() + 200 * 86400000),
    },
  });

  const customer = await prisma.customer.create({
    data: { name: "Test Customer", phone: "0240000000" },
  });

  testCustomer = { _id: customer.id, name: customer.name, phone: customer.phone };

  await prisma.pharmacy.create({
    data: {
      name: "Town Centre Pharmacy",
      registrationNumber: "PH-001",
      phone: "+233 30 200 1234",
      email: "info@towncentrepharmacy.gh",
      address: "123 Liberation Road",
      city: "Accra",
      region: "Greater Accra",
      country: "Ghana",
      currency: "GHS",
      timezone: "Africa/Accra",
      branchNames: ["Main Branch"],
      paymentMethods: ["cash"],
      settings: { create: { requireManagerApprovalForRefund: true } },
    },
  });

  return { expiredBatch, secondBatch };
}

export async function cleanupTestData() {
  await truncateAll();
}
