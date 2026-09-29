import request from "supertest";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import app from "../app";
import { prisma } from "../config/prisma";
import { setupTestData, cleanupTestData, getOwnerToken, getTestMedicine, getTestBatch } from "./helpers";

let ownerToken: string;

beforeAll(async () => {
  await setupTestData();
  ownerToken = getOwnerToken();
});

afterAll(async () => {
  await cleanupTestData();
});

async function seedSale() {
  const med = getTestMedicine();
  const batch = getTestBatch();
  const owner = await prisma.user.findFirst({ where: { role: "admin" } });
  return prisma.sale.create({
    data: {
      transactionNumber: `RPT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      items: {
        create: [{
          medicineId: med._id,
          batchId: batch._id,
          name: "Paracetamol",
          quantity: 3,
          unitPrice: 5,
          discount: 0,
          subtotal: 15,
          seq: 0,
        }],
      },
      cashierId: owner!.id,
      subtotal: 15, discount: 0, tax: 0, total: 15, costOfGoods: 9,
      payments: { create: [{ method: "cash", amount: 15, date: new Date(), seq: 0 }] },
      paymentMethod: "cash",
      status: "completed",
    },
  });
}

async function seedInsuranceSale() {
  const med = getTestMedicine();
  const batch = getTestBatch();
  const owner = await prisma.user.findFirst({ where: { role: "admin" } });
  return prisma.sale.create({
    data: {
      transactionNumber: `INS-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      items: {
        create: [{
          medicineId: med._id,
          batchId: batch._id,
          name: "Paracetamol",
          quantity: 2,
          unitPrice: 5,
          discount: 0,
          subtotal: 10,
          seq: 0,
        }],
      },
      cashierId: owner!.id,
      subtotal: 10, discount: 0, tax: 0, total: 10, costOfGoods: 6,
      payments: { create: [{ method: "insurance", amount: 10, date: new Date(), seq: 0 }] },
      paymentMethod: "insurance",
      status: "completed",
      saleType: "insurance",
      insuranceProvider: "NHIS",
      policyOrNhisNumber: "NHIS-001",
      claimStatus: "pending",
    },
  });
}

