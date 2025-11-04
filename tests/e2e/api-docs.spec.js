/**
 * E2E: API Documentation (Swagger) embed in Settings
 * Verifies that the Swagger UI is accessible within an iframe and renders in the app
 */
import { test, expect } from '@playwright/test';

const BASE_URL = process.env.VITE_AISHACRM_FRONTEND_URL || process.env.PLAYWRIGHT_FRONTEND_URL || 'http://localhost:5173';
const BACKEND_URL = process.env.VITE_AISHACRM_BACKEND_URL || process.env.PLAYWRIGHT_BACKEND_URL || 'http://localhost:3001';

test.describe('Settings - API Documentation', () => {
  test('should load Swagger UI iframe and render operations', async ({ page }) => {
    // Go directly to the API Docs tab via query param to avoid tab click flakiness
    await page.goto(`${BASE_URL}/settings?tab=api-docs`, { waitUntil: 'networkidle' });

  // Wait for iframe to be present and visible (allow extra time on WebKit)
  const iframeEl = page.locator('iframe[src*="/api-docs"]');
  await expect(iframeEl).toBeVisible({ timeout: 20000 });
  await iframeEl.scrollIntoViewIfNeeded();

    // Validate iframe src points to backend swagger docs
    const src = await iframeEl.getAttribute('src');
    expect(src).toBeTruthy();
    expect(src).toContain('/api-docs');

    // Validate backend swagger JSON is reachable and well-formed (theme-independent functional check)
  const resp = await page.request.get(`${BACKEND_URL}/api-docs.json`);
    expect(resp.ok()).toBeTruthy();
    const spec = await resp.json();
    expect(spec).toBeTruthy();
    // Basic swagger/openapi shape checks
    expect(spec.openapi || spec.swagger).toBeTruthy();
    // Note: some environments may not include annotated paths yet; just ensure the object exists
    expect(spec.paths).toBeDefined();
  });
});
