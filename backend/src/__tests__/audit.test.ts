import request from "supertest";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import app from "../app";
import { prisma } from "../config/prisma";
import { setupTestData, cleanupTestData, getOwnerToken, getCashierToken, getTestMedicine, getTestBatch } from "./helpers";

let ownerToken: string;
let cashierToken: string;
let medicineId: string;
let batchId: string;

beforeAll(async () => {
  await setupTestData();
  ownerToken = getOwnerToken();
  cashierToken = getCashierToken();
  medicineId = getTestMedicine()._id.toString();
  batchId = getTestBatch()._id.toString();
});

afterAll(async () => {
  await cleanupTestData();
});

beforeEach(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.medicineBatch.updateMany({ data: { quantity: 50 } });
  await prisma.medicine.updateMany({ data: { status: "active" } });
});

async function createSale(token: string, qty = 3) {
  return request(app)
    .post("/api/v1/sales")
    .set("Authorization", `Bearer ${token}`)
    .send({
      items: [{ medicine: medicineId, quantity: qty }],
      payments: [{ method: "cash", amount: qty * 5 }],
    });
}

describe("Audit Log System", () => {
  describe("Sale operations create audit logs", () => {
    it("creates audit log for sale creation", async () => {
      await createSale(cashierToken, 3);
      const logs = await prisma.auditLog.findMany({ where: { action: "SALE_CREATED" } });
      expect(logs.length).toBeGreaterThanOrEqual(1);
      expect(logs[0].module).toBe("sales");
      expect(logs[0].entity).toBe("Sale");
      expect(logs[0].entityId).toBeDefined();
      expect(logs[0].userName).toBeDefined();
      expect(logs[0].ipAddress).toBeDefined();
    });

    it("creates audit log for held sale", async () => {
      const med = getTestMedicine();
      await request(app)
        .post("/api/v1/sales/hold")
        .set("Authorization", `Bearer ${cashierToken}`)
        .send({
          items: [{ medicine: med._id, quantity: 2 }],
        });
      const logs = await prisma.auditLog.findMany({ where: { action: "SALE_HELD" } });
      expect(logs.length).toBe(1);
      expect(logs[0].entity).toBe("Sale");
    });
  });

  describe("Medicine operations create audit logs", () => {
    it("creates audit log for medicine creation", async () => {
      const category = await prisma.category.findFirst();
      await request(app)
        .post("/api/v1/medicines")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          name: "New Medicine",
          sku: "NEW-001",
          category: category!.id,
          purchasePrice: 2,
          sellingPrice: 4,
        });
      const logs = await prisma.auditLog.findMany({ where: { action: "MEDICINE_CREATED" } });
      expect(logs.length).toBe(1);
      expect(logs[0].entity).toBe("Medicine");
      expect(logs[0].after).toBeDefined();
    });

    it("creates audit log for medicine update (price change)", async () => {
      await request(app)
        .put(`/api/v1/medicines/${medicineId}`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ sellingPrice: 7 });
      const logs = await prisma.auditLog.findMany({ where: { action: "PRICE_CHANGED" } });
      expect(logs.length).toBeGreaterThanOrEqual(1);
      expect(logs[0].before).toBeDefined();
      expect(logs[0].after).toBeDefined();
    });

    it("creates audit log for medicine discontinuation", async () => {
      await request(app)
        .post(`/api/v1/medicines/${medicineId}/discontinue`)
        .set("Authorization", `Bearer ${ownerToken}`);
      const logs = await prisma.auditLog.findMany({ where: { action: "MEDICINE_DISCONTINUED" } });
      expect(logs.length).toBe(1);
      expect(logs[0].entity).toBe("Medicine");
    });

    it("creates audit log for stock adjustment", async () => {
      await request(app)
        .post("/api/v1/medicines/stock/adjust")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ batch: batchId, quantityChange: 10, reason: "Restocking" });
      const logs = await prisma.auditLog.findMany({ where: { action: "STOCK_ADJUSTED" } });
      expect(logs.length).toBe(1);
      expect(logs[0].entity).toBe("MedicineBatch");
      expect(logs[0].before).toBeDefined();
      expect(logs[0].after).toBeDefined();
    });
  });

  describe("User management creates audit logs", () => {
    it("creates audit log for user creation", async () => {
      await request(app)
        .post("/api/v1/users")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          name: "New Staff",
          email: "newstaff@test.com",
          password: "Test123!",
          role: "staff",
        });
      const logs = await prisma.auditLog.findMany({ where: { action: "USER_CREATED" } });
      expect(logs.length).toBe(1);
      expect(logs[0].entity).toBe("User");
      expect(logs[0].after).toBeDefined();
    });

    it("creates audit log for user role change", async () => {
      const user = await prisma.user.create({
        data: {
          name: "Role Test",
          email: "roletest@test.com",
          passwordHash: "$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
          role: "staff",
          permissions: ["view_dashboard", "process_sales"],
          staffId: "CH-0098",
        },
      });
      await request(app)
        .put(`/api/v1/users/${user.id}`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ role: "branch_manager" });
      const logs = await prisma.auditLog.findMany({ where: { action: "USER_ROLE_CHANGED" } });
      expect(logs.length).toBe(1);
      expect(logs[0].before).toBeDefined();
      expect(logs[0].after).toBeDefined();
    });

    it("creates audit log for user deactivation", async () => {
      const user = await prisma.user.create({
        data: {
          name: "Deactivate Test",
          email: "deactivate@test.com",
          passwordHash: "$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
          role: "staff",
          permissions: ["view_dashboard", "process_sales"],
          staffId: "CH-0097",
        },
      });
      await request(app)
        .post(`/api/v1/users/${user.id}/deactivate`)
        .set("Authorization", `Bearer ${ownerToken}`);
      const logs = await prisma.auditLog.findMany({ where: { action: "USER_DEACTIVATED" } });
      expect(logs.length).toBe(1);
      expect(logs[0].entity).toBe("User");
      expect(logs[0].before).toBeDefined();
      expect(logs[0].after).toBeDefined();
    });
  });

  describe("Auth operations create audit logs", () => {
    it("creates audit log for login", async () => {
      await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "testowner@test.com", password: "Test123!" });
      const logs = await prisma.auditLog.findMany({ where: { action: "USER_LOGIN" } });
      expect(logs.length).toBe(1);
      expect(logs[0].module).toBe("auth");
      expect(logs[0].entity).toBe("User");
    });

    it("creates audit log for logout", async () => {
      await request(app)
        .post("/api/v1/auth/logout")
        .set("Authorization", `Bearer ${ownerToken}`);
      const logs = await prisma.auditLog.findMany({ where: { action: "USER_LOGOUT" } });
      expect(logs.length).toBe(1);
      expect(logs[0].module).toBe("auth");
    });
  });

  describe("Audit endpoint", () => {
    it("returns paginated audit logs", async () => {
      await createSale(cashierToken, 3);
      const res = await request(app)
        .get("/api/v1/audit?page=1&limit=10")
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("data");
      expect(res.body).toHaveProperty("pagination");
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.pagination).toHaveProperty("total");
    });

    it("filters by module", async () => {
      await createSale(cashierToken, 3);
      const res = await request(app)
        .get("/api/v1/audit?module=sales")
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.every((l: any) => l.module === "sales")).toBe(true);
    });

    it("filters by action", async () => {
      await createSale(cashierToken, 3);
      const res = await request(app)
        .get("/api/v1/audit?action=SALE_CREATED")
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.every((l: any) => l.action === "SALE_CREATED")).toBe(true);
    });

    it("filters by entity", async () => {
      await createSale(cashierToken, 3);
      const res = await request(app)
        .get("/api/v1/audit?entity=Sale")
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.every((l: any) => l.entity === "Sale")).toBe(true);
    });

    it("returns detail by id", async () => {
      const loginRes = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "testowner@test.com", password: "Test123!" });
      expect(loginRes.status).toBe(200);
      const listRes = await request(app)
        .get("/api/v1/audit?limit=1")
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body.data.length).toBeGreaterThanOrEqual(1);
      const logId = listRes.body.data[0]._id;
      const res = await request(app)
        .get(`/api/v1/audit/${logId}`)
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(res.status).toBe(200);
      expect(res.body._id).toBe(logId);
    });

    it("cashier without view_audit_logs permission cannot access", async () => {
      const res = await request(app)
        .get("/api/v1/audit")
        .set("Authorization", `Bearer ${cashierToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe("Audit record completeness", () => {
    it("records ipAddress", async () => {
      const loginRes = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "testowner@test.com", password: "Test123!" });
      expect(loginRes.status).toBe(200);
      const logs = await prisma.auditLog.findMany({ where: { action: "USER_LOGIN" } });
      expect(logs.length).toBeGreaterThanOrEqual(1);
      expect(logs[0].ipAddress).toBeDefined();
    });

    it("records entity and entityId", async () => {
      const loginRes = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "testowner@test.com", password: "Test123!" });
      expect(loginRes.status).toBe(200);
      const logs = await prisma.auditLog.findMany({ where: { action: "USER_LOGIN" } });
      expect(logs.length).toBeGreaterThanOrEqual(1);
      expect(logs[0].entity).toBe("User");
      expect(logs[0].entityId).toBeDefined();
    });
  });
});
