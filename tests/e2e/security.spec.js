/**
 * E2E: Settings → Security tab
 * Verifies key cards render and the Refresh interaction works.
 */
import { test, expect } from '@playwright/test';

const BASE_URL = process.env.VITE_AISHACRM_FRONTEND_URL || 'http://localhost:5173';

test.describe('Settings - Security', () => {
  test('should render Security metrics and allow refresh', async ({ page }) => {
    // Go to settings
    await page.goto(`${BASE_URL}/settings`, { waitUntil: 'networkidle' });

    // Click Security tab/nav
    const securityTab = page.locator('a[href="/settings/security"], button:has-text("Security"), a:has-text("Security")').first();
    await expect(securityTab).toBeVisible({ timeout: 10000 });
    await securityTab.click();

    // Wait for header status alert or metrics to appear
    await page.waitForTimeout(500);

    // Key sections present
    await expect(page.locator('text=JWT Authentication')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=Rate Limiting')).toBeVisible();
    await expect(page.locator('text=CORS Security')).toBeVisible();
    await expect(page.locator('text=Row-Level Security')).toBeVisible();
    await expect(page.locator('text=Active API Keys')).toBeVisible();

    // Use Refresh
    const refreshBtn = page.locator('button:has-text("Refresh")').first();
    if (await refreshBtn.isVisible()) {
      await refreshBtn.click();
      await page.waitForTimeout(300);
      // After refresh, sections should still be visible
      await expect(page.locator('text=JWT Authentication')).toBeVisible();
    }
  });
});
