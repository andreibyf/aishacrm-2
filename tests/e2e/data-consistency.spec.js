/**
 * E2E: Settings → Data Consistency
 * Runs the duplicate scan and validates that either a success (no duplicates) or results list is shown.
 */
import { test, expect } from '@playwright/test';

const BASE_URL = process.env.VITE_AISHACRM_FRONTEND_URL || 'http://localhost:5173';

test.describe('Settings - Data Consistency', () => {
  test('should scan for duplicates and show a result state', async ({ page }) => {
    // Go to settings
    await page.goto(`${BASE_URL}/settings`, { waitUntil: 'networkidle' });

    // Click Data Consistency tab/nav
    const dcTab = page.locator('a[href="/settings/data-consistency"], button:has-text("Data Consistency"), a:has-text("Data Consistency")').first();
    await expect(dcTab).toBeVisible({ timeout: 10000 });
    await dcTab.click();

    // Ensure header & button present
    await expect(page.locator('text=Data Consistency Manager')).toBeVisible({ timeout: 10000 });
    const scanBtn = page.locator('button:has-text("Scan for Duplicates")');
    await expect(scanBtn).toBeVisible();

    // Run scan
    await scanBtn.click();

    // Wait for results; allow for backend processing
    await page.waitForTimeout(1500);

    // One of the two result states should appear
    const noDupes = page.locator('text=Data integrity check passed!');
    const dupesFound = page.locator('text=duplicate record groups');

    await expect(noDupes.or(dupesFound)).toBeVisible({ timeout: 20000 });
  });
});
