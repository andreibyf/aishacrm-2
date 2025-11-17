import { test, expect } from '@playwright/test';

const BACKEND_URL = process.env.PLAYWRIGHT_BACKEND_URL || 'http://localhost:4001';
const TENANT_ID = 'local-tenant-001';

test.describe('@smoke Permissions', () => {
  test('roles endpoint accessible to superadmin', async ({ request }) => {
    const res = await request.get(`${BACKEND_URL}/api/permissions/roles?tenant_id=${TENANT_ID}`);
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json?.data || json).toBeTruthy();
  });

  test('grant permission requires required fields (validation failure)', async ({ request }) => {
    const res = await request.post(`${BACKEND_URL}/api/permissions/grant`, { data: { tenant_id: TENANT_ID } });
    // Expect validation error or failure status
    expect([400,422,500]).toContain(res.status());
  });
});
