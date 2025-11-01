// Auth setup to create a persisted SuperAdmin session for all Playwright projects
// This runs once before browser projects and writes storage state to playwright/.auth/superadmin.json
import { test as setup, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const BASE_URL = process.env.VITE_AISHACRM_FRONTEND_URL || 'http://localhost:5173';
const SUPERADMIN_EMAIL = process.env.SUPERADMIN_EMAIL || 'admin@aishacrm.com';
const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD || 'SuperAdmin123!';

const authDir = path.join('playwright', '.auth');
const authFile = path.join(authDir, 'superadmin.json');

setup.describe.configure({ mode: 'serial' });

setup('authenticate as superadmin', async ({ page }) => {
  // Ensure auth directory exists
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  // Navigate to app root
  await page.goto(BASE_URL, { waitUntil: 'load' });

  // If already logged in (from a previous run and dev server session), skip login
  const loginFormVisible = await page
    .locator('input[type="email"], input[name="email"]')
    .isVisible()
    .catch(() => false);

  if (loginFormVisible) {
    // Fill and submit login form
    await page.fill('input[type="email"], input[name="email"]', SUPERADMIN_EMAIL);
    await page.fill('input[type="password"], input[name="password"]', SUPERADMIN_PASSWORD);
    await page.click('button[type="submit"]');

    // Wait for main app shell to load
    await page.waitForSelector('main, [role="main"], nav, header', { timeout: 20000 });
  }

  // Small settle time for client-side bootstrapping
  await page.waitForTimeout(500);

  // Verify we see some main UI element to confirm auth
  await expect(page.locator('nav, header, [data-testid="app-shell"]').first()).toBeVisible({ timeout: 10000 });

  // Persist storage for reuse by all projects
  await page.context().storageState({ path: authFile });
});
