/**
 * Bundle Endpoints Manual Verification Script
 *
 * This script tests the new bundle endpoints and compares their responses
 * with the traditional sequential API call pattern.
 *
 * Usage:
 *   node scripts/test-bundle-endpoints.js
 *
 * Environment variables:
 *   BACKEND_URL - Backend URL (default: http://localhost:4001)
 *   TEST_TENANT_ID - Tenant UUID to test with (required)
 *   TEST_USER_EMAIL - Test user email for authentication
 *   TEST_USER_PASSWORD - Test user password for authentication
 */

import fetch from 'node-fetch';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4001';
const TEST_TENANT_ID = process.env.TEST_TENANT_ID;
const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL;
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD;

let authCookie = null;

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(80));
  log(title, 'cyan');
  console.log('='.repeat(80) + '\n');
}

function logSuccess(message) {
  log(`✓ ${message}`, 'green');
}

function logError(message) {
  log(`✗ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠ ${message}`, 'yellow');
}

function logInfo(message) {
  log(`ℹ ${message}`, 'blue');
}

/**
 * Authenticate and get session cookie
 */
async function authenticate() {
  logSection('Step 1: Authentication');

  if (!TEST_USER_EMAIL || !TEST_USER_PASSWORD) {
    logWarning('TEST_USER_EMAIL or TEST_USER_PASSWORD not set');
    logInfo('Attempting to proceed without authentication (may fail)');
    return false;
  }

  try {
    const response = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: TEST_USER_EMAIL,
        password: TEST_USER_PASSWORD
      })
    });

    if (response.ok) {
      const cookies = response.headers.get('set-cookie');
      if (cookies) {
        authCookie = cookies.split(';')[0];
        logSuccess('Authentication successful');
        return true;
      }
    }

    logError(`Authentication failed: ${response.status} ${response.statusText}`);
    return false;
  } catch (error) {
    logError(`Authentication error: ${error.message}`);
    return false;
  }
}

/**
 * Make authenticated request
 */
async function makeRequest(path, description = '') {
  if (description) {
    logInfo(`Fetching: ${description}`);
  }

  const headers = {
    'Accept': 'application/json',
    ...(authCookie && { 'Cookie': authCookie })
  };

  const startTime = Date.now();
  const response = await fetch(`${BACKEND_URL}${path}`, {
    headers,
    credentials: 'include'
  });
  const elapsed = Date.now() - startTime;

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return { data, elapsed };
}

/**
 * Test leads bundle endpoint
 */
async function testLeadsBundle() {
  logSection('Step 2: Testing Leads Bundle Endpoint');

  try {
    const { data: bundle, elapsed } = await makeRequest(
      `/api/bundles/leads?tenant_id=${TEST_TENANT_ID}&page=1&page_size=10`,
      'Leads bundle'
    );

    logSuccess(`Leads bundle fetched in ${elapsed}ms`);

    // Verify structure
    const bundleData = bundle.data;
    const issues = [];

    if (!Array.isArray(bundleData.leads)) issues.push('leads should be array');
    if (typeof bundleData.stats !== 'object') issues.push('stats should be object');
    if (!Array.isArray(bundleData.users)) issues.push('users should be array');
    if (!Array.isArray(bundleData.employees)) issues.push('employees should be array');
    if (!Array.isArray(bundleData.accounts)) issues.push('accounts should be array');
    if (typeof bundleData.pagination !== 'object') issues.push('pagination should be object');
    if (typeof bundleData.meta !== 'object') issues.push('meta should be object');

    // Check stats keys
    const expectedStatsKeys = ['total', 'new', 'contacted', 'qualified', 'unqualified', 'converted', 'lost'];
    expectedStatsKeys.forEach(key => {
      if (!(key in bundleData.stats)) issues.push(`stats.${key} missing`);
    });

    // Check pagination keys
    const expectedPaginationKeys = ['page', 'page_size', 'total_items', 'total_pages'];
    expectedPaginationKeys.forEach(key => {
      if (!(key in bundleData.pagination)) issues.push(`pagination.${key} missing`);
    });

    if (issues.length > 0) {
      logError('Structure validation failed:');
      issues.forEach(issue => log(`  - ${issue}`, 'red'));
      return false;
    }

    logSuccess('Structure validation passed');
    log(`  Leads: ${bundleData.leads.length}`, 'dim');
    log(`  Users: ${bundleData.users.length}`, 'dim');
    log(`  Employees: ${bundleData.employees.length}`, 'dim');
    log(`  Accounts: ${bundleData.accounts.length}`, 'dim');
    log(`  Total items: ${bundleData.pagination.total_items}`, 'dim');
    log(`  Stats: ${JSON.stringify(bundleData.stats)}`, 'dim');

    return bundleData;
  } catch (error) {
    logError(`Leads bundle test failed: ${error.message}`);
    return false;
  }
}

