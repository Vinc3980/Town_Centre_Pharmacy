import request from "supertest";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import app from "../app";
import { prisma } from "../config/prisma";
import { setupTestData, cleanupTestData, getOwnerToken, getCashierToken, getTestMedicine } from "./helpers";

let ownerToken: string;
let cashierToken: string;
let cashierId: string;
let branchId = "";

const BRANCH = {
  name: "Tema Branch",
  code: "TM-01",
  address: "Heavy Industrial Area, Tema",
  phone: "030 200 1122",
};

beforeAll(async () => {
  await setupTestData();
  ownerToken = getOwnerToken();
  cashierToken = getCashierToken();
  const users = await request(app)
    .get("/api/v1/users")
    .set("Authorization", `Bearer ${ownerToken}`);
  cashierId = users.body.find((u: { email: string }) => u.email === "testcashier@test.com").id;
});

afterAll(async () => {
  await cleanupTestData();
});

beforeEach(async () => {
  await prisma.auditLog.deleteMany();
});

describe("Branches API", () => {
  it("rejects staff without manage_users on list", async () => {
    const res = await request(app)
      .get("/api/v1/branches")
      .set("Authorization", `Bearer ${cashierToken}`);
    expect(res.status).toBe(403);
  });

  it("rejects staff without manage_users on create", async () => {
    const res = await request(app)
      .post("/api/v1/branches")
      .set("Authorization", `Bearer ${cashierToken}`)
      .send(BRANCH);
    expect(res.status).toBe(403);
  });

  it("creates a branch", async () => {
    const res = await request(app)
      .post("/api/v1/branches")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send(BRANCH);
    expect(res.status).toBe(201);
    expect(res.body.name).toBe(BRANCH.name);
    expect(res.body.code).toBe(BRANCH.code);
    expect(res.body.manager).toBeNull();
    expect(res.body.staff).toEqual([]);
    expect(res.body.today).toEqual({ salesCount: 0, revenue: 0 });
    branchId = res.body.id;

    const audit = await prisma.auditLog.findFirst({ where: { action: "BRANCH_CREATED" } });
    expect(audit).toBeTruthy();
  });

  it("rejects a duplicate branch code", async () => {
    const res = await request(app)
      .post("/api/v1/branches")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ ...BRANCH, name: "Another Branch", code: BRANCH.code });
    expect(res.status).toBe(409);
  });

  it("rejects a duplicate branch name", async () => {
    const res = await request(app)
      .post("/api/v1/branches")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ ...BRANCH, code: "TM-02" });
    expect(res.status).toBe(409);
  });

  it("assigns staff to a branch and shows them in the list", async () => {
    const assigned = await request(app)
      .put(`/api/v1/users/${cashierId}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ branch: BRANCH.name });
    expect(assigned.status).toBe(200);
    expect(assigned.body.branch).toBe(BRANCH.name);

    const res = await request(app)
      .get("/api/v1/branches")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    const branch = res.body.find((b: { id: string }) => b.id === branchId);
    expect(branch).toBeTruthy();
    expect(branch.staff).toHaveLength(1);
    expect(branch.staff[0].email).toBe("testcashier@test.com");
    expect(branch.staff[0].branch).toBe(BRANCH.name);
    expect(branch.today).toHaveProperty("salesCount");
    expect(branch.today).toHaveProperty("revenue");
  });

  it("stamps sales with the cashier's branch", async () => {
    const medicine = getTestMedicine();
    const res = await request(app)
      .post("/api/v1/sales")
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({
        items: [{ medicine: medicine._id, quantity: 1 }],
        payments: [{ method: "cash", amount: 5 }],
      });
    expect(res.status).toBe(201);
    expect(res.body.branch).toBe(BRANCH.name);
  });

  it("returns daily transactions for a branch", async () => {
    const res = await request(app)
      .get(`/api/v1/branches/${branchId}/daily`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.branch.name).toBe(BRANCH.name);
    expect(res.body.summary).toHaveProperty("salesCount");
    expect(res.body.summary).toHaveProperty("revenue");
    expect(Array.isArray(res.body.sales)).toBe(true);
    expect(res.body.sales.length).toBe(1);
    expect(res.body.sales[0].cashier.name).toContain("Cashier");
    expect(res.body.summary.salesCount).toBe(1);
  });

  it("rejects an invalid date parameter", async () => {
    const res = await request(app)
      .get(`/api/v1/branches/${branchId}/daily?date=not-a-date`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown branch", async () => {
    const res = await request(app)
      .get("/api/v1/branches/11111111-1111-4111-8111-111111111111/daily")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(404);
  });
});
