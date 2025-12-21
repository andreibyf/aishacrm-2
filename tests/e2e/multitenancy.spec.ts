import { test, expect } from '@playwright/test';

const BACKEND_URL = process.env.PLAYWRIGHT_BACKEND_URL || 'http://localhost:4001';
const TENANT_ID = 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
const OTHER_TENANT_ID = '00000000-0000-0000-0000-000000000999'; // Non-existent / isolation check

test.describe('@smoke Multitenancy', () => {
  test('RLS prevents cross-tenant read', async ({ request }) => {
    // Create lead under valid tenant
    const leadEmail = `mt-test-${Date.now()}@isolation.test`;
    const create = await request.post(`${BACKEND_URL}/api/leads`, {
      data: {
        tenant_id: TENANT_ID,
        first_name: 'Iso',
        last_name: 'Check',
        email: leadEmail,
        status: 'new'
      }
    });
    expect(create.ok()).toBeTruthy();

    // Attempt fetch with OTHER_TENANT_ID
    const cross = await request.get(`${BACKEND_URL}/api/leads?tenant_id=${OTHER_TENANT_ID}&email=${encodeURIComponent(leadEmail)}`);
    // Expect either 0 results or forbidden
    expect([200,403]).toContain(cross.status());
    if (cross.status() === 200) {
      const json = await cross.json();
      const leads = json?.data?.leads || [];
      const found = leads.find((l:any) => l.email === leadEmail);
      expect(found).toBeFalsy();
    }
  });
});
