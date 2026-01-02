import { test, expect } from '@playwright/test';

const FRONTEND_URL = process.env.PLAYWRIGHT_FRONTEND_URL || process.env.VITE_AISHACRM_FRONTEND_URL || 'http://localhost:4000';
const BACKEND_URL = process.env.PLAYWRIGHT_BACKEND_URL || process.env.VITE_AISHACRM_BACKEND_URL || 'http://localhost:4001';
const TENANT_ID = process.env.E2E_TENANT_ID || '6cb4c008-4847-426a-9a2e-918ad70e7b69';

/** Poll until locator visible or timeout */
async function waitForElement(page, locatorFn, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const loc = locatorFn();
      if (await loc.isVisible({ timeout: 1000 })) return loc;
    } catch {}
    await page.waitForTimeout(500);
  }
  throw new Error('Element not found within timeout');
}

test.describe('Accounts: hierarchy and relationships', () => {
  test('create parent/child accounts and link via metadata', async ({ request, page }) => {
    const ts = Date.now();
    const parentName = `ParentCo ${ts}`;
    const childName = `ChildCo ${ts}`;

    // Create parent account
    const parentRes = await request.post(`${BACKEND_URL}/api/accounts`, {
      data: { tenant_id: TENANT_ID, name: parentName, type: 'customer' },
    });
    expect(parentRes.ok()).toBeTruthy();
    const parentJson = await parentRes.json();
    const parentId = parentJson?.data?.id || parentJson?.data?.account?.id || parentJson?.id;
    expect(parentId).toBeTruthy();

    // Create child account
    const childRes = await request.post(`${BACKEND_URL}/api/accounts`, {
      data: { tenant_id: TENANT_ID, name: childName, type: 'customer' },
    });
    expect(childRes.ok()).toBeTruthy();
    const childJson = await childRes.json();
    const childId = childJson?.data?.id || childJson?.data?.account?.id || childJson?.id;
    expect(childId).toBeTruthy();

    // Link child -> parent using flexible metadata (flattened by API)
    const upd = await request.put(`${BACKEND_URL}/api/accounts/${childId}`, {
      data: {
        metadata: {
          parent_account_id: parentId,
          parent_account_name: parentName,
        },
      },
    });
    expect(upd.ok()).toBeTruthy();

    // Verify child shows flattened parent fields
    const getChild = await request.get(`${BACKEND_URL}/api/accounts/${childId}?tenant_id=${TENANT_ID}`);
    expect(getChild.ok()).toBeTruthy();
    const child = await getChild.json();
    const payload = child?.data || child;
    expect(payload.parent_account_id).toBe(parentId);
    expect(payload.parent_account_name).toBe(parentName);

    // Optional UI smoke: search child and open details (best-effort)
    await page.goto(`${FRONTEND_URL}/Accounts`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000); // Allow initial list load
    
    // Force list refresh if reload button present
    const reload = page.getByRole('button', { name: /refresh|reload/i }).first();
    if (await reload.isVisible({ timeout: 1000 }).catch(() => false)) {
      await reload.click();
      await page.waitForTimeout(1000);
    }
    
    const search = page.getByPlaceholder(/search accounts/i).first();
    const hasSearch = await search.isVisible().catch(() => false);
    if (hasSearch) {
      await search.fill(childName);
      await page.waitForTimeout(1500);
    }
    
    // Poll for child visibility up to 30s
    await waitForElement(page, () => page.getByText(childName).first());
  });
});
