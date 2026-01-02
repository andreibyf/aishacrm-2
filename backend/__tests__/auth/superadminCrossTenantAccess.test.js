/**
 * Test: Superadmin cross-tenant read access
 * Verifies that superadmins can read data from any tenant
 * 
 * Migrated to v2 routes and node:test format
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const TEST_TENANT = process.env.TEST_TENANT_ID || 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
const SHOULD_RUN = process.env.CI ? (process.env.CI_BACKEND_TESTS === 'true') : true;

async function jsonFetch(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  let body = null;
  try { body = await res.json(); } catch { /* non-json */ }
  return { res, body };
}

describe('Superadmin Cross-Tenant Access', { skip: !SHOULD_RUN }, () => {

  test('GET /api/v2/opportunities with tenant_id returns data', async () => {
    const { res, body } = await jsonFetch(`/api/v2/opportunities?tenant_id=${TEST_TENANT}&limit=5`);

    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    assert.equal(body.status, 'success');
    assert.ok(body.data?.opportunities !== undefined || body.data !== undefined,
      'Should return opportunities data');
  });

  test('GET /api/v2/leads with tenant_id returns data', async () => {
    const { res, body } = await jsonFetch(`/api/v2/leads?tenant_id=${TEST_TENANT}&limit=5`);

    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    assert.equal(body.status, 'success');
    assert.ok(body.data?.leads !== undefined || body.data !== undefined,
      'Should return leads data');
  });

  test('GET /api/v2/accounts with tenant_id returns data', async () => {
    const { res, body } = await jsonFetch(`/api/v2/accounts?tenant_id=${TEST_TENANT}&limit=5`);

    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    assert.equal(body.status, 'success');
    assert.ok(body.data?.accounts !== undefined || body.data !== undefined,
      'Should return accounts data');
  });

  test('POST /api/v2/opportunities without tenant_id is rejected', async () => {
    const { res, body: _body } = await jsonFetch('/api/v2/opportunities', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Test Opportunity',
        amount: 1000,
      }),
    });

    // Should require tenant_id
    assert.ok([400, 401, 403].includes(res.status),
      `Expected 400/401/403 for missing tenant_id, got ${res.status}`);
  });

  test('Tenant-scoped routes require tenant_id', async () => {
    // Activities without tenant_id should fail
    const { res } = await jsonFetch('/api/v2/activities?limit=5');

    // Should return error for missing tenant_id
    assert.ok([400, 401, 403].includes(res.status),
      `Expected tenant_id required error, got ${res.status}`);
  });
});
