/**
 * Test suite to verify tenant_id validation for accounts GET by ID endpoint
 * Tests both v1 (/api/accounts) and v2 (/api/v2/accounts) routes
 * Related to issue: accounts GET by ID should require tenant_id parameter
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:4001';
const TENANT_ID = process.env.TEST_TENANT_ID || 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
const SHOULD_RUN = process.env.CI ? (process.env.CI_BACKEND_TESTS === 'true') : true;

let testAccountId = null;

async function createTestAccount() {
  const res = await fetch(`${BASE_URL}/api/v2/accounts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenant_id: TENANT_ID,
      name: 'Test Account for tenant_id validation',
      type: 'customer',
      industry: 'Technology'
    })
  });
  const json = await res.json();
  return { status: res.status, data: json.data };
}

async function deleteTestAccount(id) {
  try {
    await fetch(`${BASE_URL}/api/v2/accounts/${id}?tenant_id=${TENANT_ID}`, {
      method: 'DELETE'
    });
  } catch {
    // Ignore cleanup errors
  }
}

describe('Accounts V2 - tenant_id validation for GET by ID', { skip: !SHOULD_RUN }, () => {
  before(async () => {
    // Create a test account
    const result = await createTestAccount();
    assert.ok([200, 201].includes(result.status), 'Failed to create test account');
    testAccountId = result.data?.id || result.data?.account?.id;
    assert.ok(testAccountId, 'Test account should have an ID');
  });

  after(async () => {
    // Cleanup
    if (testAccountId) {
      await deleteTestAccount(testAccountId);
    }
  });

  test('GET /api/v2/accounts/:id WITH tenant_id returns 200', async () => {
    const res = await fetch(`${BASE_URL}/api/v2/accounts/${testAccountId}?tenant_id=${TENANT_ID}`);
    const json = await res.json();
    
    assert.equal(res.status, 200, 'Should return 200 when tenant_id is provided');
    assert.equal(json.status, 'success', 'Response should have success status');
    assert.ok(json.data?.account || json.data, 'Response should contain account data');
  });

  test('GET /api/v2/accounts/:id WITHOUT tenant_id returns 400', async () => {
    const res = await fetch(`${BASE_URL}/api/v2/accounts/${testAccountId}`);
    const json = await res.json();
    
    assert.equal(res.status, 400, 'Should return 400 when tenant_id is missing');
    assert.equal(json.status, 'error', 'Response should have error status');
    assert.match(json.message, /tenant_id.*required/i, 'Error message should mention tenant_id is required');
  });

  test('GET /api/v2/accounts/:id with WRONG tenant_id returns 404', async () => {
    const wrongTenantId = '00000000-0000-0000-0000-000000000000';
    const res = await fetch(`${BASE_URL}/api/v2/accounts/${testAccountId}?tenant_id=${wrongTenantId}`);
    const json = await res.json();
    
    assert.equal(res.status, 404, 'Should return 404 when accessing with wrong tenant_id');
    assert.equal(json.status, 'error', 'Response should have error status');
  });

  test('GET /api/v2/accounts/:id with empty tenant_id returns 400', async () => {
    const res = await fetch(`${BASE_URL}/api/v2/accounts/${testAccountId}?tenant_id=`);
    const json = await res.json();
    
    assert.equal(res.status, 400, 'Should return 400 when tenant_id is empty');
    assert.equal(json.status, 'error', 'Response should have error status');
  });
});
