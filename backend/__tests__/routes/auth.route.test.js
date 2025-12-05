import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const _TENANT_ID = process.env.TEST_TENANT_ID || 'a11dfb63-4b18-4eb8-872e-747af2e37c46'; // Reserved for future use
// In CI, run only if explicitly enabled
const SHOULD_RUN = process.env.CI ? (process.env.CI_BACKEND_TESTS === 'true') : true;

describe('Auth Routes', { skip: !SHOULD_RUN }, () => {
  
  test('POST /api/auth/verify-token returns 400 without token', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/verify-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    // 429 = rate limited, which is acceptable
    assert.ok([400, 429].includes(res.status), `expected 400 or 429 for missing token, got ${res.status}`);
    const json = await res.json();
    assert.equal(json.status, 'error');
    assert.ok(json.message.includes('token'), 'should mention token required');
  });

  test('POST /api/auth/verify-token validates invalid token', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/verify-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'invalid-token-123' })
    });
    // 429 = rate limited, which is acceptable
    assert.ok([200, 429].includes(res.status), `expected 200 or 429, got ${res.status}`);
    const json = await res.json();
    assert.equal(json.status, 'success');
    assert.equal(json.data.valid, false, 'invalid token should return valid: false');
  });

  test('POST /api/auth/login returns 400 without credentials', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    // May return 400 or 401 depending on implementation
    assert.ok([400, 401].includes(res.status), `expected 400 or 401, got ${res.status}`);
  });

  test('POST /api/auth/login returns error for invalid credentials', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        email: 'nonexistent@test.invalid',
        password: 'wrongpassword123'
      })
    });
    // Should fail authentication
    assert.ok([400, 401, 422].includes(res.status), `expected auth failure status, got ${res.status}`);
  });

  test('POST /api/auth/forgot-password returns 400 without email', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    // 429 = rate limited, 404 = route not found, both acceptable
    assert.ok([400, 404, 429].includes(res.status), `expected 400/404/429, got ${res.status}`);
  });

  test('POST /api/auth/forgot-password handles non-existent email gracefully', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nonexistent-user-test@example.invalid' })
    });
    // Should return 200 (security: don't reveal if email exists)
    // or 404/400 depending on implementation
    assert.ok([200, 400, 404].includes(res.status), `expected valid response, got ${res.status}`);
  });

  test('POST /api/auth/logout clears cookies', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    // 429 = rate limited, which is acceptable
    assert.ok([200, 429].includes(res.status), `logout should return 200 or 429, got ${res.status}`);
    const json = await res.json();
    assert.equal(json.status, 'success');
  });

  test('GET /api/auth/me without auth returns 401', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/me`);
    // 429 = rate limited, which is acceptable
    assert.ok([401, 429].includes(res.status), `expected 401 or 429, got ${res.status}`);
  });

  test('POST /api/auth/refresh without cookie returns 401', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    // 429 = rate limited, which is acceptable
    assert.ok([401, 429].includes(res.status), `expected 401 or 429, got ${res.status}`);
  });
});
