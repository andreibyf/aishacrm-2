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
