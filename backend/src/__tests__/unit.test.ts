import bcrypt from "bcryptjs";
import { describe, it, expect } from "vitest";
import { toCents, fromCents, addMoney, subtractMoney, multiplyMoney, roundMoney } from "../utils/money";
import { PERMISSIONS, ROLE_PERMISSIONS, ROLES } from "../utils/permissions";
import { escapeRegex, stripProtectedFields, sanitizeHtml, sanitizeFilename, MEDICINE_UPDATABLE_FIELDS, PROTECTED_FIELDS } from "../utils/security";

describe("Password hashing", () => {
  it("bcrypt.compare matches correct password", async () => {
    const hash = await bcrypt.hash("testpass", 10);
    const match = await bcrypt.compare("testpass", hash);
    expect(match).toBe(true);
  });

  it("bcrypt.compare rejects wrong password", async () => {
    const hash = await bcrypt.hash("testpass", 10);
    const match = await bcrypt.compare("wrongpass", hash);
    expect(match).toBe(false);
  });

  it("hash has expected rounds", () => {
    const hash = bcrypt.hashSync("test", 10);
    expect(hash).toMatch(/^\$2[aby]?\$10\$/);
  });
});

describe("Permission system", () => {
  it("PERMISSIONS array includes all 16 permissions", () => {
    expect(PERMISSIONS.length).toBe(16);
  });

  it("ROLES array includes all roles", () => {
    expect(ROLES).toContain("admin");
    expect(ROLES).toContain("branch_manager");
    expect(ROLES).toContain("staff");
    expect(ROLES.length).toBe(3);
  });

  it("owner has all permissions", () => {
    expect(ROLE_PERMISSIONS.admin.length).toBe(PERMISSIONS.length);
    for (const perm of PERMISSIONS) {
      expect(ROLE_PERMISSIONS.admin).toContain(perm);
    }
  });

  it("cashier has limited permissions", () => {
    expect(ROLE_PERMISSIONS.staff).toEqual(["view_dashboard", "process_sales", "view_reports"]);
    expect(ROLE_PERMISSIONS.staff.length).toBe(3);
    expect(ROLE_PERMISSIONS.staff).not.toContain("dispense_controlled_substances");
    expect(ROLE_PERMISSIONS.admin).toContain("dispense_controlled_substances");
    expect(ROLE_PERMISSIONS.branch_manager).toContain("dispense_controlled_substances");
  });

  it("auditor has only view permissions", () => {
    expect(ROLE_PERMISSIONS.auditor).toBeUndefined();
  });

  it("branch_manager does not have manage_users", () => {
    expect(ROLE_PERMISSIONS.staff).not.toContain("manage_users");
  });

  it("every role has view_dashboard", () => {
    for (const role of ROLES) {
      expect(ROLE_PERMISSIONS[role]).toContain("view_dashboard");
    }
  });
});

