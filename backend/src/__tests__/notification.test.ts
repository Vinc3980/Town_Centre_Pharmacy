import { randomUUID } from "node:crypto";
import request from "supertest";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import app from "../app";
import { prisma } from "../config/prisma";
import {
  setupTestData, cleanupTestData,
  getOwnerToken, getCashierToken,
  getTestMedicine,
} from "./helpers";

beforeAll(async () => {
  await setupTestData();
});

afterAll(async () => {
  await cleanupTestData();
});

beforeEach(async () => {
  await prisma.notification.deleteMany();
});

async function createSale(token: string, qty = 3) {
  const med = getTestMedicine();
  return request(app)
    .post("/api/v1/sales")
    .set("Authorization", `Bearer ${token}`)
    .send({
      items: [{ medicine: med._id, quantity: qty }],
      payments: [{ method: "cash", amount: qty * 5 }],
    });
}

describe("Notification API", () => {
  describe("GET /notifications", () => {
    it("returns notifications for owner", async () => {
      await prisma.notification.create({
        data: {
          title: "Test notification",
          message: "Test message",
          priority: "info",
          category: "system",
          targetRoles: ["admin"],
        },
      });

      const res = await request(app)
        .get("/api/v1/notifications")
        .set("Authorization", `Bearer ${getOwnerToken()}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(1);
      expect(res.body[0].title).toBe("Test notification");
    });

    it("returns empty for cashier with no user-targeted notifications", async () => {
      await prisma.notification.create({
        data: {
          title: "Manager only",
          message: "Test",
          priority: "info",
          category: "system",
          targetRoles: ["admin"],
        },
      });

      const res = await request(app)
        .get("/api/v1/notifications")
        .set("Authorization", `Bearer ${getCashierToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(0);
    });

    it("returns user-targeted notifications to that user", async () => {
      const user = await prisma.user.findUnique({ where: { email: "testcashier@test.com" } });
      await prisma.notification.create({
        data: {
          title: "Your report",
          message: "Approved",
          priority: "info",
          category: "daily_report",
          userId: user!.id,
          targetRoles: [],
        },
      });

      const res = await request(app)
        .get("/api/v1/notifications")
        .set("Authorization", `Bearer ${getCashierToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
    });

    it("filters by unreadOnly", async () => {
      await prisma.notification.createMany({
        data: [
          {
            title: "Read notif", message: "Read", priority: "info",
            category: "system", targetRoles: ["admin"], isRead: true,
          },
          {
            title: "Unread notif", message: "Unread", priority: "info",
            category: "system", targetRoles: ["admin"], isRead: false,
          },
        ],
      });

      const res = await request(app)
        .get("/api/v1/notifications?unreadOnly=true")
        .set("Authorization", `Bearer ${getOwnerToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].title).toBe("Unread notif");
    });

    it("filters by category", async () => {
      await prisma.notification.createMany({
        data: [
          {
            title: "Low stock", message: "Out", priority: "critical",
            category: "low_stock", targetRoles: ["admin"],
          },
          {
            title: "System", message: "Update", priority: "info",
            category: "system", targetRoles: ["admin"],
          },
        ],
      });

      const res = await request(app)
        .get("/api/v1/notifications?category=low_stock")
        .set("Authorization", `Bearer ${getOwnerToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].category).toBe("low_stock");
    });
  });

  describe("GET /notifications/unread-count", () => {
    it("returns correct unread count", async () => {
      await prisma.notification.createMany({
        data: [
          { title: "A", message: "a", priority: "info", category: "system", targetRoles: ["admin"], isRead: false },
          { title: "B", message: "b", priority: "info", category: "system", targetRoles: ["admin"], isRead: false },
          { title: "C", message: "c", priority: "info", category: "system", targetRoles: ["admin"], isRead: true },
        ],
      });

      const res = await request(app)
        .get("/api/v1/notifications/unread-count")
        .set("Authorization", `Bearer ${getOwnerToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(2);
    });

    it("returns 0 when no unread", async () => {
      const res = await request(app)
        .get("/api/v1/notifications/unread-count")
        .set("Authorization", `Bearer ${getOwnerToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(0);
    });
  });

  describe("POST /notifications/:id/read", () => {
    it("marks notification as read", async () => {
      const notif = await prisma.notification.create({
        data: {
          title: "Read me",
          message: "Please",
          priority: "info",
          category: "system",
          targetRoles: ["admin"],
          isRead: false,
        },
      });

      const res = await request(app)
        .post(`/api/v1/notifications/${notif.id}/read`)
        .set("Authorization", `Bearer ${getOwnerToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.isRead).toBe(true);

      const updated = await prisma.notification.findUnique({ where: { id: notif.id } });
      expect(updated!.isRead).toBe(true);
    });

    it("returns 404 for non-existent notification", async () => {
      const fakeId = randomUUID();
      const res = await request(app)
        .post(`/api/v1/notifications/${fakeId}/read`)
        .set("Authorization", `Bearer ${getOwnerToken()}`);

      expect(res.status).toBe(404);
    });
  });

  describe("POST /notifications/read-all", () => {
    it("marks all as read", async () => {
      await prisma.notification.createMany({
        data: [
          { title: "A", message: "a", priority: "info", category: "system", targetRoles: ["admin"], isRead: false },
          { title: "B", message: "b", priority: "info", category: "system", targetRoles: ["admin"], isRead: false },
        ],
      });

      const res = await request(app)
        .post("/api/v1/notifications/read-all")
        .set("Authorization", `Bearer ${getOwnerToken()}`);

      expect(res.status).toBe(200);

      const unread = await prisma.notification.count({ where: { isRead: false, targetRoles: { has: "admin" } } });
      expect(unread).toBe(0);
    });
  });

  describe("Low stock notification", () => {
    it("creates low stock notification on sale", async () => {
      const med = getTestMedicine();

      await prisma.medicineBatch.deleteMany({ where: { medicineId: med._id } });

      await prisma.medicineBatch.create({
        data: {
          medicineId: med._id,
          batchNumber: "NOTIF-LOW-001",
          quantity: 28,
          purchasePrice: 3,
          sellingPrice: 5,
          expiryDate: new Date(Date.now() + 365 * 86400000),
        },
      });

      await createSale(getCashierToken(), 5);

      const notifs = await prisma.notification.findMany({ where: { category: "low_stock" } });
      expect(notifs.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Deduplication", () => {
    it("updates existing unread notification instead of creating duplicate", async () => {
      const med = getTestMedicine();

      await prisma.sale.deleteMany();
      await prisma.medicineBatch.deleteMany({ where: { medicineId: med._id } });

      await prisma.medicineBatch.create({
        data: {
          medicineId: med._id,
          batchNumber: "NOTIF-DUP-001",
          quantity: 28,
          purchasePrice: 3,
          sellingPrice: 5,
          expiryDate: new Date(Date.now() + 365 * 86400000),
        },
      });

      await createSale(getCashierToken(), 5);
      const count1 = await prisma.notification.count({ where: { category: "low_stock" } });

      await prisma.medicineBatch.create({
        data: {
          medicineId: med._id,
          batchNumber: "NOTIF-DUP-002",
          quantity: 28,
          purchasePrice: 3,
          sellingPrice: 5,
          expiryDate: new Date(Date.now() + 365 * 86400000),
        },
      });

      await createSale(getCashierToken(), 5);
      const count2 = await prisma.notification.count({ where: { category: "low_stock" } });

      expect(count2).toBe(count1);
    });
  });
});
