import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { TENANT_ID } from '../testConstants.js';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const JWT_SECRET = process.env.JWT_SECRET || '';
const HAS_SUPABASE = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
const SHOULD_RUN =
  (process.env.CI_BACKEND_TESTS === '1' || process.env.RUN_IMPERSONATION_TESTS === '1') &&
  HAS_SUPABASE &&
  !!JWT_SECRET;

const describeIfEnabled = SHOULD_RUN ? describe : describe.skip;

function makeToken(payload, expiresIn = '15m') {
  return jwt.sign(payload, JWT_SECRET, { algorithm: 'HS256', expiresIn });
}

function makeSuperadminToken() {
  return makeToken({
    sub: '11111111-1111-1111-1111-111111111111',
    email: 'superadmin@aishacrm-test.com',
    role: 'superadmin',
    tenant_id: TENANT_ID,
    table: 'users',
  });
}

function getSetCookies(response) {
  if (typeof response.headers.getSetCookie === 'function') {
    return response.headers.getSetCookie();
  }
  const fallback = response.headers.get('set-cookie');
  return fallback ? [fallback] : [];
}

function extractCookieValue(setCookies, name) {
  const prefix = `${name}=`;
  const match = setCookies.find((c) => c.startsWith(prefix));
  if (!match) return null;
  const withoutPrefix = match.slice(prefix.length);
  return withoutPrefix.split(';')[0] || null;
}

async function request(method, path, options = {}) {
  const url = `${BACKEND_URL}${path}`;
  const { cookie, body } = options;
  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  return {
    status: response.status,
    data,
    setCookies: getSetCookies(response),
  };
}

describeIfEnabled('Impersonation Auth Cookie Flow', () => {
  let supabaseClient;
  let testUserId;
  let testUserEmail;

  before(async () => {
    const { getSupabaseClient } = await import('../../lib/supabase-db.js');
    supabaseClient = getSupabaseClient();

    testUserEmail = `test-user-${Date.now()}@aishacrm-test.com`;
    const { data, error } = await supabaseClient
      .from('users')
      .insert({
        email: testUserEmail,
        first_name: 'Impersonation',
        last_name: 'Test',
        role: 'user',
        tenant_id: TENANT_ID,
        status: 'active',
      })
      .select('id')
      .single();

    if (error || !data?.id) {
      throw new Error(`Failed to create test user: ${error?.message || 'unknown error'}`);
    }
    testUserId = data.id;
  });

  after(async () => {
    if (supabaseClient && testUserId) {
      await supabaseClient.from('users').delete().eq('id', testUserId);
    }
  });

  it('starts impersonation via cookies and /api/auth/me reflects target identity', async () => {
    const superadminToken = makeSuperadminToken();
    const impersonate = await request('POST', '/api/auth/impersonate', {
      cookie: `aisha_access=${superadminToken}`,
      body: { user_id: testUserId },
    });

    assert.equal(impersonate.status, 200, JSON.stringify(impersonate.data));
    assert.equal(impersonate.data?.status, 'success');

    const impersonationAccess = extractCookieValue(impersonate.setCookies, 'aisha_access');
    const originalAccess = extractCookieValue(impersonate.setCookies, 'aisha_original');
    assert.ok(impersonationAccess, 'Expected impersonation aisha_access cookie');
    assert.ok(originalAccess, 'Expected aisha_original cookie');

    const decoded = jwt.decode(impersonationAccess);
    assert.equal(decoded?.sub, testUserId);
    assert.equal(decoded?.email, testUserEmail);
    assert.equal(decoded?.role, 'user');
    assert.equal(decoded?.impersonating, true);

    const me = await request('GET', '/api/auth/me', {
      cookie: `aisha_access=${impersonationAccess}`,
    });
    assert.equal(me.status, 200);
    const authMeUser = me.data?.data?.user;
    assert.ok(authMeUser, 'Expected /api/auth/me user payload');
    assert.equal(authMeUser.email, testUserEmail);
    assert.equal(authMeUser.role, 'user');
    assert.equal(authMeUser.impersonating, true);
  });

  it('stops impersonation and restores original superadmin session cookie', async () => {
    const superadminToken = makeSuperadminToken();
    const impersonate = await request('POST', '/api/auth/impersonate', {
      cookie: `aisha_access=${superadminToken}`,
      body: { user_id: testUserId },
    });
    assert.equal(impersonate.status, 200, JSON.stringify(impersonate.data));

    const impersonationAccess = extractCookieValue(impersonate.setCookies, 'aisha_access');
    const originalAccess = extractCookieValue(impersonate.setCookies, 'aisha_original');
    assert.ok(impersonationAccess);
    assert.ok(originalAccess);

    const stop = await request('POST', '/api/auth/stop-impersonate', {
      cookie: `aisha_access=${impersonationAccess}; aisha_original=${originalAccess}`,
    });

    assert.equal(stop.status, 200, JSON.stringify(stop.data));
    assert.equal(stop.data?.status, 'success');

    const restoredAccess = extractCookieValue(stop.setCookies, 'aisha_access');
    assert.ok(restoredAccess, 'Expected restored aisha_access cookie');

    const restoredPayload = jwt.decode(restoredAccess);
    assert.equal(restoredPayload?.email, 'superadmin@aishacrm-test.com');
    assert.equal(restoredPayload?.role, 'superadmin');
    assert.equal(restoredPayload?.impersonating, undefined);
  });
});

