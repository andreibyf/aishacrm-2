/**
 * [CRM] Growth / Opportunity Intelligence — API contract E2E
 *
 * Exercises the /api/v2/growth surface (Phase 1) against a running backend.
 * Runs in CI against the live stack (self-hosted runner), NOT in unit-test runs.
 *
 * Scope notes (Phase 1):
 * - Auth uses the superadmin storage state, so POST /insights is NOT throttled
 *   here (superadmin bypasses the 7-day cooldown by design). The 429-cooldown
 *   path requires a NON-superadmin token and is left as a CI follow-up.
 * - growthInsightWorker ships disabled (GROWTH_INSIGHT_WORKER_ENABLED), so a
 *   kicked-off run stays `status:'running'` and no opportunities are synthesized
 *   in this flow. The "action → campaign appears" flow depends on the worker +
 *   a richer dispatcher (post-Phase-1) and is intentionally not asserted here.
 */

import { test as base, expect } from '@playwright/test';

const BASE_API_URL = process.env.PLAYWRIGHT_BACKEND_URL || 'http://localhost:4001';
const TEST_TENANT_ID =
  process.env.E2E_TENANT_ID || process.env.TEST_TENANT_ID || '6cb4c008-4847-426a-9a2e-918ad70e7b69';
const authFile = 'playwright/.auth/superadmin.json';

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return await response.text();
  }
}

const test = base.extend({
  apiContext: async ({ playwright }, inner) => {
    const context = await playwright.request.newContext({
      baseURL: `${BASE_API_URL}/api/`,
      extraHTTPHeaders: {
        'Content-Type': 'application/json',
        'x-tenant-id': TEST_TENANT_ID,
      },
      storageState: authFile,
    });
    await inner(context);
    await context.dispose();
  },
});

test.describe('[CRM] Growth / Opportunity Intelligence API', () => {
  test('business profile: PUT then GET round-trips the declared scope', async ({ apiContext }) => {
    const putRes = await apiContext.put('v2/growth/profile', {
      data: {
        tenant_id: TEST_TENANT_ID,
        service_catalog: [{ name: 'AC Repair', slug: 'ac-repair', keywords: ['air conditioning'] }],
        target_regions: [{ type: 'city', name: 'Wellington' }],
        // a non-whitelisted key must be dropped server-side
        evil: 'should-not-persist',
      },
    });
    expect(putRes.status()).toBeGreaterThanOrEqual(200);
    expect(putRes.status()).toBeLessThan(300);

    const getRes = await apiContext.get('v2/growth/profile');
    expect(getRes.status()).toBe(200);
    const body = await safeJson(getRes);
    expect(body.status).toBe('success');
    const profile = body.data.profile;
    expect(Array.isArray(profile.service_catalog)).toBe(true);
    expect(profile.service_catalog.some((s) => s.slug === 'ac-repair')).toBe(true);
    expect(profile).not.toHaveProperty('evil');
  });

  test('insights: POST kicks off an async run (202 + ETA), GET /current reflects it', async ({
    apiContext,
  }) => {
    const postRes = await apiContext.post('v2/growth/insights', {
      data: { tenant_id: TEST_TENANT_ID },
    });
    // Superadmin is exempt from the cooldown, so this should be a 202 accept.
    expect(postRes.status()).toBe(202);
    const created = await safeJson(postRes);
    expect(created.status).toBe('success');
    expect(created.data).toHaveProperty('id');
    expect(created.data.status).toBe('running');
    expect(typeof created.data.eta_seconds).toBe('number');
    expect(created.data.eta_range).toHaveProperty('low');
    expect(created.data.eta_range).toHaveProperty('high');

    const currentRes = await apiContext.get('v2/growth/insights/current');
    expect(currentRes.status()).toBe(200);
    const current = await safeJson(currentRes);
    expect(current.status).toBe('success');
    expect(current.data.insight).toBeTruthy();
    expect(current.data.insight.id).toBe(created.data.id);
  });

  test('opportunities + dashboard endpoints respond with the expected envelope', async ({
    apiContext,
  }) => {
    const listRes = await apiContext.get('v2/growth/opportunities');
    expect(listRes.status()).toBe(200);
    const list = await safeJson(listRes);
    expect(list.status).toBe('success');
    expect(Array.isArray(list.data)).toBe(true);

    const dashRes = await apiContext.get('v2/growth/dashboard');
    expect(dashRes.status()).toBe(200);
    const dash = await safeJson(dashRes);
    expect(dash.status).toBe('success');
    expect(dash.data).toHaveProperty('top_opportunities');
  });

  test('a non-existent opportunity is 404 (tenant-scoped)', async ({ apiContext }) => {
    const res = await apiContext.get(
      'v2/growth/opportunities/00000000-0000-0000-0000-000000000000',
    );
    expect(res.status()).toBe(404);
  });
});
