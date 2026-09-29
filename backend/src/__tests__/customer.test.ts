import { randomUUID } from "node:crypto";
import request from "supertest";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import app from "../app";
import { prisma } from "../config/prisma";
import { setupTestData, cleanupTestData, getOwnerToken } from "./helpers";

let ownerToken: string;
let testCustomerId: string;

beforeAll(async () => {
  await setupTestData();
  ownerToken = getOwnerToken();
  const customer = await prisma.customer.findFirst({ where: { phone: "0240000000" } });
  testCustomerId = customer!.id;
});

afterAll(async () => {
  await cleanupTestData();
});

describe("GET /api/v1/customers", () => {
  it("should list customers", async () => {
    const res = await request(app)
      .get("/api/v1/customers")
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  it("should search customers by name", async () => {
    const res = await request(app)
      .get("/api/v1/customers?search=Test")
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body[0].name).toContain("Test");
  });

  it("should search customers by phone", async () => {
    const res = await request(app)
      .get("/api/v1/customers?search=024000")
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body[0].phone).toContain("024000");
  });
});

describe("POST /api/v1/customers", () => {
  it("should create a customer", async () => {
    const res = await request(app)
      .post("/api/v1/customers")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "New Customer", phone: "0241111111" });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("New Customer");
    expect(res.body.phone).toBe("0241111111");
  });

  it("should create a customer with a Ghana Card number", async () => {
    const res = await request(app)
      .post("/api/v1/customers")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "Ghana Card Customer", phone: "0243333333", ghanaCardNumber: "GHA-123456789-0" });

    expect(res.status).toBe(201);
    expect(res.body.ghanaCardNumber).toBe("GHA-123456789-0");
  });

  it("should prevent duplicate phone (409)", async () => {
    const res = await request(app)
      .post("/api/v1/customers")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "Dup Customer", phone: "0240000000" });

    expect(res.status).toBe(409);
  });

  it("should validate required fields", async () => {
    const res = await request(app)
      .post("/api/v1/customers")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "X" });

    expect(res.status).toBe(400);
  });
});

describe("PUT /api/v1/customers/:id", () => {
  it("should update a customer", async () => {
    const res = await request(app)
      .put(`/api/v1/customers/${testCustomerId}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "Updated Customer" });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Updated Customer");
  });

  it("should set and clear the Ghana Card number", async () => {
    const set = await request(app)
      .put(`/api/v1/customers/${testCustomerId}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ ghanaCardNumber: "GHA-987654321-0" });

    expect(set.status).toBe(200);
    expect(set.body.ghanaCardNumber).toBe("GHA-987654321-0");

    const cleared = await request(app)
      .put(`/api/v1/customers/${testCustomerId}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ ghanaCardNumber: "" });

    expect(cleared.status).toBe(200);
    expect(cleared.body.ghanaCardNumber).toBeNull();
  });

  it("should prevent protected field modification", async () => {
    const res = await request(app)
      .put(`/api/v1/customers/${testCustomerId}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ outstandingBalance: 9999, _id: "fake", createdAt: new Date() });

    expect(res.status).toBe(200);
    const customer = await prisma.customer.findUnique({ where: { id: testCustomerId } });
    expect(customer!.outstandingBalance).toBe(0);
  });
});

describe("GET /api/v1/customers/:id", () => {
  it("should return 404 for non-existent customer", async () => {
    const fakeId = randomUUID();
    const res = await request(app)
      .get(`/api/v1/customers/${fakeId}`)
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(res.status).toBe(404);
  });
});