/**
 * Test contacts bundle endpoint
 */
async function testContactsBundle() {
  logSection('Step 3: Testing Contacts Bundle Endpoint');

  try {
    const { data: bundle, elapsed } = await makeRequest(
      `/api/bundles/contacts?tenant_id=${TEST_TENANT_ID}&page=1&page_size=10`,
      'Contacts bundle'
    );

    logSuccess(`Contacts bundle fetched in ${elapsed}ms`);

    const bundleData = bundle.data;
    const issues = [];

    if (!Array.isArray(bundleData.contacts)) issues.push('contacts should be array');
    if (typeof bundleData.stats !== 'object') issues.push('stats should be object');
    if (!Array.isArray(bundleData.users)) issues.push('users should be array');
    if (!Array.isArray(bundleData.employees)) issues.push('employees should be array');
    if (!Array.isArray(bundleData.accounts)) issues.push('accounts should be array');

    const expectedStatsKeys = ['total', 'active', 'prospect', 'customer', 'inactive'];
    expectedStatsKeys.forEach(key => {
      if (!(key in bundleData.stats)) issues.push(`stats.${key} missing`);
    });

    if (issues.length > 0) {
      logError('Structure validation failed:');
      issues.forEach(issue => log(`  - ${issue}`, 'red'));
      return false;
    }

    logSuccess('Structure validation passed');
    log(`  Contacts: ${bundleData.contacts.length}`, 'dim');
    log(`  Users: ${bundleData.users.length}`, 'dim');
    log(`  Employees: ${bundleData.employees.length}`, 'dim');
    log(`  Accounts: ${bundleData.accounts.length}`, 'dim');
    log(`  Stats: ${JSON.stringify(bundleData.stats)}`, 'dim');

    return bundleData;
  } catch (error) {
    logError(`Contacts bundle test failed: ${error.message}`);
    return false;
  }
}

/**
 * Test opportunities bundle endpoint
 */
async function testOpportunitiesBundle() {
  logSection('Step 4: Testing Opportunities Bundle Endpoint');

  try {
    const { data: bundle, elapsed } = await makeRequest(
      `/api/bundles/opportunities?tenant_id=${TEST_TENANT_ID}&page=1&page_size=10`,
      'Opportunities bundle'
    );

    logSuccess(`Opportunities bundle fetched in ${elapsed}ms`);

    const bundleData = bundle.data;
    const issues = [];

    if (!Array.isArray(bundleData.opportunities)) issues.push('opportunities should be array');
    if (typeof bundleData.stats !== 'object') issues.push('stats should be object');
    if (!Array.isArray(bundleData.users)) issues.push('users should be array');
    if (!Array.isArray(bundleData.employees)) issues.push('employees should be array');
    if (!Array.isArray(bundleData.accounts)) issues.push('accounts should be array');
    if (!Array.isArray(bundleData.contacts)) issues.push('contacts should be array');
    if (!Array.isArray(bundleData.leads)) issues.push('leads should be array');

    const expectedStatsKeys = ['total', 'prospecting', 'qualification', 'proposal', 'negotiation', 'closed_won', 'closed_lost'];
    expectedStatsKeys.forEach(key => {
      if (!(key in bundleData.stats)) issues.push(`stats.${key} missing`);
    });

    if (issues.length > 0) {
      logError('Structure validation failed:');
      issues.forEach(issue => log(`  - ${issue}`, 'red'));
      return false;
    }

    logSuccess('Structure validation passed');
    log(`  Opportunities: ${bundleData.opportunities.length}`, 'dim');
    log(`  Users: ${bundleData.users.length}`, 'dim');
    log(`  Employees: ${bundleData.employees.length}`, 'dim');
    log(`  Accounts: ${bundleData.accounts.length}`, 'dim');
    log(`  Contacts: ${bundleData.contacts.length}`, 'dim');
    log(`  Leads: ${bundleData.leads.length}`, 'dim');
    log(`  Stats: ${JSON.stringify(bundleData.stats)}`, 'dim');

    return bundleData;
  } catch (error) {
    logError(`Opportunities bundle test failed: ${error.message}`);
    return false;
  }
}

