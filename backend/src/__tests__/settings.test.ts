import request from "supertest";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import app from "../app";
import { prisma } from "../config/prisma";
import { setupTestData, cleanupTestData, getOwnerToken, getCashierToken } from "./helpers";

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

beforeEach(async () => {
  await prisma.auditLog.deleteMany();
});

describe("Settings API", () => {
  describe("GET /api/v1/settings (all settings)", () => {
    it("returns all settings sections for owner", async () => {
      const res = await request(app)
        .get("/api/v1/settings")
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("pharmacy");
      expect(res.body).toHaveProperty("inventory");
      expect(res.body).toHaveProperty("sales");
      expect(res.body).toHaveProperty("security");
      expect(res.body.pharmacy.name).toBe("Town Centre Pharmacy");
    });

    it("rejects cashier without manage_settings", async () => {
      const res = await request(app)
        .get("/api/v1/settings")
        .set("Authorization", `Bearer ${cashierToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe("Pharmacy info", () => {
    it("GET /api/v1/settings/pharmacy returns pharmacy info", async () => {
      const res = await request(app)
        .get("/api/v1/settings/pharmacy")
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(res.status).toBe(200);
      expect(res.body.name).toBe("Town Centre Pharmacy");
      expect(res.body.registrationNumber).toBe("PH-001");
    });

    it("PUT /api/v1/settings/pharmacy updates pharmacy info", async () => {
      const res = await request(app)
        .put("/api/v1/settings/pharmacy")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ name: "Town Centre Pharmacy Updated", phone: "+233 30 200 5678" });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe("Town Centre Pharmacy Updated");
      expect(res.body.phone).toBe("+233 30 200 5678");

      const audit = await prisma.auditLog.findFirst({ where: { action: "SETTINGS_UPDATED", entity: "Pharmacy" } });
      expect(audit).toBeTruthy();
      expect(audit!.before).toBeTruthy();
      expect(audit!.after).toBeTruthy();
    });

    it("PUT accepts a fresh-database payload (empty text fields, null logoUrl)", async () => {
      const res = await request(app)
        .put("/api/v1/settings/pharmacy")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          name: "Town Centre Pharmacy",
          registrationNumber: "PH-001",
          phone: "",
          email: "",
          address: "",
          city: "",
          region: "",
          country: "Ghana",
          logoUrl: null,
          currency: "GHS",
          timezone: "Africa/Accra",
          branches: ["Main Branch"],
          paymentMethods: ["Cash", "Mobile Money", "Card", "Credit"],
        });
      expect(res.status).toBe(200);
      expect(res.body.phone).toBe("");
      expect(res.body.email).toBe("");
      expect(res.body.address).toBe("");
      expect(res.body.logoUrl).toBeNull();
      expect(res.body.name).toBe("Town Centre Pharmacy");
    });

    it("PUT clears an optional text field back to empty", async () => {
      await request(app)
        .put("/api/v1/settings/pharmacy")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ phone: "+233 30 200 5678" })
        .expect(200);

      const res = await request(app)
        .put("/api/v1/settings/pharmacy")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ phone: "" });
      expect(res.status).toBe(200);
      expect(res.body.phone).toBe("");
    });

    it("PUT rejects an invalid email but still allows empty", async () => {
      const bad = await request(app)
        .put("/api/v1/settings/pharmacy")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ email: "not-an-email" });
      expect(bad.status).toBe(400);
      expect(bad.body.message).toBe("Validation failed");

      const ok = await request(app)
        .put("/api/v1/settings/pharmacy")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ email: "" });
      expect(ok.status).toBe(200);
      expect(ok.body.email).toBe("");
    });
  });

  describe("Inventory settings", () => {
    it("GET /api/v1/settings/inventory returns inventory settings", async () => {
      const res = await request(app)
        .get("/api/v1/settings/inventory")
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("lowStockThreshold");
      expect(res.body).toHaveProperty("expiryWarningDays");
      expect(res.body).toHaveProperty("allowNegativeStock");
    });

    it("PUT /api/v1/settings/inventory updates inventory settings", async () => {
      const res = await request(app)
        .put("/api/v1/settings/inventory")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ lowStockThreshold: 15, expiryWarningDays: 60 });
      expect(res.status).toBe(200);
      expect(res.body.lowStockThreshold).toBe(15);
      expect(res.body.expiryWarningDays).toBe(60);

      const audit = await prisma.auditLog.findFirst({
        where: { action: "SETTINGS_UPDATED", description: { contains: "inventory settings" } },
      });
      expect(audit).toBeTruthy();
      expect(audit!.before).toBeTruthy();
    });

    it("PUT /api/v1/settings/inventory validates negative threshold", async () => {
      const res = await request(app)
        .put("/api/v1/settings/inventory")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ lowStockThreshold: -5 });
      expect(res.status).toBe(400);
    });
  });

  describe("Sales settings", () => {
    it("GET /api/v1/settings/sales returns sales settings", async () => {
      const res = await request(app)
        .get("/api/v1/settings/sales")
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("requireManagerApprovalForRefund");
      expect(res.body).toHaveProperty("taxEnabled");
      expect(res.body).toHaveProperty("taxRate");
    });

    it("PUT /api/v1/settings/sales updates sales settings", async () => {
      const res = await request(app)
        .put("/api/v1/settings/sales")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ taxEnabled: true, taxRate: 15, requireManagerApprovalForRefund: false });
      expect(res.status).toBe(200);
      expect(res.body.taxEnabled).toBe(true);
      expect(res.body.taxRate).toBe(15);
      expect(res.body.requireManagerApprovalForRefund).toBe(false);
    });

    it("PUT /api/v1/settings/sales validates tax rate range", async () => {
      const res = await request(app)
        .put("/api/v1/settings/sales")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ taxRate: 150 });
      expect(res.status).toBe(400);
    });
  });

  describe("Security settings", () => {
    it("GET /api/v1/settings/security returns security settings", async () => {
      const res = await request(app)
        .get("/api/v1/settings/security")
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("minPasswordLength");
      expect(res.body).toHaveProperty("maxLoginAttempts");
      expect(res.body).toHaveProperty("lockoutDurationMinutes");
      expect(res.body).toHaveProperty("sessionExpirationMinutes");
    });

    it("PUT /api/v1/settings/security updates security settings", async () => {
      const res = await request(app)
        .put("/api/v1/settings/security")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ maxLoginAttempts: 3, lockoutDurationMinutes: 30 });
      expect(res.status).toBe(200);
      expect(res.body.maxLoginAttempts).toBe(3);
      expect(res.body.lockoutDurationMinutes).toBe(30);
    });
  });
});

describe("Profile API", () => {
  describe("GET /api/v1/profile", () => {
    it("returns current user profile", async () => {
      const res = await request(app)
        .get("/api/v1/profile")
        .set("Authorization", `Bearer ${ownerToken}`);
      expect(res.status).toBe(200);
      expect(res.body.name).toBe("Test Owner");
      expect(res.body.email).toBe("testowner@test.com");
      expect(res.body.role).toBe("admin");
      expect(res.body).toHaveProperty("permissions");
      expect(res.body).toHaveProperty("createdAt");
    });
  });

  describe("PUT /api/v1/profile", () => {
    it("updates profile name and phone", async () => {
      const res = await request(app)
        .put("/api/v1/profile")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ name: "Updated Owner", phone: "0241234567" });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe("Updated Owner");
      expect(res.body.phone).toBe("0241234567");

      const audit = await prisma.auditLog.findFirst({ where: { action: "USER_UPDATED", module: "users" } });
      expect(audit).toBeTruthy();
    });

    it("rejects duplicate email", async () => {
      const res = await request(app)
        .put("/api/v1/profile")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ email: "testcashier@test.com" });
      expect(res.status).toBe(409);
    });

    it("validates email format", async () => {
      const res = await request(app)
        .put("/api/v1/profile")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ email: "not-an-email" });
      expect(res.status).toBe(400);
    });
  });

  describe("PUT /api/v1/profile/password", () => {
    it("changes password with correct current password", async () => {
      const res = await request(app)
        .put("/api/v1/profile/password")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ currentPassword: "Test123!", newPassword: "NewPass456!" });
      expect(res.status).toBe(200);
      expect(res.body.message).toContain("Password changed");

      const audit = await prisma.auditLog.findFirst({ where: { action: "PASSWORD_CHANGED" } });
      expect(audit).toBeTruthy();
    });

    it("rejects wrong current password", async () => {
      const res = await request(app)
        .put("/api/v1/profile/password")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ currentPassword: "WrongPassword123!", newPassword: "NewPass456!" });
      expect(res.status).toBe(401);
    });

    it("rejects same password as current", async () => {
      const res = await request(app)
        .put("/api/v1/profile/password")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ currentPassword: "NewPass456!", newPassword: "NewPass456!" });
      expect(res.status).toBe(400);
    });

    it("rejects short new password", async () => {
      const res = await request(app)
        .put("/api/v1/profile/password")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ currentPassword: "Test123!", newPassword: "ab" });
      expect(res.status).toBe(400);
    });
  });
});

describe("Login account lockout", () => {
  it("locks account after max failed attempts", async () => {
    await request(app).put("/api/v1/settings/security")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ maxLoginAttempts: 2, lockoutDurationMinutes: 5 });

    for (let i = 0; i < 2; i++) {
      await request(app).post("/api/v1/auth/login")
        .send({ email: "testcashier@test.com", password: "WrongPassword" });
    }

    const res = await request(app).post("/api/v1/auth/login")
      .send({ email: "testcashier@test.com", password: "WrongPassword" });
    expect(res.status).toBe(423);
    expect(res.body.message).toContain("locked");

    const loginRes = await request(app).post("/api/v1/auth/login")
      .send({ email: "testcashier@test.com", password: "Test123!" });
    expect(loginRes.status).toBe(423);
  });
});
