import { test, expect } from '@playwright/test';

const BACKEND_URL = process.env.VITE_AISHACRM_BACKEND_URL || 'http://localhost:3001';

async function waitForBackendHealth(request: any) {
  await expect
    .poll(async () => {
      try { const r = await request.get(`${BACKEND_URL}/api/system/status`); return r.ok() ? 200 : r.status(); }
      catch { return 0; }
    }, { timeout: 60_000, intervals: [500, 1000, 1500] })
    .toBe(200);
}

function rid() { return Math.random().toString(36).slice(2); }

test.describe('Notifications API', () => {
  test.beforeAll(async ({ request }) => { await waitForBackendHealth(request); });

  test('create → list → mark as read', async ({ request }) => {
    const tenantId = process.env.E2E_TENANT_ID || 'local-tenant-001';
    const recipient = process.env.E2E_RECIPIENT_ID || '00000000-0000-0000-0000-000000000000';

    // Create
    const create = await request.post(`${BACKEND_URL}/api/notifications`, {
      data: { tenant_id: tenantId, recipient_id: recipient, title: `E2E Test ${rid()}`, body: 'Hello', type: 'info' }
    });
    expect(create.ok()).toBeTruthy();

    // List
    const list = await request.get(`${BACKEND_URL}/api/notifications`, { params: { tenant_id: tenantId, recipient_id: recipient, limit: '10' } });
    expect(list.ok()).toBeTruthy();
    const data = await list.json();
    const note = (data?.data?.notifications || [])[0];
    expect(note).toBeTruthy();

    // Mark read (if supported)
    const id = note.id || note.notification_id || note.uuid;
    if (id) {
      const mark = await request.put(`${BACKEND_URL}/api/notifications/${id}`, { data: { read: true } });
      expect([200, 204]).toContain(mark.status());
    }
  });
});
