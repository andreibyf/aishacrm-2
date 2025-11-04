// Auth setup to create a persisted SuperAdmin session for all Playwright projects
// This runs once before browser projects and writes storage state to playwright/.auth/superadmin.json
import { test as setup, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const BASE_URL = process.env.VITE_AISHACRM_FRONTEND_URL || 'http://localhost:5173';
const BACKEND_URL = process.env.VITE_AISHACRM_BACKEND_URL || 'http://localhost:3001';
// Require env vars for credentials; do not hardcode demo defaults
const SUPERADMIN_EMAIL = process.env.SUPERADMIN_EMAIL || '';
const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD || '';

const authDir = path.join('playwright', '.auth');
const authFile = path.join(authDir, 'superadmin.json');

setup.describe.configure({ mode: 'serial' });

async function waitForBackendReady(request, { timeout = 90_000 } = {}) {
  // Poll backend status until DB is ready (not an error)
  await expect
    .poll(
      async () => {
        try {
          const res = await request.get(`${BACKEND_URL}/api/system/status`, { timeout: 5000 });
          if (!res.ok()) return 'not-ok';
          const body = await res.json().catch(() => null);
          const db = String(body?.data?.database || '');
          return db && !/^error:/i.test(db) ? 'ready' : 'db-error';
        } catch {
          return 'net-error';
        }
      },
      { timeout, intervals: [500, 1000, 2000, 3000] }
    )
    .toBe('ready');
}

setup('authenticate as superadmin', async ({ page, request }) => {
  // Extend timeouts for cloud deployments where cold starts can be slow
  setup.setTimeout(180_000);
  page.setDefaultNavigationTimeout(120_000);
  
  // Set up E2E mode via addInitScript BEFORE any navigation
  await page.addInitScript(() => {
    localStorage.setItem('E2E_TEST_MODE', 'true');
    window.__e2eUser = {
      id: 'e2e-test-user-id',
      email: 'e2e@example.com',
      role: 'superadmin',
      tenant_id: 'local-tenant-001'
    };
    console.log('[Auth Setup] E2E mode enabled, mock user injected');
  });
  
  // If running against a remote backend, block until DB is healthy to avoid transient 401/500 noise
  try {
    await waitForBackendReady(request, { timeout: 120_000 });
  } catch {
    // Non-fatal: proceed, UI may still warm up; tests can retry as needed
    console.warn('[Auth Setup] Backend not fully ready, proceeding with login');
  }
  // Ensure auth directory exists
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  // Warm up frontend endpoints to reduce first navigation flakiness
  try { await request.get(BASE_URL, { timeout: 15_000 }); } catch { /* warmup ignore */ }
  try { await request.get(`${BASE_URL}/env.js`, { timeout: 15_000 }); } catch { /* warmup ignore */ }

  // Navigate to app root and then resolve state: header (already logged in) or login form (sign in)
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

  // If the app shows an intermediate loading screen, wait for it to disappear first
  const loadingText = page.locator('text=Loading user data...');
  await loadingText.waitFor({ state: 'detached', timeout: 45000 }).catch(() => {});

  const header = page.locator('[data-testid="app-header"]').first();
  const emailInput = page.locator('#email, input[type="email"], input[name="email"]').first();
  const passwordInput = page.locator('#password, input[type="password"], input[name="password"]').first();

  // Quick check: if header is visible, we're already authenticated
  let authed = await header.isVisible().catch(() => false);
  if (authed) {
    console.log('Header visible – session already authenticated.');
  } else {
    // Try to detect the login form properly (use wait APIs instead of isVisible timeout)
    let didFindLogin = false;
    try {
      await emailInput.waitFor({ state: 'visible', timeout: 30000 });
      didFindLogin = true;
    } catch {
      didFindLogin = false;
    }

    if (didFindLogin) {
      if (SUPERADMIN_EMAIL && SUPERADMIN_PASSWORD) {
        console.log('Login form detected, performing login...');
        await emailInput.fill(SUPERADMIN_EMAIL);
        await passwordInput.fill(SUPERADMIN_PASSWORD);
        await page.click('button[type="submit"]');
        // After submit, give the app time to authenticate and mount the layout header
        await loadingText.waitFor({ state: 'detached', timeout: 45000 }).catch(() => {});
        await expect(header).toBeVisible({ timeout: 45000 });
        console.log('Login successful, main app loaded');
        authed = true;
      } else {
        console.warn('[Auth Setup] SUPERADMIN_EMAIL/PASSWORD not provided; skipping login.');
      }
    } else {
      // Neither header nor login form visible; try one more reload
      console.log('Neither header nor login form visible yet; reloading root and retrying header check...');
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
      await loadingText.waitFor({ state: 'detached', timeout: 45000 }).catch(() => {});
      authed = await header.isVisible().catch(() => false);
    }
  }

  // Wait for main navigation as a signal that user context finished mounting
  const mainNav = page.getByTestId('main-navigation');
  await mainNav.waitFor({ timeout: 20_000 }).catch(() => {});

  // Small settle time for client-side bootstrapping
  await page.waitForTimeout(500);

  // Verify we see the header element to confirm auth
  if (authed) {
    await expect(header).toBeVisible({ timeout: 20000 });
  } else {
    console.warn('[Auth Setup] Proceeding without persisted auth state (no credentials provided).');
  }

  // Persist storage for reuse by all projects
  await page.context().storageState({ path: authFile });
  console.log(`Auth state saved to ${authFile}`);
});
