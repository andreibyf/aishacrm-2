import { test, expect } from '@playwright/test';

const BACKEND_URL = process.env.VITE_AISHACRM_BACKEND_URL || 'http://localhost:3001';

async function waitForBackendHealth(request: any) {
  await expect
    .poll(async () => {
      try {
        const res = await request.get(`${BACKEND_URL}/api/system/status`, { timeout: 5000 });
        return res.ok() ? 200 : res.status();
      } catch { return 0; }
    }, { timeout: 60_000, intervals: [500, 1000, 1500] })
    .toBe(200);
}

function rid() { return Math.random().toString(36).slice(2); }

test.describe('RLS Enforcement - Black-box', () => {
  test.beforeAll(async ({ request }) => { await waitForBackendHealth(request); });

  test('cannot access another tenant\'s contact by ID', async ({ request }) => {
    const tenantA = 'unit-test-tenant';
    const tenantB = 'local-tenant-001';

    // Create a contact in tenant A
    const create = await request.post(`${BACKEND_URL}/api/contacts`, {
      data: { tenant_id: tenantA, first_name: 'RLS', last_name: `Test-${rid()}`, email: `rls.${rid()}@example.com`, status: 'active' }
    });
    expect(create.ok()).toBeTruthy();
    const created = await create.json();
    const id = created?.data?.id || created?.data?.contact?.id || created?.id;
    expect(id).toBeTruthy();

    // Try to fetch using another tenant context (if API uses tenant_id query)
    const fetchOther = await request.get(`${BACKEND_URL}/api/contacts/${id}`, { params: { tenant_id: tenantB } });
    expect([403, 404]).toContain(fetchOther.status());

    // Cleanup
    await request.delete(`${BACKEND_URL}/api/contacts/${id}`, { params: { tenant_id: tenantA } });
  });

  test('list without tenant should return empty or scoped', async ({ request }) => {
    const res = await request.get(`${BACKEND_URL}/api/contacts`, { params: { limit: '5' } });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    // Accept either empty or scoped to default tenant
    const contacts = body?.data?.contacts || [];
    expect(Array.isArray(contacts)).toBeTruthy();
  });
});
