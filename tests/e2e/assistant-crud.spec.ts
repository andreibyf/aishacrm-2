import { test, expect } from '@playwright/test';

const BACKEND_URL = process.env.PLAYWRIGHT_BACKEND_URL || process.env.VITE_AISHACRM_BACKEND_URL || 'http://localhost:4001';
const TENANT_ID = process.env.E2E_TENANT_ID || '6cb4c008-4847-426a-9a2e-918ad70e7b69';

test.describe('AI Assistant: conversations CRUD', () => {
  test('@smoke create, update, list, delete conversation', async ({ request }) => {
    // Create conversation
    const create = await request.post(`${BACKEND_URL}/api/ai/conversations`, {
      data: { agent_name: 'crm_assistant', metadata: { e2e: true } },
      params: { tenant_id: TENANT_ID },
    });
    expect(create.ok()).toBeTruthy();
    const conv = await create.json();
    const id = conv?.data?.id || conv?.data?.conversation?.id;
    expect(id).toBeTruthy();

    // Add a user message
    const msg = await request.post(`${BACKEND_URL}/api/ai/conversations/${id}/messages`, {
      data: { role: 'user', content: 'Set title to: Test Conversation Title' },
      params: { tenant_id: TENANT_ID },
    });
    expect(msg.ok()).toBeTruthy();

    // Update conversation title and topic
    const patch = await request.patch(`${BACKEND_URL}/api/ai/conversations/${id}`, {
      data: { title: 'Test Conversation Title', topic: 'leads' },
      params: { tenant_id: TENANT_ID },
    });
    expect(patch.ok()).toBeTruthy();
    const upd = await patch.json();
    expect(upd?.data?.title).toBe('Test Conversation Title');
    expect(upd?.data?.topic).toBe('leads');

    // List conversations
    const list = await request.get(`${BACKEND_URL}/api/ai/conversations?tenant_id=${TENANT_ID}`);
    expect(list.ok()).toBeTruthy();
    const all = await list.json();
    const arr = Array.isArray(all?.data) ? all.data : [];
    expect(arr.find((c: any) => c.id === id)).toBeTruthy();

    // Delete conversation
    const del = await request.delete(`${BACKEND_URL}/api/ai/conversations/${id}`, { params: { tenant_id: TENANT_ID } });
    expect(del.ok()).toBeTruthy();

    // Verify it no longer exists
    const get = await request.get(`${BACKEND_URL}/api/ai/conversations/${id}?tenant_id=${TENANT_ID}`);
    expect(get.status()).toBe(404);
  });
});
