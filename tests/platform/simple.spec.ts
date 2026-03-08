import { test, expect } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_FRONTEND_URL || process.env.VITE_AISHACRM_FRONTEND_URL || 'http://localhost:4000';

test('[PLATFORM] simple test', async ({ page }) => {
  await page.goto(BASE_URL);
  await expect(page).toHaveTitle(/.+/);
});
