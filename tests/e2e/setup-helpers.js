/**
 * Shared E2E Test Setup Helpers
 * Common utilities to reduce boilerplate across all E2E specs
 */

/**
 * Suppress Supabase Auth errors in E2E environment.
 * Call this in beforeEach via page.addInitScript.
 */
export function suppressAuthErrors() {
  const originalError = console.error;
  console.error = (...args) => {
    const msg = args.join(' ');
    if (
      msg.includes('Auth session missing') ||
      msg.includes('AuthSessionMissingError') ||
      msg.includes('[Supabase Auth]')
    ) {
      return; // Suppress expected E2E auth errors
    }
    originalError.apply(console, args);
  };
}

/**
 * Mark environment as E2E test mode to disable background polling.
 */
export function setE2EMode() {
  localStorage.setItem('E2E_TEST_MODE', 'true');
}

/**
 * Inject a mock user for E2E tests (bypasses actual auth flows).
 * @param {string} email - User email
 * @param {string} role - User role (e.g., 'superadmin', 'admin', 'user')
 * @param {string} tenantId - Tenant ID for the mock user
 */
export function injectMockUser(email = 'e2e@example.com', role = 'superadmin', tenantId = 'local-tenant-001') {
  window.__e2eUser = {
    id: 'e2e-test-user-id',
    email,
    role,
    tenant_id: tenantId
  };
}

/**
 * Wait for a page that requires user to be loaded (shows spinner until user is set).
 * Re-injects E2E user if missing and waits for spinner to disappear.
 * Use this after navigating to pages like Activities, Leads, Contacts, Opportunities.
 * 
 * @param {Page} page - Playwright page object
 * @param {string} email - E2E user email
 */
export async function waitForUserPage(page, email = 'e2e@example.com') {
  console.log('[waitForUserPage] Starting...');
  
  // Wait for page to load
  await page.waitForLoadState('domcontentloaded');
  console.log('[waitForUserPage] DOM content loaded');
  
  // CRITICAL: Re-inject E2E user IMMEDIATELY before React mounts
  await page.evaluate((userEmail) => {
    console.log('[E2E] Setting __e2eUser before React checks for it');
    window.__e2eUser = {
      id: 'e2e-test-user-id',
      email: userEmail || 'e2e@example.com',
      role: 'superadmin',
      tenant_id: 'local-tenant-001'
    };
    localStorage.setItem('E2E_TEST_MODE', 'true');
  }, email);
  console.log('[waitForUserPage] User injected');
  
  // Wait for React to process - increased from 500ms to 2000ms
  await page.waitForTimeout(2000);
  console.log('[waitForUserPage] After 2s settle');
  
  // Wait for the spinner to disappear OR main content to appear
  const spinnerGone = await page.waitForSelector('[class*="animate-spin"]', { 
    state: 'hidden', 
    timeout: 15000  // Increased from 10s to 15s
  }).then(() => true).catch(() => {
    console.log('[waitForUserPage] Spinner wait timeout');
    return false;
  });
  
  if (spinnerGone) {
    console.log('[waitForUserPage] Spinner disappeared');
  } else {
    console.log('[waitForUserPage] Spinner still present, checking for content...');
    // Maybe content is there despite spinner - check for buttons/table
    const hasContent = await page.locator('table, button:has-text("Add"), button:has-text("New")').first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    
    if (hasContent) {
      console.log('[waitForUserPage] Content found despite spinner');
    } else {
      // Last resort - reload page
      console.log('[waitForUserPage] No content found, reloading page...');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.evaluate((userEmail) => {
        window.__e2eUser = {
          id: 'e2e-test-user-id',
          email: userEmail || 'e2e@example.com',
          role: 'superadmin',
          tenant_id: 'local-tenant-001'
        };
        localStorage.setItem('E2E_TEST_MODE', 'true');
      }, email);
      await page.waitForTimeout(3000);  // Longer wait after reload
      // One more spinner wait attempt
      await page.waitForSelector('[class*="animate-spin"]', { state: 'hidden', timeout: 15000 }).catch(() => {
        console.log('[waitForUserPage] Spinner still visible after reload');
      });
    }
  }
  
  // Wait for the primary content region to be visible (more reliable than a broad selector)
  // Prefer the main landmark to avoid matching a hidden button as the first element
  await page.locator('main, [role="main"]').first().waitFor({ state: 'visible', timeout: 15000 });
  console.log('[waitForUserPage] Main content visible');
  
  // Final settle time - increased from 1500ms to 3000ms
  await page.waitForTimeout(3000);
  console.log('[waitForUserPage] Complete');
}
