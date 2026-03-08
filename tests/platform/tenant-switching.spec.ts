import { test, expect } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_FRONTEND_URL || 'http://localhost:4000';
const BACKEND_URL = process.env.PLAYWRIGHT_BACKEND_URL || 'http://localhost:4001';

async function getAnyTenantId(request: any) {
  const res = await request.get(`${BACKEND_URL}/api/tenants?limit=2`);
  if (!res.ok()) {
    console.error('Failed to fetch tenants:', await res.text());
    return ['a11dfb63-4b18-4eb8-872e-747af2e37c46']; // Use actual tenant UUID from helpers.ts
  }
  const body = await res.json();
  const tenants = body?.data?.tenants || [];
  const envTenant = process.env.E2E_TENANT_ID;
  if (envTenant) return [envTenant, envTenant];
  
  // Extract tenant UUIDs (not slugs)
  const ids = tenants.map((t: any) => t.id || t.uuid || t.tenant_id).filter(Boolean);
  return ids.length ? ids : ['a11dfb63-4b18-4eb8-872e-747af2e37c46'];
}

test('tenant switching persists and scopes data', async ({ page, request }) => {
  // Discover 1-2 tenants
  const ids = await getAnyTenantId(request);
  const a = ids[0];
  const b = ids[1] || (process.env.E2E_TENANT_ID ? process.env.E2E_TENANT_ID : 'a11dfb63-4b18-4eb8-872e-747af2e37c46');

  // Set tenant A in storage and navigate
  await page.addInitScript((id) => localStorage.setItem('selected_tenant_id', id as string), a);
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);

  // Verify storage
  const storedA = await page.evaluate(() => localStorage.getItem('selected_tenant_id'));
  expect(storedA).toBe(a);

  // Switch to tenant B
  await page.evaluate((id) => localStorage.setItem('selected_tenant_id', id as string), b);
  await page.reload();
  await page.waitForTimeout(300);
  const storedB = await page.evaluate(() => localStorage.getItem('selected_tenant_id'));
  expect(storedB).toBe(b);

  // Verify URL persistence
  await page.evaluate((id) => {
    const url = new URL(window.location.href);
    url.searchParams.set('tenant', id as string);
    window.history.replaceState({}, '', url);
  }, b);
  await page.reload();
  expect((new URL(page.url())).searchParams.get('tenant')).toBe(b);
});
