import { test, expect } from '@playwright/test';

const BACKEND_URL = process.env.PLAYWRIGHT_BACKEND_URL || 'http://localhost:4001';

test.describe('@smoke Stripe Integration', () => {
  test('placeholder create payment returns not implemented message', async ({ request }) => {
    const res = await request.post(`${BACKEND_URL}/api/integrations/stripe/create-payment`, { data: { amount: 1000 } });
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json?.data?.message || json?.message).toMatch(/not yet implemented/i);
  });
});