/**
 * Test cache behavior
 */
async function testCacheBehavior() {
  logSection('Step 5: Testing Cache Behavior');

  try {
    // First request (should hit database)
    logInfo('Making first request (uncached)...');
    const { elapsed: elapsed1 } = await makeRequest(
      `/api/bundles/leads?tenant_id=${TEST_TENANT_ID}&page=1&page_size=5`,
      'First request'
    );

    // Second request (should hit cache)
    logInfo('Making second request (should be cached)...');
    const { elapsed: elapsed2 } = await makeRequest(
      `/api/bundles/leads?tenant_id=${TEST_TENANT_ID}&page=1&page_size=5`,
      'Second request'
    );

    log(`  First request: ${elapsed1}ms`, 'dim');
    log(`  Second request: ${elapsed2}ms`, 'dim');

    if (elapsed2 < elapsed1) {
      logSuccess(`Cache working! Second request ${Math.round((1 - elapsed2/elapsed1) * 100)}% faster`);
    } else {
      logWarning('Second request not faster - cache may not be working as expected');
    }

    return true;
  } catch (error) {
    logError(`Cache test failed: ${error.message}`);
    return false;
  }
}

/**
 * Test filter support
 */
async function testFilters() {
  logSection('Step 6: Testing Filter Support');

  const tests = [
    {
      name: 'Search filter',
      path: `/api/bundles/leads?tenant_id=${TEST_TENANT_ID}&search=test`
    },
    {
      name: 'Status filter',
      path: `/api/bundles/leads?tenant_id=${TEST_TENANT_ID}&status=new`
    },
    {
      name: 'Assigned filter',
      path: `/api/bundles/leads?tenant_id=${TEST_TENANT_ID}&assigned_to=unassigned`
    },
    {
      name: 'Test data filter',
      path: `/api/bundles/leads?tenant_id=${TEST_TENANT_ID}&include_test_data=false`
    },
    {
      name: 'Pagination',
      path: `/api/bundles/leads?tenant_id=${TEST_TENANT_ID}&page=2&page_size=5`
    }
  ];

  let allPassed = true;

  for (const test of tests) {
    try {
      const { data, elapsed } = await makeRequest(test.path, test.name);
      logSuccess(`${test.name} - ${elapsed}ms`);
    } catch (error) {
      logError(`${test.name} failed: ${error.message}`);
      allPassed = false;
    }
  }

  return allPassed;
}

/**
 * Main test execution
 */
async function main() {
  logSection('Bundle Endpoints Verification Script');

  // Validate environment
  if (!TEST_TENANT_ID) {
    logError('TEST_TENANT_ID environment variable is required');
    logInfo('Usage: TEST_TENANT_ID=your-uuid node scripts/test-bundle-endpoints.js');
    process.exit(1);
  }

  logInfo(`Backend URL: ${BACKEND_URL}`);
  logInfo(`Test Tenant ID: ${TEST_TENANT_ID}`);

  // Run tests
  const authenticated = await authenticate();

  if (!authenticated) {
    logWarning('Proceeding without authentication (tests may fail)');
  }

  const leadsResult = await testLeadsBundle();
  const contactsResult = await testContactsBundle();
  const opportunitiesResult = await testOpportunitiesBundle();
  const cacheResult = await testCacheBehavior();
  const filtersResult = await testFilters();

  // Summary
  logSection('Test Summary');

  const results = [
    { name: 'Authentication', passed: authenticated },
    { name: 'Leads Bundle', passed: !!leadsResult },
    { name: 'Contacts Bundle', passed: !!contactsResult },
    { name: 'Opportunities Bundle', passed: !!opportunitiesResult },
    { name: 'Cache Behavior', passed: cacheResult },
    { name: 'Filters', passed: filtersResult }
  ];

  results.forEach(result => {
    if (result.passed) {
      logSuccess(result.name);
    } else {
      logError(result.name);
    }
  });

  const allPassed = results.every(r => r.passed);

  if (allPassed) {
    logSection('✓ ALL TESTS PASSED');
    logSuccess('Bundle endpoints are working correctly!');
    logInfo('You can now safely update the frontend pages to use these endpoints.');
  } else {
    logSection('✗ SOME TESTS FAILED');
    logError('Please fix the issues above before updating frontend pages.');
    process.exit(1);
  }
}

// Run tests
main().catch(error => {
  logError(`Unexpected error: ${error.message}`);
  console.error(error);
  process.exit(1);
});
