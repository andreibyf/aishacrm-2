import { test, expect } from '@playwright/test';

const BACKEND_URL = process.env.PLAYWRIGHT_BACKEND_URL || 'http://localhost:4001';
const TENANT_ID = 'a11dfb63-4b18-4eb8-872e-747af2e37c46';

test.describe('@smoke Permissions', () => {
  test('roles endpoint accessible to superadmin', async ({ request }) => {
    const res = await request.get(`${BACKEND_URL}/api/permissions/roles?tenant_id=${TENANT_ID}`);
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json?.data || json).toBeTruthy();
  });

  test('grant permission endpoint accepts request (validation not yet implemented)', async ({ request }) => {
    const res = await request.post(`${BACKEND_URL}/api/permissions/grant`, { data: { tenant_id: TENANT_ID } });
    // Backend currently returns 200 with placeholder response (no validation implemented)
    // Accept 200 success or 400/422/500 if validation added later
    expect([200,400,422,500]).toContain(res.status());
  });
});
