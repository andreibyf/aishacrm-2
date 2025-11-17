import { test, expect } from '@playwright/test';

const BACKEND_URL = process.env.PLAYWRIGHT_BACKEND_URL || 'http://localhost:4001';
const TENANT_ID = 'local-tenant-001';

test.describe('@smoke Duplicate Detection', () => {
  test('find duplicates endpoint returns none for unique lead', async ({ request }) => {
    const email = `dup-test-${Date.now()}@unique.test`;
    // Create lead
    const create = await request.post(`${BACKEND_URL}/api/leads`, { data: { tenant_id: TENANT_ID, first_name: 'Dup', last_name: 'Check', email, status: 'new' } });
    expect(create.ok()).toBeTruthy();
    // Check duplicates
    const check = await request.post(`${BACKEND_URL}/api/validation/check-duplicate-before-create`, { data: { tenant_id: TENANT_ID, entity_type: 'lead', email } });
    expect(check.ok()).toBeTruthy();
    const json = await check.json();
    expect(json?.data?.has_duplicates).toBeFalsy();
  });

  test('find duplicates flags second identical lead', async ({ request }) => {
    const email = `dup-test-${Date.now()}@dup.test`;
    // First lead
    await request.post(`${BACKEND_URL}/api/leads`, { data: { tenant_id: TENANT_ID, first_name: 'First', last_name: 'Lead', email, status: 'new' } });
    // Duplicate check before second
    const dupCheck = await request.post(`${BACKEND_URL}/api/validation/check-duplicate-before-create`, { data: { tenant_id: TENANT_ID, entity_type: 'lead', email } });
    const json = await dupCheck.json();
    expect(json?.data?.has_duplicates).toBeTruthy();
    expect(Array.isArray(json?.data?.potential_duplicates)).toBeTruthy();
  });
});
