import { test, expect } from '@playwright/test';

const BACKEND_URL = process.env.PLAYWRIGHT_BACKEND_URL || 'http://localhost:4001';
const TENANT_ID = 'local-tenant-001';

test.describe('@smoke Assistant Chat', () => {
  test('create conversation and post message', async ({ request }) => {
    // Create conversation
    const convRes = await request.post(`${BACKEND_URL}/api/ai/conversations`, {
      data: { tenant_id: TENANT_ID, agent_name: 'crm_assistant', metadata: { e2e: true } }
    });
    expect(convRes.ok()).toBeTruthy();
    const convJson = await convRes.json();
    const convId = convJson?.data?.conversation?.id || convJson?.data?.id || convJson?.id;
    expect(convId).toBeTruthy();

    // Post user message
    const userMsg = await request.post(`${BACKEND_URL}/api/ai/conversations/${convId}/messages`, {
      data: {
        tenant_id: TENANT_ID,
        role: 'user',
        content: 'Summarize recent lead qualification best practices.'
      }
    });
    expect(userMsg.ok()).toBeTruthy();

    // Fetch conversation details
    const detail = await request.get(`${BACKEND_URL}/api/ai/conversations/${convId}?tenant_id=${TENANT_ID}`);
    expect(detail.ok()).toBeTruthy();
    const detailJson = await detail.json();
    const messages = detailJson?.data?.messages || [];
    expect(messages.length).toBeGreaterThan(0);
    // Look for assistant reply or graceful error message when model not configured
    const assistant = messages.find((m:any) => m.role === 'assistant');
    expect(assistant).toBeTruthy();
  });
});
