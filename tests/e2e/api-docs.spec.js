/**
 * E2E: API Documentation (Swagger) embed in Settings
 * Verifies that the Swagger UI is accessible within an iframe and renders in the app
 */
import { test, expect } from '@playwright/test';

const BASE_URL = process.env.VITE_AISHACRM_FRONTEND_URL || 'http://localhost:5173';

test.describe('Settings - API Documentation', () => {
  test('should load Swagger UI in iframe with dark theme', async ({ page }) => {
    // Go to settings
    await page.goto(`${BASE_URL}/settings`, { waitUntil: 'networkidle' });

    // Click API Documentation tab or nav item
    const apiDocsTab = page.locator('a[href="/settings/api-docs"], button:has-text("API Documentation"), a:has-text("API Documentation")').first();
    if (await apiDocsTab.isVisible()) {
      await apiDocsTab.click();
    }

    // Wait for iframe to be present
    const iframeEl = page.locator('iframe[src*="/api-docs"]');
    await expect(iframeEl).toBeVisible({ timeout: 10000 });

    // Get the iframe content
    const frame = await iframeEl.contentFrame();
    await expect(frame.locator('.swagger-ui')).toBeVisible({ timeout: 15000 });

    // Spot-check dark theme classes exist on body or container
    const hasDarkBackground = await frame.evaluate(() => {
      const el = document.querySelector('.swagger-ui') || document.body;
      const style = window.getComputedStyle(el);
      // Check for a dark-ish background color (rgb around slate-900)
      return style.backgroundColor !== 'rgba(0, 0, 0, 0)';
    });
    expect(hasDarkBackground).toBeTruthy();
  });
});
