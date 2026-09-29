import request from "supertest";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import app from "../app";
import { prisma } from "../config/prisma";
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
      batchNumber: `DAILY-RESTOCK-${Date.now()}-${Math.random()}`,
      quantity: qty,
      purchasePrice: 3,
      sellingPrice: 5,
      expiryDate: new Date(Date.now() + 365 * 86400000),
    },
  });
}

async function approveOpenSession(sessionId: string) {
  return request(app)
    .post(`/api/v1/daily/sessions/${sessionId}/approve`)
    .set("Authorization", `Bearer ${getOwnerToken()}`);
}

async function approveCloseSession(sessionId: string) {
  return request(app)
    .post(`/api/v1/daily/sessions/${sessionId}/approve-close`)
    .set("Authorization", `Bearer ${getOwnerToken()}`);
}

async function createCompletedSale(token: string, qty = 3) {
  const batch = await restockMedicine(50);
  const res = await request(app)
    .post("/api/v1/sales")
    .set("Authorization", `Bearer ${token}`)
    .send({
      items: [{ medicine: medicineId, quantity: qty }],
      payments: [{ method: "cash", amount: qty * 5 }],
    });
  return { status: res.status, body: res.body, batchId: batch.id };
}

async function createApprovedExpense(amount = 25, paymentMethod = "cash") {
  const createRes = await request(app)
    .post("/api/v1/expenses")
    .set("Authorization", `Bearer ${getOwnerToken()}`)
    .send({ category: "transport", description: "Test expense", amount, paymentMethod });

  if (createRes.status === 201) {
    await request(app)
      .post(`/api/v1/expenses/${createRes.body._id}/approve`)
      .set("Authorization", `Bearer ${getOwnerToken()}`);
  }
  return createRes;
}

beforeEach(async () => {
  await prisma.dailyReport.deleteMany();
  await prisma.dailySession.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.expense.deleteMany();
});

