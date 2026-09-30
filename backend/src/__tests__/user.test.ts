import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import request from "supertest";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import app from "../app";
import { prisma } from "../config/prisma";
import { ROLE_PERMISSIONS } from "../utils/permissions";
import { setupTestData, cleanupTestData, getOwnerToken, getCashierToken } from "./helpers";

let ownerToken: string;
let cashierToken: string;
let ownerUserId: string;
let cashierUserId: string;

beforeAll(async () => {
  await setupTestData();
  ownerToken = getOwnerToken();
  cashierToken = getCashierToken();
  const owner = await prisma.user.findFirst({ where: { email: "testowner@test.com" } });
  const cashier = await prisma.user.findFirst({ where: { email: "testcashier@test.com" } });
  ownerUserId = owner!.id;
  cashierUserId = cashier!.id;
});

afterAll(async () => {
  await cleanupTestData();
});

beforeEach(async () => {
  await prisma.user.updateMany({ data: { isActive: true } });
});

describe("GET /api/v1/users", () => {
  it("should list all users", async () => {
    const res = await request(app)
      .get("/api/v1/users")
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(3);
  });

  it("should return 403 for cashier", async () => {
    const res = await request(app)
      .get("/api/v1/users")
      .set("Authorization", `Bearer ${cashierToken}`);

    expect(res.status).toBe(403);
  });
});

describe("GET /api/v1/users/:id", () => {
  it("should return a user by id", async () => {
    const res = await request(app)
      .get(`/api/v1/users/${ownerUserId}`)
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.email).toBe("testowner@test.com");
  });

  it("should return 404 for non-existent user", async () => {
    const fakeId = randomUUID();
    const res = await request(app)
      .get(`/api/v1/users/${fakeId}`)
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(res.status).toBe(404);
  });
});

describe("POST /api/v1/users", () => {
  it("should create a user with hashed password", async () => {
    const res = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "New User", email: "newuser@test.com", password: "Pass123!", role: "staff" });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("New User");
    expect(res.body.role).toBe("staff");

    const user = await prisma.user.findFirst({ where: { email: "newuser@test.com" } });
    expect(user).toBeDefined();
    expect(user!.passwordHash).not.toBe("Pass123!");
    const match = await bcrypt.compare("Pass123!", user!.passwordHash);
    expect(match).toBe(true);
  });

  it("should prevent duplicate email (409)", async () => {
    const res = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "Dup User", email: "testowner@test.com", password: "Pass123!", role: "staff" });

    expect(res.status).toBe(409);
  });

  it("should return 403 when cashier tries to create user", async () => {
    const res = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({ name: "Blocked", email: "blocked@test.com", password: "Pass123!", role: "staff" });

    expect(res.status).toBe(403);
  });

  it("should set correct permissions for role", async () => {
    const res = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "Perm User", email: "permuser@test.com", password: "Pass123!", role: "branch_manager" });

    expect(res.status).toBe(201);
    expect(res.body.permissions).toEqual(ROLE_PERMISSIONS.branch_manager);
  });
});