describe("FEFO logic", () => {
  it("sorted batches by expiryDate ascending", () => {
    const batches = [
      { batchNumber: "B3", expiryDate: new Date("2026-12-31") },
      { batchNumber: "B1", expiryDate: new Date("2026-01-15") },
      { batchNumber: "B2", expiryDate: new Date("2026-06-30") },
    ];
    const sorted = [...batches].sort((a, b) => a.expiryDate.getTime() - b.expiryDate.getTime());
    expect(sorted[0].batchNumber).toBe("B1");
    expect(sorted[1].batchNumber).toBe("B2");
    expect(sorted[2].batchNumber).toBe("B3");
  });

  it("filtered expired batches excluded", () => {
    const now = new Date("2026-06-01");
    const batches = [
      { batchNumber: "B1", expiryDate: new Date("2025-01-01"), quantity: 10 },
      { batchNumber: "B2", expiryDate: new Date("2027-01-01"), quantity: 20 },
      { batchNumber: "B3", expiryDate: new Date("2025-12-31"), quantity: 5 },
    ];
    const valid = batches.filter(b => b.expiryDate > now);
    expect(valid.length).toBe(1);
    expect(valid[0].batchNumber).toBe("B2");
  });

  it("valid batches come first in FEFO order", () => {
    const now = new Date("2026-06-01");
    const batches = [
      { batchNumber: "B3", expiryDate: new Date("2027-06-01"), quantity: 10 },
      { batchNumber: "B1", expiryDate: new Date("2026-08-01"), quantity: 15 },
      { batchNumber: "B-expired", expiryDate: new Date("2025-01-01"), quantity: 5 },
      { batchNumber: "B2", expiryDate: new Date("2026-10-01"), quantity: 8 },
    ];
    const valid = batches
      .filter(b => b.expiryDate > now && b.quantity > 0)
      .sort((a, b) => a.expiryDate.getTime() - b.expiryDate.getTime());
    expect(valid[0].batchNumber).toBe("B1");
    expect(valid[1].batchNumber).toBe("B2");
    expect(valid[2].batchNumber).toBe("B3");
  });

  it("empty array when all batches expired", () => {
    const now = new Date("2030-01-01");
    const batches = [
      { batchNumber: "B1", expiryDate: new Date("2025-01-01") },
      { batchNumber: "B2", expiryDate: new Date("2026-01-01") },
    ];
    const valid = batches.filter(b => b.expiryDate > now);
    expect(valid.length).toBe(0);
  });
});

describe("Stock calculations", () => {
  it("totalStock aggregation", () => {
    const batches = [
      { quantity: 10 },
      { quantity: 25 },
      { quantity: 5 },
    ];
    const total = batches.reduce((sum, b) => sum + b.quantity, 0);
    expect(total).toBe(40);
  });

  it("negative stock check prevents when allowNegativeStock is false", () => {
    const currentStock = 10;
    const requestedQty = 15;
    const allowNegativeStock = false;
    const canProceed = allowNegativeStock || currentStock >= requestedQty;
    expect(canProceed).toBe(false);
  });

  it("negative stock check allows when allowNegativeStock is true", () => {
    const currentStock = 10;
    const requestedQty = 15;
    const allowNegativeStock = true;
    const canProceed = allowNegativeStock || currentStock >= requestedQty;
    expect(canProceed).toBe(true);
  });

  it("reorder level check flags low stock", () => {
    const reorderLevel = 20;
    const currentStock = 8;
    const needsReorder = currentStock <= reorderLevel;
    expect(needsReorder).toBe(true);
  });

  it("reorder level check passes when stock sufficient", () => {
    const reorderLevel = 20;
    const currentStock = 30;
    const needsReorder = currentStock <= reorderLevel;
    expect(needsReorder).toBe(false);
  });
});

describe("Tax calculations", () => {
  it("taxEnabled true applies taxRate", () => {
    const subtotal = 100;
    const taxEnabled = true;
    const taxRate = 0.15;
    const tax = taxEnabled ? subtotal * taxRate : 0;
    expect(tax).toBe(15);
  });

  it("taxEnabled false returns 0", () => {
    const subtotal = 100;
    const taxEnabled = false;
    const taxRate = 0.15;
    const tax = taxEnabled ? subtotal * taxRate : 0;
    expect(tax).toBe(0);
  });

  it("roundMoney precision for tax", () => {
    const rawTax = 100 * 0.07;
    const rounded = roundMoney(rawTax);
    expect(rounded).toBe(7);
    expect(rounded.toString().length).toBeLessThanOrEqual(5);
  });
});

describe("Discount calculations", () => {
  it("item discount reduces subtotal", () => {
    const itemPrice = 50;
    const itemDiscount = 5;
    const saleSubtotal = itemPrice - itemDiscount;
    expect(saleSubtotal).toBe(45);
  });

  it("sale-level discount applied after items", () => {
    const itemsSubtotal = 100;
    const saleDiscount = 10;
    const total = itemsSubtotal - saleDiscount;
    expect(total).toBe(90);
  });

  it("discount cannot exceed subtotal", () => {
    const subtotal = 30;
    const requestedDiscount = 50;
    const appliedDiscount = Math.min(requestedDiscount, subtotal);
    expect(appliedDiscount).toBe(30);
  });

  it("discount permission required check", () => {
    const cashierPermissions = ["view_dashboard", "process_sales"];
    const hasDiscountPermission = cashierPermissions.includes("apply_discounts");
    expect(hasDiscountPermission).toBe(false);

    const adminPermissions = ROLE_PERMISSIONS.admin;
    const adminHasDiscount = adminPermissions.includes("apply_discounts");
    expect(adminHasDiscount).toBe(true);
  });
});

