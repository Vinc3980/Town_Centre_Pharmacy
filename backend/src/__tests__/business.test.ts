import bcrypt from "bcryptjs";
import request from "supertest";
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import app from "../app";
import { prisma } from "../config/prisma";
import { signAccessToken } from "../services/tokenService";
import { ROLE_PERMISSIONS } from "../utils/permissions";
import { setupTestData, cleanupTestData, getOwnerToken, getCashierToken, getPharmacistToken, getTestMedicine, getTestBatch } from "./helpers";

let ownerToken: string;
let cashierToken: string;
let pharmacistToken: string;
let medicineId: string;
let medId: string;
let testBatchId: string;

beforeAll(async () => {
  await setupTestData();
  ownerToken = getOwnerToken();
  cashierToken = getCashierToken();
  pharmacistToken = getPharmacistToken();
  const med = getTestMedicine();
  medId = med._id;
  medicineId = med._id.toString();
  testBatchId = getTestBatch()._id.toString();
});

afterAll(async () => {
  await cleanupTestData();
});

beforeEach(async () => {
  await prisma.medicineBatch.updateMany({ data: { quantity: 50 } });
  await prisma.medicine.updateMany({ data: { status: "active" } });
  await prisma.pharmacySettings.updateMany({ data: { allowNegativeStock: false, requireManagerApprovalForRefund: true } });
});

async function restockMedicine(qty = 50, expiryDays = 365) {
  return prisma.medicineBatch.create({
    data: {
      medicineId: medId,
      batchNumber: `BIZ-TEST-${Date.now()}-${Math.random()}`,
      quantity: qty,
      purchasePrice: 3,
      sellingPrice: 5,
      expiryDate: new Date(Date.now() + expiryDays * 86400000),
    },
  });
}

async function createSale(token: string, qty = 3) {
  await restockMedicine(50);
  return request(app)
    .post("/api/v1/sales")
    .set("Authorization", `Bearer ${token}`)
    .send({
      items: [{ medicine: medicineId, quantity: qty }],
      payments: [{ method: "cash", amount: qty * 5 }],
    });
}

describe("Expired medicine cannot be sold", () => {
  it("rejects sale when only expired batches remain", async () => {
    await prisma.medicineBatch.deleteMany({ where: { medicineId: medId } });

    await prisma.medicineBatch.create({
      data: {
        medicineId: medId,
        batchNumber: `EXP-BIZ-${Date.now()}`,
        quantity: 20,
        purchasePrice: 3,
        sellingPrice: 5,
        expiryDate: new Date(Date.now() - 86400000),
      },
    });

    const res = await request(app)
      .post("/api/v1/sales")
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({
        items: [{ medicine: medicineId, quantity: 1 }],
        payments: [{ method: "cash", amount: 5 }],
      });

    expect(res.status).toBe(409);
  });
});

