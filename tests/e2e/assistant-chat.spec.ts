import { test, expect } from '@playwright/test';

const BACKEND_URL = process.env.PLAYWRIGHT_BACKEND_URL || 'http://localhost:4001';
const TENANT_ID = process.env.E2E_TENANT_ID || '6cb4c008-4847-426a-9a2e-918ad70e7b69';

test.describe('@smoke Assistant Chat', () => {
  test('create conversation and post message', async ({ request }) => {
    // Create conversation - tenant_id required in body, not query
    const convRes = await request.post(`${BACKEND_URL}/api/ai/conversations`, {
      data: { agent_name: 'crm_assistant', metadata: { e2e: true } },
      params: { tenant_id: TENANT_ID }
    });
    expect(convRes.ok()).toBeTruthy();
    const convJson = await convRes.json();
    const convId = convJson?.data?.conversation?.id || convJson?.data?.id || convJson?.id;
    expect(convId).toBeTruthy();

    // Post user message
    const userMsg = await request.post(`${BACKEND_URL}/api/ai/conversations/${convId}/messages`, {
      data: {
        role: 'user',
        content: 'Summarize recent lead qualification best practices.'
      },
      params: { tenant_id: TENANT_ID }
    });
    expect(userMsg.ok()).toBeTruthy();

    // Fetch conversation details
    const detail = await request.get(`${BACKEND_URL}/api/ai/conversations/${convId}?tenant_id=${TENANT_ID}`);
    expect(detail.ok()).toBeTruthy();
    const detailJson = await detail.json();
    const messages = detailJson?.data?.messages || [];
    expect(messages.length).toBeGreaterThan(0);
    // Verify user message was stored
    const userMessage = messages.find((m:any) => m.role === 'user');
    expect(userMessage).toBeTruthy();
    // Assistant reply is optional - requires OpenAI API keys configured
    // In production, an assistant message would be generated; gracefully skip verification if not present
  });
});
