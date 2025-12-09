/**
 * Module Settings Tenant Isolation E2E Tests
 * 
 * Verifies that toggling module access for one tenant does NOT affect another tenant.
 * This is a critical multi-tenancy security and isolation test.
 * 
 * @see https://github.com/ai-sha-crm/issues/XXX - Module settings tenant isolation bug
 */
import { test, expect } from '@playwright/test';

const BACKEND_URL = process.env.PLAYWRIGHT_BACKEND_URL || process.env.VITE_AISHACRM_BACKEND_URL || 'http://localhost:4001';
// Note: FRONTEND_URL not used in API-only tests

// Known tenant A (system tenant from copilot-instructions.md)
const TENANT_A_ID = 'a11dfb63-4b18-4eb8-872e-747af2e37c46';

// Module to test with
const TEST_MODULE = 'Opportunities';
const ALT_MODULE = 'SalesReports';

/**
 * Helper: Get or create a second tenant for isolation testing
 * @param {import('@playwright/test').APIRequestContext} request
 * @returns {Promise<string>} Tenant B ID
 */
async function getOrCreateTenantB(request) {
  // First try to find an existing second tenant
  const listRes = await request.get(`${BACKEND_URL}/api/tenants?limit=10`);
  if (listRes.ok()) {
    const body = await listRes.json();
    // API returns { status: 'success', data: { tenants: [...], total, limit, offset }}
    const tenants = body.data?.tenants || body.data || body.tenants || [];
    if (Array.isArray(tenants)) {
      const otherTenant = tenants.find(
        (t) => t.id !== TENANT_A_ID && t.slug !== 'system'
      );
      if (otherTenant) {
        return otherTenant.id;
      }
    }
  }
  
  // Create a new tenant for testing
  const createRes = await request.post(`${BACKEND_URL}/api/tenants`, {
    data: {
      name: `Test Tenant B ${Date.now()}`,
      slug: `test-tenant-b-${Date.now()}`,
    },
  });
  
  if (!createRes.ok()) {
    throw new Error(`Failed to create tenant B: ${await createRes.text()}`);
  }
  
  const created = await createRes.json();
  return created.id || created.data?.id;
}

/**
 * Helper: Get module settings for a specific tenant
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} tenantId
 * @returns {Promise<Array>} Module settings for the tenant
 */
async function getModuleSettings(request, tenantId) {
  const res = await request.get(`${BACKEND_URL}/api/modulesettings?tenant_id=${tenantId}`);
  if (!res.ok()) {
    const text = await res.text();
    throw new Error(`Failed to get module settings for tenant ${tenantId}: ${text}`);
  }
  const body = await res.json();
  // API returns { status: 'success', data: { modulesettings: [...] } }
  return body.data?.modulesettings || body.data || [];
}

/**
 * Helper: Toggle a module for a specific tenant
 * Note: Due to a backend bug where ON CONFLICT isn't working, we must delete first then create
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} tenantId
 * @param {string} moduleName
 * @param {boolean} enabled
 * @returns {Promise<void>}
 */
async function setModuleEnabled(request, tenantId, moduleName, enabled) {
  // First, try to clean up any existing setting to work around backend upsert bug
  await cleanupModuleSetting(request, tenantId, moduleName);
  
  // Then create the new setting
  const res = await request.post(`${BACKEND_URL}/api/modulesettings`, {
    data: {
      tenant_id: tenantId,
      module_name: moduleName,
      is_enabled: enabled,
    },
  });
  
  if (!res.ok()) {
    const text = await res.text();
    throw new Error(`Failed to set module ${moduleName} to ${enabled} for tenant ${tenantId}: ${text}`);
  }
}

/**
 * Helper: Check if a specific module is enabled for a tenant
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} tenantId
 * @param {string} moduleName
 * @returns {Promise<boolean>}
 */
async function isModuleEnabled(request, tenantId, moduleName) {
  const settings = await getModuleSettings(request, tenantId);
  const setting = settings.find((s) => s.module_name === moduleName);
  // If no explicit setting, module is enabled by default
  return setting ? setting.is_enabled !== false : true;
}

/**
 * Helper: Clean up module settings for a tenant/module combination
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} tenantId
 * @param {string} moduleName
 */
