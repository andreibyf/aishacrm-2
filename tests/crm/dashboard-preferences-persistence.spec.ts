import { test, expect } from '@playwright/test';

const FRONTEND_URL = process.env.PLAYWRIGHT_FRONTEND_URL || process.env.VITE_AISHACRM_FRONTEND_URL || 'http://localhost:4000';

test.describe('Dashboard: widget preference persistence', () => {
  test('toggling a widget off persists after reload, and can be restored', async ({ page }) => {
    // Navigate to dashboard
    await page.goto(`${FRONTEND_URL}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Open customization modal
    const customize = page.getByRole('button', { name: /customize|customise|edit widgets|configure/i }).first();
    await expect(customize).toBeVisible({ timeout: 10000 });
    await customize.click();

    // Target the 'Lead Sources' widget switch
    const targetSwitch = page.getByRole('switch', { name: /lead sources/i });
    await expect(targetSwitch).toBeVisible({ timeout: 5000 });

    // Ensure it's turned OFF
    const initialState = await targetSwitch.getAttribute('aria-checked');
    if (initialState !== 'false') {
      await targetSwitch.click();
      await expect(targetSwitch).toHaveAttribute('aria-checked', 'false');
    }

    // Save preferences and close
    await page.getByRole('button', { name: /save preferences/i }).click();

    // Reload the page and verify the widget is hidden
    await page.reload({ waitUntil: 'domcontentloaded' });
    // Give the dashboard a moment to render widgets
    await page.waitForTimeout(1000);
    // Confirm no Lead Sources widget title is visible (exact match to title text)
    await expect(page.getByText('Lead Sources', { exact: true })).toHaveCount(0);

    // Re-open customization and turn it back ON to restore state
    await customize.click();
    const restoreSwitch = page.getByRole('switch', { name: /lead sources/i });
    await expect(restoreSwitch).toBeVisible({ timeout: 5000 });
    const restoreState = await restoreSwitch.getAttribute('aria-checked');
    if (restoreState !== 'true') {
      await restoreSwitch.click();
      await expect(restoreSwitch).toHaveAttribute('aria-checked', 'true');
    }

    // Save and verify the widget returns
    await page.getByRole('button', { name: /save preferences/i }).click();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    // Confirm the Lead Sources widget title (exact match) is visible again
    await expect(page.getByText('Lead Sources', { exact: true })).toBeVisible({ timeout: 15000 });
  });
});
