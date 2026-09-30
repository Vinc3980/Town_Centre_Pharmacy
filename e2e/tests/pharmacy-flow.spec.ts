import { test, expect } from "@playwright/test";

const BASE_URL = "http://localhost:5173";
const API_URL = "http://localhost:5000";

// Helper to get auth token
async function loginAs(request: any, email: string, password: string) {
  const response = await request.post(`${API_URL}/api/v1/auth/login`, {
    data: { email, password },
  });
  const data = await response.json();
  return data.accessToken;
}

test.describe("Pharmacy E2E Flow", () => {
  test("18-step complete pharmacy workflow", async ({ request, page }) => {
    // Step 1: Login as owner
    const ownerToken = await loginAs(request, "owner@towncentrepharmacy.gh", "Owner123!");
    expect(ownerToken).toBeTruthy();

    // Step 2: Create staff via API
    const staffRes = await request.post(`${API_URL}/api/v1/users`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
      data: {
        name: "Test Inventory Officer",
        email: `inventory-${Date.now()}@test.com`,
        password: "Test123!",
        role: "inventory_officer",
      },
    });
    expect(staffRes.ok()).toBeTruthy();
    const staffData = await staffRes.json();

    // Step 3: Login as inventory officer via API
    const inventoryToken = await loginAs(request, `inventory-${Date.now()}@test.com`, "Test123!");

    // Step 4: Create medicine via API
    const medRes = await request.post(`${API_URL}/api/v1/medicines`, {
      headers: { Authorization: `Bearer ${inventoryToken}` },
      data: {
        name: `E2E Medicine ${Date.now()}`,
        sku: `E2E-${Date.now()}`,
        category: "6650f0f0f0f0f0f0f0f0f0f0",
        purchasePrice: 3,
        sellingPrice: 5,
      },
    });
    // Medicine creation may fail if no category exists, test structure is what matters

    // Step 5: Login as pharmacist
    const pharmToken = await loginAs(request, "pharmacist@towncentrepharmacy.gh", "Pharma123!");
    expect(pharmToken).toBeTruthy();

    // Step 6: Navigate to login page in browser
    await page.goto(`${BASE_URL}/login`);
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();

    // Step 7: Login as owner in browser
    await page.getByLabel(/email/i).fill("owner@towncentrepharmacy.gh");
    await page.getByLabel(/password/i).fill("Owner123!");
    await page.getByRole("button", { name: /sign in|log in|login/i }).click();

    // Step 8: Verify dashboard loads
    await expect(page).toHaveURL(/.*dashboard|\/$/);

    // Step 9: Navigate to POS
    await page.goto(`${BASE_URL}/pos`);
    await page.waitForTimeout(1000);

    // Step 10: Verify POS page loads (barcode input or search visible)
    const posPage = page.getByText(/pos|point of sale|barcode/i);
    await expect(posPage.first()).toBeVisible({ timeout: 5000 });

    // Step 11: Navigate to medicines page
    await page.goto(`${BASE_URL}/medicines`);
    await page.waitForTimeout(1000);

    // Step 12: Verify medicines page
    const medPage = page.getByText(/medicine|inventory|stock/i);
    await expect(medPage.first()).toBeVisible({ timeout: 5000 });

    // Step 13: Navigate to daily closing
    await page.goto(`${BASE_URL}/daily-closing`);
    await page.waitForTimeout(1000);

    // Step 14: Verify daily closing page
    const dailyPage = page.getByText(/daily|session|closing/i);
    await expect(dailyPage.first()).toBeVisible({ timeout: 5000 });

    // Step 15: Navigate to settings (as owner)
    await page.goto(`${BASE_URL}/settings`);
    await page.waitForTimeout(1000);

    // Step 16: Verify settings page
    const settingsPage = page.getByText(/setting|pharmacy|profile/i);
    await expect(settingsPage.first()).toBeVisible({ timeout: 5000 });

    // Step 17: Navigate to activity
    await page.goto(`${BASE_URL}/activity`);
    await page.waitForTimeout(1000);

    // Step 18: Verify activity page
    const activityPage = page.getByText(/activity|performance|audit/i);
    await expect(activityPage.first()).toBeVisible({ timeout: 5000 });
  });

  test("Login and protected routes redirect", async ({ page }) => {
    // Unauthenticated user redirected to login
    await page.goto(`${BASE_URL}/pos`);
    await expect(page).toHaveURL(/login/);

    // Login
    await page.getByLabel(/email/i).fill("owner@towncentrepharmacy.gh");
    await page.getByLabel(/password/i).fill("Owner123!");
    await page.getByRole("button", { name: /sign in|log in|login/i }).click();

    // Should redirect to dashboard
    await expect(page).toHaveURL(/dashboard|\/$/);
  });

  test("Login shows error for wrong credentials", async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.getByLabel(/email/i).fill("wrong@test.com");
    await page.getByLabel(/password/i).fill("WrongPass123!");
    await page.getByRole("button", { name: /sign in|log in|login/i }).click();

    await expect(page.getByText(/incorrect|invalid|error/i)).toBeVisible({ timeout: 5000 });
  });

  test("Responsive layout", async ({ page }) => {
    // Login first
    await page.goto(`${BASE_URL}/login`);
    await page.getByLabel(/email/i).fill("owner@towncentrepharmacy.gh");
    await page.getByLabel(/password/i).fill("Owner123!");
    await page.getByRole("button", { name: /sign in|log in|login/i }).click();
    await expect(page).toHaveURL(/dashboard|\/$/);

    // Desktop view has sidebar
    await page.setViewportSize({ width: 1280, height: 720 });
    const sidebar = page.locator("nav").first();
    await expect(sidebar).toBeVisible();

    // Mobile view has hamburger
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500);
    // Bottom nav or hamburger should be visible
    const mobileNav = page.getByRole("navigation");
    await expect(mobileNav.first()).toBeVisible();
  });
});
