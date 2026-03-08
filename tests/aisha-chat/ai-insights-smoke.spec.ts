import { test, expect } from '@playwright/test';

const FRONTEND_URL = process.env.PLAYWRIGHT_FRONTEND_URL || process.env.VITE_AISHACRM_FRONTEND_URL || 'http://localhost:4000';
const BACKEND_URL = process.env.PLAYWRIGHT_BACKEND_URL || process.env.VITE_AISHACRM_BACKEND_URL || 'http://localhost:4001';

async function pickTenantWithIndustry(request: any) {
  const res = await request.get(`${BACKEND_URL}/api/tenants?limit=10`);
  if (!res.ok()) throw new Error(`Failed to list tenants: ${res.status()}`);
  const body = await res.json();
  const list = Array.isArray(body?.data) ? body.data : (Array.isArray(body?.data?.tenants) ? body.data.tenants : []);
  const withIndustry = list.find((t: any) => (t?.industry || t?.metadata?.industry));
  return withIndustry || list[0];
}

test.describe('AI Market Insights smoke', () => {
  test('superadmin generates insights for selected tenant', async ({ page, request }) => {
    // Discover a tenant and select it in localStorage prior to navigation
    const tenant = await pickTenantWithIndustry(request);
    expect(tenant).toBeTruthy();
    const selectedId = tenant.tenant_id || tenant.id;
    expect(selectedId).toBeTruthy();

    await page.addInitScript((id) => {
      localStorage.setItem('E2E_TEST_MODE', 'true');
      localStorage.setItem('selected_tenant_id', id as string);
      // Ensure a superadmin view for reports
      (window as any).__e2eUser = { id: 'e2e', email: 'e2e@example.com', role: 'superadmin', tenant_id: id };
    }, selectedId);

    // Navigate to Reports page directly
    await page.goto(`${FRONTEND_URL}/Reports`, { waitUntil: 'domcontentloaded' });

    // Wait for tabs to mount and select the AI Insights tab
    const tab = page.getByRole('tab', { name: /AI Insights/i });
    await tab.click();

    // Click Generate Insights
    const generateBtn = page.getByRole('button', { name: /Generate Insights/i });
    await expect(generateBtn).toBeEnabled();
    await generateBtn.click();

    // Expect either loading state then one of the known section headings
    const analyzing = page.getByText(/Analyzing\.{0,3}/i);
    await analyzing.waitFor({ state: 'detached', timeout: 60_000 }).catch(() => {});

    const overview = page.getByRole('heading', { name: /Market Overview/i }).first();
    const recommendations = page.getByRole('heading', { name: /Strategic Recommendations/i }).first();
    try {
      await expect(overview).toBeVisible({ timeout: 30_000 });
    } catch {
      await expect(recommendations).toBeVisible({ timeout: 15_000 });
    }
  });
});
