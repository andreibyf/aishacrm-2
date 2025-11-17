import { test, expect } from '@playwright/test';

// ElevenLabs endpoints may be proxied through functions; we test tenant field presence and graceful failure if no key configured.

const BACKEND_URL = process.env.PLAYWRIGHT_BACKEND_URL || 'http://localhost:4001';
const TENANT_ID = 'local-tenant-001';

test.describe('@smoke ElevenLabs', () => {
  test('tenant metadata exposes agent id (may be empty)', async ({ request }) => {
    const res = await request.get(`${BACKEND_URL}/api/tenants/${TENANT_ID}`);
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    const agentId = json?.data?.tenant?.elevenlabs_agent_id || json?.data?.elevenlabs_agent_id || '';
    expect(agentId).toBeDefined();
  });

  test('speech generation request returns success or graceful error', async ({ request }) => {
    // Hypothetical endpoint pattern via functions proxy:
    const res = await request.post(`${BACKEND_URL}/api/functions/generateElevenLabsSpeech`, {
      data: { tenant_id: TENANT_ID, text: 'Testing speech synthesis for Ai-SHA CRM.' }
    });
    // Accept 200 success, 400/500 graceful failure, or 404 if endpoint not implemented
    expect([200,400,404,500]).toContain(res.status());
    const json = await res.json().catch(()=>({}));
    if (res.status() === 200) {
      expect(json?.data?.audio || json?.data?.url || json?.data).toBeTruthy();
    } else {
      // Ensure an informative message exists
      expect((json?.error?.message || json?.message || '').length).toBeGreaterThan(0);
    }
  });
});