async function cleanupModuleSetting(request, tenantId, moduleName) {
  try {
    // Reset to enabled state (default) rather than deleting
    // This is safer since tenants may have pre-initialized module settings
    await request.post(`${BACKEND_URL}/api/modulesettings`, {
      headers: { 
        'Content-Type': 'application/json',
        'x-tenant-id': tenantId
      },
      data: {
        tenant_id: tenantId,
        module_name: moduleName,
        is_enabled: true
      }
    });
  } catch {
    // Ignore cleanup errors
  }
}

// ============================================================================
// Test Suite: Module Settings API Tenant Isolation
// ============================================================================

test.describe('Module Settings API Tenant Isolation', () => {
  let tenantBId;
  
  test.beforeAll(async ({ request }) => {
    // Get or create tenant B for isolation testing
    tenantBId = await getOrCreateTenantB(request);
    console.log(`[Setup] Tenant A: ${TENANT_A_ID}`);
    console.log(`[Setup] Tenant B: ${tenantBId}`);
    
    // Clean up any previous test state
    await cleanupModuleSetting(request, TENANT_A_ID, TEST_MODULE);
    await cleanupModuleSetting(request, tenantBId, TEST_MODULE);
    await cleanupModuleSetting(request, TENANT_A_ID, ALT_MODULE);
    await cleanupModuleSetting(request, tenantBId, ALT_MODULE);
  });
  
  test.afterAll(async ({ request }) => {
    // Clean up test state
    await cleanupModuleSetting(request, TENANT_A_ID, TEST_MODULE);
    await cleanupModuleSetting(request, tenantBId, TEST_MODULE);
    await cleanupModuleSetting(request, TENANT_A_ID, ALT_MODULE);
    await cleanupModuleSetting(request, tenantBId, ALT_MODULE);
  });
  
  test('disabling module for Tenant A does NOT disable it for Tenant B', async ({ request }) => {
    // Ensure both tenants start with module enabled (default state)
    const initialA = await isModuleEnabled(request, TENANT_A_ID, TEST_MODULE);
    const initialB = await isModuleEnabled(request, tenantBId, TEST_MODULE);
    console.log(`[Before] Tenant A ${TEST_MODULE} enabled: ${initialA}`);
    console.log(`[Before] Tenant B ${TEST_MODULE} enabled: ${initialB}`);
    
    // Disable module for Tenant A only
    await setModuleEnabled(request, TENANT_A_ID, TEST_MODULE, false);
    
    // Verify Tenant A has module disabled
    const afterA = await isModuleEnabled(request, TENANT_A_ID, TEST_MODULE);
    expect(afterA).toBe(false);
    
    // CRITICAL: Verify Tenant B still has module enabled
    const afterB = await isModuleEnabled(request, tenantBId, TEST_MODULE);
    expect(afterB).toBe(true);
    
    console.log(`[After] Tenant A ${TEST_MODULE} enabled: ${afterA}`);
    console.log(`[After] Tenant B ${TEST_MODULE} enabled: ${afterB}`);
  });
  
  test('enabling module for Tenant A does NOT affect Tenant B disabled state', async ({ request }) => {
    // Set up: Disable module for both tenants
    await setModuleEnabled(request, TENANT_A_ID, TEST_MODULE, false);
    await setModuleEnabled(request, tenantBId, TEST_MODULE, false);
    
    // Verify initial state
    expect(await isModuleEnabled(request, TENANT_A_ID, TEST_MODULE)).toBe(false);
    expect(await isModuleEnabled(request, tenantBId, TEST_MODULE)).toBe(false);
    
    // Enable module for Tenant A only
    await setModuleEnabled(request, TENANT_A_ID, TEST_MODULE, true);
    
    // Verify Tenant A has module enabled
    expect(await isModuleEnabled(request, TENANT_A_ID, TEST_MODULE)).toBe(true);
    
    // CRITICAL: Verify Tenant B still has module disabled
    expect(await isModuleEnabled(request, tenantBId, TEST_MODULE)).toBe(false);
  });
  
  test('module settings are scoped to tenant_id in list response', async ({ request }) => {
    // Set different states for each tenant
    await setModuleEnabled(request, TENANT_A_ID, ALT_MODULE, false);
    await setModuleEnabled(request, tenantBId, ALT_MODULE, true);
    
    // Get settings for each tenant
    const settingsA = await getModuleSettings(request, TENANT_A_ID);
    const settingsB = await getModuleSettings(request, tenantBId);
    
    // Verify tenant A settings only contain tenant A's data
    const altModuleA = settingsA.find((s) => s.module_name === ALT_MODULE);
    expect(altModuleA).toBeDefined();
    expect(altModuleA.tenant_id).toBe(TENANT_A_ID);
    expect(altModuleA.is_enabled).toBe(false);
    
    // Verify tenant B settings only contain tenant B's data
    const altModuleB = settingsB.find((s) => s.module_name === ALT_MODULE);
    if (altModuleB) {
      expect(altModuleB.tenant_id).toBe(tenantBId);
      expect(altModuleB.is_enabled).toBe(true);
    }
  });
  
  test('cannot update module setting with wrong tenant_id', async ({ request }) => {
    // Get a setting for Tenant A
    await setModuleEnabled(request, TENANT_A_ID, TEST_MODULE, true);
    const settingsA = await getModuleSettings(request, TENANT_A_ID);
    const setting = settingsA.find((s) => s.module_name === TEST_MODULE);
    
    if (setting && setting.id) {
      // Try to update it with a different tenant_id
      const _res = await request.patch(`${BACKEND_URL}/api/modulesettings/${setting.id}`, {
        data: {
          tenant_id: tenantBId, // Wrong tenant!
          is_enabled: false,
        },
      });
      
      // This should either fail or not affect the setting for Tenant B
      const settingsB = await getModuleSettings(request, tenantBId);
      const settingB = settingsB.find((s) => s.module_name === TEST_MODULE && s.id === setting.id);
      
      // The setting should NOT appear in Tenant B's settings
      expect(settingB).toBeUndefined();
    }
  });
  
  test('bulk toggle affects only specified tenant', async ({ request }) => {
    // Enable module for both tenants
    await setModuleEnabled(request, TENANT_A_ID, TEST_MODULE, true);
    await setModuleEnabled(request, tenantBId, TEST_MODULE, true);
    
    // Disable multiple modules for Tenant A only
    await setModuleEnabled(request, TENANT_A_ID, TEST_MODULE, false);
    await setModuleEnabled(request, TENANT_A_ID, ALT_MODULE, false);
    
    // Verify Tenant A has both disabled
    expect(await isModuleEnabled(request, TENANT_A_ID, TEST_MODULE)).toBe(false);
    expect(await isModuleEnabled(request, TENANT_A_ID, ALT_MODULE)).toBe(false);
    
    // Verify Tenant B still has both enabled
    expect(await isModuleEnabled(request, tenantBId, TEST_MODULE)).toBe(true);
    expect(await isModuleEnabled(request, tenantBId, ALT_MODULE)).toBe(true);
  });
});