describe("Prescription-required medicine restriction", () => {
  it("blocks sale of prescription medicine without prescription", async () => {
    await prisma.medicine.update({ where: { id: medicineId }, data: { prescriptionRequired: true } });

    const res = await request(app)
      .post("/api/v1/sales")
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({
        items: [{ medicine: medicineId, quantity: 1 }],
        payments: [{ method: "cash", amount: 5 }],
      });

    expect(res.status).toBe(403);

    await prisma.medicine.update({ where: { id: medicineId }, data: { prescriptionRequired: false } });
  });

  it("allows sale of prescription medicine when a prescription reference is provided", async () => {
    await restockMedicine(50);
    await prisma.medicine.update({ where: { id: medicineId }, data: { prescriptionRequired: true } });

    const res = await request(app)
      .post("/api/v1/sales")
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({
        items: [{ medicine: medicineId, quantity: 1 }],
        payments: [{ method: "cash", amount: 5 }],
        prescriptionReference: "RX-2026-0001",
      });

    expect(res.status).toBe(201);
    expect(res.body.prescriptionReference).toBe("RX-2026-0001");
    expect(res.body.dispensedBy).toBeDefined();

    const sale = await prisma.sale.findUnique({ where: { id: res.body._id } });
    expect(sale!.prescriptionReference).toBe("RX-2026-0001");
    expect(sale!.dispensedById).not.toBeNull();

    const detail = await request(app)
      .get(`/api/v1/sales/${res.body._id}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.sale.dispensedBy).toBeTypeOf("object");
    expect(detail.body.sale.dispensedBy.name).toBeTruthy();

    await prisma.medicine.update({ where: { id: medicineId }, data: { prescriptionRequired: false } });
  });
});

describe("Controlled substance dispensing", () => {
  beforeEach(async () => {
    await restockMedicine(50);
    await prisma.medicine.update({
      where: { id: medicineId },
      data: { isControlledSubstance: true, controlledSubstanceClass: "Narcotic" },
    });
  });

  afterEach(async () => {
    await prisma.medicine.update({
      where: { id: medicineId },
      data: { isControlledSubstance: false, controlledSubstanceClass: null, prescriptionRequired: false },
    });
  });

  it("blocks staff from dispensing controlled substances even with a prescription", async () => {
    const res = await request(app)
      .post("/api/v1/sales")
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({
        items: [{ medicine: medicineId, quantity: 1 }],
        payments: [{ method: "cash", amount: 5 }],
        prescriptionReference: "RX-CTRL-0001",
      });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/permission to dispense controlled/i);
  });

  it("blocks controlled dispensing without a prescription reference", async () => {
    const res = await request(app)
      .post("/api/v1/sales")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        items: [{ medicine: medicineId, quantity: 1 }],
        payments: [{ method: "cash", amount: 5 }],
      });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/requires a valid prescription/i);
  });

  it("allows a branch manager to dispense with a prescription reference", async () => {
    const res = await request(app)
      .post("/api/v1/sales")
      .set("Authorization", `Bearer ${pharmacistToken}`)
      .send({
        items: [{ medicine: medicineId, quantity: 2 }],
        payments: [{ method: "cash", amount: 10 }],
        prescriptionReference: "RX-CTRL-0002",
      });

    expect(res.status).toBe(201);

    const sale = await prisma.sale.findUnique({ where: { id: res.body._id } });
    expect(sale!.prescriptionReference).toBe("RX-CTRL-0002");
    expect(sale!.dispensedById).not.toBeNull();
  });
});

describe("Negative stock prevention", () => {
  it("prevents selling more than available when allowNegativeStock is false", async () => {
    await prisma.medicineBatch.updateMany({ where: { medicineId: medId }, data: { quantity: 2 } });
    await prisma.pharmacySettings.updateMany({ data: { allowNegativeStock: false } });

    const res = await request(app)
      .post("/api/v1/sales")
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({
        items: [{ medicine: medicineId, quantity: 10 }],
        payments: [{ method: "cash", amount: 50 }],
      });

    expect(res.status).toBe(409);
  });
});

describe("Refund cannot exceed original quantity", () => {
  it("rejects refund exceeding original sale quantity", async () => {
    await prisma.pharmacySettings.updateMany({ data: { requireManagerApprovalForRefund: false } });
    const saleRes = await createSale(ownerToken, 2);
    const saleId = saleRes.body._id;

    const saleDoc = await prisma.sale.findUnique({ where: { id: saleId }, include: { items: true } });
    const saleItem = saleDoc!.items.find((it) => it.medicineId === medicineId);
    const batchId = saleItem!.batchId;

    const res = await request(app)
      .post(`/api/v1/sales/${saleId}/refund`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        items: [{ medicine: medicineId, batch: batchId, returnQuantity: 3, condition: "resaleable", reason: "Excess" }],
      });

    expect(res.status).toBe(400);

    await prisma.pharmacySettings.updateMany({ data: { requireManagerApprovalForRefund: true } });
  });
});

describe("Double refund prevention", () => {
  it("prevents refunding more than already refundable", async () => {
    await prisma.pharmacySettings.updateMany({ data: { requireManagerApprovalForRefund: false } });
    const saleRes = await createSale(ownerToken, 2);
    const saleId = saleRes.body._id;

    const saleDoc = await prisma.sale.findUnique({ where: { id: saleId }, include: { items: true } });
    const saleItem = saleDoc!.items.find((it) => it.medicineId === medicineId);
    const batchId = saleItem!.batchId;

    await request(app)
      .post(`/api/v1/sales/${saleId}/refund`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        items: [{ medicine: medicineId, batch: batchId, returnQuantity: 2, condition: "resaleable", reason: "Full return" }],
      });

    const res = await request(app)
      .post(`/api/v1/sales/${saleId}/refund`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        items: [{ medicine: medicineId, batch: batchId, returnQuantity: 1, condition: "resaleable", reason: "Extra" }],
      });

    expect(res.status).toBe(409);

    await prisma.pharmacySettings.updateMany({ data: { requireManagerApprovalForRefund: true } });
  });
});

describe("Approved daily report immutability", () => {
  it("cannot re-approve an already approved report", async () => {
    const openRes = await request(app)
      .post("/api/v1/daily/sessions")
      .set("Authorization", `Bearer ${getCashierToken()}`)
      .send({ openingCash: 50 });

    await prisma.dailySession.update({ where: { id: openRes.body._id }, data: { status: "open" } });

    const closeRes = await request(app)
      .post("/api/v1/daily/sessions/close")
      .set("Authorization", `Bearer ${getCashierToken()}`)
      .send({ actualCash: 50 });

    await prisma.dailySession.update({ where: { id: closeRes.body._id }, data: { status: "closed", closedAt: new Date() } });

    const submitRes = await request(app)
      .post("/api/v1/daily/reports/submit")
      .set("Authorization", `Bearer ${getCashierToken()}`)
      .send({ actualCash: 50 });

    await request(app)
      .post(`/api/v1/daily/reports/${submitRes.body._id}/approve`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({});

    const res = await request(app)
      .post(`/api/v1/daily/reports/${submitRes.body._id}/approve`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({});

    expect(res.status).toBe(400);
  });
});

describe("Cashier cannot approve daily reports", () => {
  it("rejects cashier approval attempt", async () => {
    const openRes = await request(app)
      .post("/api/v1/daily/sessions")
      .set("Authorization", `Bearer ${getCashierToken()}`)
      .send({ openingCash: 50 });

    await prisma.dailySession.update({ where: { id: openRes.body._id }, data: { status: "open" } });

    const closeRes = await request(app)
      .post("/api/v1/daily/sessions/close")
      .set("Authorization", `Bearer ${getCashierToken()}`)
      .send({ actualCash: 50 });

    await prisma.dailySession.update({ where: { id: closeRes.body._id }, data: { status: "closed", closedAt: new Date() } });

    const submitRes = await request(app)
      .post("/api/v1/daily/reports/submit")
      .set("Authorization", `Bearer ${getCashierToken()}`)
      .send({ actualCash: 50 });

    const res = await request(app)
      .post(`/api/v1/daily/reports/${submitRes.body._id}/approve`)
      .set("Authorization", `Bearer ${getCashierToken()}`)
      .send({});

    expect(res.status).toBe(403);
  });
});

describe("Cashier permission restrictions", () => {
  it("cashier cannot access audit logs", async () => {
    const res = await request(app)
      .get("/api/v1/audit")
      .set("Authorization", `Bearer ${cashierToken}`);

    expect(res.status).toBe(403);
  });

  it("cashier cannot create users", async () => {
    const res = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({ name: "Hacker", email: "h@h.com", password: "Pass123!", role: "staff" });

    expect(res.status).toBe(403);
  });

  it("cashier cannot access settings", async () => {
    const res = await request(app)
      .get("/api/v1/settings")
      .set("Authorization", `Bearer ${cashierToken}`);

    expect(res.status).toBe(403);
  });
});

describe("Discount requires permission", () => {
  it("cashier without apply_discounts permission cannot apply discount", async () => {
    await prisma.pharmacySettings.updateMany({ data: { requireManagerApprovalForRefund: false } });
    await restockMedicine(50);

    const res = await request(app)
      .post("/api/v1/sales")
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({
        items: [{ medicine: medicineId, quantity: 1, discount: 10, discountType: "percentage" }],
        payments: [{ method: "cash", amount: 5 }],
      });

    expect([403, 400]).toContain(res.status);
  });
});

describe("Return condition restocking rules", () => {
  it("damaged return does not restock", async () => {
    await prisma.pharmacySettings.updateMany({ data: { requireManagerApprovalForRefund: false } });
    const saleRes = await createSale(ownerToken, 2);
    const saleId = saleRes.body._id;

    const saleDoc = await prisma.sale.findUnique({ where: { id: saleId }, include: { items: true } });
    const saleItem = saleDoc!.items.find((it) => it.medicineId === medicineId);
    const batchId = saleItem!.batchId;

    const stockBefore = await prisma.medicineBatch.aggregate({
      where: { medicineId: medId },
      _sum: { quantity: true },
    });

    await request(app)
      .post(`/api/v1/sales/${saleId}/refund`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        items: [{ medicine: medicineId, batch: batchId, returnQuantity: 1, condition: "damaged", reason: "Broken" }],
      });

    const stockAfter = await prisma.medicineBatch.aggregate({
      where: { medicineId: medId },
      _sum: { quantity: true },
    });

    expect(stockAfter._sum.quantity).toBe(stockBefore._sum.quantity);
  });

  it("resaleable return does restock", async () => {
    await prisma.pharmacySettings.updateMany({ data: { requireManagerApprovalForRefund: false } });
    const saleRes = await createSale(ownerToken, 2);
    const saleId = saleRes.body._id;

    const saleDoc = await prisma.sale.findUnique({ where: { id: saleId }, include: { items: true } });
    const saleItem = saleDoc!.items.find((it) => it.medicineId === medicineId);
    const batchId = saleItem!.batchId;

    const stockBefore = await prisma.medicineBatch.aggregate({
      where: { medicineId: medId },
      _sum: { quantity: true },
    });

    await request(app)
      .post(`/api/v1/sales/${saleId}/refund`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        items: [{ medicine: medicineId, batch: batchId, returnQuantity: 1, condition: "resaleable", reason: "Changed mind" }],
      });

    const stockAfter = await prisma.medicineBatch.aggregate({
      where: { medicineId: medId },
      _sum: { quantity: true },
    });

    expect(stockAfter._sum.quantity).toBe((stockBefore._sum.quantity ?? 0) + 1);
  });
});

describe("Self-deactivation prevention", () => {
  it("user cannot deactivate their own account", async () => {
    const owner = await prisma.user.findUnique({ where: { email: "testowner@test.com" } });
    const res = await request(app)
      .post(`/api/v1/users/${owner!.id}/deactivate`)
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(res.status).toBe(400);
  });
});

describe("Owner role protection", () => {
  it("cannot change owner's role", async () => {
    const owner = await prisma.user.findUnique({ where: { email: "testowner@test.com" } });
    const res = await request(app)
      .put(`/api/v1/users/${owner!.id}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ role: "staff" });

    expect(res.status).toBe(403);
  });

  it("cannot assign equal or higher role", async () => {
    const pharmacist = await prisma.user.findUnique({ where: { email: "testpharmacist@test.com" } });
    const branchManagerToken = signAccessToken({
      sub: pharmacist!.id,
      role: "branch_manager",
      permissions: ROLE_PERMISSIONS.branch_manager,
      name: "Branch Manager",
    });

    const cashier = await prisma.user.findUnique({ where: { email: "testcashier@test.com" } });
    const res = await request(app)
      .put(`/api/v1/users/${cashier!.id}`)
      .set("Authorization", `Bearer ${branchManagerToken}`)
      .send({ role: "branch_manager" });

    expect(res.status).toBe(403);
  });
});
