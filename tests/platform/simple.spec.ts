import { test, expect } from '@playwright/test';

test('[PLATFORM] simple test', async ({ page }) => {
  await page.goto('https://example.com');
  await expect(page).toHaveTitle(/Example Domain/);
});
