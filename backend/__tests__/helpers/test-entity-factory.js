/**
 * Test Entity Factory - Complete Suite
 *
 * Provides factory functions for creating ALL test entities with:
 * - Proper timestamp fields
 * - is_test_data flag set to true
 * - Test email patterns
 * - Consistent metadata
 *
 * Entities covered:
 * - Leads
 * - Contacts
 * - Accounts
 * - Opportunities
 * - Activities
 * - Employees
 * - Users
 *
 * Usage:
 *   import { TestFactory } from './helpers/test-entity-factory.js';
 *
 *   const lead = TestFactory.lead({ first_name: "John" });
 *   const employee = TestFactory.employee({ role: "Sales Rep" });
 */

function generateTestId() {
  return Math.random().toString(36).substring(2, 11);
}

function getNow() {
  return new Date().toISOString();
}

function getTenantId(overrides) {
  return (
    overrides.tenant_id ||
    process.env.TEST_TENANT_ID ||
    process.env.STAGING_TENANT_ID ||
    'test-tenant'
  );
}

function ensureTestEmail(email, defaultPrefix) {
  if (!email) {
    const testId = generateTestId();
    return `${defaultPrefix}-${testId}@example.com`;
  }
  // Force test domain if custom email provided
  if (!email.includes('@example.com') && !email.includes('@playwright.test')) {
    const localPart = email.split('@')[0];
    const testId = generateTestId();
    return `${localPart}-${testId}@example.com`;
  }
  return email;
}

/**
 * Base metadata for all test entities
 */
function getTestMetadata(additional = {}) {
  return {
    is_test_data: true,
    test_run_id: process.env.TEST_RUN_ID || process.env.GITHUB_RUN_ID || 'local-test',
    created_by_test: true,
    test_timestamp: getNow(),
    ...additional,
  };
}

/**
 * Lead Factory
 */
function createTestLead(overrides = {}) {
  const now = getNow();
  const testId = generateTestId();

  const defaults = {
    first_name: 'Test',
    last_name: `Lead-${testId}`,
    email: ensureTestEmail(overrides.email, 'lead-test'),
    company: 'Test Company',
    status: 'new',
    source: 'test',
    metadata: getTestMetadata(overrides.metadata),
    tenant_id: getTenantId(overrides),
  };

  return {
    ...defaults,
    ...overrides,
    // Force critical fields that must not be overridden
    is_test_data: true,
    created_at: overrides.created_at || now,
    created_date: overrides.created_date || now,
    updated_at: overrides.updated_at || now,
    updated_date: overrides.updated_date || now,
  };
}

/**
 * Contact Factory
 */
function createTestContact(overrides = {}) {
  const now = getNow();
  const testId = generateTestId();

  const defaults = {
    first_name: 'Test',
    last_name: `Contact-${testId}`,
    email: ensureTestEmail(overrides.email, 'contact-test'),
    phone: '+1-555-0100',
    metadata: getTestMetadata(overrides.metadata),
    tenant_id: getTenantId(overrides),
  };

  return {
    ...defaults,
    ...overrides,
    is_test_data: true,
    created_at: overrides.created_at || now,
    created_date: overrides.created_date || now,
    updated_at: overrides.updated_at || now,
    updated_date: overrides.updated_date || now,
  };
}

/**
 * Account Factory
 */
function createTestAccount(overrides = {}) {
  const now = getNow();
  const testId = generateTestId();

  const defaults = {
    name: `Test Account ${testId}`,
    industry: 'Technology',
    account_type: 'prospect',
    metadata: getTestMetadata(overrides.metadata),
    tenant_id: getTenantId(overrides),
  };

  return {
    ...defaults,
    ...overrides,
    is_test_data: true,
    created_at: overrides.created_at || now,
    created_date: overrides.created_date || now,
    updated_at: overrides.updated_at || now,
    updated_date: overrides.updated_date || now,
  };
}

/**
 * Opportunity Factory
 */
function createTestOpportunity(overrides = {}) {
  const now = getNow();
  const testId = generateTestId();
  const closeDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const defaults = {
    name: `Test Opportunity ${testId}`,
    stage: 'prospecting',
    amount: 10000,
    probability: 25,
    close_date: closeDate,
    metadata: getTestMetadata(overrides.metadata),
    tenant_id: getTenantId(overrides),
  };

  return {
    ...defaults,
    ...overrides,
    is_test_data: true,
    created_at: overrides.created_at || now,
    created_date: overrides.created_date || now,
    updated_at: overrides.updated_at || now,
    updated_date: overrides.updated_date || now,
  };
}

/**
 * Activity Factory
 */
function createTestActivity(overrides = {}) {
  const now = getNow();
  const testId = generateTestId();
  const dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const defaults = {
    subject: `Test Activity ${testId}`,
    type: 'task',
    status: 'pending',
    due_date: dueDate,
    metadata: getTestMetadata(overrides.metadata),
    tenant_id: getTenantId(overrides),
  };

  return {
    ...defaults,
    ...overrides,
    is_test_data: true,
    created_at: overrides.created_at || now,
    created_date: overrides.created_date || now,
    updated_at: overrides.updated_at || now,
    updated_date: overrides.updated_date || now,
  };
}

/**
 * Employee Factory
 */
function createTestEmployee(overrides = {}) {
  const now = getNow();
  const testId = generateTestId();

  const defaults = {
    first_name: 'Test',
    last_name: `Employee-${testId}`,
    email: ensureTestEmail(overrides.email, 'employee-test'),
    role: 'Test Role',
    status: 'active',
    metadata: getTestMetadata(overrides.metadata),
    tenant_id: getTenantId(overrides),
  };

  return {
    ...defaults,
    ...overrides,
    is_test_data: true,
    created_at: overrides.created_at || now,
    updated_at: overrides.updated_at || now,
  };
}

/**
 * User Factory
 */
function createTestUser(overrides = {}) {
  const now = getNow();
  const testId = generateTestId();

  const defaults = {
    email: ensureTestEmail(overrides.email, 'user-test'),
    first_name: 'Test',
    last_name: `User-${testId}`,
    role: 'user',
    metadata: getTestMetadata(overrides.metadata),
    tenant_id: getTenantId(overrides),
  };

  return {
    ...defaults,
    ...overrides,
    is_test_data: true,
    created_at: overrides.created_at || now,
    updated_at: overrides.updated_at || now,
  };
}

/**
 * Unified Test Factory
 */
export const TestFactory = {
  lead: createTestLead,
  contact: createTestContact,
  account: createTestAccount,
  opportunity: createTestOpportunity,
  activity: createTestActivity,
  employee: createTestEmployee,
  user: createTestUser,

  // Batch creation
  leads: (count, overrides = {}) =>
    Array.from({ length: count }, (_, i) =>
      createTestLead({ ...overrides, last_name: `Lead-${i + 1}` }),
    ),

  contacts: (count, overrides = {}) =>
    Array.from({ length: count }, (_, i) =>
      createTestContact({ ...overrides, last_name: `Contact-${i + 1}` }),
    ),

  employees: (count, overrides = {}) =>
    Array.from({ length: count }, (_, i) =>
      createTestEmployee({ ...overrides, last_name: `Employee-${i + 1}` }),
    ),
};

// Export individual factories
export {
  createTestLead,
  createTestContact,
  createTestAccount,
  createTestOpportunity,
  createTestActivity,
  createTestEmployee,
  createTestUser,
};

export default TestFactory;
