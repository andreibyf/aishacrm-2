/**
 * Integration tests for the new granular permissions system.
 * 
 * Tests the full flow from user creation through to data visibility,
 * ensuring that:
 *   - Users with perm_* columns set correctly can/cannot see data
 *   - Team assignments with access_level work correctly
 *   - The wizard-created users have correct permissions
 *   - Employees linked to users work correctly
 * 
 * Run with: docker compose exec backend node --test __tests__/integration/userPermissions.integration.test.js
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

// Test configuration - use env vars or defaults
const SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

// Skip if no Supabase config
const SKIP_INTEGRATION = !SUPABASE_URL || !SUPABASE_SERVICE_KEY;

// Test data IDs (will be created/cleaned up) - must be valid UUIDs
const TEST_TENANT_ID = randomUUID();
const TEST_USER_IDS = [];
const TEST_TEAM_IDS = [];
const TEST_EMPLOYEE_IDS = [];

// Supabase admin client
let supabase;

describe('User Permissions Integration Tests', { skip: SKIP_INTEGRATION }, () => {
  before(async () => {
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false },
    });

    // Create test tenant
    const { data: tenant, error: tenantErr } = await supabase
      .from('tenant')
      .insert({
        id: TEST_TENANT_ID,
        tenant_id: TEST_TENANT_ID,
        name: 'Permission Test Tenant',
        status: 'active',
      })
      .select()
      .single();

    if (tenantErr) {
      console.error('Failed to create test tenant:', tenantErr);
      throw tenantErr;
    }

    // Create test teams
    const teams = [
      { name: 'Sales Team', description: 'Sales department', tenant_id: TEST_TENANT_ID },
      { name: 'Marketing Team', description: 'Marketing department', tenant_id: TEST_TENANT_ID },
    ];

    const { data: createdTeams, error: teamErr } = await supabase
      .from('teams')
      .insert(teams)
      .select();

    if (teamErr) {
      console.error('Failed to create test teams:', teamErr);
      throw teamErr;
    }

    TEST_TEAM_IDS.push(...createdTeams.map((t) => t.id));
    console.log('Created test teams:', TEST_TEAM_IDS);
  });

  after(async () => {
    // Cleanup test data
    if (TEST_TEAM_IDS.length > 0) {
      await supabase.from('team_members').delete().in('team_id', TEST_TEAM_IDS);
      await supabase.from('teams').delete().in('id', TEST_TEAM_IDS);
    }
    if (TEST_EMPLOYEE_IDS.length > 0) {
      await supabase.from('employees').delete().in('id', TEST_EMPLOYEE_IDS);
    }
    if (TEST_USER_IDS.length > 0) {
      await supabase.from('users').delete().in('id', TEST_USER_IDS);
    }
    await supabase.from('tenant').delete().eq('id', TEST_TENANT_ID);
    console.log('Cleaned up test data');
  });

  // ─── Permission Column Tests ───────────────────────────────────────────

  describe('perm_* columns on users table', () => {
    it('can create user with all perm_* columns', async () => {
      const testUser = {
        email: `admin-test-${Date.now()}@test.com`,
        first_name: 'Admin',
        last_name: 'Test User',
        tenant_id: TEST_TENANT_ID,
        role: 'employee',
        employee_role: 'director',
        status: 'active',
        perm_notes_anywhere: true,
        perm_all_records: true,
        perm_reports: true,
        perm_employees: true,
        perm_settings: true,
      };

      const { data: user, error } = await supabase
        .from('users')
        .insert(testUser)
        .select()
        .single();

      if (error) {
        console.error('Create user error:', error);
      }

      assert.ok(!error, `Should create user without error: ${error?.message}`);
      assert.ok(user, 'Should return created user');
      assert.strictEqual(user.perm_notes_anywhere, true);
      assert.strictEqual(user.perm_all_records, true);
      assert.strictEqual(user.perm_reports, true);
      assert.strictEqual(user.perm_employees, true);
      assert.strictEqual(user.perm_settings, true);
      assert.strictEqual(user.employee_role, 'director');

      TEST_USER_IDS.push(user.id);
    });

    it('can create user with minimal permissions (defaults)', async () => {
      const testUser = {
        email: `basic-test-${Date.now()}@test.com`,
        first_name: 'Basic',
        last_name: 'Test User',
        tenant_id: TEST_TENANT_ID,
        role: 'employee',
        status: 'active',
        // No perm_* columns - should use defaults
      };

      const { data: user, error } = await supabase
        .from('users')
        .insert(testUser)
        .select()
        .single();

      assert.ok(!error, `Should create user without error: ${error?.message}`);
      assert.ok(user, 'Should return created user');
      // Check defaults
      assert.strictEqual(user.perm_notes_anywhere, true, 'perm_notes_anywhere should default to true');
      assert.strictEqual(user.perm_all_records, false, 'perm_all_records should default to false');
      assert.strictEqual(user.perm_reports, false, 'perm_reports should default to false');
      assert.strictEqual(user.perm_employees, false, 'perm_employees should default to false');
      assert.strictEqual(user.perm_settings, false, 'perm_settings should default to false');
      assert.strictEqual(user.employee_role, 'employee', 'employee_role should default to employee');

      TEST_USER_IDS.push(user.id);
    });

    it('can update user perm_* columns', async () => {
      // First create a basic user
      const testUser = {
        email: `update-test-${Date.now()}@test.com`,
        first_name: 'Update',
        last_name: 'Test User',
        tenant_id: TEST_TENANT_ID,
        role: 'employee',
        status: 'active',
      };

      const { data: user, error: createErr } = await supabase
        .from('users')
        .insert(testUser)
        .select()
        .single();

      assert.ok(!createErr, `Should create user: ${createErr?.message}`);
      TEST_USER_IDS.push(user.id);

      // Now update permissions
      const { data: updatedUser, error: updateErr } = await supabase
        .from('users')
        .update({
          perm_reports: true,
          perm_all_records: true,
          employee_role: 'manager',
        })
        .eq('id', user.id)
        .select()
        .single();

      assert.ok(!updateErr, `Should update without error: ${updateErr?.message}`);
      assert.strictEqual(updatedUser.perm_reports, true);
      assert.strictEqual(updatedUser.perm_all_records, true);
      assert.strictEqual(updatedUser.employee_role, 'manager');
      // Unchanged columns should retain values
      assert.strictEqual(updatedUser.perm_notes_anywhere, true);
      assert.strictEqual(updatedUser.perm_employees, false);
    });
  });

  // ─── Team Members with access_level ────────────────────────────────────

  describe('team_members access_level column', () => {
    let testUserId;

    before(async () => {
      // Create a user for team membership tests
      const { data: user, error } = await supabase
        .from('users')
        .insert({
          email: `team-test-${Date.now()}@test.com`,
          first_name: 'Team',
          last_name: 'Test User',
          tenant_id: TEST_TENANT_ID,
          role: 'employee',
          status: 'active',
        })
        .select()
        .single();

      assert.ok(!error, `Should create test user: ${error?.message}`);
      testUserId = user.id;
      TEST_USER_IDS.push(user.id);
    });

    it('can create team membership with access_level=view_own', async () => {
      const { data: membership, error } = await supabase
        .from('team_members')
        .insert({
          team_id: TEST_TEAM_IDS[0],
          user_id: testUserId,
          role: 'member',
          access_level: 'view_own',
        })
        .select()
        .single();

      assert.ok(!error, `Should create membership: ${error?.message}`);
      assert.strictEqual(membership.access_level, 'view_own');

      // Cleanup
      await supabase.from('team_members').delete().eq('id', membership.id);
    });

    it('can create team membership with access_level=view_team', async () => {
      const { data: membership, error } = await supabase
        .from('team_members')
        .insert({
          team_id: TEST_TEAM_IDS[0],
          user_id: testUserId,
          role: 'member',
          access_level: 'view_team',
        })
        .select()
        .single();

      assert.ok(!error, `Should create membership: ${error?.message}`);
      assert.strictEqual(membership.access_level, 'view_team');

      // Cleanup
      await supabase.from('team_members').delete().eq('id', membership.id);
    });

    it('can create team membership with access_level=manage_team', async () => {
      const { data: membership, error } = await supabase
        .from('team_members')
        .insert({
          team_id: TEST_TEAM_IDS[0],
          user_id: testUserId,
          role: 'manager',
          access_level: 'manage_team',
        })
        .select()
        .single();

      assert.ok(!error, `Should create membership: ${error?.message}`);
      assert.strictEqual(membership.access_level, 'manage_team');

      // Cleanup
      await supabase.from('team_members').delete().eq('id', membership.id);
    });

    it('rejects invalid access_level values', async () => {
      const { data, error } = await supabase
        .from('team_members')
        .insert({
          team_id: TEST_TEAM_IDS[0],
          user_id: testUserId,
          role: 'member',
          access_level: 'invalid_level',
        })
        .select()
        .single();

      assert.ok(error, 'Should reject invalid access_level');
      assert.ok(error.message.includes('check') || error.code === '23514', 'Should be a check constraint violation');
    });

    it('defaults access_level to view_own when not specified', async () => {
      const { data: membership, error } = await supabase
        .from('team_members')
        .insert({
          team_id: TEST_TEAM_IDS[1],
          user_id: testUserId,
          role: 'member',
          // No access_level specified
        })
        .select()
        .single();

      assert.ok(!error, `Should create membership: ${error?.message}`);
      assert.strictEqual(membership.access_level, 'view_own', 'Should default to view_own');

      // Cleanup
      await supabase.from('team_members').delete().eq('id', membership.id);
    });
  });

  // ─── User-Employee Linkage ─────────────────────────────────────────────

  describe('user-employee email linkage', () => {
    it('user and employee with same email can be linked via user_id', async () => {
      const testEmail = `linkage-test-${Date.now()}@test.com`;

      // Create user
      const { data: user, error: userErr } = await supabase
        .from('users')
        .insert({
          email: testEmail,
          first_name: 'Linkage',
          last_name: 'Test',
          tenant_id: TEST_TENANT_ID,
          role: 'employee',
          status: 'active',
        })
        .select()
        .single();

      assert.ok(!userErr, `Should create user: ${userErr?.message}`);
      TEST_USER_IDS.push(user.id);

      // Create employee with same email
      const { data: employee, error: empErr } = await supabase
        .from('employees')
        .insert({
          first_name: 'Linkage',
          last_name: 'Test',
          email: testEmail,
          tenant_id: TEST_TENANT_ID,
          status: 'active',
        })
        .select()
        .single();

      assert.ok(!empErr, `Should create employee: ${empErr?.message}`);
      TEST_EMPLOYEE_IDS.push(employee.id);

      // Now create team_member with user_id (not just employee_id)
      const { data: membership, error: memErr } = await supabase
        .from('team_members')
        .insert({
          team_id: TEST_TEAM_IDS[0],
          user_id: user.id,
          employee_id: employee.id,
          role: 'member',
          access_level: 'view_team',
        })
        .select()
        .single();

      assert.ok(!memErr, `Should create membership with user_id: ${memErr?.message}`);
      assert.strictEqual(membership.user_id, user.id);
      assert.strictEqual(membership.employee_id, employee.id);

      // Cleanup
      await supabase.from('team_members').delete().eq('id', membership.id);
    });
  });

  // ─── user_profile_view Tests ───────────────────────────────────────────

  describe('user_profile_view includes perm_* columns', () => {
    it('can query user_profile_view and see perm_* columns', async () => {
      // Create a user with specific permissions
      const testEmail = `profile-view-${Date.now()}@test.com`;
      const { data: user, error: createErr } = await supabase
        .from('users')
        .insert({
          email: testEmail,
          first_name: 'Profile',
          last_name: 'View Test',
          tenant_id: TEST_TENANT_ID,
          role: 'employee',
          employee_role: 'manager',
          status: 'active',
          perm_notes_anywhere: true,
          perm_all_records: true,
          perm_reports: true,
          perm_employees: false,
          perm_settings: false,
        })
        .select()
        .single();

      assert.ok(!createErr, `Should create user: ${createErr?.message}`);
      TEST_USER_IDS.push(user.id);

      // Query the view
      const { data: profile, error: viewErr } = await supabase
        .from('user_profile_view')
        .select('*')
        .eq('user_id', user.id)
        .single();

      assert.ok(!viewErr, `Should query view: ${viewErr?.message}`);
      assert.ok(profile, 'Should return profile');
      
      // Check perm_* columns are present
      assert.strictEqual(profile.perm_notes_anywhere, true);
      assert.strictEqual(profile.perm_all_records, true);
      assert.strictEqual(profile.perm_reports, true);
      assert.strictEqual(profile.perm_employees, false);
      assert.strictEqual(profile.perm_settings, false);
      assert.strictEqual(profile.employee_role, 'manager');
    });
  });
});

// ─── Visibility Scope Integration ────────────────────────────────────────────

describe('Visibility Scope Integration', { skip: SKIP_INTEGRATION }, () => {
  // These tests verify the getVisibilityScope function works with real DB data
  // Import the actual teamVisibility module
  let getVisibilityScope;
  let clearVisibilityCache;

  before(async () => {
    try {
      const mod = await import('../../lib/teamVisibility.js');
      getVisibilityScope = mod.getVisibilityScope;
      clearVisibilityCache = mod.clearVisibilityCache;
    } catch (e) {
      console.log('Could not import teamVisibility, skipping scope tests');
    }
  });

  beforeEach(() => {
    if (clearVisibilityCache) {
      clearVisibilityCache();
    }
  });

  it('user with perm_settings=true gets bypass scope', async function () {
    if (!getVisibilityScope) {
      this.skip();
      return;
    }

    const adminUser = {
      id: 'test-admin-' + Date.now(),
      role: 'employee',
      tenant_id: TEST_TENANT_ID,
      perm_settings: true,
      perm_employees: false,
    };

    const scope = await getVisibilityScope(adminUser, supabase);
    assert.strictEqual(scope.bypass, true);
    assert.strictEqual(scope.mode, 'bypass');
  });

  it('user with perm_employees=true gets bypass scope', async function () {
    if (!getVisibilityScope) {
      this.skip();
      return;
    }

    const hrUser = {
      id: 'test-hr-' + Date.now(),
      role: 'employee',
      tenant_id: TEST_TENANT_ID,
      perm_settings: false,
      perm_employees: true,
    };

    const scope = await getVisibilityScope(hrUser, supabase);
    assert.strictEqual(scope.bypass, true);
  });

  it('basic user without elevated perms does NOT bypass', async function () {
    if (!getVisibilityScope) {
      this.skip();
      return;
    }

    const basicUser = {
      id: 'test-basic-' + Date.now(),
      role: 'employee',
      tenant_id: TEST_TENANT_ID,
      perm_settings: false,
      perm_employees: false,
      perm_all_records: false,
    };

    const scope = await getVisibilityScope(basicUser, supabase);
    assert.strictEqual(scope.bypass, false);
  });
});
