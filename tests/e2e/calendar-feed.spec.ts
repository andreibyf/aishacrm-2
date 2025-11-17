import { test, expect } from '@playwright/test';

const BACKEND_URL = process.env.PLAYWRIGHT_BACKEND_URL || 'http://localhost:4001';
const TENANT_ID = 'local-tenant-001';

test.describe('@smoke Calendar Feed', () => {
  test('calendar feed returns array of activities', async ({ request }) => {
    const res = await request.get(`${BACKEND_URL}/api/reports/calendar?tenant_id=${TENANT_ID}`);
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    const items = json?.data || json;
    expect(Array.isArray(items)).toBeTruthy();
    if (items.length) {
      const first = items[0];
      expect(first).toHaveProperty('id');
      expect(first).toHaveProperty('type');
      expect(first).toHaveProperty('due_date');
    }
  });
});
