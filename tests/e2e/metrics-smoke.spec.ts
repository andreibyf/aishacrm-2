import { test, expect } from '@playwright/test';

const BACKEND_URL = process.env.VITE_AISHACRM_BACKEND_URL || process.env.PLAYWRIGHT_BACKEND_URL || 'http://localhost:3001';

async function waitForBackendHealth(request: any) {
  await expect
    .poll(
      async () => {
        try {
          const res = await request.get(`${BACKEND_URL}/api/system/status`, { timeout: 5000 });
          return res.ok() ? 200 : res.status();
        } catch {
          return 0;
        }
      },
      { timeout: 60_000, intervals: [500, 1000, 1500] }
    )
    .toBe(200);
}

test.describe('Dashboard/Reports - Metrics smoke', () => {
  test.beforeAll(async ({ request }) => {
    await waitForBackendHealth(request);
  });

  test('performance metrics returns success (zeros ok)', async ({ request }) => {
    const tenantId = process.env.E2E_TENANT_ID || 'local-tenant-001';
    const res = await request.get(`${BACKEND_URL}/api/metrics/performance`, { params: { hours: '24', limit: '100', tenant_id: tenantId } });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe('success');
    expect(body.data).toBeTruthy();
    expect(body.data.metrics).toBeTruthy();
    // numbers; zeros are acceptable
    expect(typeof body.data.metrics.totalCalls).toBe('number');
  });
});
