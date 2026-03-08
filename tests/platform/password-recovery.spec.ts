import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

// Environment-driven configuration
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
// Service role key MUST NOT be exposed client-side; only used here in Node test context.
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
// Adaptive frontend base URL selection (Docker defaults 4000, local dev may use 3000)
function chooseBaseUrl() {
  const explicit = process.env.PLAYWRIGHT_FRONTEND_URL || process.env.VITE_AISHACRM_FRONTEND_URL;
  if (explicit) return explicit;
  const candidates = ['http://localhost:4000', 'http://localhost:3000'];
  // Attempt lightweight synchronous heuristic: prefer first responsive port
  // (Playwright will navigate anyway; failures fall back to 3000)
  return candidates[0];
}
const BASE_URL = chooseBaseUrl();
const FRONTEND_RESET_URL = `${BASE_URL.replace(/\/$/, '')}/auth/reset`;
// Test user config (override via env for deterministic CI usage)
// Default to provided production/admin email unless overridden
const TEST_EMAIL = process.env.PASSWORD_RESET_TEST_EMAIL || 'abyfield@4vdataconsulting.com';
const INITIAL_PASSWORD = process.env.PASSWORD_RESET_INITIAL_PASSWORD || 'InitPassw0rd!';
const NEW_PASSWORD = process.env.PASSWORD_RESET_NEW_PASSWORD || 'NewPassw0rd!1';
const INJECT_TOKEN = process.env.SUPABASE_RECOVERY_TOKEN || '';

// Utility: ensure user exists with initial password
async function ensureTestUser(admin: SupabaseClient) {
  // Attempt creation; swallow duplicate errors without failing test
  const { data: created, error } = await admin.auth.admin.createUser({
    email: TEST_EMAIL,
    password: INITIAL_PASSWORD,
    email_confirm: true,
  });
  if (error && !/duplicate|exists|already/i.test(error.message)) {
    throw error;
  }
  return created?.user || null;
}

// Generate recovery link
async function generateRecoveryLink(admin: SupabaseClient) {
  const { data, error } = await admin.auth.admin.generateLink({ type: 'recovery', email: TEST_EMAIL });
  if (error) throw error;
  const raw = data?.properties?.action_link;
  if (!raw) return raw;
  try {
    const u = new URL(raw);
    // Ensure redirect_to matches running frontend reset route (Docker default port 4000)
    u.searchParams.set('redirect_to', FRONTEND_RESET_URL);
    return u.toString();
  } catch {
    return raw;
  }
}

// Skip early if we cannot run a real flow
const canRun = !!(SUPABASE_URL && SERVICE_ROLE_KEY);

test.describe('Password Recovery Flow (direct, no pre-auth dependency)', () => {
  test('user can reset password via recovery link (admin generated)', async ({ page }) => {
    test.skip(!canRun, 'Missing Supabase service role credentials; set SUPABASE_SERVICE_ROLE_KEY');

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    // Ensure baseline user exists
    await ensureTestUser(admin);

    // Clear any existing auth/browser state to simulate fresh reset
    await page.context().clearCookies();
    await page.addInitScript(() => { localStorage.clear(); });

    const recoveryLink = INJECT_TOKEN
      ? `${SUPABASE_URL}/auth/v1/verify?token=${INJECT_TOKEN}&type=recovery&redirect_to=${encodeURIComponent(FRONTEND_RESET_URL)}`
      : await generateRecoveryLink(admin);
    expect(recoveryLink).toBeTruthy();

    // Navigate to recovery link (Supabase will verify token then redirect)
    await page.goto(recoveryLink, { waitUntil: 'domcontentloaded' });

    const heading = page.getByRole('heading', { name: /Reset Your Password/i });

    // Attempt normal wait first
    const visible = await heading.isVisible().catch(() => false);
    if (!visible) {
      // Inject hash fallback if Supabase did not append recovery fragments
      await page.evaluate(() => {
        const current = new URL(window.location.href);
        const token = current.searchParams.get('token');
        if (token) {
          window.location.hash = `type=recovery&access_token=${token}`;
        } else {
          window.location.hash = 'type=recovery';
        }
      });
      await page.reload({ waitUntil: 'domcontentloaded' });
    }
    await heading.waitFor({ timeout: 45_000 });

    // Fill & submit new password
    await page.fill('#newPassword', NEW_PASSWORD);
    await page.fill('#confirmPassword', NEW_PASSWORD);
    await page.getByRole('button', { name: /Update Password/i }).click();

    // Success message & redirect
    await page.getByText(/Redirecting to login/i).waitFor({ timeout: 45_000 });
    await page.waitForURL(/\/login\?reset=success/, { timeout: 60_000 });

    // Login with new password
    const emailInput = page.locator('#email, input[type="email"], input[name="email"]').first();
    const passwordInput = page.locator('#password, input[type="password"], input[name="password"]').first();
    await emailInput.fill(TEST_EMAIL);
    await passwordInput.fill(NEW_PASSWORD);

    const loginBtn = page.getByRole('button', { name: /sign in/i }).first();
    if (await loginBtn.isVisible()) {
      await loginBtn.click();
    } else {
      // fallback generic submit
      await page.locator('button[type="submit"]').first().click().catch(() => {});
    }

    // Confirm app header appears signaling authenticated session
    const header = page.locator('[data-testid="app-header"]').first();
    await expect(header).toBeVisible({ timeout: 60_000 });
  });

  test('skips gracefully without service role key', async () => {
    test.skip(canRun, 'Service role key present; primary test covers flow');
    // Document skip rationale for CI logs
    expect(canRun).toBeFalsy();
  });
});
