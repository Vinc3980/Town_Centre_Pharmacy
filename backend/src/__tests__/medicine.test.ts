import { randomUUID } from "node:crypto";
import request from "supertest";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import app from "../app";
import { prisma } from "../config/prisma";
import { setupTestData, cleanupTestData, getOwnerToken, getCashierToken, getPharmacistToken, getTestMedicine, getTestBatch } from "./helpers";

let ownerToken: string;
let medicineId: string;
let medId: string;
let categoryId: string;

beforeAll(async () => {
  await setupTestData();
  ownerToken = getOwnerToken();
  const med = getTestMedicine();
  medId = med._id;
  medicineId = med._id;
  const cat = await prisma.category.findFirst();
  categoryId = cat!.id;
});

afterAll(async () => {
  await cleanupTestData();
});

beforeEach(async () => {
  await prisma.medicineBatch.updateMany({ data: { quantity: 50 } });
});

async function restockMedicine(qty = 50) {
  const med = getTestMedicine();
  return prisma.medicineBatch.create({
    data: {
      medicineId: med._id,
      batchNumber: `MED-TEST-${Date.now()}-${Math.random()}`,
      quantity: qty,
      purchasePrice: 3,
      sellingPrice: 5,
      expiryDate: new Date(Date.now() + 365 * 86400000),
    },
  });
}

describe("GET /api/v1/medicines", () => {
  it("lists all medicines with stock info", async () => {
    const res = await request(app)
      .get("/api/v1/medicines")
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty("totalStock");
    expect(res.body[0]).toHaveProperty("batchCount");
  });

  it("searches by name", async () => {
    const res = await request(app)
      .get("/api/v1/medicines?search=Paracetamol")
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body[0].name.toLowerCase()).toContain("paracetamol");
  });

  it("filters by category", async () => {
    const res = await request(app)
      .get(`/api/v1/medicines?category=${categoryId}`)
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("filters by status", async () => {
    const res = await request(app)
      .get("/api/v1/medicines?status=active")
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe("POST /api/v1/medicines", () => {
  it("creates medicine with valid data", async () => {
    const res = await request(app)
      .post("/api/v1/medicines")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        name: "Ibuprofen 400mg",
        category: categoryId,
        sku: "MED-NEW-001",
        purchasePrice: 4,
        sellingPrice: 8,
      });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Ibuprofen 400mg");
    expect(res.body.sku).toBe("MED-NEW-001");
  });

  it("validates required fields", async () => {
    const res = await request(app)
      .post("/api/v1/medicines")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it("prevents duplicate SKU (returns error)", async () => {
    const res = await request(app)
      .post("/api/v1/medicines")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        name: "Duplicate SKU Medicine",
        category: categoryId,
        sku: "TEST-001",
        purchasePrice: 2,
        sellingPrice: 4,
      });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("creates an initial batch when quantity is provided", async () => {
    const res = await request(app)
      .post("/api/v1/medicines")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        name: "Amoxicillin 250mg",
        category: categoryId,
        sku: "MED-QTY-001",
        purchasePrice: 4,
        sellingPrice: 8,
        quantity: 25,
        expiryDate: "2027-12-31",
      });

    expect(res.status).toBe(201);

    const med = await prisma.medicine.findFirst({
      where: { sku: "MED-QTY-001" },
      include: { batches: true },
    });
    expect(med).toBeTruthy();
    expect(med!.batches).toHaveLength(1);
    expect(med!.batches[0].quantity).toBe(25);
    expect(med!.batches[0].batchNumber).toBe("INIT-MED-QTY-001");

    const movement = await prisma.inventoryMovement.findFirst({
      where: { medicineId: med!.id },
    });
    expect(movement).toBeTruthy();
    expect(movement!.quantityChange).toBe(25);
    expect(movement!.type).toBe("receive");
  });

  it("rejects initial quantity without an expiry date", async () => {
    const res = await request(app)
      .post("/api/v1/medicines")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        name: "No Expiry Medicine",
        category: categoryId,
        sku: "MED-QTY-002",
        purchasePrice: 4,
        sellingPrice: 8,
        quantity: 10,
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/expiry date/i);

    const med = await prisma.medicine.findFirst({ where: { sku: "MED-QTY-002" } });
    expect(med).toBeNull();
  });
});

describe("PUT /api/v1/medicines/:id", () => {
  it("updates medicine fields", async () => {
    const res = await request(app)
      .put(`/api/v1/medicines/${medicineId}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ sellingPrice: 7, name: "Paracetamol 500mg Updated" });

    expect(res.status).toBe(200);
    expect(res.body.sellingPrice).toBe(7);
    expect(res.body.name).toBe("Paracetamol 500mg Updated");

    await prisma.medicine.update({ where: { id: medicineId }, data: { name: "Paracetamol 500mg" } });
  });

  it("prevents modifying protected fields (_id, __v)", async () => {
    const originalId = medicineId;
    const res = await request(app)
      .put(`/api/v1/medicines/${medicineId}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ _id: randomUUID(), __v: 99, name: "Safe Update" });

    expect(res.status).toBe(200);
    const med = await prisma.medicine.findUnique({ where: { id: medicineId } });
    expect(med!.id).toBe(originalId);
    expect(med!.name).toBe("Safe Update");
    expect((med as Record<string, unknown>).__v).toBeUndefined();
  });
});

describe("POST /api/v1/medicines/:id/discontinue", () => {
  it("marks medicine as discontinued", async () => {
    await prisma.medicine.update({ where: { id: medicineId }, data: { status: "active" } });

    const res = await request(app)
      .post(`/api/v1/medicines/${medicineId}/discontinue`)
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("discontinued");

    await prisma.medicine.update({ where: { id: medicineId }, data: { status: "active" } });
  });

  it("returns 404 for non-existent medicine", async () => {
    const fakeId = randomUUID();
    const res = await request(app)
      .post(`/api/v1/medicines/${fakeId}/discontinue`)
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(res.status).toBe(404);
  });
});

describe("POST /api/v1/medicines/stock/receive", () => {
  it("receives stock and creates batch", async () => {
    const res = await request(app)
      .post("/api/v1/medicines/stock/receive")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        medicine: medicineId,
        batchNumber: `RCV-${Date.now()}`,
        quantity: 30,
        purchasePrice: 3,
        sellingPrice: 5,
        expiryDate: new Date(Date.now() + 180 * 86400000).toISOString(),
      });

    expect(res.status).toBe(201);
    expect(res.body.quantity).toBe(30);
    expect(res.body.batchNumber).toBeDefined();
  });

  it("creates inventory movement on receive", async () => {
    const countBefore = await prisma.inventoryMovement.count({ where: { type: "receive" } });

    await request(app)
      .post("/api/v1/medicines/stock/receive")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        medicine: medicineId,
        batchNumber: `RCV-MOV-${Date.now()}`,
        quantity: 20,
        purchasePrice: 3,
        sellingPrice: 5,
        expiryDate: new Date(Date.now() + 365 * 86400000).toISOString(),
      });

    const countAfter = await prisma.inventoryMovement.count({ where: { type: "receive" } });
    expect(countAfter).toBe(countBefore + 1);
  });
});

