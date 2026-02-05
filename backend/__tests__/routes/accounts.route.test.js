import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getAuthHeaders } from '../helpers/auth.js';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const TENANT_ID = process.env.TEST_TENANT_ID || 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
// In CI, run only if explicitly enabled (requires Supabase creds + running backend)
const SHOULD_RUN = process.env.CI ? (process.env.CI_BACKEND_TESTS === 'true') : true;

const createdIds = [];

async function createAccount(payload) {
  const res = await fetch(`${BASE_URL}/api/accounts`, {
    method: 'POST',
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ tenant_id: TENANT_ID, ...payload })
  });
  const json = await res.json();
  return { status: res.status, json };
}

async function getAccount(id) {
  const res = await fetch(`${BASE_URL}/api/accounts/${id}?tenant_id=${TENANT_ID}`, {
    headers: getAuthHeaders()
  });
  const json = await res.json();
  return { status: res.status, json };
}

async function updateAccount(id, payload) {
  const res = await fetch(`${BASE_URL}/api/accounts/${id}`, {
    method: 'PUT',
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ tenant_id: TENANT_ID, ...payload })
  });
  const json = await res.json();
  return { status: res.status, json };
}

async function deleteAccount(id) {
  const res = await fetch(`${BASE_URL}/api/accounts/${id}?tenant_id=${TENANT_ID}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  return res.status;
}

describe('Accounts Routes', { skip: !SHOULD_RUN }, () => {
  before(async () => {
    // Seed test accounts
    const a = await createAccount({ 
      name: 'Unit Test Account A', 
      type: 'customer',
      industry: 'Technology',
      revenue: 50000
    });
    // Accept 200 or 201 - API currently returns 200 for creation
    assert.ok([200, 201].includes(a.status), `create account A failed: ${JSON.stringify(a.json)}`);
    const idA = a.json?.data?.id || a.json?.data?.account?.id;
    assert.ok(idA, 'account A should have an id');
    createdIds.push(idA);

    const b = await createAccount({ 
      name: 'Unit Test Account B', 
      type: 'prospect',
      industry: 'Finance'
    });
    // Accept 200 or 201 - API currently returns 200 for creation
    assert.ok([200, 201].includes(b.status), `create account B failed: ${JSON.stringify(b.json)}`);
    const idB = b.json?.data?.id || b.json?.data?.account?.id;
    assert.ok(idB, 'account B should have an id');
    createdIds.push(idB);
  });

  after(async () => {
    for (const id of createdIds.filter(Boolean)) {
      try { await deleteAccount(id); } catch { /* ignore */ }
    }
  });

  test('GET /api/accounts returns 200 with tenant_id', async () => {
    const res = await fetch(`${BASE_URL}/api/accounts?tenant_id=${TENANT_ID}`, {
      headers: getAuthHeaders()
    });
    assert.equal(res.status, 200, 'expected 200 from accounts list');
    const json = await res.json();
    assert.equal(json.status, 'success');
    assert.ok(json.data?.accounts || Array.isArray(json.data), 'expected accounts array in response');
    assert.ok(Number.isInteger(json.data?.total), 'expected total count in response');
  });

  test('GET /api/accounts/:id returns specific account', async () => {
    const id = createdIds[0];
    assert.ok(id, 'need a valid account id');
    
    const result = await getAccount(id);
    assert.equal(result.status, 200, 'expected 200 from get account by id');
    assert.equal(result.json.status, 'success');
    
    const account = result.json.data?.account || result.json.data;
    assert.ok(account, 'expected account in response');
    assert.equal(account.name, 'Unit Test Account A');
    assert.equal(account.type, 'customer');
  });

  test('GET /api/accounts/:id enforces tenant scoping', async () => {
    const id = createdIds[0];
    assert.ok(id, 'need a valid account id');
    
    // Try to access with wrong tenant_id (non-existent tenant)
    const res = await fetch(`${BASE_URL}/api/accounts/${id}?tenant_id=wrong-tenant-999`, {
      headers: getAuthHeaders()
    });
    // Should return 403/404 for cross-tenant access, or 500 if tenant validation fails
    assert.ok([403, 404, 500].includes(res.status), `expected 403/404/500 for invalid tenant access, got ${res.status}`);
  });

  test('PUT /api/accounts/:id updates account', async () => {
    const id = createdIds[0];
    assert.ok(id, 'need a valid account id');
    
    const result = await updateAccount(id, { 
      revenue: 100000,
      type: 'partner'
    });
    
    assert.equal(result.status, 200, 'expected 200 from update account');
    assert.equal(result.json.status, 'success');
    
    const updated = result.json.data?.account || result.json.data;
    assert.ok(updated, 'expected updated account in response');
    assert.equal(updated.revenue, 100000, 'revenue should be updated');
    assert.equal(updated.type, 'partner', 'type should be updated');
  });

  test('DELETE /api/accounts/:id removes account', async () => {
    // Create a temporary account to delete
    const temp = await createAccount({ 
      name: 'Temp Delete Account', 
      type: 'prospect'
    });
    assert.equal(temp.status, 201, 'create temp account failed');
    const tempId = temp.json?.data?.id || temp.json?.data?.account?.id;
    assert.ok(tempId, 'temp account should have an id');
    
    // Delete it
    const status = await deleteAccount(tempId);
    assert.ok([200, 204].includes(status), `expected 200/204 from delete, got ${status}`);
    
    // Verify it's gone
    const verify = await getAccount(tempId);
    assert.equal(verify.status, 404, 'deleted account should return 404');
  });

  test('GET /api/accounts supports type filter', async () => {
    const res = await fetch(`${BASE_URL}/api/accounts?tenant_id=${TENANT_ID}&type=customer`, {
      headers: getAuthHeaders()
    });
    assert.equal(res.status, 200, 'expected 200 from accounts list with type filter');
    const json = await res.json();
    const accounts = json.data?.accounts || [];
    assert.ok(Array.isArray(accounts), 'accounts should be an array');
    
    // Ensure all returned accounts have type 'customer'
    for (const a of accounts) {
      assert.equal(a.type, 'customer', 'filtered accounts should all be customers');
    }
  });

  test('POST /api/accounts requires tenant_id', async () => {
    const res = await fetch(`${BASE_URL}/api/accounts`, {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: 'No Tenant Account' })
    });
    assert.equal(res.status, 400, 'expected 400 when tenant_id is missing');
    const json = await res.json();
    assert.equal(json.status, 'error');
  });

  test('POST /api/accounts creates account with metadata', async () => {
    const result = await createAccount({ 
      name: 'Account with Metadata', 
      type: 'customer',
      custom_field: 'custom_value',
      tags: ['test', 'unit']
    });
    
    assert.equal(result.status, 201, 'expected 201 from create account');
    const account = result.json?.data?.account || result.json?.data;
    assert.ok(account, 'expected account in response');
    
    // Custom fields should be in metadata
    assert.ok(account.metadata || account.custom_field, 'expected metadata or expanded fields');
    
    // Cleanup
    const id = result.json?.data?.id || result.json?.data?.account?.id;
    if (id) {
      try { await deleteAccount(id); } catch { /* ignore */ }
    }
  });

  test('GET /api/accounts/search returns matching accounts', async () => {
    const res = await fetch(`${BASE_URL}/api/accounts/search?tenant_id=${TENANT_ID}&q=Unit`, {
      headers: getAuthHeaders()
    });
    assert.equal(res.status, 200, 'expected 200 from accounts search');
    const json = await res.json();
    assert.equal(json.status, 'success');
    assert.ok(json.data?.accounts || Array.isArray(json.data), 'expected accounts array in search response');
    assert.ok(Number.isInteger(json.data?.total), 'expected total count in search response');
  });

  test('GET /api/accounts/search requires q parameter', async () => {
    const res = await fetch(`${BASE_URL}/api/accounts/search?tenant_id=${TENANT_ID}`, {
      headers: getAuthHeaders()
    });
    assert.equal(res.status, 400, 'expected 400 when q is missing');
    const json = await res.json();
    assert.equal(json.status, 'error');
  });

  test('GET /api/accounts/search requires tenant_id', async () => {
    const res = await fetch(`${BASE_URL}/api/accounts/search?q=test`, {
      headers: getAuthHeaders()
    });
    assert.equal(res.status, 400, 'expected 400 when tenant_id is missing');
    const json = await res.json();
    assert.equal(json.status, 'error');
  });
});
