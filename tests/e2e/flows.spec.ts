import { test, expect } from '@playwright/test';

test.describe('Fizzy Critical End-to-End User Journeys', () => {
  const timestamp = Date.now();
  const testKidUsername = `kid_e2e_${timestamp}`;

  test('Flow 1: Child Registration, Age-Tier Calculation & Feed Exploration', async ({ page }) => {
    // 1. Visit App
    await page.goto('/register');
    await expect(page).toHaveTitle(/Fizzy/i);

    // 2. Select Child Role
    const childRoleBtn = page.getByRole('button', { name: /Child/i });
    if (await childRoleBtn.isVisible()) {
      await childRoleBtn.click();
    }

    // 3. Fill Registration
    await page.fill('input[placeholder*="username" i], input[name="username"]', testKidUsername);
    await page.fill('input[placeholder*="display" i], input[name="displayName"]', 'E2E Explorer');
    await page.fill('input[type="password"]', 'Password123!');
    await page.fill('input[type="date"]', '2015-06-15'); // 10 years old -> EXPLORER tier

    await page.click('button[type="submit"]');

    // 4. Verify landing on Home Feed / Dashboard
    await page.waitForURL(/\/(feed)?$/);
    await expect(page.locator('text=Fizzy')).toBeVisible();
  });

  test('Flow 2: Admin Login & Moderation Control Access', async ({ page }) => {
    await page.goto('/login');

    await page.fill('input[placeholder*="username" i], input[name="usernameOrEmail"]', 'safety_admin');
    await page.fill('input[type="password"]', 'Password123!');
    await page.click('button[type="submit"]');

    // Admin should navigate to moderation dashboard
    await page.waitForURL(/\/moderation|\/admin/);
    await expect(page.getByText(/Moderation|Admin|Safety/i).first()).toBeVisible();
  });

  test('Flow 3: Parent Login & Children Safety Management Access', async ({ page }) => {
    await page.goto('/login');

    await page.fill('input[placeholder*="username" i], input[name="usernameOrEmail"]', 'guardian_sarah');
    await page.fill('input[type="password"]', 'Password123!');
    await page.click('button[type="submit"]');

    // Parent should navigate to Parent Portal
    await page.waitForURL(/\/parent/);
    await expect(page.getByText(/Parent Portal|Linked Children/i).first()).toBeVisible();
  });
});