describe("PUT /api/v1/users/:id", () => {
  it("should update user name", async () => {
    const res = await request(app)
      .put(`/api/v1/users/${cashierUserId}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "Updated Cashier" });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Updated Cashier");
  });

  it("should change user role with hierarchy check", async () => {
    const pharmacistId = (await prisma.user.findFirst({ where: { email: "testpharmacist@test.com" } }))!.id;

    const res = await request(app)
      .put(`/api/v1/users/${pharmacistId}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ role: "staff" });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe("staff");
    expect(res.body.permissions).toEqual(ROLE_PERMISSIONS.staff);
  });

  it("should prevent assigning equal or higher role (403)", async () => {
    const pharmacistId = (await prisma.user.findFirst({ where: { email: "testpharmacist@test.com" } }))!.id;
    const pharmacistTk = (await import("./helpers")).getPharmacistToken();

    const res = await request(app)
      .put(`/api/v1/users/${cashierUserId}`)
      .set("Authorization", `Bearer ${pharmacistTk}`)
      .send({ role: "branch_manager" });

    expect(res.status).toBe(403);
  });

  it("should prevent changing owner role (403)", async () => {
    const res = await request(app)
      .put(`/api/v1/users/${ownerUserId}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ role: "staff" });

    expect(res.status).toBe(403);
  });

  it("should prevent non-owner from assigning owner role (403)", async () => {
    const pharmacistToken = (await import("./helpers")).getPharmacistToken();

    const res = await request(app)
      .put(`/api/v1/users/${cashierUserId}`)
      .set("Authorization", `Bearer ${pharmacistToken}`)
      .send({ role: "admin" });

    expect(res.status).toBe(403);
  });
});

describe("POST /api/v1/users/:id/deactivate", () => {
  it("should deactivate a user", async () => {
    const pharmacistId = (await prisma.user.findFirst({ where: { email: "testpharmacist@test.com" } }))!.id;

    const res = await request(app)
      .post(`/api/v1/users/${pharmacistId}/deactivate`)
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    const user = await prisma.user.findUnique({ where: { id: pharmacistId } });
    expect(user!.isActive).toBe(false);
  });

  it("should return 400 when deactivating self", async () => {
    const res = await request(app)
      .post(`/api/v1/users/${ownerUserId}/deactivate`)
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(res.status).toBe(400);
  });

  it("should return 400 when deactivating owner", async () => {
    const pharmacistToken = (await import("./helpers")).getPharmacistToken();

    const res = await request(app)
      .post(`/api/v1/users/${ownerUserId}/deactivate`)
      .set("Authorization", `Bearer ${pharmacistToken}`);

    expect(res.status).toBe(403);
  });
});

describe("POST /api/v1/users/:id/reactivate", () => {
  it("should reactivate a user", async () => {
    const pharmacistId = (await prisma.user.findFirst({ where: { email: "testpharmacist@test.com" } }))!.id;
    await prisma.user.update({ where: { id: pharmacistId }, data: { isActive: false } });

    const res = await request(app)
      .post(`/api/v1/users/${pharmacistId}/reactivate`)
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    const user = await prisma.user.findUnique({ where: { id: pharmacistId } });
    expect(user!.isActive).toBe(true);
  });
});

describe("User audit logs", () => {
  it("should create audit log for user creation", async () => {
    await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "Audit User", email: "audituser@test.com", password: "Pass123!", role: "staff" });

    const log = await prisma.auditLog.findFirst({ where: { action: "USER_CREATED", module: "users" } });
    expect(log).toBeDefined();
    expect(log!.description).toContain("created user");
  });

  it("should create audit log for user update", async () => {
    const pharmacistId = (await prisma.user.findFirst({ where: { email: "testpharmacist@test.com" } }))!.id;

    await request(app)
      .put(`/api/v1/users/${pharmacistId}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "Updated Pharmacist" });

    const log = await prisma.auditLog.findFirst({ where: { action: "USER_UPDATED", module: "users" } });
    expect(log).toBeDefined();
  });
});

describe("Password reset request flow", () => {
  it("should create a manager-targeted notification when an active user requests a reset", async () => {
    const res = await request(app)
      .post("/api/v1/users/request-password-reset")
      .send({ email: "testcashier@test.com" });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain("password reset request has been sent");

    const notif = await prisma.notification.findFirst({
      where: { title: "Password Reset Request", message: { contains: "testcashier@test.com" } },
      orderBy: { createdAt: "desc" },
    });
    expect(notif).toBeTruthy();
    expect(notif!.targetRoles).toEqual(expect.arrayContaining(["admin", "branch_manager"]));
    await prisma.notification.delete({ where: { id: notif!.id } });
  });

  it("should return a generic response without creating a notification for unknown emails", async () => {
    const before = await prisma.notification.count({ where: { title: "Password Reset Request" } });

    const res = await request(app)
      .post("/api/v1/users/request-password-reset")
      .send({ email: "ghost-user@test.com" });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain("If your account exists");
    const after = await prisma.notification.count({ where: { title: "Password Reset Request" } });
    expect(after).toBe(before);
  });

  it("should let a manager reset a user's password and the new password works for login", async () => {
    const scratch = await prisma.user.create({
      data: {
        name: "Reset Scratch",
        email: `reset-${randomUUID()}@test.com`,
        staffId: `RS-${randomUUID().slice(0, 8)}`,
        role: "staff",
        permissions: [],
        passwordHash: await bcrypt.hash("Test123!", 10),
      },
    });

    const res = await request(app)
      .post(`/api/v1/users/${scratch.id}/reset-password`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ newPassword: "NewPass123!" });
    expect(res.status).toBe(200);

    const loginOld = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: scratch.email, password: "Test123!" });
    expect(loginOld.status).toBe(401);

    const loginNew = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: scratch.email, password: "NewPass123!" });
    expect(loginNew.status).toBe(200);
    expect(loginNew.body.accessToken).toBeTruthy();
  });

  it("should forbid staff from resetting passwords", async () => {
    const res = await request(app)
      .post(`/api/v1/users/${ownerUserId}/reset-password`)
      .set("Authorization", `Bearer ${cashierToken}`)
      .send({ newPassword: "Hacked123!" });
    expect(res.status).toBe(403);
  });
});
