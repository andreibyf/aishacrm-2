// Auth setup to create a persisted SuperAdmin session for all Playwright projects
// This runs once before browser projects and writes storage state to playwright/.auth/superadmin.json
import { test as setup, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const BASE_URL = process.env.VITE_AISHACRM_FRONTEND_URL || 'http://localhost:5173';
const SUPERADMIN_EMAIL = process.env.SUPERADMIN_EMAIL || 'test@aishacrm.com';
const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD || 'TestPassword123!';

const authDir = path.join('playwright', '.auth');
const authFile = path.join(authDir, 'superadmin.json');

setup.describe.configure({ mode: 'serial' });

setup('authenticate as superadmin', async ({ page }) => {
  // Ensure auth directory exists
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  // Navigate to app root and then resolve state: header (already logged in) or login form (sign in)
  await page.goto(BASE_URL, { waitUntil: 'load' });

  const header = page.locator('header').first();
  const emailInput = page.locator('#email, input[type="email"], input[name="email"]').first();
  const passwordInput = page.locator('#password, input[type="password"], input[name="password"]').first();

  // Quick check: if header is visible, we're already authenticated
  if (await header.isVisible().catch(() => false)) {
    console.log('Header visible – session already authenticated.');
  } else {
    // Try to detect the login form properly (use wait APIs instead of isVisible timeout)
    let didFindLogin = false;
    try {
      await emailInput.waitFor({ state: 'visible', timeout: 15000 });
      didFindLogin = true;
    } catch {
      didFindLogin = false;
    }

    if (didFindLogin) {
      console.log('Login form detected, performing login...');
      await emailInput.fill(SUPERADMIN_EMAIL);
      await passwordInput.fill(SUPERADMIN_PASSWORD);
      await page.click('button[type="submit"]');
      // Wait until header shows up after the app reloads itself
      await expect(header).toBeVisible({ timeout: 30000 });
      console.log('Login successful, main app loaded');
    } else {
      // Neither header nor login form visible; try one more reload
      console.log('Neither header nor login form visible yet; reloading root and retrying header check...');
      await page.goto(BASE_URL, { waitUntil: 'load' });
      await expect(header).toBeVisible({ timeout: 20000 });
    }
  }

  // Small settle time for client-side bootstrapping
  await page.waitForTimeout(500);

  // Verify we see the header element to confirm auth
  await expect(header).toBeVisible({ timeout: 10000 });

  // Persist storage for reuse by all projects
  await page.context().storageState({ path: authFile });
  console.log(`Auth state saved to ${authFile}`);
});
