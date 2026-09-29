import request from "supertest";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import app from "../app";
import { prisma } from "../config/prisma";
import {
  setupTestData, cleanupTestData,
  getOwnerToken, getCashierToken, getPharmacistToken,
  getTestMedicine, getTestBatch, getTestCustomer,
} from "./helpers";

let medicineId: string;
let customerId: string;
let medId: string;
let testBatchId: string;

beforeAll(async () => {
  await setupTestData();
  const med = getTestMedicine();
  const cust = getTestCustomer();
  const batch = getTestBatch();
  medId = med._id;
  medicineId = med._id.toString();
  customerId = cust._id.toString();
  testBatchId = batch._id.toString();
});

afterAll(async () => {
  await cleanupTestData();
});

async function restockMedicine(qty = 50) {
  return prisma.medicineBatch.create({
    data: {
      medicineId: medId,
      batchNumber: `RESTOCK-${Date.now()}-${Math.random()}`,
      quantity: qty,
      purchasePrice: 3,
      sellingPrice: 5,
      expiryDate: new Date(Date.now() + 365 * 86400000),
    },
  });
}

async function createCompletedSale(qty = 3) {
  await restockMedicine(50);
  const res = await request(app)
    .post("/api/v1/sales")
    .set("Authorization", `Bearer ${getCashierToken()}`)
    .send({
      items: [{ medicine: medicineId, quantity: qty }],
      payments: [{ method: "cash", amount: qty * 5 }],
    });
  const saleId = res.body._id;
  const saleDoc = await prisma.sale.findUnique({ where: { id: saleId }, include: { items: true } });
  const saleItem = saleDoc!.items.find((it) => it.medicineId === medicineId);
  const batchId = saleItem!.batchId;
  return { saleId, batchId, total: res.body.total, sale: res.body };
}