describe("POST /api/v1/medicines/stock/adjust", () => {
  it("adjusts stock quantity", async () => {
    const batch = await restockMedicine(50);
    const batchId = batch.id;

    const res = await request(app)
      .post("/api/v1/medicines/stock/adjust")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ batch: batchId, quantityChange: -10, reason: "Broken tablets" });

    expect(res.status).toBe(200);
    expect(res.body.quantity).toBe(40);
  });

  it("creates adjustment audit entry", async () => {
    const batch = await restockMedicine(50);
    const batchId = batch.id;

    await request(app)
      .post("/api/v1/medicines/stock/adjust")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ batch: batchId, quantityChange: -5, reason: "Counted discrepancy" });

    const movement = await prisma.inventoryMovement.findFirst({ where: { batchId: batch.id, type: "adjustment" } });
    expect(movement).toBeDefined();
    expect(movement!.quantityChange).toBe(-5);
    expect(movement!.reason).toBe("Counted discrepancy");
  });
});

describe("GET /api/v1/medicines/reports/low-stock", () => {
  it("returns low stock medicines", async () => {
    const batch = await restockMedicine(50);
    await prisma.medicineBatch.update({ where: { id: batch.id }, data: { quantity: 2 } });

    const res = await request(app)
      .get("/api/v1/medicines/reports/low-stock")
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe("GET /api/v1/medicines/reports/expiry", () => {
  it("returns expiring batches", async () => {
    await prisma.medicineBatch.create({
      data: {
        medicineId: medId,
        batchNumber: `EXP-${Date.now()}`,
        quantity: 10,
        purchasePrice: 3,
        sellingPrice: 5,
        expiryDate: new Date(Date.now() + 5 * 86400000),
      },
    });

    const res = await request(app)
      .get("/api/v1/medicines/reports/expiry?days=30")
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });
});

describe("GET /api/v1/medicines/barcode/:barcode", () => {
  it("finds medicine by barcode", async () => {
    const res = await request(app)
      .get("/api/v1/medicines/barcode/TESTBARCODE001")
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.barcode).toBe("TESTBARCODE001");
    expect(res.body.totalStock).toBeDefined();
  });

  it("returns 404 for unknown barcode", async () => {
    const res = await request(app)
      .get("/api/v1/medicines/barcode/NONEXISTENT123")
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(res.status).toBe(404);
  });
});