async function seedControlledSale() {
  const med = getTestMedicine();
  const batch = getTestBatch();
  const owner = await prisma.user.findFirst({ where: { role: "admin" } });
  await prisma.medicine.update({
    where: { id: med._id },
    data: { isControlledSubstance: true, controlledSubstanceClass: "Opioid" },
  });
  return prisma.sale.create({
    data: {
      transactionNumber: `CTRL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      items: {
        create: [{
          medicineId: med._id,
          batchId: batch._id,
          name: "Paracetamol",
          quantity: 4,
          unitPrice: 5,
          discount: 0,
          subtotal: 20,
          seq: 0,
        }],
      },
      cashierId: owner!.id,
      subtotal: 20, discount: 0, tax: 0, total: 20, costOfGoods: 12,
      payments: { create: [{ method: "cash", amount: 20, date: new Date(), seq: 0 }] },
      paymentMethod: "cash",
      status: "completed",
      prescriptionReference: "RX-CTRL-9001",
    },
  });
}

describe("Reports API", () => {
  describe("GET /api/v1/reports/sales", () => {
    it("returns paginated sales report", async () => {
      await seedSale();
      const res = await request(app)
        .get("/api/v1/reports/sales?page=1&limit=10")
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("data");
      expect(res.body).toHaveProperty("pagination");
      expect(res.body).toHaveProperty("summary");
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.pagination).toHaveProperty("total");
      expect(res.body.summary).toHaveProperty("totalRevenue");
    });

    it("exports CSV", async () => {
      const res = await request(app)
        .get("/api/v1/reports/sales?format=csv")
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("text/csv");
    });
  });

  describe("GET /api/v1/reports/insurance", () => {
    it("returns the insurance claims register", async () => {
      await seedInsuranceSale();
      const res = await request(app)
        .get("/api/v1/reports/insurance?page=1&limit=10")
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("data");
      expect(res.body).toHaveProperty("summary");
      expect(res.body.summary).toHaveProperty("pendingCount");
      expect(res.body.summary).toHaveProperty("totalClaimValue");
      expect(res.body.summary.totalClaimValue).toBeGreaterThan(0);
      expect(res.body.data.every((r: { insuranceProvider: string }) => r.insuranceProvider === "NHIS")).toBe(true);
    });

    it("filters by claim status", async () => {
      const res = await request(app)
        .get("/api/v1/reports/insurance?claimStatus=pending")
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data.every((r: { claimStatus: string }) => r.claimStatus === "pending")).toBe(true);
    });

    it("exports CSV", async () => {
      const res = await request(app)
        .get("/api/v1/reports/insurance?format=csv")
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("text/csv");
    });
  });

  describe("GET /api/v1/reports/controlled", () => {
    it("returns the controlled substances register", async () => {
      const sale = await seedControlledSale();
      try {
        const res = await request(app)
          .get("/api/v1/reports/controlled?page=1&limit=10")
          .set("Authorization", `Bearer ${ownerToken}`);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty("data");
        expect(res.body).toHaveProperty("summary");
        expect(res.body.summary).toHaveProperty("unitsDispensed");
        expect(res.body.summary.unitsDispensed).toBeGreaterThan(0);
        const row = res.body.data.find((r: { _id: string }) => r._id === sale.id);
        expect(row).toBeDefined();
        expect(row.controlledSubstanceClass).toBe("Opioid");
        expect(row.prescriptionReference).toBe("RX-CTRL-9001");
        expect(row.medicines).toContain("Paracetamol");
      } finally {
        await prisma.medicine.update({
          where: { id: getTestMedicine()._id },
          data: { isControlledSubstance: false, controlledSubstanceClass: null },
        });
      }
    });

    it("exports CSV", async () => {
      const res = await request(app)
        .get("/api/v1/reports/controlled?format=csv")
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("text/csv");
    });
  });

  describe("GET /api/v1/reports/inventory", () => {
    it("returns inventory report", async () => {
      const res = await request(app)
        .get("/api/v1/reports/inventory?page=1&limit=10")
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("data");
      expect(res.body).toHaveProperty("summary");
      expect(res.body).toHaveProperty("pagination");
      expect(res.body.summary).toHaveProperty("totalStock");
      expect(res.body.summary).toHaveProperty("totalStockValue");
    });
  });

  describe("GET /api/v1/reports/expenses", () => {
    it("returns expense report", async () => {
      const res = await request(app)
        .get("/api/v1/reports/expenses?page=1&limit=10")
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("data");
      expect(res.body).toHaveProperty("summary");
      expect(res.body.summary).toHaveProperty("totalExpenses");
    });
  });

  describe("GET /api/v1/reports/profit", () => {
    it("returns profit report with daily breakdown", async () => {
      await seedSale();
      const res = await request(app)
        .get("/api/v1/reports/profit")
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("data");
      expect(res.body).toHaveProperty("summary");
      expect(res.body.summary).toHaveProperty("revenue");
      expect(res.body.summary).toHaveProperty("netProfit");
    });
  });

  describe("GET /api/v1/reports/staff", () => {
    it("returns staff performance report", async () => {
      await seedSale();
      const res = await request(app)
        .get("/api/v1/reports/staff")
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("data");
      expect(res.body).toHaveProperty("summary");
      expect(Array.isArray(res.body.data)).toBe(true);
      if (res.body.data.length > 0) {
        expect(res.body.data[0]).toHaveProperty("staff");
        expect(res.body.data[0]).toHaveProperty("totalSales");
        expect(res.body.data[0]).toHaveProperty("profit");
      }
    });
  });

  describe("GET /api/v1/reports/stock-movements", () => {
    it("returns stock movement report", async () => {
      const res = await request(app)
        .get("/api/v1/reports/stock-movements?page=1&limit=10")
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("data");
      expect(res.body).toHaveProperty("pagination");
    });
  });

  describe("GET /api/v1/reports/expiry", () => {
    it("returns expiry report", async () => {
      const res = await request(app)
        .get("/api/v1/reports/expiry?page=1&limit=10")
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("data");
      expect(res.body).toHaveProperty("summary");
      expect(res.body.summary).toHaveProperty("totalCount");
      expect(res.body.summary).toHaveProperty("totalValue");
    });

    it("respects expiryDays filter", async () => {
      const res = await request(app)
        .get("/api/v1/reports/expiry?expiryDays=30")
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe("GET /api/v1/reports/low-stock", () => {
    it("returns low stock report", async () => {
      const res = await request(app)
        .get("/api/v1/reports/low-stock?page=1&limit=10")
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("data");
      expect(res.body).toHaveProperty("pagination");
    });
  });

  describe("GET /api/v1/reports/daily", () => {
    it("returns daily report", async () => {
      const res = await request(app)
        .get("/api/v1/reports/daily?page=1&limit=10")
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("data");
      expect(res.body).toHaveProperty("pagination");
    });
  });

  describe("GET /api/v1/reports/purchases", () => {
    it("returns purchase report", async () => {
      const res = await request(app)
        .get("/api/v1/reports/purchases?page=1&limit=10")
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("data");
      expect(res.body).toHaveProperty("pagination");
      expect(res.body).toHaveProperty("summary");
      expect(res.body.summary).toHaveProperty("totalReceived");
    });
  });

  describe("Export formats", () => {
    it("exports Excel for inventory", async () => {
      const res = await request(app)
        .get("/api/v1/reports/inventory?format=xlsx")
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("spreadsheetml");
    });

    it("exports PDF for sales", async () => {
      const res = await request(app)
        .get("/api/v1/reports/sales?format=pdf")
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("application/pdf");
    });
  });
});
