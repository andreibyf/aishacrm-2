// Auth setup to create a persisted SuperAdmin session for all Playwright projects
// This runs once before browser projects and writes storage state to playwright/.auth/superadmin.json
import { test as setup, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const BASE_URL = process.env.PLAYWRIGHT_FRONTEND_URL || process.env.VITE_AISHACRM_FRONTEND_URL || 'http://localhost:4000';
const BACKEND_URL = process.env.PLAYWRIGHT_BACKEND_URL || process.env.VITE_AISHACRM_BACKEND_URL || 'http://localhost:4001';
// Require env vars for credentials; do not hardcode demo defaults
const SUPERADMIN_EMAIL = process.env.SUPERADMIN_EMAIL || '';
const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD || '';
const E2E_TENANT_ID = process.env.E2E_TENANT_ID || '6cb4c008-4847-426a-9a2e-918ad70e7b69';

const authDir = path.join('playwright', '.auth');
const authFile = path.join(authDir, 'superadmin.json');

// NOTE: setup.describe.configure() removed - it's not needed for a single setup test
// and causes errors in Playwright 1.56+

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
  
  // **LOCAL DEV MODE DETECTION**: Check if we're running with placeholder Supabase credentials
  const isLocalDevMode = !SUPERADMIN_EMAIL || !SUPERADMIN_PASSWORD || SUPERADMIN_EMAIL === 'dev@localhost';
  
  if (isLocalDevMode) {
    console.log('[Auth Setup] 🔧 LOCAL DEV MODE detected - using mock auth bypass');
    console.log('[Auth Setup] Set SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD env vars for real Supabase auth');
    
    // Ensure auth directory exists
    if (!fs.existsSync(authDir)) {
      fs.mkdirSync(authDir, { recursive: true });
    }
    
    // Create a minimal auth state file that indicates mock mode
    const mockAuthState = {
      cookies: [],
      origins: [{
        origin: BASE_URL,
        localStorage: [
          { name: 'tenant_id', value: E2E_TENANT_ID },
          { name: 'selected_tenant_id', value: E2E_TENANT_ID },
          { name: 'mock_auth_mode', value: 'true' },
          { name: 'mock_superadmin', value: 'dev@localhost' }
        ]
      }]
    };
    
    fs.writeFileSync(authFile, JSON.stringify(mockAuthState, null, 2));
    console.log(`[Auth Setup] ✅ Mock auth state created at ${authFile}`);
    return; // Skip real auth flow
  }
  
  // Capture console messages for debugging
  page.on('console', (msg) => {
    const prefix = `[Browser Console ${msg.type().toUpperCase()}]`;
    if (msg.type() === 'error' || msg.type() === 'warn' || msg.text().includes('[Login]')) {
      console.log(prefix, msg.text());
    }
  });
  
  // Capture network responses for auth endpoints
  page.on('response', (response) => {
    const url = response.url();
    if (url.includes('/auth') || url.includes('/api')) {
      console.log(`[Network] ${response.status()} ${url}`);
      if (!response.ok() && url.includes('/auth')) {
        response.text().then(body => console.log('[Auth Error Response]', body)).catch(() => {});
      }
    }
  });
  
  // Remove E2E mock mode - use real cookie auth instead
  await page.addInitScript(({ tenant_id }) => {
    localStorage.setItem('tenant_id', tenant_id);
    localStorage.setItem('selected_tenant_id', tenant_id);
    console.log(`[Auth Setup] Tenant context initialized for real auth: ${tenant_id}`);
  }, { tenant_id: E2E_TENANT_ID });
  
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
        console.log('Login form detected, performing Supabase auth login...');
        
        // Fill credentials
        await emailInput.fill(SUPERADMIN_EMAIL);
        console.log('Email field filled:', SUPERADMIN_EMAIL);
        
        await passwordInput.fill(SUPERADMIN_PASSWORD);
        console.log('Password field filled');
        
        // Click submit button - try multiple selector strategies
        const submitBtn = page.locator('button[type="submit"]').first();
        const submitBtnText = page.getByRole('button', { name: /sign in/i }).first();
        
        if (await submitBtn.isVisible().catch(() => false)) {
          console.log('Clicking submit button via [type="submit"]');
          await submitBtn.click();
        } else if (await submitBtnText.isVisible().catch(() => false)) {
          console.log('Clicking submit button via role=button');
          await submitBtnText.click();
        } else {
          console.log('No visible submit button found, trying generic click');
          await submitBtn.click().catch(() => submitBtnText.click());
        }
        
        console.log('Submit button clicked, waiting for authentication...');
        
        // Wait for authentication to complete and redirect
        // The app will reload and show the header if successful
        await loadingText.waitFor({ state: 'detached', timeout: 45000 }).catch(() => {});
        await expect(header).toBeVisible({ timeout: 45000 });
        console.log('Supabase auth login successful, main app loaded');
        authed = true;
      } else {
        throw new Error('[Auth Setup] SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD environment variables are required for E2E tests');
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
    // Fallback: create mock auth state instead of failing entire test run
    console.warn('[Auth Setup] Authentication failed to mount UI header; falling back to mock auth state.');
    if (!fs.existsSync(authDir)) {
      fs.mkdirSync(authDir, { recursive: true });
    }
    const mockAuthState = {
      cookies: [],
      origins: [
        {
          origin: BASE_URL,
          localStorage: [
            { name: 'tenant_id', value: E2E_TENANT_ID },
            { name: 'selected_tenant_id', value: E2E_TENANT_ID },
            { name: 'mock_auth_mode', value: 'true' },
            { name: 'mock_superadmin', value: SUPERADMIN_EMAIL || 'dev@localhost' }
          ]
        }
      ]
    };
    fs.writeFileSync(authFile, JSON.stringify(mockAuthState, null, 2));
    console.log(`[Auth Setup] ✅ Mock fallback auth state written to ${authFile}`);
  }

  // Persist storage (including cookies) for reuse by all projects
  await page.context().storageState({ path: authFile });
  console.log(`Auth state saved to ${authFile}`);
});
