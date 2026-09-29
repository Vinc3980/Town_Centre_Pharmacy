import { randomUUID } from "node:crypto";
import request from "supertest";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import app from "../app";
import { prisma } from "../config/prisma";
import { setupTestData, cleanupTestData, getOwnerToken, getPharmacistToken } from "./helpers";

let ownerToken: string;
let pharmacistToken: string;

beforeAll(async () => {
  await setupTestData();
  ownerToken = getOwnerToken();
  pharmacistToken = getPharmacistToken();
});

afterAll(async () => {
  await cleanupTestData();
});

async function createTestExpense(token: string, overrides?: Partial<{ category: string; description: string; amount: number; paymentMethod: string }>) {
  return request(app)
    .post("/api/v1/expenses")
    .set("Authorization", `Bearer ${token}`)
    .send({
      category: "utilities",
      description: "Electricity bill",
      amount: 250,
      paymentMethod: "cash",
      ...overrides,
    });
}

describe("Expense — CRUD", () => {
  it("should create an expense", async () => {
    const res = await createTestExpense(ownerToken);
    expect(res.status).toBe(201);
    expect(res.body.category).toBe("utilities");
    expect(res.body.status).toBe("pending");
    expect(res.body.amount).toBe(250);
    expect(res.body.recordedBy.name).toBe("Test Owner");
  });

  it("should list expenses", async () => {
    await createTestExpense(ownerToken);
    const res = await request(app)
      .get("/api/v1/expenses")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it("should list expenses with status filter", async () => {
    const res = await request(app)
      .get("/api/v1/expenses?status=pending")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("should list expenses with category filter", async () => {
    const res = await request(app)
      .get("/api/v1/expenses?category=utilities")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("should get expense by id", async () => {
    const created = await createTestExpense(ownerToken);
    const res = await request(app)
      .get(`/api/v1/expenses/${created.body._id}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body._id).toBe(created.body._id);
    expect(res.body.recordedBy.name).toBe("Test Owner");
  });

  it("should return 404 for non-existent expense", async () => {
    const res = await request(app)
      .get(`/api/v1/expenses/${randomUUID()}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(404);
  });

  it("should update a pending expense", async () => {
    const created = await createTestExpense(ownerToken);
    const res = await request(app)
      .put(`/api/v1/expenses/${created.body._id}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ description: "Updated electricity bill", amount: 300 });
    expect(res.status).toBe(200);
    expect(res.body.description).toBe("Updated electricity bill");
    expect(res.body.amount).toBe(300);
  });

  it("should not update an approved expense", async () => {
    const created = await createTestExpense(ownerToken);
    await request(app)
      .post(`/api/v1/expenses/${created.body._id}/approve`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({});

    const res = await request(app)
      .put(`/api/v1/expenses/${created.body._id}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ amount: 999 });
    expect(res.status).toBe(400);
  });
});

describe("Expense — Approval workflow", () => {
  it("should approve a pending expense", async () => {
    const created = await createTestExpense(ownerToken);
    const res = await request(app)
      .post(`/api/v1/expenses/${created.body._id}/approve`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("approved");
    expect(res.body.approvedBy.name).toBe("Test Owner");
  });

  it("should reject a pending expense with reason", async () => {
    const created = await createTestExpense(ownerToken);
    const res = await request(app)
      .post(`/api/v1/expenses/${created.body._id}/approve`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ rejectionReason: "Over budget" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("rejected");
    expect(res.body.rejectionReason).toBe("Over budget");
  });

  it("should not approve a non-pending expense", async () => {
    const created = await createTestExpense(ownerToken);
    await request(app)
      .post(`/api/v1/expenses/${created.body._id}/approve`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({});

    const res = await request(app)
      .post(`/api/v1/expenses/${created.body._id}/approve`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it("should reject requires reason", async () => {
    const created = await createTestExpense(ownerToken);
    const res = await request(app)
      .post(`/api/v1/expenses/${created.body._id}/approve`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ rejectionReason: "" });
    expect(res.status).toBe(400);
  });

  it("should not create expense without manage_expenses permission", async () => {
    const { ROLE_PERMISSIONS } = await import("../utils/permissions");
    const { signAccessToken } = await import("../services/tokenService");
    const bcrypt = await import("bcryptjs");

    const hash = await bcrypt.hash("Test123!", 10);
    const cashier = await prisma.user.create({
      data: {
        name: "Test Cashier",
        email: "testcashier2@test.com",
        passwordHash: hash,
        role: "staff",
        permissions: ROLE_PERMISSIONS.staff,
        staffId: "CH-0099",
      },
    });
    const token = signAccessToken({ sub: cashier.id, role: cashier.role, permissions: ROLE_PERMISSIONS.staff, name: cashier.name });

    const res = await request(app)
      .post("/api/v1/expenses")
      .set("Authorization", `Bearer ${token}`)
      .send({ category: "misc", description: "Test", amount: 10 });
    expect(res.status).toBe(403);
  });
});

describe("Expense — list filters", () => {
  it("should filter by date range", async () => {
    const res = await request(app)
      .get(`/api/v1/expenses?from=2020-01-01&to=2030-12-31`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("should filter by search text", async () => {
    const res = await request(app)
      .get(`/api/v1/expenses?search=electricity`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
