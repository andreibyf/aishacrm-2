import { test, expect } from '@playwright/test';

const BACKEND_URL = process.env.PLAYWRIGHT_BACKEND_URL || 'http://localhost:4001';
const TENANT_ID = 'local-tenant-001';

test.describe('@smoke Duplicate Detection', () => {
  test('find duplicates endpoint returns none for unique lead', async ({ request }) => {
    const email = `dup-test-${Date.now()}@unique.test`;
    // Check duplicates BEFORE creating - should find none
    const check = await request.post(`${BACKEND_URL}/api/validation/check-duplicate-before-create`, { 
      data: { 
        tenant_id: TENANT_ID, 
        entity_type: 'Lead', 
        data: { email } 
      } 
    });
    expect(check.ok()).toBeTruthy();
    const json = await check.json();
    expect(json?.data?.has_duplicates).toBeFalsy();
  });

  test('find duplicates flags second identical lead', async ({ request }) => {
    const email = `dup-test-${Date.now()}@dup.test`;
    // First lead
    await request.post(`${BACKEND_URL}/api/leads`, { data: { tenant_id: TENANT_ID, first_name: 'First', last_name: 'Lead', email, status: 'new' } });
    // Duplicate check before second - backend returns 'duplicates' field
    const dupCheck = await request.post(`${BACKEND_URL}/api/validation/check-duplicate-before-create`, { 
      data: { 
        tenant_id: TENANT_ID, 
        entity_type: 'Lead', 
        data: { email } 
      } 
    });
    const json = await dupCheck.json();
    expect(json?.data?.has_duplicates).toBeTruthy();
    expect(Array.isArray(json?.data?.duplicates)).toBeTruthy();
    expect(json?.data?.duplicates?.length).toBeGreaterThan(0);
  });
});
