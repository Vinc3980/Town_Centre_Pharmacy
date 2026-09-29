import request from "supertest";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import app from "../app";
import { prisma } from "../config/prisma";
import { setupTestData, cleanupTestData } from "./helpers";

let ownerToken: string;
let ownerUserId: string;

beforeAll(async () => {
  await setupTestData();
  const { getOwnerToken } = await import("./helpers");
  ownerToken = getOwnerToken();
  const owner = await prisma.user.findUnique({ where: { email: "testowner@test.com" } });
  ownerUserId = owner!.id;
});

afterAll(async () => {
  await cleanupTestData();
});

beforeEach(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.user.updateMany({ data: { loginAttempts: 0, lockedUntil: null } });
});

describe("POST /api/v1/auth/login", () => {
  it("should return accessToken, refreshToken, and user on correct credentials", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "testowner@test.com", password: "Test123!" });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe("testowner@test.com");
    expect(res.body.user.role).toBe("admin");
  });

  it("should return 401 with wrong password", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "testowner@test.com", password: "WrongPass!" });

    expect(res.status).toBe(401);
  });

  it("should return 401 with non-existent email", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "nonexistent@test.com", password: "Test123!" });

    expect(res.status).toBe(401);
  });

  it("should return 400 with missing email (validation)", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ password: "Test123!" });

    expect(res.status).toBe(400);
  });

  it("should return 423 after max failed attempts", async () => {
    await prisma.pharmacySettings.updateMany({ data: { maxLoginAttempts: 2 } });

    await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "testcashier@test.com", password: "Wrong1" });
    await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "testcashier@test.com", password: "Wrong2" });

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "testcashier@test.com", password: "Wrong3" });

    expect(res.status).toBe(423);

    await prisma.pharmacySettings.updateMany({ data: { maxLoginAttempts: 5 } });
  });

  it("should successfully login with correct credentials", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "testowner@test.com", password: "Test123!" });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
  });

  it("should lock account after max failed attempts and return 423", async () => {
    const settings = await prisma.pharmacySettings.findFirst();
    const origMax = settings?.maxLoginAttempts ?? 5;

    await prisma.pharmacySettings.updateMany({ data: { maxLoginAttempts: 2 } });

    await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "testpharmacist@test.com", password: "Wrong1" });
    await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "testpharmacist@test.com", password: "Wrong2" });

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "testpharmacist@test.com", password: "Wrong3" });

    expect(res.status).toBe(423);

    await prisma.pharmacySettings.updateMany({ data: { maxLoginAttempts: origMax } });
    await prisma.user.updateMany({ data: { loginAttempts: 0, lockedUntil: null } });
  });
});

describe("POST /api/v1/auth/refresh", () => {
  it("should return a new accessToken with valid refreshToken", async () => {
    const loginRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "testowner@test.com", password: "Test123!" });

    const res = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: loginRes.body.refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
  });

  it("should return 401 with invalid refresh token", async () => {
    const res = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: "invalid.token.here" });

    expect(res.status).toBe(401);
  });

  it("should return 401 with expired/wrong version refresh token", async () => {
    const { signRefreshToken } = await import("../services/tokenService");
    const fakeToken = signRefreshToken(ownerUserId, 999);

    const res = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: fakeToken });

    expect(res.status).toBe(401);
  });
});

describe("POST /api/v1/auth/logout", () => {
  it("should increment refreshTokenVersion on logout", async () => {
    const userBefore = await prisma.user.findUnique({ where: { id: ownerUserId } });
    const versionBefore = userBefore!.refreshTokenVersion;

    await request(app)
      .post("/api/v1/auth/logout")
      .set("Authorization", `Bearer ${ownerToken}`);

    const userAfter = await prisma.user.findUnique({ where: { id: ownerUserId } });
    expect(userAfter!.refreshTokenVersion).toBe(versionBefore + 1);
  });

  it("should create an audit log for logout", async () => {
    await request(app)
      .post("/api/v1/auth/logout")
      .set("Authorization", `Bearer ${ownerToken}`);

    const log = await prisma.auditLog.findFirst({ where: { action: "USER_LOGOUT", module: "auth" } });
    expect(log).toBeDefined();
    expect(log!.description).toContain("logged out");
  });
});

describe("GET /api/v1/auth/me", () => {
  it("should return current user", async () => {
    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.email).toBe("testowner@test.com");
    expect(res.body.role).toBe("admin");
  });

  it("should return 401 without token", async () => {
    const res = await request(app)
      .get("/api/v1/auth/me");

    expect(res.status).toBe(401);
  });

  it("should return 401 with invalid token", async () => {
    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", "Bearer invalidtoken123");

    expect(res.status).toBe(401);
  });
});
