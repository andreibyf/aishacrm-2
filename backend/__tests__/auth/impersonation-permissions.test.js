/**
 * Impersonation Permission Accuracy Tests
 *
 * Validates that when a superadmin impersonates a user, the impersonation
 * session reflects the target user's EXACT permissions including:
 * - Navigation permissions (nav_permissions)
 * - Granular permissions (perm_notes_anywhere, perm_all_records, etc.)
 * - Data visibility (RLS + employee_role)
 *
 * Run with:
 *   docker compose exec backend npm test -- __tests__/auth/impersonation-permissions.test.js
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-access';
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// Test requires actual database records to verify permission loading
// We'll create a test user with custom permissions, impersonate, and verify

function makeToken(payload, expiresIn = '15m') {
  return jwt.sign(payload, JWT_SECRET, { algorithm: 'HS256', expiresIn });
}

function makeSuperadminToken() {
  return makeToken({
    sub: 'test-superadmin-uuid',
    email: 'superadmin@aishacrm-test.com',
    role: 'superadmin',
    table: 'users',
  });
}

async function request(method, path, options = {}) {
  const url = `${BACKEND_URL}${path}`;
  const { cookie, body, ...fetchOpts } = options;
  
  const headers = {
    'Content-Type': 'application/json',
    ...(cookie && { Cookie: cookie }),
    ...fetchOpts.headers,
  };

  const res = await fetch(url, {
    method,
    headers,
    ...(body && { body: JSON.stringify(body) }),
    ...fetchOpts,
  });

  let data;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  return { status: res.status, data };
}

const post = (path, opts) => request('POST', path, opts);
const get = (path, opts) => request('GET', path, opts);

describe('Impersonation Permission Accuracy', () => {
  let testUserId;
  let testUserEmail;
  let supabaseClient;

  before(async () => {
    // Import Supabase client to create test user
    const { getSupabaseClient } = await import('../../lib/supabase-db.js');
    supabaseClient = getSupabaseClient();

    // Create test user with restrictive permissions
    testUserEmail = `test-user-${Date.now()}@aishacrm-test.com`;
    
    const { data: userData, error: userError } = await supabaseClient
      .from('users')
      .insert({
        email: testUserEmail,
        first_name: 'Test',
        last_name: 'Restricted',
        role: 'user',
        tenant_id: 'test-tenant-uuid',
        status: 'active',
        employee_role: 'employee', // Restricted visibility
        perm_notes_anywhere: false, // Cannot edit others' notes
        perm_all_records: false, // Only assigned records
        perm_reports: false, // No reports access
        perm_employees: false, // No employee management
        perm_settings: false, // No settings access
        nav_permissions: {
          dashboard: true,
          contacts: true,
          accounts: false, // Accounts page HIDDEN
          leads: true,
          opportunities: false, // Opportunities page HIDDEN
          activities: true,
          reports: false, // Reports page HIDDEN
        },
      })
      .select()
      .single();

    if (userError) {
      console.error('Failed to create test user:', userError);
      throw userError;
    }

    testUserId = userData.id;
    console.log(`Created test user: ${testUserEmail} (${testUserId})`);
  });

  after(async () => {
    // Cleanup test user
    if (testUserId && supabaseClient) {
      await supabaseClient.from('users').delete().eq('id', testUserId);
      console.log(`Cleaned up test user: ${testUserId}`);
    }
  });

  it('loads target user permissions when impersonating', async () => {
    await delay(100);
    
    const superadminToken = makeSuperadminToken();
    
    // Start impersonation
    const { status, data } = await post('/api/auth/impersonate', {
      cookie: `aisha_access=${superadminToken}`,
      body: { user_id: testUserId },
    });

    assert.equal(status, 200, `Expected 200, got ${status}: ${JSON.stringify(data)}`);
    assert.equal(data?.status, 'success');
    assert.ok(data?.token, 'Should return impersonation token');

    // Extract impersonation token from response
    const impersonationToken = data.token;

    // Verify impersonation token includes target user email
    const decoded = jwt.decode(impersonationToken);
    assert.equal(decoded.email, testUserEmail, 'Token email should match target user');
    assert.equal(decoded.role, 'user', 'Token role should match target user');
    assert.equal(decoded.impersonating, true, 'Token should have impersonating flag');
    
    // Call /api/auth/me to check if permissions are loaded from DB
    const { status: meStatus, data: meData } = await get('/api/auth/me', {
      cookie: `aisha_access=${impersonationToken}`,
    });

    assert.equal(meStatus, 200, `Expected 200 from /me, got ${meStatus}`);
    assert.ok(meData?.user, 'Should return user object');

    const user = meData.user;

    // Verify basic identity
    assert.equal(user.email, testUserEmail, 'Should have target user email');
    assert.equal(user.role, 'user', 'Should have target user role');
    assert.equal(user.impersonating, true, 'Should show impersonating flag');

    // Verify granular permissions match test user
    assert.equal(
      user.perm_notes_anywhere,
      false,
      'perm_notes_anywhere should be false for restricted user',
    );
    assert.equal(
      user.perm_all_records,
      false,
      'perm_all_records should be false for restricted user',
    );
    assert.equal(user.perm_reports, false, 'perm_reports should be false for restricted user');
    assert.equal(
      user.perm_employees,
      false,
      'perm_employees should be false for restricted user',
    );
    assert.equal(user.perm_settings, false, 'perm_settings should be false for restricted user');

    // Verify navigation permissions
    assert.ok(user.nav_permissions, 'Should have nav_permissions object');
    assert.equal(
      user.nav_permissions.accounts,
      false,
      'Accounts page should be hidden for this user',
    );
    assert.equal(
      user.nav_permissions.opportunities,
      false,
      'Opportunities page should be hidden for this user',
    );
    assert.equal(
      user.nav_permissions.reports,
      false,
      'Reports page should be hidden for this user',
    );
    assert.equal(user.nav_permissions.contacts, true, 'Contacts page should be visible');
    assert.equal(user.nav_permissions.leads, true, 'Leads page should be visible');

    // Verify employee_role for data visibility
    assert.equal(
      user.employee_role,
      'employee',
      'employee_role should be "employee" for restricted visibility',
    );

    console.log('✅ Impersonation correctly loaded all target user permissions');
  });

  it('superadmin sees full permissions after stopping impersonation', async () => {
    await delay(100);

    const superadminToken = makeSuperadminToken();

    // Start impersonation
    const { status: impStatus, data: impData } = await post('/api/auth/impersonate', {
      cookie: `aisha_access=${superadminToken}`,
      body: { user_id: testUserId },
    });

    assert.equal(impStatus, 200, 'Impersonation should succeed');
    const impersonationToken = impData.token;

    // Stop impersonation
    const { status: stopStatus, data: stopData } = await post('/api/auth/stop-impersonate', {
      cookie: `aisha_access=${impersonationToken}; aisha_original=${superadminToken}`,
    });

    assert.equal(stopStatus, 200, `Expected 200 from stop-impersonate, got ${stopStatus}`);
    assert.equal(stopData?.status, 'success');
    assert.ok(stopData?.token, 'Should return restored token');

    // Verify restored token has superadmin role
    const restoredToken = stopData.token;
    const decoded = jwt.decode(restoredToken);
    assert.equal(decoded.role, 'superadmin', 'Restored token should have superadmin role');
    assert.equal(decoded.impersonating, undefined, 'Should not have impersonating flag');

    console.log('✅ Superadmin permissions restored after stopping impersonation');
  });

  it('navigation UI respects target user nav_permissions during impersonation', async () => {
    // This is an integration concept test - in real usage, frontend checks:
    // hasPageAccess(user, 'accounts') should return FALSE during impersonation
    // because user.nav_permissions.accounts === false

    await delay(100);

    const superadminToken = makeSuperadminToken();
    const { status, data } = await post('/api/auth/impersonate', {
      cookie: `aisha_access=${superadminToken}`,
      body: { user_id: testUserId },
    });

    assert.equal(status, 200);
    const impersonationToken = data.token;

    // Fetch user data that frontend would use
    const { data: meData } = await get('/api/auth/me', {
      cookie: `aisha_access=${impersonationToken}`,
    });

    const user = meData.user;

    // Simulate frontend hasPageAccess() logic
    function hasPageAccess(user, pageName) {
      if (!user.nav_permissions) return true; // Default allow
      return user.nav_permissions[pageName] !== false;
    }

    // Test navigation checks
    assert.equal(hasPageAccess(user, 'accounts'), false, 'Accounts page should be hidden');
    assert.equal(
      hasPageAccess(user, 'opportunities'),
      false,
      'Opportunities page should be hidden',
    );
    assert.equal(hasPageAccess(user, 'reports'), false, 'Reports page should be hidden');
    assert.equal(hasPageAccess(user, 'contacts'), true, 'Contacts page should be visible');
    assert.equal(hasPageAccess(user, 'leads'), true, 'Leads page should be visible');
    assert.equal(hasPageAccess(user, 'dashboard'), true, 'Dashboard should be visible');

    console.log('✅ Navigation permissions correctly restrict UI during impersonation');
  });
});
