import { test, expect } from '@playwright/test';

const FRONTEND_URL = process.env.PLAYWRIGHT_FRONTEND_URL || process.env.VITE_AISHACRM_FRONTEND_URL || 'http://localhost:4000';
const BACKEND_URL = process.env.PLAYWRIGHT_BACKEND_URL || process.env.VITE_AISHACRM_BACKEND_URL || 'http://localhost:4001';
const TENANT_ID = 'local-tenant-001';

test.describe('Dashboard: stats + basic customization affordances', () => {
  test('@smoke dashboard-stats endpoint returns data', async ({ request }) => {
    const res = await request.get(`${BACKEND_URL}/api/reports/dashboard-stats?tenant_id=${TENANT_ID}`);
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    const stats = json?.data || {};
    expect(stats).toHaveProperty('totalContacts');
    expect(stats).toHaveProperty('totalAccounts');
    expect(stats).toHaveProperty('totalLeads');
    expect(stats).toHaveProperty('totalOpportunities');
  });

  test('UI: dashboard renders core widgets; customization control is present if available', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000); // Extend initial load wait for widgets

    // Expect at least one KPI-like label; poll for 20s
    const candidates = [
      /total contacts/i,
      /total accounts/i,
      /total leads/i,
      /total opportunities/i,
      /pipeline/i,
      /activities/i,
      /contacts/i,
      /accounts/i,
      /revenue/i,
    ];
    let foundOne = false;
    const start = Date.now();
    while (Date.now() - start < 20000 && !foundOne) {
      for (const rx of candidates) {
        if (await page.getByText(rx).first().isVisible({ timeout: 500 }).catch(() => false)) {
          foundOne = true; break;
        }
      }
      if (!foundOne) await page.waitForTimeout(500);
    }
    expect(foundOne).toBeTruthy();

    // Best-effort: try to open customization if present
    const customize = page.getByRole('button', { name: /customize|customise|edit widgets|configure/i }).first();
    const hasCustomize = await customize.isVisible().catch(() => false);
    if (hasCustomize) {
      await customize.click();
      // Look for any modal/panel indication
      const panel = page.getByText(/widgets|layout|save/i).first();
      await panel.isVisible({ timeout: 3000 }).catch(() => {});
      // Close if a close button exists
      const close = page.getByRole('button', { name: /close|done|save/i }).first();
      if (await close.isVisible().catch(() => false)) {
        await close.click().catch(() => {});
      }
    }
  });
});