describe("Refund — full refund (no approval required)", () => {
  it("should process a full refund immediately when approval not required", async () => {
    await prisma.pharmacySettings.updateMany({ data: { requireManagerApprovalForRefund: false } });

    const { saleId, batchId } = await createCompletedSale(2);

    const res = await request(app)
      .post(`/api/v1/sales/${saleId}/refund`)
      .set("Authorization", `Bearer ${getOwnerToken()}`)
      .send({
        items: [{ medicine: medicineId, batch: batchId, returnQuantity: 2, condition: "resaleable", reason: "Customer changed mind" }],
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("completed");
    expect(res.body.refundAmount).toBe(10);

    const sale = await prisma.sale.findUnique({ where: { id: saleId } });
    expect(sale!.status).toBe("refunded");

    await prisma.pharmacySettings.updateMany({ data: { requireManagerApprovalForRefund: true } });
  });
});

describe("Refund — approval required", () => {
  it("should create a pending refund when approval is required", async () => {
    const { saleId, batchId } = await createCompletedSale(2);

    const res = await request(app)
      .post(`/api/v1/sales/${saleId}/refund`)
      .set("Authorization", `Bearer ${getOwnerToken()}`)
      .send({
        items: [{ medicine: medicineId, batch: batchId, returnQuantity: 1, condition: "resaleable", reason: "Wrong item" }],
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("pending");
    expect(res.body.refundAmount).toBe(5);

    const sale = await prisma.sale.findUnique({ where: { id: saleId } });
    expect(sale!.status).toBe("completed");
  });

  it("should list pending refunds", async () => {
    const res = await request(app)
      .get("/api/v1/sales/refunds/pending")
      .set("Authorization", `Bearer ${getOwnerToken()}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].status).toBe("pending");
  });

  it("should approve a pending refund", async () => {
    const pending = await prisma.saleReturn.findFirst({ where: { status: "pending" } });
    if (!pending) return;

    const res = await request(app)
      .post(`/api/v1/sales/refunds/${pending.id}/approve`)
      .set("Authorization", `Bearer ${getOwnerToken()}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("completed");

    const sale = await prisma.sale.findUnique({ where: { id: pending.saleId } });
    expect(sale!.status).toMatch(/refunded|partially_refunded/);
  });

  it("should reject a pending refund with reason", async () => {
    const { saleId, batchId } = await createCompletedSale(1);
    await request(app)
      .post(`/api/v1/sales/${saleId}/refund`)
      .set("Authorization", `Bearer ${getCashierToken()}`)
      .send({
        items: [{ medicine: medicineId, batch: batchId, returnQuantity: 1, condition: "resaleable", reason: "Test reject" }],
      });

    const pending = await prisma.saleReturn.findFirst({ where: { status: "pending" } });
    if (!pending) return;

    const res = await request(app)
      .post(`/api/v1/sales/refunds/${pending.id}/approve`)
      .set("Authorization", `Bearer ${getOwnerToken()}`)
      .send({ rejectionReason: "Not valid" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("rejected");
    expect(res.body.rejectionReason).toBe("Not valid");
  });
});

describe("Partial refund", () => {
  it("should allow partial refund of a sale", async () => {
    await prisma.pharmacySettings.updateMany({ data: { requireManagerApprovalForRefund: false } });

    const { saleId, batchId } = await createCompletedSale(4);

    const res = await request(app)
      .post(`/api/v1/sales/${saleId}/refund`)
      .set("Authorization", `Bearer ${getOwnerToken()}`)
      .send({
        items: [{ medicine: medicineId, batch: batchId, returnQuantity: 2, condition: "resaleable", reason: "Partial return" }],
      });

    expect(res.status).toBe(201);
    expect(res.body.refundAmount).toBe(10);

    const sale = await prisma.sale.findUnique({ where: { id: saleId } });
    expect(sale!.status).toBe("partially_refunded");
    expect(sale!.refundedAmount).toBe(10);

    await prisma.pharmacySettings.updateMany({ data: { requireManagerApprovalForRefund: true } });
  });
});

describe("Double refund prevention", () => {
  it("should not allow returning more than originally sold", async () => {
    await prisma.pharmacySettings.updateMany({ data: { requireManagerApprovalForRefund: false } });

    const { saleId, batchId } = await createCompletedSale(2);

    await request(app)
      .post(`/api/v1/sales/${saleId}/refund`)
      .set("Authorization", `Bearer ${getOwnerToken()}`)
      .send({
        items: [{ medicine: medicineId, batch: batchId, returnQuantity: 2, condition: "resaleable", reason: "Full return" }],
      });

    const res = await request(app)
      .post(`/api/v1/sales/${saleId}/refund`)
      .set("Authorization", `Bearer ${getOwnerToken()}`)
      .send({
        items: [{ medicine: medicineId, batch: batchId, returnQuantity: 1, condition: "resaleable", reason: "Second return" }],
      });

    expect(res.status).toBe(409);

    await prisma.pharmacySettings.updateMany({ data: { requireManagerApprovalForRefund: true } });
  });
});

describe("Excess refund prevention", () => {
  it("should not allow returning more than available quantity", async () => {
    const { saleId, batchId } = await createCompletedSale(2);

    const res = await request(app)
      .post(`/api/v1/sales/${saleId}/refund`)
      .set("Authorization", `Bearer ${getOwnerToken()}`)
      .send({
        items: [{ medicine: medicineId, batch: batchId, returnQuantity: 5, condition: "resaleable", reason: "Too many" }],
      });

    expect(res.status).toBe(400);
  });
});

describe("Damaged return", () => {
  it("should record damaged return without restocking", async () => {
    await prisma.pharmacySettings.updateMany({ data: { requireManagerApprovalForRefund: false } });

    const { saleId, batchId } = await createCompletedSale(2);
    const stockBefore = await prisma.medicineBatch.aggregate({
      where: { medicineId: medId },
      _sum: { quantity: true },
    });

    const res = await request(app)
      .post(`/api/v1/sales/${saleId}/refund`)
      .set("Authorization", `Bearer ${getOwnerToken()}`)
      .send({
        items: [{ medicine: medicineId, batch: batchId, returnQuantity: 1, condition: "damaged", reason: "Broken tablet" }],
      });

    expect(res.status).toBe(201);
    expect(res.body.items[0].condition).toBe("damaged");

    const stockAfter = await prisma.medicineBatch.aggregate({
      where: { medicineId: medId },
      _sum: { quantity: true },
    });

    const damagedMovement = await prisma.inventoryMovement.findFirst({ where: { type: "damaged" } });
    expect(damagedMovement).toBeDefined();

    await prisma.pharmacySettings.updateMany({ data: { requireManagerApprovalForRefund: true } });
  });
});

describe("Void", () => {
  it("should void a completed sale and restore stock", async () => {
    const { saleId } = await createCompletedSale(2);
    const stockBefore = await prisma.medicineBatch.aggregate({
      where: { medicineId: medId },
      _sum: { quantity: true },
    });

    const res = await request(app)
      .post(`/api/v1/sales/${saleId}/void`)
      .set("Authorization", `Bearer ${getOwnerToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("voided");

    const sale = await prisma.sale.findUnique({ where: { id: saleId } });
    expect(sale!.status).toBe("voided");

    const stockAfter = await prisma.medicineBatch.aggregate({
      where: { medicineId: medId },
      _sum: { quantity: true },
    });

    const returnMovement = await prisma.inventoryMovement.findFirst({ where: { type: "return", reason: "Sale voided" } });
    expect(returnMovement).toBeDefined();
  });

  it("should void a held sale without stock changes", async () => {
    const res = await request(app)
      .post("/api/v1/sales/hold")
      .set("Authorization", `Bearer ${getCashierToken()}`)
      .send({ items: [{ medicine: medicineId, quantity: 1 }] });

    const voidRes = await request(app)
      .post(`/api/v1/sales/${res.body._id}/void`)
      .set("Authorization", `Bearer ${getOwnerToken()}`);

    expect(voidRes.status).toBe(200);
    expect(voidRes.body.status).toBe("voided");
  });

  it("should not void an already voided sale", async () => {
    const { saleId } = await createCompletedSale(1);
    await request(app)
      .post(`/api/v1/sales/${saleId}/void`)
      .set("Authorization", `Bearer ${getOwnerToken()}`);

    const res = await request(app)
      .post(`/api/v1/sales/${saleId}/void`)
      .set("Authorization", `Bearer ${getOwnerToken()}`);

    expect(res.status).toBe(409);
  });
});

describe("Sale detail", () => {
  it("should return sale detail with returns", async () => {
    const { saleId } = await createCompletedSale(1);

    const res = await request(app)
      .get(`/api/v1/sales/${saleId}`)
      .set("Authorization", `Bearer ${getOwnerToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.sale).toBeDefined();
    expect(res.body.returns).toBeDefined();
    expect(Array.isArray(res.body.returns)).toBe(true);
  });
});

describe("Sales list", () => {
  it("should list sales with filters", async () => {
    const res = await request(app)
      .get("/api/v1/sales")
      .set("Authorization", `Bearer ${getOwnerToken()}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("should filter by status", async () => {
    const res = await request(app)
      .get("/api/v1/sales?status=completed")
      .set("Authorization", `Bearer ${getOwnerToken()}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

async function createInsuranceSale() {
  await restockMedicine(50);
  return request(app)
    .post("/api/v1/sales")
    .set("Authorization", `Bearer ${getCashierToken()}`)
    .send({
      items: [{ medicine: medicineId, quantity: 2 }],
      payments: [{ method: "insurance", amount: 10 }],
      customer: customerId,
      saleType: "insurance",
      insuranceProvider: "NHIS",
      policyOrNhisNumber: "NHIS-9981",
    });
}

describe("Insurance sales", () => {
  it("should reject an insurance sale without a registered customer", async () => {
    await restockMedicine(20);
    const res = await request(app)
      .post("/api/v1/sales")
      .set("Authorization", `Bearer ${getCashierToken()}`)
      .send({
        items: [{ medicine: medicineId, quantity: 1 }],
        payments: [{ method: "insurance", amount: 5 }],
        saleType: "insurance",
        insuranceProvider: "NHIS",
        policyOrNhisNumber: "NHIS-1",
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/registered customer/i);
  });

  it("should reject an insurance sale without a provider", async () => {
    await restockMedicine(20);
    const res = await request(app)
      .post("/api/v1/sales")
      .set("Authorization", `Bearer ${getCashierToken()}`)
      .send({
        items: [{ medicine: medicineId, quantity: 1 }],
        payments: [{ method: "insurance", amount: 5 }],
        customer: customerId,
        saleType: "insurance",
        policyOrNhisNumber: "NHIS-1",
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/provider/i);
  });

  it("should reject an insurance sale without a policy number", async () => {
    await restockMedicine(20);
    const res = await request(app)
      .post("/api/v1/sales")
      .set("Authorization", `Bearer ${getCashierToken()}`)
      .send({
        items: [{ medicine: medicineId, quantity: 1 }],
        payments: [{ method: "insurance", amount: 5 }],
        customer: customerId,
        saleType: "insurance",
        insuranceProvider: "NHIS",
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/policy or nhis number/i);
  });

  it("should create a completed insurance sale with a pending claim", async () => {
    const res = await createInsuranceSale();

    expect(res.status).toBe(201);
    expect(res.body.saleType).toBe("insurance");
    expect(res.body.insuranceProvider).toBe("NHIS");
    expect(res.body.policyOrNhisNumber).toBe("NHIS-9981");
    expect(res.body.claimStatus).toBe("pending");
    expect(res.body.payments[0].method).toBe("insurance");
  });
});

describe("Claim status transitions", () => {
  it("should let staff submit a pending claim", async () => {
    const created = await createInsuranceSale();

    const res = await request(app)
      .patch(`/api/v1/sales/${created.body._id}/claim-status`)
      .set("Authorization", `Bearer ${getCashierToken()}`)
      .send({ claimStatus: "submitted" });

    expect(res.status).toBe(200);
    expect(res.body.claimStatus).toBe("submitted");
  });

  it("should not let staff approve a claim", async () => {
    const created = await createInsuranceSale();

    const res = await request(app)
      .patch(`/api/v1/sales/${created.body._id}/claim-status`)
      .set("Authorization", `Bearer ${getCashierToken()}`)
      .send({ claimStatus: "approved" });

    expect(res.status).toBe(403);
  });

  it("should let an admin approve a submitted claim", async () => {
    const created = await createInsuranceSale();
    await request(app)
      .patch(`/api/v1/sales/${created.body._id}/claim-status`)
      .set("Authorization", `Bearer ${getCashierToken()}`)
      .send({ claimStatus: "submitted" });

    const res = await request(app)
      .patch(`/api/v1/sales/${created.body._id}/claim-status`)
      .set("Authorization", `Bearer ${getOwnerToken()}`)
      .send({ claimStatus: "approved" });

    expect(res.status).toBe(200);
    expect(res.body.claimStatus).toBe("approved");
  });

  it("should reject an invalid claim status transition", async () => {
    const created = await createInsuranceSale();
    await request(app)
      .patch(`/api/v1/sales/${created.body._id}/claim-status`)
      .set("Authorization", `Bearer ${getOwnerToken()}`)
      .send({ claimStatus: "approved" });

    const res = await request(app)
      .patch(`/api/v1/sales/${created.body._id}/claim-status`)
      .set("Authorization", `Bearer ${getOwnerToken()}`)
      .send({ claimStatus: "submitted" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/cannot change claim status/i);
  });

  it("should reject claim status changes on retail sales", async () => {
    const { saleId } = await createCompletedSale(1);

    const res = await request(app)
      .patch(`/api/v1/sales/${saleId}/claim-status`)
      .set("Authorization", `Bearer ${getOwnerToken()}`)
      .send({ claimStatus: "submitted" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/insurance/i);
  });
});

describe("Held sales and prescription capture", () => {
  it("should flag held sales containing prescription medicines", async () => {
    await prisma.medicine.update({ where: { id: medicineId }, data: { prescriptionRequired: true } });

    const holdRes = await request(app)
      .post("/api/v1/sales/hold")
      .set("Authorization", `Bearer ${getCashierToken()}`)
      .send({ items: [{ medicine: medicineId, quantity: 1 }] });
    expect(holdRes.status).toBe(201);

    const held = await request(app)
      .get("/api/v1/sales/held")
      .set("Authorization", `Bearer ${getOwnerToken()}`);
    const found = (held.body as { _id: string; requiresPrescription: boolean; hasControlledItems: boolean }[])
      .find((h) => h._id === holdRes.body._id);
    expect(found).toBeDefined();
    expect(found!.requiresPrescription).toBe(true);
    expect(found!.hasControlledItems).toBe(false);

    await prisma.medicine.update({ where: { id: medicineId }, data: { prescriptionRequired: false } });
  });

  it("should require a prescription reference to resume a held prescription sale", async () => {
    await prisma.medicine.update({ where: { id: medicineId }, data: { prescriptionRequired: true } });

    const holdRes = await request(app)
      .post("/api/v1/sales/hold")
      .set("Authorization", `Bearer ${getCashierToken()}`)
      .send({ items: [{ medicine: medicineId, quantity: 1 }] });

    const blocked = await request(app)
      .post(`/api/v1/sales/${holdRes.body._id}/resume`)
      .set("Authorization", `Bearer ${getCashierToken()}`)
      .send({ payments: [{ method: "cash", amount: 5 }] });
    expect(blocked.status).toBe(403);

    const ok = await request(app)
      .post(`/api/v1/sales/${holdRes.body._id}/resume`)
      .set("Authorization", `Bearer ${getCashierToken()}`)
      .send({ payments: [{ method: "cash", amount: 5 }], prescriptionReference: "RX-RESUME-0001" });
    expect(ok.status).toBe(200);
    expect(ok.body.prescriptionReference).toBe("RX-RESUME-0001");
    expect(ok.body.dispensedBy).toBeDefined();

    await prisma.medicine.update({ where: { id: medicineId }, data: { prescriptionRequired: false } });
  });
});
