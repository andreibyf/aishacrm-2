/**
 * Impersonation endpoint regression tests
 *
 * Tests security constraints on POST /api/auth/impersonate and
 * POST /api/auth/stop-impersonate.
 *
 * These tests forge JWTs signed with JWT_SECRET and send them as cookies
 * to verify enforcement without requiring live DB users.
 *
 * IMPORTANT: Run with Doppler to ensure JWT_SECRET matches the backend:
 *   docker compose exec backend doppler run -- node --test __tests__/auth/impersonation.test.js
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-access';
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function makeToken(payload, expiresIn = '15m') {
  return jwt.sign(payload, JWT_SECRET, { algorithm: 'HS256', expiresIn });
}

function makeSuperadminToken() {
  return makeToken({
    sub: 'superadmin-test-uuid',
    email: 'admin@test.com',
    role: 'superadmin',
    table: 'users',
  });
}

function makeNonSuperadminToken(role = 'user') {
  return makeToken({
    sub: 'regular-user-uuid',
    email: 'user@test.com',
    role,
    table: 'users',
    tenant_id: 'tenant-uuid-test',
  });
}

function makeImpersonationToken() {
  return makeToken({
    sub: 'target-user-uuid',
    email: 'target@test.com',
    role: 'user',
    table: 'users',
    tenant_id: 'tenant-uuid-test',
    impersonating: true,
    original_user: {
      id: 'superadmin-test-uuid',
      email: 'admin@test.com',
      role: 'superadmin',
    },
  });
}

async function post(path, { cookie, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers['Cookie'] = cookie;

  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: 'POST',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    // non-JSON response
  }
  return { status: res.status, data };
}

describe('POST /api/auth/impersonate — security constraints', () => {
  before(() => delay(200));

  it('returns 401 when no access cookie is present', async () => {
    const { status, data } = await post('/api/auth/impersonate', {
      body: { user_id: 'some-uuid' },
    });
    assert.ok([401, 429].includes(status), `Expected 401 or 429, got ${status}`);
    if (status !== 429) {
      assert.equal(data?.status, 'error');
    }
  });

  it('returns 400 when user_id is missing', async () => {
    const token = makeSuperadminToken();
    const { status, data } = await post('/api/auth/impersonate', {
      cookie: `aisha_access=${token}`,
      body: {},
    });
    // 400 = validation error, 429 = rate limited
    assert.ok([400, 429].includes(status), `Expected 400 or 429, got ${status}`);
    if (status !== 429) {
      assert.equal(data?.status, 'error');
      assert.match(data?.message, /user_id/i);
    }
  });

  it('returns 403 when caller is not a superadmin', async () => {
    await delay(100);
    const token = makeNonSuperadminToken('user');
    const { status, data } = await post('/api/auth/impersonate', {
      cookie: `aisha_access=${token}`,
      body: { user_id: 'some-target-uuid' },
    });
    assert.ok([403, 429].includes(status), `Expected 403 or 429, got ${status}`);
    if (status !== 429) {
      assert.equal(data?.status, 'error');
      assert.match(data?.message, /superadmin/i);
    }
  });

  it('returns 403 when caller role is manager (non-superadmin)', async () => {
    await delay(100);
    const token = makeNonSuperadminToken('manager');
    const { status, data } = await post('/api/auth/impersonate', {
      cookie: `aisha_access=${token}`,
      body: { user_id: 'some-target-uuid' },
    });
    assert.ok([403, 429].includes(status), `Expected 403 or 429, got ${status}`);
    if (status !== 429) {
      assert.equal(data?.status, 'error');
    }
  });

  it('returns 400 when already impersonating', async () => {
    await delay(100);
    const token = makeImpersonationToken();
    const { status, data } = await post('/api/auth/impersonate', {
      cookie: `aisha_access=${token}`,
      body: { user_id: 'another-uuid' },
    });
    // Active impersonation token has role='user', so we expect either 403 (non-superadmin check)
    // or 400 (already-impersonating check). Both are correct rejections.
    assert.ok([400, 403, 429].includes(status), `Expected 400, 403 or 429, got ${status}`);
    if (status !== 429) {
      assert.equal(data?.status, 'error');
    }
  });
});

describe('POST /api/auth/stop-impersonate — security constraints', () => {
  before(() => delay(200));

  it('returns 400 when no aisha_original cookie is present', async () => {
    await delay(100);
    const token = makeImpersonationToken();
    const { status, data } = await post('/api/auth/stop-impersonate', {
      cookie: `aisha_access=${token}`,
    });
    assert.ok([400, 429].includes(status), `Expected 400 or 429, got ${status}`);
    if (status !== 429) {
      assert.equal(data?.status, 'error');
      assert.match(data?.message, /no impersonation/i);
    }
  });

  it('returns 401 when aisha_original token is invalid/expired', async () => {
    await delay(100);
    const currentToken = makeToken({
      sub: 'target-user-uuid',
      email: 'target@test.com',
      role: 'user',
      impersonating: true,
      original_user: null, // no original_user to re-mint from
    });
    const expiredToken = jwt.sign(
      { sub: 'admin-uuid', email: 'admin@test.com', role: 'superadmin' },
      JWT_SECRET,
      { algorithm: 'HS256', expiresIn: -1 }, // already expired
    );
    const { status, data } = await post('/api/auth/stop-impersonate', {
      cookie: `aisha_access=${currentToken}; aisha_original=${expiredToken}`,
    });
    // 401 = expired original and no recovery path; 429 = rate limited
    assert.ok([401, 429].includes(status), `Expected 401 or 429, got ${status}`);
    if (status !== 429) {
      assert.equal(data?.status, 'error');
    }
  });

  it('recovers gracefully when aisha_original is expired but original_user in token', async () => {
    await delay(100);
    const currentToken = makeImpersonationToken();
    const expiredOriginal = jwt.sign(
      { sub: 'superadmin-test-uuid', email: 'admin@test.com', role: 'superadmin' },
      JWT_SECRET,
      { algorithm: 'HS256', expiresIn: -1 },
    );
    const { status, data } = await post('/api/auth/stop-impersonate', {
      cookie: `aisha_access=${currentToken}; aisha_original=${expiredOriginal}`,
    });
    // Should either succeed (200) using re-minted token, or rate limit (429)
    assert.ok([200, 429].includes(status), `Expected 200 or 429, got ${status}`);
    if (status === 200) {
      assert.equal(data?.status, 'success');
    }
  });
});
