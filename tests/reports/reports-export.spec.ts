import { test, expect } from '@playwright/test';

const BACKEND_URL = process.env.PLAYWRIGHT_BACKEND_URL || process.env.VITE_AISHACRM_BACKEND_URL || 'http://localhost:4001';
const TENANT_ID = process.env.E2E_TENANT_ID || '6cb4c008-4847-426a-9a2e-918ad70e7b69';

test.describe('@smoke Reports: exports and analytics', () => {
  test('export overview PDF', async ({ request }) => {
    const res = await request.get(`${BACKEND_URL}/api/reports/export-pdf?report_type=overview&tenant_id=${TENANT_ID}`);
    expect(res.ok()).toBeTruthy();
    expect(res.headers()['content-type']).toContain('application/pdf');
    const buf = Buffer.from(await res.body());
    expect(buf.length).toBeGreaterThan(500); // non-empty PDF
  });

  test('export data-quality PDF', async ({ request }) => {
    const res = await request.get(`${BACKEND_URL}/api/reports/export-pdf?report_type=data-quality&tenant_id=${TENANT_ID}`);
    expect(res.ok()).toBeTruthy();
    expect(res.headers()['content-type']).toContain('application/pdf');
    const buf = Buffer.from(await res.body());
    expect(buf.length).toBeGreaterThan(500);
  });

  test('pipeline and lead-status JSON endpoints', async ({ request }) => {
    const p = await request.get(`${BACKEND_URL}/api/reports/pipeline?tenant_id=${TENANT_ID}`);
    expect(p.ok()).toBeTruthy();
    const pJson = await p.json();
    expect(Array.isArray(pJson?.data?.stages || [])).toBeTruthy();

    const l = await request.get(`${BACKEND_URL}/api/reports/lead-status?tenant_id=${TENANT_ID}`);
    expect(l.ok()).toBeTruthy();
    const lJson = await l.json();
    expect(Array.isArray(lJson?.data?.statuses || [])).toBeTruthy();
  });
});
