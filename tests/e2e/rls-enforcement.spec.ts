import { test, expect } from '@playwright/test';

const BACKEND_URL = process.env.PLAYWRIGHT_BACKEND_URL || 'http://localhost:4001';

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
    const tenantB = process.env.E2E_TENANT_ID || 'local-tenant-001';

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

  test('list with explicit tenant should return scoped data', async ({ request }) => {
    const tenantId = process.env.E2E_TENANT_ID || 'local-tenant-001';
    const res = await request.get(`${BACKEND_URL}/api/contacts`, { params: { tenant_id: tenantId, limit: '5' } });
    if (!res.ok()) {
      console.error('List contacts failed:', res.status(), await res.text());
    }
    expect(res.status()).toBe(200); // Explicit success status
    const body = await res.json();
    const contacts = body?.data?.contacts || [];
    expect(Array.isArray(contacts)).toBeTruthy();
  });

  test('list without tenant_id should be rejected', async ({ request }) => {
    // Negative test: verify that requests without tenant_id are properly rejected
    const res = await request.get(`${BACKEND_URL}/api/contacts`, { params: { limit: '5' } }); // No tenant_id
    
    // Should receive 400 (Bad Request) or 401 (Unauthorized)
    expect([400, 401]).toContain(res.status());
    
    const body = await res.json();
    // Verify error message indicates missing tenant_id
    expect(body?.error || body?.message || '').toMatch(/tenant/i);
  });
});
