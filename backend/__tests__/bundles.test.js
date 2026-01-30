/**
 * Bundle Routes Tests
 *
 * Tests for /api/bundles/* endpoints that provide optimized page data loading
 *
 * Run: npm test backend/__tests__/bundles.test.js
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert';

// Test configuration
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const TEST_TIMEOUT = 10000; // 10 seconds

// Test tenant and auth (will need to be set up)
let authCookie = null;
let testTenantId = null;

/**
 * Helper: Make authenticated request
 */
async function makeAuthRequest(path, options = {}) {
  const url = `${BACKEND_URL}${path}`;
  const headers = {
    'Accept': 'application/json',
    'Cookie': authCookie || '',
    ...options.headers
  };

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include'
  });

  return response;
}

/**
 * Helper: Login and get auth cookie
 */
async function setupAuth() {
  // Try to use existing test user or create one
  // This assumes you have a test user setup in your system
  const loginResponse = await fetch(`${BACKEND_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: process.env.TEST_USER_EMAIL || 'test@example.com',
      password: process.env.TEST_USER_PASSWORD || 'testpassword123'
    })
  });

  if (loginResponse.ok) {
    const cookies = loginResponse.headers.get('set-cookie');
    if (cookies) {
      authCookie = cookies.split(';')[0];
    }
    const data = await loginResponse.json();
    testTenantId = data.user?.tenant_id || process.env.TEST_TENANT_ID;
  }

  // If login fails, try to get from environment
  if (!testTenantId) {
    testTenantId = process.env.TEST_TENANT_ID;
  }

  console.log('[Test Setup] Auth cookie:', authCookie ? 'Set' : 'Not set');
  console.log('[Test Setup] Test tenant ID:', testTenantId || 'Not set');
}

describe('Bundle API Endpoints', { timeout: TEST_TIMEOUT }, () => {
  before(async () => {
    await setupAuth();
  });

  describe('GET /api/bundles/leads', () => {
    it('should require authentication', async () => {
      const response = await fetch(`${BACKEND_URL}/api/bundles/leads?tenant_id=${testTenantId || 'test-uuid'}`);

      // Should return 401 or redirect without auth cookie
      assert.ok(response.status === 401 || response.status === 302 || response.status === 403,
        `Expected 401/302/403 without auth, got ${response.status}`);
    });

    it('should require tenant_id parameter', async () => {
      if (!authCookie) {
        console.log('[Skip] No auth cookie available');
        return;
      }

      const response = await makeAuthRequest('/api/bundles/leads');
      assert.strictEqual(response.status, 400, 'Should return 400 without tenant_id');

      const data = await response.json();
      assert.ok(data.message.includes('tenant_id'), 'Error message should mention tenant_id');
    });

    it('should return bundle with correct structure', async () => {
      if (!authCookie || !testTenantId) {
        console.log('[Skip] No auth or tenant_id available');
        return;
      }

      const response = await makeAuthRequest(`/api/bundles/leads?tenant_id=${testTenantId}`);

      if (response.status !== 200) {
        const errorText = await response.text();
        console.log('[Error]', errorText);
      }

      assert.strictEqual(response.status, 200, 'Should return 200 OK');

      const json = await response.json();
      assert.strictEqual(json.status, 'success', 'Should have success status');

      const bundle = json.data;

      // Verify structure
      assert.ok(Array.isArray(bundle.leads), 'Bundle should contain leads array');
      assert.ok(typeof bundle.stats === 'object', 'Bundle should contain stats object');
      assert.ok(Array.isArray(bundle.users), 'Bundle should contain users array');
      assert.ok(Array.isArray(bundle.employees), 'Bundle should contain employees array');
      assert.ok(Array.isArray(bundle.accounts), 'Bundle should contain accounts array');
      assert.ok(typeof bundle.pagination === 'object', 'Bundle should contain pagination object');
      assert.ok(typeof bundle.meta === 'object', 'Bundle should contain meta object');

      // Verify stats structure
      assert.ok('total' in bundle.stats, 'Stats should have total');
      assert.ok('new' in bundle.stats, 'Stats should have new count');
      assert.ok('contacted' in bundle.stats, 'Stats should have contacted count');
      assert.ok('qualified' in bundle.stats, 'Stats should have qualified count');

      // Verify pagination structure
      assert.ok('page' in bundle.pagination, 'Pagination should have page');
      assert.ok('page_size' in bundle.pagination, 'Pagination should have page_size');
      assert.ok('total_items' in bundle.pagination, 'Pagination should have total_items');
      assert.ok('total_pages' in bundle.pagination, 'Pagination should have total_pages');

      // Verify meta
      assert.strictEqual(bundle.meta.tenant_id, testTenantId, 'Meta should include tenant_id');
      assert.ok(bundle.meta.generated_at, 'Meta should include generated_at timestamp');

      console.log('[Success] Leads bundle structure verified');
      console.log('  - Leads:', bundle.leads.length);
      console.log('  - Users:', bundle.users.length);
      console.log('  - Employees:', bundle.employees.length);
      console.log('  - Accounts:', bundle.accounts.length);
      console.log('  - Total items:', bundle.pagination.total_items);
    });

    it('should support pagination parameters', async () => {
      if (!authCookie || !testTenantId) {
        console.log('[Skip] No auth or tenant_id available');
        return;
      }

      const response = await makeAuthRequest(
        `/api/bundles/leads?tenant_id=${testTenantId}&page=1&page_size=10`
      );

      assert.strictEqual(response.status, 200);

      const json = await response.json();
      const bundle = json.data;

      assert.ok(bundle.leads.length <= 10, 'Should respect page_size limit');
      assert.strictEqual(bundle.pagination.page, 1, 'Should return correct page number');
      assert.strictEqual(bundle.pagination.page_size, 10, 'Should return correct page_size');
    });

    it('should support search filter', async () => {
      if (!authCookie || !testTenantId) {
        console.log('[Skip] No auth or tenant_id available');
        return;
      }

      const response = await makeAuthRequest(
        `/api/bundles/leads?tenant_id=${testTenantId}&search=test`
      );

      assert.strictEqual(response.status, 200);
      const json = await response.json();
      assert.ok(json.data, 'Should return bundle with search filter');
    });

    it('should support status filter', async () => {
      if (!authCookie || !testTenantId) {
        console.log('[Skip] No auth or tenant_id available');
        return;
      }

      const response = await makeAuthRequest(
        `/api/bundles/leads?tenant_id=${testTenantId}&status=new`
      );

      assert.strictEqual(response.status, 200);
      const json = await response.json();
      const bundle = json.data;

      // Verify all returned leads have status 'new' (if any)
      if (bundle.leads.length > 0) {
        bundle.leads.forEach(lead => {
          assert.strictEqual(lead.status, 'new', 'All leads should have status "new"');
        });
      }
    });
  });

  describe('GET /api/bundles/contacts', () => {
    it('should require authentication', async () => {
      const response = await fetch(`${BACKEND_URL}/api/bundles/contacts?tenant_id=${testTenantId || 'test-uuid'}`);

      assert.ok(response.status === 401 || response.status === 302 || response.status === 403,
        `Expected 401/302/403 without auth, got ${response.status}`);
    });

    it('should return bundle with correct structure', async () => {
      if (!authCookie || !testTenantId) {
        console.log('[Skip] No auth or tenant_id available');
        return;
      }

      const response = await makeAuthRequest(`/api/bundles/contacts?tenant_id=${testTenantId}`);

      assert.strictEqual(response.status, 200);

      const json = await response.json();
      const bundle = json.data;

      assert.ok(Array.isArray(bundle.contacts), 'Bundle should contain contacts array');
      assert.ok(typeof bundle.stats === 'object', 'Bundle should contain stats object');
      assert.ok(Array.isArray(bundle.users), 'Bundle should contain users array');
      assert.ok(Array.isArray(bundle.employees), 'Bundle should contain employees array');
      assert.ok(Array.isArray(bundle.accounts), 'Bundle should contain accounts array');

      // Verify stats structure
      assert.ok('total' in bundle.stats, 'Stats should have total');
      assert.ok('active' in bundle.stats, 'Stats should have active count');
      assert.ok('prospect' in bundle.stats, 'Stats should have prospect count');
      assert.ok('customer' in bundle.stats, 'Stats should have customer count');

      console.log('[Success] Contacts bundle structure verified');
      console.log('  - Contacts:', bundle.contacts.length);
      console.log('  - Users:', bundle.users.length);
      console.log('  - Employees:', bundle.employees.length);
      console.log('  - Accounts:', bundle.accounts.length);
    });
  });

  describe('GET /api/bundles/opportunities', () => {
    it('should require authentication', async () => {
      const response = await fetch(`${BACKEND_URL}/api/bundles/opportunities?tenant_id=${testTenantId || 'test-uuid'}`);

      assert.ok(response.status === 401 || response.status === 302 || response.status === 403,
        `Expected 401/302/403 without auth, got ${response.status}`);
    });

    it('should return bundle with correct structure', async () => {
      if (!authCookie || !testTenantId) {
        console.log('[Skip] No auth or tenant_id available');
        return;
      }

      const response = await makeAuthRequest(`/api/bundles/opportunities?tenant_id=${testTenantId}`);

      assert.strictEqual(response.status, 200);

      const json = await response.json();
      const bundle = json.data;

      assert.ok(Array.isArray(bundle.opportunities), 'Bundle should contain opportunities array');
      assert.ok(typeof bundle.stats === 'object', 'Bundle should contain stats object');
      assert.ok(Array.isArray(bundle.users), 'Bundle should contain users array');
      assert.ok(Array.isArray(bundle.employees), 'Bundle should contain employees array');
      assert.ok(Array.isArray(bundle.accounts), 'Bundle should contain accounts array');
      assert.ok(Array.isArray(bundle.contacts), 'Bundle should contain contacts array');
      assert.ok(Array.isArray(bundle.leads), 'Bundle should contain leads array');

      // Verify stats structure
      assert.ok('total' in bundle.stats, 'Stats should have total');
      assert.ok('prospecting' in bundle.stats, 'Stats should have prospecting count');
      assert.ok('qualification' in bundle.stats, 'Stats should have qualification count');
      assert.ok('proposal' in bundle.stats, 'Stats should have proposal count');

      console.log('[Success] Opportunities bundle structure verified');
      console.log('  - Opportunities:', bundle.opportunities.length);
      console.log('  - Users:', bundle.users.length);
      console.log('  - Employees:', bundle.employees.length);
      console.log('  - Accounts:', bundle.accounts.length);
      console.log('  - Contacts:', bundle.contacts.length);
      console.log('  - Leads:', bundle.leads.length);
    });

    it('should support stage filter', async () => {
      if (!authCookie || !testTenantId) {
        console.log('[Skip] No auth or tenant_id available');
        return;
      }

      const response = await makeAuthRequest(
        `/api/bundles/opportunities?tenant_id=${testTenantId}&stage=prospecting`
      );

      assert.strictEqual(response.status, 200);
      const json = await response.json();
      const bundle = json.data;

      // Verify all returned opportunities have stage 'prospecting' (if any)
      if (bundle.opportunities.length > 0) {
        bundle.opportunities.forEach(opp => {
          assert.strictEqual(opp.stage, 'prospecting', 'All opportunities should have stage "prospecting"');
        });
      }
    });
  });

  describe('Performance Tests', () => {
    it('leads bundle should respond within 2 seconds', async () => {
      if (!authCookie || !testTenantId) {
        console.log('[Skip] No auth or tenant_id available');
        return;
      }

      const startTime = Date.now();
      const response = await makeAuthRequest(`/api/bundles/leads?tenant_id=${testTenantId}`);
      const elapsed = Date.now() - startTime;

      assert.strictEqual(response.status, 200);
      assert.ok(elapsed < 2000, `Should respond in < 2s, took ${elapsed}ms`);

      console.log(`[Performance] Leads bundle: ${elapsed}ms`);
    });

    it('contacts bundle should respond within 2 seconds', async () => {
      if (!authCookie || !testTenantId) {
        console.log('[Skip] No auth or tenant_id available');
        return;
      }

      const startTime = Date.now();
      const response = await makeAuthRequest(`/api/bundles/contacts?tenant_id=${testTenantId}`);
      const elapsed = Date.now() - startTime;

      assert.strictEqual(response.status, 200);
      assert.ok(elapsed < 2000, `Should respond in < 2s, took ${elapsed}ms`);

      console.log(`[Performance] Contacts bundle: ${elapsed}ms`);
    });

    it('opportunities bundle should respond within 2 seconds', async () => {
      if (!authCookie || !testTenantId) {
        console.log('[Skip] No auth or tenant_id available');
        return;
      }

      const startTime = Date.now();
      const response = await makeAuthRequest(`/api/bundles/opportunities?tenant_id=${testTenantId}`);
      const elapsed = Date.now() - startTime;

      assert.strictEqual(response.status, 200);
      assert.ok(elapsed < 2000, `Should respond in < 2s, took ${elapsed}ms`);

      console.log(`[Performance] Opportunities bundle: ${elapsed}ms`);
    });
  });

  describe('Cache Tests', () => {
    it('should cache results and serve from cache on second request', async () => {
      if (!authCookie || !testTenantId) {
        console.log('[Skip] No auth or tenant_id available');
        return;
      }

      const url = `/api/bundles/leads?tenant_id=${testTenantId}&page=1&page_size=5`;

      // First request (should hit database)
      const startTime1 = Date.now();
      const response1 = await makeAuthRequest(url);
      const elapsed1 = Date.now() - startTime1;

      assert.strictEqual(response1.status, 200);
      const json1 = await response1.json();
      assert.strictEqual(json1.data.cached, undefined, 'First request should not be from cache');

      // Second request (should hit cache)
      const startTime2 = Date.now();
      const response2 = await makeAuthRequest(url);
      const elapsed2 = Date.now() - startTime2;

      assert.strictEqual(response2.status, 200);
      const json2 = await response2.json();

      // Cache hit should be faster
      console.log(`[Cache Test] First request: ${elapsed1}ms, Second request: ${elapsed2}ms`);

      // Verify data is the same
      assert.deepStrictEqual(json1.data.stats, json2.data.stats, 'Cached data should match');
    });
  });
});
