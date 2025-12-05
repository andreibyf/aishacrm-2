import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const TENANT_ID = process.env.TEST_TENANT_ID || 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
// In CI, run only if explicitly enabled
const SHOULD_RUN = process.env.CI ? (process.env.CI_BACKEND_TESTS === 'true') : true;

describe('Users Routes', { skip: !SHOULD_RUN }, () => {

  test('GET /api/users returns 200 with tenant_id', async () => {
    const res = await fetch(`${BASE_URL}/api/users?tenant_id=${TENANT_ID}`);
    assert.equal(res.status, 200, 'expected 200 from users list');
    const json = await res.json();
    assert.equal(json.status, 'success');
    assert.ok(json.data?.users || Array.isArray(json.data), 'expected users array');
  });

  test('GET /api/users/:id returns specific user', async () => {
    // First get a list to find a valid user ID
    const listRes = await fetch(`${BASE_URL}/api/users?tenant_id=${TENANT_ID}&limit=1`);
    if (listRes.status !== 200) return; // Skip if can't get users
    
    const listJson = await listRes.json();
    const users = listJson.data?.users || listJson.data || [];
    if (users.length === 0) return; // Skip if no users
    
    const userId = users[0].id;
    const res = await fetch(`${BASE_URL}/api/users/${userId}?tenant_id=${TENANT_ID}`);
    assert.equal(res.status, 200, 'expected 200 for specific user');
    const json = await res.json();
    assert.equal(json.status, 'success');
  });

  test('GET /api/users/:id returns 404 for non-existent', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await fetch(`${BASE_URL}/api/users/${fakeId}?tenant_id=${TENANT_ID}`);
    assert.equal(res.status, 404, 'expected 404 for non-existent user');
  });

  test('POST /api/users requires email', async () => {
    const res = await fetch(`${BASE_URL}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant_id: TENANT_ID, name: 'Test User' })
    });
    assert.ok([400, 422].includes(res.status), `expected 400 or 422 for missing email, got ${res.status}`);
  });

  test('PUT /api/users/:id validates user exists', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await fetch(`${BASE_URL}/api/users/${fakeId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant_id: TENANT_ID, name: 'Updated' })
    });
    assert.ok([404, 403].includes(res.status), `expected 404 or 403, got ${res.status}`);
  });
});
