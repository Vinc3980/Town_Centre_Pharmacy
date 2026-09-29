import request from "supertest";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PaymentMethod, SaleStatus } from "@prisma/client";
import app from "../app";
import { prisma } from "../config/prisma";
import { setupTestData, cleanupTestData, getOwnerToken, getCashierToken, getTestMedicine, getTestBatch } from "./helpers";

let ownerToken: string;
let cashierToken: string;

beforeAll(async () => {
  await setupTestData();
  ownerToken = getOwnerToken();
  cashierToken = getCashierToken();
});

afterAll(async () => {
  await cleanupTestData();
});

async function createSale(overrides: Partial<{
  items: { medicine: string; batch?: string; name?: string; quantity: number; unitPrice?: number; discount?: number; subtotal?: number }[];
  payments: { method: string; amount: number; date?: Date }[];
  status: SaleStatus;
  cashier: string;
  branch: string;
  total: number;
  costOfGoods: number;
  paymentMethod: PaymentMethod;
  discount: number;
  refundedAmount: number;
}> = {}) {
  const med = getTestMedicine();
  const batch = getTestBatch();

  const owner = await prisma.user.findFirst({ where: { role: "admin" } });

  const itemRows = (overrides.items ?? [{
    medicine: med._id,
    batch: batch._id,
    name: "Paracetamol 500mg",
    quantity: 2,
    unitPrice: med.sellingPrice,
    discount: 0,
    subtotal: med.sellingPrice * 2,
  }]).map((it, seq) => ({
    medicineId: it.medicine,
    batchId: it.batch ?? batch._id,
    name: it.name ?? med.name,
    quantity: it.quantity,
    unitPrice: it.unitPrice ?? med.sellingPrice,
    discount: it.discount ?? 0,
    subtotal: it.subtotal ?? (it.unitPrice ?? med.sellingPrice) * it.quantity,
    seq,
  }));

  const paymentRows = (overrides.payments ?? [
    { method: "cash", amount: overrides.total ?? 10 },
  ]).map((p, seq) => ({
    method: p.method as PaymentMethod,
    amount: p.amount,
    date: p.date ?? new Date(),
    seq,
  }));

  const sale = await prisma.sale.create({
    data: {
      transactionNumber: `DASH-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      items: { create: itemRows },
      payments: { create: paymentRows },
      cashierId: overrides.cashier ?? owner!.id,
      branch: overrides.branch ?? "Main Branch",
      subtotal: overrides.total ?? 10,
      discount: overrides.discount ?? 0,
      tax: 0,
      total: overrides.total ?? 10,
      costOfGoods: overrides.costOfGoods ?? 6,
      paymentMethod: overrides.paymentMethod ?? "cash",
      status: overrides.status ?? "completed",
      refundedAmount: overrides.refundedAmount ?? 0,
    },
    include: { items: true, payments: true },
  });

  return sale;
}

describe("Dashboard API", () => {
  describe("GET /api/v1/dashboard", () => {
    it("returns dashboard summary with aggregated stats", async () => {
      await createSale({ total: 100, costOfGoods: 60 });
      await createSale({ total: 50, costOfGoods: 30, paymentMethod: "mobile_money" });

      const res = await request(app)
        .get("/api/v1/dashboard")
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("totalRevenue");
      expect(res.body).toHaveProperty("transactionCount");
      expect(res.body).toHaveProperty("grossProfit");
      expect(res.body).toHaveProperty("netProfit");
      expect(res.body).toHaveProperty("inventoryValue");
      expect(res.body).toHaveProperty("lowStockCount");
      expect(res.body).toHaveProperty("expiringSoon");
      expect(res.body).toHaveProperty("expired");
      expect(res.body).toHaveProperty("activeStaff");
      expect(res.body).toHaveProperty("openSessions");
      expect(res.body).toHaveProperty("dateRange");
      expect(res.body.totalRevenue).toBeGreaterThanOrEqual(150);
      expect(res.body.transactionCount).toBeGreaterThanOrEqual(2);
    });

    it("filters by date range", async () => {
      const today = new Date().toISOString().slice(0, 10);

      const res = await request(app)
        .get(`/api/v1/dashboard?from=${today}&to=${today}`)
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(typeof res.body.totalRevenue).toBe("number");
    });

    it("filters by branch", async () => {
      await createSale({ total: 25, branch: "East Legon" });

      const res = await request(app)
        .get("/api/v1/dashboard?branch=East Legon")
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.totalRevenue).toBeGreaterThanOrEqual(25);
    });

    it("rejects requests without authentication", async () => {
      const res = await request(app)
        .get("/api/v1/dashboard");

      expect(res.status).toBe(401);
    });
  });

  describe("GET /api/v1/dashboard/revenue-trend", () => {
    it("returns daily revenue trend data", async () => {
      await createSale({ total: 75, costOfGoods: 45 });

      const res = await request(app)
        .get("/api/v1/dashboard/revenue-trend?days=7")
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(7);
      expect(res.body[0]).toHaveProperty("date");
      expect(res.body[0]).toHaveProperty("revenue");
      expect(res.body[0]).toHaveProperty("profit");
    });

    it("supports branch filter", async () => {
      const res = await request(app)
        .get("/api/v1/dashboard/revenue-trend?days=3&branch=Main Branch")
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(3);
    });
  });

  describe("GET /api/v1/dashboard/payment-breakdown", () => {
    it("returns payment method breakdown", async () => {
      await createSale({ total: 40, paymentMethod: "card" });
      await createSale({ total: 60, paymentMethod: "cash" });

      const res = await request(app)
        .get("/api/v1/dashboard/payment-breakdown")
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0]).toHaveProperty("method");
      expect(res.body[0]).toHaveProperty("total");
      expect(res.body[0]).toHaveProperty("count");
    });
  });

  describe("GET /api/v1/dashboard/top-medicines", () => {
    it("returns top selling medicines with category", async () => {
      const res = await request(app)
        .get("/api/v1/dashboard/top-medicines?limit=5")
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      if (res.body.length > 0) {
        expect(res.body[0]).toHaveProperty("name");
        expect(res.body[0]).toHaveProperty("totalQuantity");
        expect(res.body[0]).toHaveProperty("totalRevenue");
      }
    });
  });

  describe("GET /api/v1/dashboard/sales-by-staff", () => {
    it("returns sales grouped by staff member", async () => {
      const res = await request(app)
        .get("/api/v1/dashboard/sales-by-staff")
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      if (res.body.length > 0) {
        expect(res.body[0]).toHaveProperty("name");
        expect(res.body[0]).toHaveProperty("totalSales");
        expect(res.body[0]).toHaveProperty("profit");
        expect(res.body[0]).toHaveProperty("transactionCount");
      }
    });
  });

  describe("GET /api/v1/dashboard/sales-by-category", () => {
    it("returns sales grouped by category", async () => {
      const res = await request(app)
        .get("/api/v1/dashboard/sales-by-category")
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      if (res.body.length > 0) {
        expect(res.body[0]).toHaveProperty("category");
        expect(res.body[0]).toHaveProperty("totalRevenue");
      }
    });
  });

  describe("GET /api/v1/dashboard/inventory-alerts", () => {
    it("returns low stock and expiring medicine alerts", async () => {
      const res = await request(app)
        .get("/api/v1/dashboard/inventory-alerts")
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("lowStock");
      expect(res.body).toHaveProperty("expiringSoon");
      expect(res.body).toHaveProperty("expired");
      expect(Array.isArray(res.body.lowStock)).toBe(true);
      expect(Array.isArray(res.body.expiringSoon)).toBe(true);
      expect(Array.isArray(res.body.expired)).toBe(true);
    });
  });

  describe("GET /api/v1/dashboard/recent-activity", () => {
    it("returns recent audit activity", async () => {
      const res = await request(app)
        .get("/api/v1/dashboard/recent-activity?limit=5")
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe("GET /api/v1/dashboard/staff", () => {
    it("returns staff-specific dashboard data", async () => {
      const res = await request(app)
        .get("/api/v1/dashboard/staff")
        .set("Authorization", `Bearer ${ownerToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("todaySales");
      expect(res.body).toHaveProperty("todayTransactions");
      expect(res.body).toHaveProperty("todayCashSales");
      expect(res.body).toHaveProperty("pendingRefunds");
      expect(res.body).toHaveProperty("currentSession");
      expect(res.body).toHaveProperty("todayReport");
    });
  });
});