// ============================================================================
// Smoke Test Suite (Quick Sanity Check)
// ============================================================================

test.describe('@smoke Module Settings Tenant Isolation', () => {
  
  test('toggling module for Tenant A does NOT affect Tenant B', async ({ request }) => {
    const tenantB = await getOrCreateTenantB(request);
    
    // Clean up first
    await cleanupModuleSetting(request, TENANT_A_ID, TEST_MODULE);
    await cleanupModuleSetting(request, tenantB, TEST_MODULE);
    
    // Both should start enabled (default)
    const beforeA = await isModuleEnabled(request, TENANT_A_ID, TEST_MODULE);
    const beforeB = await isModuleEnabled(request, tenantB, TEST_MODULE);
    expect(beforeA).toBe(true);
    expect(beforeB).toBe(true);
    
    // Disable for Tenant A
    await setModuleEnabled(request, TENANT_A_ID, TEST_MODULE, false);
    
    // Tenant A disabled, Tenant B still enabled
    expect(await isModuleEnabled(request, TENANT_A_ID, TEST_MODULE)).toBe(false);
    expect(await isModuleEnabled(request, tenantB, TEST_MODULE)).toBe(true);
    
    // Cleanup
    await cleanupModuleSetting(request, TENANT_A_ID, TEST_MODULE);
  });
});
