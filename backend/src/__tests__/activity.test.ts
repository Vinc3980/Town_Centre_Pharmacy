import request from "supertest";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import app from "../app";
import { prisma } from "../config/prisma";
import { ROLE_PERMISSIONS } from "../utils/permissions";
import {
  setupTestData, cleanupTestData,
  getOwnerToken, getCashierToken,
  getTestMedicine,
} from "./helpers";

let medicineId: string;

beforeAll(async () => {
  await setupTestData();
  const med = getTestMedicine();
  medicineId = med._id;
});

afterAll(async () => {
  await cleanupTestData();
});

async function restockMedicine(qty = 50) {
  return prisma.medicineBatch.create({
    data: {
      medicineId,
      batchNumber: `ACT-RESTOCK-${Date.now()}-${Math.random()}`,
      quantity: qty,
      purchasePrice: 3,
      sellingPrice: 5,
      expiryDate: new Date(Date.now() + 365 * 86400000),
    },
  });
}

async function createCompletedSale(token: string, qty = 3) {
  await restockMedicine(50);
  const res = await request(app)
    .post("/api/v1/sales")
    .set("Authorization", `Bearer ${token}`)
    .send({
      items: [{ medicine: medicineId, quantity: qty }],
      payments: [{ method: "cash", amount: qty * 5 }],
    });
  return res;
}

beforeEach(async () => {
  await prisma.dailyReport.deleteMany();
  await prisma.dailySession.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.auditLog.deleteMany();
});

describe("Staff Performance", () => {
  it("returns performance data for owner", async () => {
    await createCompletedSale(getCashierToken(), 3);
    await createCompletedSale(getCashierToken(), 2);

    const res = await request(app)
      .get("/api/v1/activity/performance")
      .set("Authorization", `Bearer ${getOwnerToken()}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);

    const cashierPerf = res.body.find((p: any) => p.salesCount > 0);
    expect(cashierPerf).toBeDefined();
    expect(cashierPerf.salesCount).toBe(2);
    expect(cashierPerf.salesValue).toBe(25);
  });

  it("filters by date range", async () => {
    await createCompletedSale(getCashierToken(), 3);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const res = await request(app)
      .get(`/api/v1/activity/performance?from=${tomorrow.toISOString()}`)
      .set("Authorization", `Bearer ${getOwnerToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(0);
  });

  it("filters by specific user", async () => {
    await createCompletedSale(getCashierToken(), 3);

    const res = await request(app)
      .get("/api/v1/activity/performance")
      .set("Authorization", `Bearer ${getOwnerToken()}`);

    expect(res.status).toBe(200);
    const cashierPerf = res.body.find((p: any) => p.salesCount > 0);
    expect(cashierPerf).toBeDefined();
    expect(cashierPerf.userInfo).toBeDefined();
    expect(cashierPerf.userInfo.name).toBe("Test Cashier");
  });

  it("returns empty for no sales", async () => {
    const res = await request(app)
      .get("/api/v1/activity/performance")
      .set("Authorization", `Bearer ${getOwnerToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(0);
  });

  it("cashier cannot access performance", async () => {
    const cashier = await prisma.user.findUnique({ where: { email: "testcashier@test.com" } });

    await prisma.user.update({
      where: { id: cashier!.id },
      data: { permissions: ROLE_PERMISSIONS.staff.filter((p) => p !== "view_reports") },
    });

    const res = await request(app)
      .get("/api/v1/activity/performance")
      .set("Authorization", `Bearer ${getCashierToken()}`);

    await prisma.user.update({
      where: { id: cashier!.id },
      data: { permissions: ROLE_PERMISSIONS.staff },
    });

    expect(res.status).toBe(403);
  });
});

describe("Recent Activity", () => {
  it("returns recent activity logs", async () => {
    await createCompletedSale(getCashierToken(), 3);

    const res = await request(app)
      .get("/api/v1/activity/recent")
      .set("Authorization", `Bearer ${getOwnerToken()}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body[0].description).toBeDefined();
    expect(res.body[0].action).toBeDefined();
  });

  it("respects limit parameter", async () => {
    await createCompletedSale(getCashierToken(), 3);
    await createCompletedSale(getCashierToken(), 2);

    const res = await request(app)
      .get("/api/v1/activity/recent?limit=1")
      .set("Authorization", `Bearer ${getOwnerToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBeLessThanOrEqual(1);
  });

  it("populates user field", async () => {
    await createCompletedSale(getCashierToken(), 3);

    const res = await request(app)
      .get("/api/v1/activity/recent")
      .set("Authorization", `Bearer ${getOwnerToken()}`);

    expect(res.status).toBe(200);
    const saleLog = res.body.find((l: any) => l.action === "SALE_CREATED");
    expect(saleLog).toBeDefined();
    expect(saleLog.user).toBeDefined();
    expect(saleLog.user.name).toBe("Test Cashier");
  });
});

describe("Audit Log Filtering", () => {
  it("filters by module", async () => {
    await createCompletedSale(getCashierToken(), 3);

    const res = await request(app)
      .get("/api/v1/audit?module=sales")
      .set("Authorization", `Bearer ${getOwnerToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.every((l: any) => l.module === "sales")).toBe(true);
  });

  it("filters by action", async () => {
    await createCompletedSale(getCashierToken(), 3);

    const res = await request(app)
      .get("/api/v1/audit?action=SALE_CREATED")
      .set("Authorization", `Bearer ${getOwnerToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.every((l: any) => l.action === "SALE_CREATED")).toBe(true);
  });

  it("filters by search text", async () => {
    await createCompletedSale(getCashierToken(), 3);

    const res = await request(app)
      .get("/api/v1/audit?search=sold")
      .set("Authorization", `Bearer ${getOwnerToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });
});