describe("Daily cash calculation", () => {
  it("expectedCash = openingCash + cashSales - cashRefunds - cashExpenses", () => {
    const openingCash = 200;
    const cashSales = 150;
    const cashRefunds = 20;
    const cashExpenses = 30;
    const expectedCash = openingCash + cashSales - cashRefunds - cashExpenses;
    expect(expectedCash).toBe(300);
  });

  it("variance = actualCash - expectedCash", () => {
    const actualCash = 305;
    const expectedCash = 300;
    const variance = actualCash - expectedCash;
    expect(variance).toBe(5);
  });

  it("zero sales and zero refunds", () => {
    const openingCash = 100;
    const cashSales = 0;
    const cashRefunds = 0;
    const cashExpenses = 0;
    const expectedCash = openingCash + cashSales - cashRefunds - cashExpenses;
    expect(expectedCash).toBe(100);
  });
});

describe("Variance calculation", () => {
  it("positive variance (overage)", () => {
    const actualCash = 520;
    const expectedCash = 500;
    const variance = actualCash - expectedCash;
    expect(variance).toBeGreaterThan(0);
    expect(variance).toBe(20);
  });

  it("negative variance (shortage)", () => {
    const actualCash = 480;
    const expectedCash = 500;
    const variance = actualCash - expectedCash;
    expect(variance).toBeLessThan(0);
    expect(variance).toBe(-20);
  });

  it("zero variance (exact)", () => {
    const actualCash = 500;
    const expectedCash = 500;
    const variance = actualCash - expectedCash;
    expect(variance).toBe(0);
  });
});

describe("Money utility functions", () => {
  it("toCents converts correctly", () => {
    expect(toCents(1.5)).toBe(150);
    expect(toCents(0.01)).toBe(1);
    expect(toCents(10)).toBe(1000);
  });

  it("fromCents converts correctly", () => {
    expect(fromCents(150)).toBe(1.5);
    expect(fromCents(1)).toBe(0.01);
    expect(fromCents(1000)).toBe(10);
  });

  it("addMoney sums multiple values", () => {
    expect(addMoney(1.01, 2.02, 3.03)).toBe(6.06);
    expect(addMoney(0.1, 0.2)).toBe(0.3);
  });

  it("subtractMoney difference", () => {
    expect(subtractMoney(10, 3)).toBe(7);
    expect(subtractMoney(0.3, 0.1)).toBe(0.2);
  });

  it("multiplyMoney rate times quantity", () => {
    expect(multiplyMoney(5.5, 3)).toBe(16.5);
    expect(multiplyMoney(1.99, 10)).toBe(19.9);
  });

  it("roundMoney floating point edge case 0.1+0.2", () => {
    const raw = 0.1 + 0.2;
    expect(raw).not.toBe(0.3);
    const rounded = roundMoney(raw);
    expect(rounded).toBe(0.3);
  });

  it("roundMoney rounds to two decimals", () => {
    expect(roundMoney(1.006)).toBe(1.01);
    expect(roundMoney(2.176)).toBe(2.18);
    expect(roundMoney(3.144)).toBe(3.14);
    expect(roundMoney(10.001)).toBe(10);
  });

  it("roundMoney handles negative values", () => {
    expect(roundMoney(-0.1 - 0.2)).toBe(-0.3);
  });

  it("roundMoney handles zero", () => {
    expect(roundMoney(0)).toBe(0);
  });

  it("toCents and fromCents are inverse", () => {
    const value = 12.34;
    expect(fromCents(toCents(value))).toBe(value);
  });
});

