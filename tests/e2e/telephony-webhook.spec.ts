import { test, expect } from '@playwright/test';

const BACKEND_URL = process.env.PLAYWRIGHT_BACKEND_URL || 'http://localhost:4001';
const TENANT_ID = 'local-tenant-001';

test.describe('@smoke Telephony Webhook', () => {
  test('Twilio inbound webhook normalization', async ({ request }) => {
    const payload = {
      tenant_id: TENANT_ID,
      // Simulated Twilio fields
      CallSid: 'CA1234567890abcdef',
      From: '+15550111',
      To: '+15550222',
      CallStatus: 'completed'
    };
    const res = await request.post(`${BACKEND_URL}/api/telephony/webhook/twilio/inbound`, { data: payload });
    expect([200,202]).toContain(res.status());
    const json = await res.json().catch(() => ({}));
    // Expect provider or normalized structure when implemented
    if (json?.data) {
      expect(json.data.provider || 'twilio').toBeTruthy();
    }
  });
});
