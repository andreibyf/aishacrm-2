import { test, expect } from '@playwright/test';

const BACKEND_URL = process.env.PLAYWRIGHT_BACKEND_URL || 'http://localhost:4001';
const TENANT_ID = process.env.E2E_TENANT_ID || '6cb4c008-4847-426a-9a2e-918ad70e7b69';

test.describe('@smoke Calendar Feed', () => {
  test('calendar feed returns array of activities', async ({ request }) => {
    const res = await request.get(`${BACKEND_URL}/api/reports/calendar?tenant_id=${TENANT_ID}`);
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    // Backend returns {status:'success', data:{activities:[...]}}
    const items = json?.data?.activities || json?.data || [];
    expect(Array.isArray(items)).toBeTruthy();
    if (items.length) {
      const first = items[0];
      expect(first).toHaveProperty('id');
      expect(first).toHaveProperty('type');
      expect(first.due_at || first.due_date).toBeDefined();
    }
  });
});