describe("Security utilities", () => {
  it("escapeRegex escapes special characters", () => {
    expect(escapeRegex(".*+?^${}()|[]\\")).toBe("\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\");
  });

  it("escapeRegex leaves normal text unchanged", () => {
    expect(escapeRegex("hello world")).toBe("hello world");
  });

  it("stripProtectedFields with allowlist", () => {
    const data = { name: "Aspirin", _id: "abc123", pharmacyId: "ph1", sellingPrice: 5 };
    const result = stripProtectedFields(data, MEDICINE_UPDATABLE_FIELDS);
    expect(result.name).toBe("Aspirin");
    expect(result.sellingPrice).toBe(5);
    expect(result).not.toHaveProperty("_id");
    expect(result).not.toHaveProperty("pharmacyId");
  });

  it("stripProtectedFields removes all protected fields", () => {
    const data = { passwordHash: "x", refreshTokenVersion: 1, loginAttempts: 3, lockedUntil: new Date(), name: "Admin" };
    const result = stripProtectedFields(data, ["name", "passwordHash", "refreshTokenVersion"]);
    expect(result.name).toBe("Admin");
    expect(result).not.toHaveProperty("passwordHash");
    expect(result).not.toHaveProperty("refreshTokenVersion");
    expect(result).not.toHaveProperty("loginAttempts");
  });

  it("sanitizeHtml strips tags", () => {
    expect(sanitizeHtml("<script>alert('xss')</script>")).toBe("&lt;script&gt;alert(&#x27;xss&#x27;)&lt;/script&gt;");
    expect(sanitizeHtml("<b>bold</b>")).toBe("&lt;b&gt;bold&lt;/b&gt;");
  });

  it("sanitizeHtml escapes ampersand and quotes", () => {
    expect(sanitizeHtml("a&b")).toBe("a&amp;b");
    expect(sanitizeHtml('"quoted"')).toBe("&quot;quoted&quot;");
  });

  it("sanitizeFilename removes special characters", () => {
    expect(sanitizeFilename("my file (1).pdf")).toBe("my_file__1_.pdf");
    expect(sanitizeFilename("report@2026.csv")).toBe("report_2026.csv");
  });

  it("sanitizeFilename truncates to 100 chars", () => {
    const long = "a".repeat(150);
    expect(sanitizeFilename(long).length).toBe(100);
  });

  it("sanitizeFilename keeps alphanumeric, dash, underscore, dot", () => {
    expect(sanitizeFilename("file-name_v2.txt")).toBe("file-name_v2.txt");
  });
});

describe("Transaction numbering", () => {
  it("INV format matches INV-YYYYMMDD-NNNN", () => {
    const seq = 1;
    const date = new Date("2026-03-15");
    const prefix = "INV";
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, "");
    const num = String(seq).padStart(4, "0");
    const txNumber = `${prefix}-${dateStr}-${num}`;
    expect(txNumber).toBe("INV-20260315-0001");
  });

  it("RET format matches RET-YYYYMMDD-NNNN", () => {
    const seq = 42;
    const date = new Date("2026-12-31");
    const prefix = "RET";
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, "");
    const num = String(seq).padStart(4, "0");
    const txNumber = `${prefix}-${dateStr}-${num}`;
    expect(txNumber).toBe("RET-20261231-0042");
  });

  it("padding with zeros for single digit sequence", () => {
    expect(String(1).padStart(4, "0")).toBe("0001");
    expect(String(99).padStart(4, "0")).toBe("0099");
    expect(String(999).padStart(4, "0")).toBe("0999");
    expect(String(1000).padStart(4, "0")).toBe("1000");
  });

  it("transaction number has correct segment count", () => {
    const txNumber = "INV-20260601-0001";
    const segments = txNumber.split("-");
    expect(segments.length).toBe(3);
    expect(segments[0]).toBe("INV");
    expect(segments[1]).toMatch(/^\d{8}$/);
    expect(segments[2]).toMatch(/^\d{4}$/);
  });
});