describe("Daily Sessions", () => {
  it("opens a session", async () => {
    const res = await request(app)
      .post("/api/v1/daily/sessions")
      .set("Authorization", `Bearer ${getCashierToken()}`)
      .send({ openingCash: 200 });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("pending_approval");
    expect(res.body.openingCash).toBe(200);
    expect(res.body.user).toBeDefined();
  });

  it("prevents duplicate open sessions", async () => {
    await request(app)
      .post("/api/v1/daily/sessions")
      .set("Authorization", `Bearer ${getCashierToken()}`)
      .send({ openingCash: 100 });

    const res = await request(app)
      .post("/api/v1/daily/sessions")
      .set("Authorization", `Bearer ${getCashierToken()}`)
      .send({ openingCash: 200 });

    expect(res.status).toBe(409);
  });

  it("gets current open session", async () => {
    await request(app)
      .post("/api/v1/daily/sessions")
      .set("Authorization", `Bearer ${getCashierToken()}`)
      .send({ openingCash: 150 });

    const res = await request(app)
      .get("/api/v1/daily/sessions/current")
      .set("Authorization", `Bearer ${getCashierToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("pending_approval");
    expect(res.body.openingCash).toBe(150);
  });

  it("returns null when no open session", async () => {
    const res = await request(app)
      .get("/api/v1/daily/sessions/current")
      .set("Authorization", `Bearer ${getCashierToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it("closes session with correct aggregation", async () => {
    const openRes = await request(app)
      .post("/api/v1/daily/sessions")
      .set("Authorization", `Bearer ${getCashierToken()}`)
      .send({ openingCash: 100 });
    await approveOpenSession(openRes.body._id);

    await createCompletedSale(getCashierToken(), 3);
    await createCompletedSale(getCashierToken(), 2);

    const res = await request(app)
      .post("/api/v1/daily/sessions/close")
      .set("Authorization", `Bearer ${getCashierToken()}`)
      .send({ actualCash: 125, notes: "Test close" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("pending_close_approval");
    expect(res.body.closeAggregates).toBeDefined();
    expect(res.body.closeAggregates.totalSales).toBe(25);
    expect(res.body.closeAggregates.cashSales).toBe(25);
    expect(res.body.closeAggregates.expectedCash).toBe(125);
    expect(res.body.closeAggregates.actualCash).toBe(125);
    expect(res.body.closeAggregates.variance).toBe(0);
  });

  it("calculates variance correctly", async () => {
    const openRes = await request(app)
      .post("/api/v1/daily/sessions")
      .set("Authorization", `Bearer ${getCashierToken()}`)
      .send({ openingCash: 100 });
    await approveOpenSession(openRes.body._id);

    await createCompletedSale(getCashierToken(), 4);

    const res = await request(app)
      .post("/api/v1/daily/sessions/close")
      .set("Authorization", `Bearer ${getCashierToken()}`)
      .send({ actualCash: 130 });

    expect(res.status).toBe(200);
    expect(res.body.closeAggregates.expectedCash).toBe(120);
    expect(res.body.closeAggregates.variance).toBe(10);
  });

  it("returns 404 when no open session to close", async () => {
    const res = await request(app)
      .post("/api/v1/daily/sessions/close")
      .set("Authorization", `Bearer ${getCashierToken()}`)
      .send({ actualCash: 0 });

    expect(res.status).toBe(404);
  });

  it("lists sessions", async () => {
    await request(app)
      .post("/api/v1/daily/sessions")
      .set("Authorization", `Bearer ${getCashierToken()}`)
      .send({ openingCash: 100 });

    const res = await request(app)
      .get("/api/v1/daily/sessions")
      .set("Authorization", `Bearer ${getOwnerToken()}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  it("includes expenses in aggregation", async () => {
    const openRes = await request(app)
      .post("/api/v1/daily/sessions")
      .set("Authorization", `Bearer ${getCashierToken()}`)
      .send({ openingCash: 200 });
    await approveOpenSession(openRes.body._id);

    await createCompletedSale(getCashierToken(), 2);
    await createApprovedExpense(10, "cash");

    const res = await request(app)
      .post("/api/v1/daily/sessions/close")
      .set("Authorization", `Bearer ${getCashierToken()}`)
      .send({ actualCash: 200 });

    expect(res.status).toBe(200);
    expect(res.body.closeAggregates.cashExpenses).toBe(10);
    expect(res.body.closeAggregates.expectedCash).toBe(200);
    expect(res.body.closeAggregates.variance).toBe(0);
  });

  it("cashier can open/close own session", async () => {
    const openRes = await request(app)
      .post("/api/v1/daily/sessions")
      .set("Authorization", `Bearer ${getCashierToken()}`)
      .send({ openingCash: 50 });

    expect(openRes.status).toBe(201);
    await approveOpenSession(openRes.body._id);

    const closeRes = await request(app)
      .post("/api/v1/daily/sessions/close")
      .set("Authorization", `Bearer ${getCashierToken()}`)
      .send({ actualCash: 50 });

    expect(closeRes.status).toBe(200);
  });
});

describe("Daily Reports", () => {
  it("submits report for closed session", async () => {
    const openRes = await request(app)
      .post("/api/v1/daily/sessions")
      .set("Authorization", `Bearer ${getCashierToken()}`)
      .send({ openingCash: 100 });
    await approveOpenSession(openRes.body._id);

    await createCompletedSale(getCashierToken(), 3);

    const closeRes = await request(app)
      .post("/api/v1/daily/sessions/close")
      .set("Authorization", `Bearer ${getCashierToken()}`)
      .send({ actualCash: 115 });
    await approveCloseSession(closeRes.body._id);

    const res = await request(app)
      .post("/api/v1/daily/reports/submit")
      .set("Authorization", `Bearer ${getCashierToken()}`)
      .send({ actualCash: 115, notes: "End of day" });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("submitted");
    expect(res.body.totalSales).toBe(15);
    expect(res.body.expectedCash).toBe(115);
    expect(res.body.variance).toBe(0);
  });

  it("returns 404 when no closed session to report on", async () => {
    const res = await request(app)
      .post("/api/v1/daily/reports/submit")
      .set("Authorization", `Bearer ${getCashierToken()}`)
      .send({ actualCash: 0 });

    expect(res.status).toBe(404);
  });

  it("prevents duplicate submitted reports for same session", async () => {
    const openRes = await request(app)
      .post("/api/v1/daily/sessions")
      .set("Authorization", `Bearer ${getCashierToken()}`)
      .send({ openingCash: 50 });
    await approveOpenSession(openRes.body._id);

    const closeRes = await request(app)
      .post("/api/v1/daily/sessions/close")
      .set("Authorization", `Bearer ${getCashierToken()}`)
      .send({ actualCash: 50 });
    await approveCloseSession(closeRes.body._id);

    await request(app)
      .post("/api/v1/daily/reports/submit")
      .set("Authorization", `Bearer ${getCashierToken()}`)
      .send({ actualCash: 50 });

    const res = await request(app)
      .post("/api/v1/daily/reports/submit")
      .set("Authorization", `Bearer ${getCashierToken()}`)
      .send({ actualCash: 50 });

    expect(res.status).toBe(409);
  });

  it("owner can approve report", async () => {
    const openRes = await request(app)
      .post("/api/v1/daily/sessions")
      .set("Authorization", `Bearer ${getCashierToken()}`)
      .send({ openingCash: 50 });
    await approveOpenSession(openRes.body._id);

    const closeRes = await request(app)
      .post("/api/v1/daily/sessions/close")
      .set("Authorization", `Bearer ${getCashierToken()}`)
      .send({ actualCash: 50 });
    await approveCloseSession(closeRes.body._id);

    const submitRes = await request(app)
      .post("/api/v1/daily/reports/submit")
      .set("Authorization", `Bearer ${getCashierToken()}`)
      .send({ actualCash: 50 });

    const res = await request(app)
      .post(`/api/v1/daily/reports/${submitRes.body._id}/approve`)
      .set("Authorization", `Bearer ${getOwnerToken()}`)
      .send({ reviewNotes: "Looks good" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("approved");
    expect(res.body.reviewedBy).toBeDefined();
  });

  it("owner can reject report", async () => {
    const openRes = await request(app)
      .post("/api/v1/daily/sessions")
      .set("Authorization", `Bearer ${getCashierToken()}`)
      .send({ openingCash: 50 });
    await approveOpenSession(openRes.body._id);

    const closeRes = await request(app)
      .post("/api/v1/daily/sessions/close")
      .set("Authorization", `Bearer ${getCashierToken()}`)
      .send({ actualCash: 50 });
    await approveCloseSession(closeRes.body._id);

    const submitRes = await request(app)
      .post("/api/v1/daily/reports/submit")
      .set("Authorization", `Bearer ${getCashierToken()}`)
      .send({ actualCash: 50 });

    const res = await request(app)
      .post(`/api/v1/daily/reports/${submitRes.body._id}/reject`)
      .set("Authorization", `Bearer ${getOwnerToken()}`)
      .send({ reviewNotes: "Numbers don't match" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("rejected");
    expect(res.body.reviewNotes).toBe("Numbers don't match");
  });

  it("cannot approve non-submitted report", async () => {
    const openRes = await request(app)
      .post("/api/v1/daily/sessions")
      .set("Authorization", `Bearer ${getCashierToken()}`)
      .send({ openingCash: 50 });
    await approveOpenSession(openRes.body._id);

    const closeRes = await request(app)
      .post("/api/v1/daily/sessions/close")
      .set("Authorization", `Bearer ${getCashierToken()}`)
      .send({ actualCash: 50 });
    await approveCloseSession(closeRes.body._id);

    const submitRes = await request(app)
      .post("/api/v1/daily/reports/submit")
      .set("Authorization", `Bearer ${getCashierToken()}`)
      .send({ actualCash: 50 });

    await request(app)
      .post(`/api/v1/daily/reports/${submitRes.body._id}/approve`)
      .set("Authorization", `Bearer ${getOwnerToken()}`);

    const res = await request(app)
      .post(`/api/v1/daily/reports/${submitRes.body._id}/approve`)
      .set("Authorization", `Bearer ${getOwnerToken()}`);

    expect(res.status).toBe(400);
  });

  it("lists pending reports for owner", async () => {
    const openRes = await request(app)
      .post("/api/v1/daily/sessions")
      .set("Authorization", `Bearer ${getCashierToken()}`)
      .send({ openingCash: 50 });
    await approveOpenSession(openRes.body._id);

    const closeRes = await request(app)
      .post("/api/v1/daily/sessions/close")
      .set("Authorization", `Bearer ${getCashierToken()}`)
      .send({ actualCash: 50 });
    await approveCloseSession(closeRes.body._id);

    await request(app)
      .post("/api/v1/daily/reports/submit")
      .set("Authorization", `Bearer ${getCashierToken()}`)
      .send({ actualCash: 50 });

    const res = await request(app)
      .get("/api/v1/daily/reports/pending")
      .set("Authorization", `Bearer ${getOwnerToken()}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  it("reject requires reviewNotes", async () => {
    const openRes = await request(app)
      .post("/api/v1/daily/sessions")
      .set("Authorization", `Bearer ${getCashierToken()}`)
      .send({ openingCash: 50 });
    await approveOpenSession(openRes.body._id);

    const closeRes = await request(app)
      .post("/api/v1/daily/sessions/close")
      .set("Authorization", `Bearer ${getCashierToken()}`)
      .send({ actualCash: 50 });
    await approveCloseSession(closeRes.body._id);

    const submitRes = await request(app)
      .post("/api/v1/daily/reports/submit")
      .set("Authorization", `Bearer ${getCashierToken()}`)
      .send({ actualCash: 50 });

    const res = await request(app)
      .post(`/api/v1/daily/reports/${submitRes.body._id}/reject`)
      .set("Authorization", `Bearer ${getOwnerToken()}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it("gets report by id", async () => {
    const openRes = await request(app)
      .post("/api/v1/daily/sessions")
      .set("Authorization", `Bearer ${getCashierToken()}`)
      .send({ openingCash: 50 });
    await approveOpenSession(openRes.body._id);

    const closeRes = await request(app)
      .post("/api/v1/daily/sessions/close")
      .set("Authorization", `Bearer ${getCashierToken()}`)
      .send({ actualCash: 50 });
    await approveCloseSession(closeRes.body._id);

    const submitRes = await request(app)
      .post("/api/v1/daily/reports/submit")
      .set("Authorization", `Bearer ${getCashierToken()}`)
      .send({ actualCash: 50 });

    const res = await request(app)
      .get(`/api/v1/daily/reports/${submitRes.body._id}`)
      .set("Authorization", `Bearer ${getOwnerToken()}`);

    expect(res.status).toBe(200);
    expect(res.body._id).toBe(submitRes.body._id);
  });
});
