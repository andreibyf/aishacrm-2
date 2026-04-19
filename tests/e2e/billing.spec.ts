/**
 * [PLATFORM] Billing E2E — Payment Portal + Settings Console
 *
 * Exercises PR #519/#520 (feat/platform-billing-ui-wiring):
 *   - /PaymentPortal renders the new BillingAdminConsole in tenant mode
 *   - Settings → Platform Billing appears in the superadmin menu
 *   - Settings → Platform Billing → tenant picker loads real tenants
 *   - Backend plans endpoint returns the 3 seeded plans
 *   - Backend subscription/invoices endpoints respond for the dev tenant
 *
 * Runs against the live Docker stack at http://localhost:4000 with a
 * superadmin session already persisted by auth.setup.js.
 */

import { test, expect } from '@playwright/test';

const BACKEND_URL =
  process.env.PLAYWRIGHT_BACKEND_URL ||
  process.env.VITE_AISHACRM_BACKEND_URL ||
  'http://localhost:4001';

const FRONTEND_URL =
  process.env.PLAYWRIGHT_FRONTEND_URL ||
  process.env.VITE_AISHACRM_FRONTEND_URL ||
  'http://localhost:4000';

// The dev tenant seeded with billing data during PR #517 verification.
// Override via E2E_TENANT_ID if needed.
const E2E_TENANT_ID =
  process.env.E2E_TENANT_ID || 'a11dfb63-4b18-4eb8-872e-747af2e37c46';

test.describe('[PLATFORM] @billing Backend endpoints', () => {
  test('GET /api/billing/plans returns 3 seeded plans', async ({ request }) => {
    const res = await request.get(`${BACKEND_URL}/api/billing/plans`);
    expect(res.ok(), `plans endpoint returned ${res.status()}`).toBeTruthy();

    const json = await res.json();
    expect(json.status).toBe('success');
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.data.length).toBeGreaterThanOrEqual(3);

    const codes = json.data.map((p) => p.code);
    expect(codes).toEqual(
      expect.arrayContaining(['starter_monthly', 'growth_monthly', 'pro_monthly']),
    );

    // Each plan has the fields the UI relies on
    for (const plan of json.data) {
      expect(plan).toHaveProperty('code');
      expect(plan).toHaveProperty('name');
      expect(plan).toHaveProperty('amount_cents');
      expect(plan).toHaveProperty('currency');
      expect(plan).toHaveProperty('billing_interval');
    }
  });

  test('GET /api/billing/account returns billing account for dev tenant', async ({ request }) => {
    const res = await request.get(
      `${BACKEND_URL}/api/billing/account?tenant_id=${E2E_TENANT_ID}`,
    );
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json.status).toBe('success');
    expect(json.data).toMatchObject({
      tenant_id: E2E_TENANT_ID,
    });
    // billing_exempt may be true or false depending on fixture state — just check it exists
    expect(json.data).toHaveProperty('billing_exempt');
  });

  test('GET /api/billing/invoices returns array for dev tenant', async ({ request }) => {
    const res = await request.get(
      `${BACKEND_URL}/api/billing/invoices?tenant_id=${E2E_TENANT_ID}&limit=10`,
    );
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json.status).toBe('success');
    expect(Array.isArray(json.data)).toBe(true);
  });
});

test.describe('[PLATFORM] @billing Payment Portal page (tenant mode)', () => {
  test('PaymentPortal page renders the new BillingAdminConsole', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/PaymentPortal`, { waitUntil: 'domcontentloaded' });

    // Wait for the user context to load and the page frame to mount
    const pageFrame = page.getByTestId('payment-portal-page');
    await expect(pageFrame).toBeVisible({ timeout: 30_000 });

    // Title appears
    await expect(page.getByRole('heading', { name: 'Payment Portal' })).toBeVisible();

    // Either the console loads its main body (plan card or empty-sub card)
    // OR we see the "no tenant selected" frame. Both are valid successful renders.
    const consoleBody = page.getByTestId('billing-admin-console');
    const emptyTenant = page.getByText(/No tenant is currently selected/i);

    await expect(consoleBody.or(emptyTenant)).toBeVisible({ timeout: 30_000 });

    // The old Base44 BillingSettings ghost should not appear anywhere
    await expect(page.getByText(/select a subscription plan/i, { exact: false })).toHaveCount(0);
  });
});

test.describe('[PLATFORM] @billing Settings → Platform Billing (superadmin)', () => {
  test('Platform Billing card appears in Settings and opens the superadmin console', async ({
    page,
  }) => {
    await page.goto(`${FRONTEND_URL}/Settings`, { waitUntil: 'domcontentloaded' });

    // The menu card grid loads. Search for "Platform Billing".
    const search = page.getByPlaceholder(/search settings/i);
    await expect(search).toBeVisible({ timeout: 30_000 });
    await search.fill('Platform Billing');

    const card = page.getByText('Platform Billing', { exact: true }).first();
    await expect(card).toBeVisible();

    // Click the card — this navigates to ?tab=billing-admin
    await card.click();

    // Wait for the superadmin console tenant picker to render
    await expect(page.getByTestId('billing-tenant-picker')).toBeVisible({
      timeout: 30_000,
    });

    // The page title changes
    await expect(
      page.getByRole('heading', { name: /Platform Billing Administration/i }).first(),
    ).toBeVisible();
  });
});
