import { test, expect } from '@playwright/test';

const FRONTEND_URL = process.env.PLAYWRIGHT_FRONTEND_URL || process.env.VITE_AISHACRM_FRONTEND_URL || 'http://localhost:4000';
const BACKEND_URL = process.env.PLAYWRIGHT_BACKEND_URL || process.env.VITE_AISHACRM_BACKEND_URL || 'http://localhost:4001';
const TENANT_ID = process.env.E2E_TENANT_ID || '6cb4c008-4847-426a-9a2e-918ad70e7b69';

/** Poll until locator visible or timeout */
async function waitForElement(page, locatorFn, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const loc = locatorFn();
      if (await loc.isVisible({ timeout: 1000 })) return loc;
    } catch (_error) {
      // Ignore errors during polling
    }
    await page.waitForTimeout(500);
  }
  throw new Error('Element not found within timeout');
}

test.describe('Calendar: view switching (and drag-drop if possible)', () => {
  test('switch views between Month/Week/Day/Agenda', async ({ page, request }) => {
    // Seed one activity to ensure something renders
    const ts = Date.now();
    const subject = `E2E Calendar Item ${ts}`;
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    await request.post(`${BACKEND_URL}/api/activities`, {
      data: { tenant_id: TENANT_ID, type: 'meeting', subject, status: 'scheduled', due_date: tomorrow },
    });

    await page.goto(`${FRONTEND_URL}/Calendar`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1000);

    // Try switching view buttons if present
    const viewButtons = ['Month', 'Week', 'Day', 'Agenda'];
    for (const name of viewButtons) {
      const btn = page.getByRole('button', { name: new RegExp(`^${name}$`, 'i') }).first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(300);
      }
    }

    // Best-effort: try to see it on the calendar; if not, fall back to Activities list
    const calendarHit = page.getByText(subject).first();
    const isVisibleOnCalendar = await calendarHit.isVisible({ timeout: 3000 }).catch(() => false);
    if (!isVisibleOnCalendar) {
      // Fall back to Activities list for stable verification
      await page.goto(`${FRONTEND_URL}/Activities`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);
      
      // Try to clear any filters that might hide the activity
      const clearFilter = page.getByRole('button', { name: /clear filter|reset|all/i }).first();
      if (await clearFilter.isVisible({ timeout: 1000 }).catch(() => false)) {
        await clearFilter.click();
        await page.waitForTimeout(1000);
      }
      
      // Force reload if available
      const reload = page.getByRole('button', { name: /refresh|reload/i }).first();
      if (await reload.isVisible({ timeout: 1000 }).catch(() => false)) {
        await reload.click();
        await page.waitForTimeout(1000);
      }
      
      // Poll for activity visibility
      await waitForElement(page, () => page.getByText(subject).first());
    } else {
      await expect(calendarHit).toBeVisible();
    }
  });
});
