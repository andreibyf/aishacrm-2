import { test } from '@playwright/experimental-ct-react';
// Note: LeadForm has complex dependencies (useTenant, useApiManager hooks)
// that require full context providers. Skipping until context wrapper is set up.
// For now, LeadForm is better tested via E2E tests.

test.describe('LeadForm - Component Tests', () => {
  test.skip('requires context providers - use E2E tests instead', async () => {
    // LeadForm uses:
    // - useTenant() hook - needs TenantProvider
    // - useApiManager() hook - needs ApiManagerProvider  
    // - cachedRequest for accounts/tags
    // These are better tested in E2E where the full app context exists.
  });
});
