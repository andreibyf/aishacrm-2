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
  // Wait for page to load
  await page.waitForLoadState('domcontentloaded');
  
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
  
  // Small wait for React to process the user
  await page.waitForTimeout(500);
  
  // Wait for the spinner to disappear OR main content to appear (race condition)
  // Try waiting for no spinner first
  const spinnerGone = await page.waitForSelector('[class*="animate-spin"]', { 
    state: 'hidden', 
    timeout: 10000 
  }).then(() => true).catch(() => false);
  
  if (!spinnerGone) {
    console.log('[E2E] Spinner still present, checking if content loaded anyway...');
    // Maybe content is there despite spinner - check for buttons/table
    const hasContent = await page.locator('table, button:has-text("Add"), button:has-text("New")').first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    
    if (!hasContent) {
      // Last resort - reload page
      console.log('[E2E] No content found, reloading page...');
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
      await page.waitForTimeout(2000);
      // One more spinner wait attempt
      await page.waitForSelector('[class*="animate-spin"]', { state: 'hidden', timeout: 10000 }).catch(() => {});
    }
  }
  
  // Ensure main content exists
  await page.waitForSelector('table, button[class*=""], h1, h2', { timeout: 10000 });
  
  // Final settle time
  await page.waitForTimeout(1500);
}
