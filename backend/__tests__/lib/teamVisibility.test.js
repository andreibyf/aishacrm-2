/**
 * Unit tests for backend/lib/teamVisibility.js
 *
 * Tests the core getVisibilityScope function with mocked Supabase queries.
 * Covers role-based bypass, visibility modes (shared vs hierarchical),
 * team membership resolution, caching, and edge cases.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  getVisibilityScope,
  getAccessLevel,
  clearVisibilityCache,
  clearSettingsCache,
} from '../../lib/teamVisibility.js';

// ─── Mock Supabase builder ───────────────────────────────────────────────────

/**
 * Creates a chainable mock Supabase client where you register expected
 * query results keyed by table name.
 *
 * Usage:
 *   const sb = mockSupabase({
 *     modulesettings: { data: { settings: { visibility_mode: 'shared' } }, error: null },
 *     team_members:   { data: [{ team_id: 't1', role: 'member', employee_id: 'u1' }], error: null },
 *   });
 */
function mockSupabase(tableResults = {}) {
  // Track which table + filters each query chain targets so we can
  // return different results for the same table queried twice (e.g.
  // team_members queried once for user's memberships, once for all team members).
  let callIndex = {};

  function createChain(table) {
    const idx = (callIndex[table] = (callIndex[table] || 0) + 1);
    const results = tableResults[table];

    // Support array of results for sequential calls to the same table
    let result;
    if (Array.isArray(results)) {
      result = results[idx - 1] || results[results.length - 1];
    } else {
      result = results || { data: null, error: null };
    }

    const chain = {
      _table: table,
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      or: () => chain,
      maybeSingle: () => Promise.resolve(result),
      single: () => Promise.resolve(result),
      then: (resolve) => resolve(result),
      // Make chain thenable so await works
      [Symbol.toStringTag]: 'Promise',
    };

    // Allow chain to be awaited directly (Supabase returns thenable)
    chain.then = (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected);
    chain.catch = (onRejected) => Promise.resolve(result).catch(onRejected);

    return chain;
  }

  return {
    from: (table) => createChain(table),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('teamVisibility — getVisibilityScope', () => {
  beforeEach(() => {
    clearVisibilityCache();
    clearSettingsCache();
  });

  // ── Role-based bypass ──────────────────────────────────────────────────

  describe('admin/superadmin bypass', () => {
    it('superadmin gets bypass=true', async () => {
      const user = { id: 'u1', role: 'superadmin', tenant_id: 't1' };
      const scope = await getVisibilityScope(user, mockSupabase());
      assert.strictEqual(scope.bypass, true);
      assert.strictEqual(scope.mode, 'bypass');
    });

    it('admin with perm_settings=true gets bypass=true', async () => {
      const user = { id: 'u2', role: 'admin', tenant_id: 't1', perm_settings: true };
      const scope = await getVisibilityScope(user, mockSupabase());
      assert.strictEqual(scope.bypass, true);
    });

    it('admin role gets bypass even without granular perm flags', async () => {
      const user = {
        id: 'u2b',
        role: 'admin',
        tenant_id: 't1',
        perm_settings: false,
        perm_employees: false,
      };
      const scope = await getVisibilityScope(user, mockSupabase());
      assert.strictEqual(scope.bypass, true);
    });

    it('Admin (mixed case) with perm_employees=true gets bypass=true', async () => {
      const user = { id: 'u3', role: 'Admin', tenant_id: 't1', perm_employees: true };
      const scope = await getVisibilityScope(user, mockSupabase());
      assert.strictEqual(scope.bypass, true);
    });
  });

  // ── No user / no tenant ────────────────────────────────────────────────

  describe('edge cases — missing user or tenant', () => {
    it('null user returns empty scope', async () => {
      const scope = await getVisibilityScope(null, mockSupabase());
      assert.strictEqual(scope.bypass, false);
      assert.deepStrictEqual(scope.employeeIds, []);
    });

    it('user with no id returns empty scope', async () => {
      const scope = await getVisibilityScope({}, mockSupabase());
      assert.strictEqual(scope.bypass, false);
      assert.deepStrictEqual(scope.employeeIds, []);
    });

    it('user with no tenant_id gets own-only scope', async () => {
      const user = { id: 'u1', role: 'employee' };
      const scope = await getVisibilityScope(user, mockSupabase());
      assert.strictEqual(scope.bypass, false);
      assert.deepStrictEqual(scope.employeeIds, ['u1']);
    });
  });

  // ── No team membership ─────────────────────────────────────────────────

  describe('no team membership → own-only', () => {
    it('employee with no teams sees only own records', async () => {
      const user = { id: 'u1', role: 'employee', tenant_id: 't1' };
      const sb = mockSupabase({
        modulesettings: { data: null, error: null },
        team_members: { data: [], error: null },
      });

      const scope = await getVisibilityScope(user, sb);
      assert.strictEqual(scope.bypass, false);
      assert.deepStrictEqual(scope.employeeIds, ['u1']);
    });

    it('user found via user_id match (no employee_id) gets team scope', async () => {
      // Regression test for the .or() fix: membership row has user_id set but
      // employee_id points to a different ID — user must still be found.
      const user = { id: 'auth-user-id', role: 'employee', tenant_id: 't1' };
      const sb = mockSupabase({
        modulesettings: { data: { settings: { visibility_mode: 'hierarchical' } }, error: null },
        team_members: [
          {
            data: [
              {
                team_id: 'team1',
                role: 'member',
                access_level: 'view_own',
                user_id: 'auth-user-id',
                employee_id: 'emp-different-id',
              },
            ],
            error: null,
          },
          {
            data: [{ employee_id: 'auth-user-id' }, { employee_id: 'emp-different-id' }],
            error: null,
          },
        ],
      });

      const scope = await getVisibilityScope(user, sb);
      assert.strictEqual(scope.bypass, false);
      assert.ok(scope.teamIds.includes('team1'), 'user_id match should grant team membership');
    });
  });

  // ── Shared mode ────────────────────────────────────────────────────────

  describe('shared visibility mode', () => {
    it('member sees all team members in shared mode', async () => {
      const user = { id: 'u1', role: 'employee', tenant_id: 't1' };

      const sb = mockSupabase({
        modulesettings: {
          data: { settings: { visibility_mode: 'shared' } },
          error: null,
        },
        // First call: user's memberships; second call: all tenant teams; third call: all team members
        team_members: [
          {
            data: [
              { team_id: 'team1', role: 'member', access_level: 'view_team', employee_id: 'u1' },
            ],
            error: null,
          },
          {
            data: [{ employee_id: 'u1' }, { employee_id: 'u2' }, { employee_id: 'u3' }],
            error: null,
          },
        ],
        teams: [{ data: [{ id: 'team1' }, { id: 'team2' }], error: null }],
      });

      const scope = await getVisibilityScope(user, sb);
      assert.strictEqual(scope.bypass, false);
      assert.strictEqual(scope.mode, 'shared');
      // Should include self + all team members
      assert.ok(scope.employeeIds.includes('u1'));
      assert.ok(scope.employeeIds.includes('u2'));
      assert.ok(scope.employeeIds.includes('u3'));
      // Member with view_team: viewTeamIds includes team, but NOT fullAccessTeamIds
      assert.ok(scope.viewTeamIds.includes('team1'));
      assert.ok(
        !scope.fullAccessTeamIds.includes('team1'),
        'view_team members should NOT have full access',
      );
      assert.ok(
        scope.sharedTeamWriteIds.includes('team1'),
        'shared mode should enable team collaboration writes',
      );
      // teamIds (visible) should include ALL tenant teams
      assert.ok(scope.teamIds.includes('team1'));
      assert.ok(scope.teamIds.includes('team2'));
    });

    it('director in shared mode gets full R/W across entire org', async () => {
      const user = { id: 'dir1', role: 'employee', tenant_id: 't1' };

      const sb = mockSupabase({
        modulesettings: {
          data: { settings: { visibility_mode: 'shared' } },
          error: null,
        },
        team_members: [
          { data: [{ team_id: 'team1', role: 'director', employee_id: 'dir1' }], error: null },
          {
            data: [{ employee_id: 'dir1' }, { employee_id: 'u2' }, { employee_id: 'u3' }],
            error: null,
          },
        ],
        teams: [
          // child teams query returns empty
          { data: [], error: null },
          // all tenant teams query
          { data: [{ id: 'team1' }, { id: 'team2' }, { id: 'team3' }], error: null },
        ],
      });

      const scope = await getVisibilityScope(user, sb);
      assert.strictEqual(scope.mode, 'shared');
      assert.strictEqual(scope.highestRole, 'director');
      // Director in shared: fullAccessTeamIds should include ALL tenant teams
      assert.ok(scope.fullAccessTeamIds.includes('team1'));
      assert.ok(scope.fullAccessTeamIds.includes('team2'));
      assert.ok(scope.fullAccessTeamIds.includes('team3'));
    });
  });

  // ── Hierarchical mode ──────────────────────────────────────────────────

  describe('hierarchical visibility mode', () => {
    it('member with view_team sees team members but does NOT have full R/W', async () => {
      const user = { id: 'u1', role: 'employee', tenant_id: 't1' };

      const sb = mockSupabase({
        modulesettings: {
          data: { settings: { visibility_mode: 'hierarchical' } },
          error: null,
        },
        team_members: [
          {
            data: [
              { team_id: 'team1', role: 'member', access_level: 'view_team', employee_id: 'u1' },
            ],
            error: null,
          },
          {
            data: [{ employee_id: 'u1' }, { employee_id: 'u2' }, { employee_id: 'u3' }],
            error: null,
          },
        ],
      });

      const scope = await getVisibilityScope(user, sb);
      assert.strictEqual(scope.bypass, false);
      assert.strictEqual(scope.mode, 'hierarchical');
      // Members see their team members (for dropdown scoping)
      assert.ok(scope.employeeIds.includes('u1'));
      assert.ok(scope.employeeIds.includes('u2'));
      assert.ok(scope.employeeIds.includes('u3'));
      // view_team: in viewTeamIds but NOT fullAccessTeamIds
      assert.ok(scope.viewTeamIds.includes('team1'));
      assert.ok(
        !scope.fullAccessTeamIds.includes('team1'),
        'view_team members should NOT have full access',
      );
      // teamIds only includes own team (not all org)
      assert.deepStrictEqual(scope.teamIds, ['team1']);
    });

    it('member with manage_team HAS full R/W on own team', async () => {
      const user = { id: 'u1', role: 'employee', tenant_id: 't1' };

      const sb = mockSupabase({
        modulesettings: {
          data: { settings: { visibility_mode: 'hierarchical' } },
          error: null,
        },
        team_members: [
          {
            data: [
              { team_id: 'team1', role: 'member', access_level: 'manage_team', employee_id: 'u1' },
            ],
            error: null,
          },
          {
            data: [{ employee_id: 'u1' }, { employee_id: 'u2' }, { employee_id: 'u3' }],
            error: null,
          },
        ],
      });

      const scope = await getVisibilityScope(user, sb);
      assert.strictEqual(scope.bypass, false);
      // manage_team: in BOTH viewTeamIds AND fullAccessTeamIds
      assert.ok(scope.viewTeamIds.includes('team1'));
      assert.ok(scope.fullAccessTeamIds.includes('team1'));
    });

    it('manager sees team members in hierarchical mode', async () => {
      const user = { id: 'mgr1', role: 'employee', tenant_id: 't1' };

      const sb = mockSupabase({
        modulesettings: {
          data: { settings: { visibility_mode: 'hierarchical' } },
          error: null,
        },
        team_members: [
          { data: [{ team_id: 'team1', role: 'manager', employee_id: 'mgr1' }], error: null },
          {
            data: [{ employee_id: 'mgr1' }, { employee_id: 'emp1' }, { employee_id: 'emp2' }],
            error: null,
          },
        ],
      });

      const scope = await getVisibilityScope(user, sb);
      assert.strictEqual(scope.bypass, false);
      assert.ok(scope.employeeIds.includes('mgr1'));
      assert.ok(scope.employeeIds.includes('emp1'));
      assert.ok(scope.employeeIds.includes('emp2'));
    });
  });

  // ── Caching ────────────────────────────────────────────────────────────

  describe('caching', () => {
    it('second call returns cached result without hitting Supabase again', async () => {
      let callCount = 0;
      const sb = {
        from: (_table) => {
          callCount++;
          const chain = {
            select: () => chain,
            eq: () => chain,
            in: () => chain,
            or: () => chain,
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
            then: (fn) => Promise.resolve({ data: [], error: null }).then(fn),
            catch: (fn) => Promise.resolve({ data: [], error: null }).catch(fn),
          };
          return chain;
        },
      };

      const user = { id: 'cache-user', role: 'employee', tenant_id: 't1' };

      await getVisibilityScope(user, sb);
      const firstCallCount = callCount;

      await getVisibilityScope(user, sb);
      // Should not have made additional Supabase calls
      assert.strictEqual(callCount, firstCallCount, 'Cache should prevent additional DB calls');
    });

    it('clearVisibilityCache forces fresh fetch', async () => {
      let callCount = 0;
      const sb = {
        from: () => {
          callCount++;
          const chain = {
            select: () => chain,
            eq: () => chain,
            in: () => chain,
            or: () => chain,
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
            then: (fn) => Promise.resolve({ data: [], error: null }).then(fn),
            catch: (fn) => Promise.resolve({ data: [], error: null }).catch(fn),
          };
          return chain;
        },
      };

      const user = { id: 'cache-user-2', role: 'employee', tenant_id: 't1' };

      await getVisibilityScope(user, sb);
      const firstCallCount = callCount;

      clearVisibilityCache('cache-user-2');

      await getVisibilityScope(user, sb);
      assert.ok(callCount > firstCallCount, 'Should make new calls after cache clear');
    });
  });

  // ── Error resilience ───────────────────────────────────────────────────

  describe('error resilience', () => {
    it('falls back to own-only if team_members query fails', async () => {
      const user = { id: 'u1', role: 'employee', tenant_id: 't1' };

      const sb = mockSupabase({
        modulesettings: { data: null, error: null },
        team_members: { data: null, error: { message: 'DB error' } },
      });

      const scope = await getVisibilityScope(user, sb);
      assert.strictEqual(scope.bypass, false);
      assert.deepStrictEqual(scope.employeeIds, ['u1']);
    });

    it('defaults to hierarchical mode if settings fetch fails', async () => {
      const user = { id: 'u1', role: 'employee', tenant_id: 't1' };

      const sb = mockSupabase({
        modulesettings: { data: null, error: { message: 'Settings error' } },
        team_members: { data: [], error: null },
      });

      const scope = await getVisibilityScope(user, sb);
      assert.strictEqual(scope.mode, 'hierarchical');
    });
  });
});

// ─── Granular permissions tests ───────────────────────────────────────────────

describe('teamVisibility — granular perm_* permissions', () => {
  beforeEach(() => {
    clearVisibilityCache();
    clearSettingsCache();
  });

  describe('perm_settings and perm_employees bypass', () => {
    it('user with perm_settings=true gets bypass (even if role=employee)', async () => {
      const user = {
        id: 'u1',
        role: 'employee',
        tenant_id: 't1',
        perm_settings: true,
        perm_employees: false,
      };
      const scope = await getVisibilityScope(user, mockSupabase());
      assert.strictEqual(scope.bypass, true);
      assert.strictEqual(scope.mode, 'bypass');
    });

    it('user with perm_employees=true gets bypass', async () => {
      const user = {
        id: 'u2',
        role: 'employee',
        tenant_id: 't1',
        perm_settings: false,
        perm_employees: true,
      };
      const scope = await getVisibilityScope(user, mockSupabase());
      assert.strictEqual(scope.bypass, true);
    });

    it('user with both perm_settings and perm_employees=true gets bypass', async () => {
      const user = {
        id: 'u3',
        role: 'manager',
        tenant_id: 't1',
        perm_settings: true,
        perm_employees: true,
      };
      const scope = await getVisibilityScope(user, mockSupabase());
      assert.strictEqual(scope.bypass, true);
    });

    it('user with perm_settings=false and perm_employees=false does NOT bypass', async () => {
      const user = {
        id: 'u4',
        role: 'manager',
        tenant_id: 't1',
        perm_settings: false,
        perm_employees: false,
      };
      const sb = mockSupabase({
        modulesettings: { data: null, error: null },
        team_members: { data: [], error: null },
      });
      const scope = await getVisibilityScope(user, sb);
      assert.strictEqual(scope.bypass, false);
    });
  });

  describe('perm_all_records for org-wide visibility', () => {
    it('user with perm_all_records=true sees all tenant teams', async () => {
      const user = {
        id: 'u1',
        role: 'employee',
        tenant_id: 't1',
        perm_all_records: true,
        perm_notes_anywhere: true,
      };

      const sb = mockSupabase({
        modulesettings: {
          data: { settings: { visibility_mode: 'hierarchical' } },
          error: null,
        },
        team_members: [
          {
            data: [
              { team_id: 'team1', role: 'member', access_level: 'view_own', employee_id: 'u1' },
            ],
            error: null,
          },
          { data: [{ employee_id: 'u1' }, { employee_id: 'u2' }], error: null },
        ],
        teams: [{ data: [{ id: 'team1' }, { id: 'team2' }, { id: 'team3' }], error: null }],
      });

      const scope = await getVisibilityScope(user, sb);
      assert.strictEqual(scope.bypass, false);
      // Should see all teams (org-wide read via perm_all_records)
      assert.ok(scope.teamIds.includes('team1'));
      assert.ok(scope.teamIds.includes('team2'));
      assert.ok(scope.teamIds.includes('team3'));
    });

    it('user with perm_all_records=false only sees own team', async () => {
      const user = {
        id: 'u1',
        role: 'employee',
        tenant_id: 't1',
        perm_all_records: false,
      };

      const sb = mockSupabase({
        modulesettings: {
          data: { settings: { visibility_mode: 'hierarchical' } },
          error: null,
        },
        team_members: [
          {
            data: [
              { team_id: 'team1', role: 'member', access_level: 'view_team', employee_id: 'u1' },
            ],
            error: null,
          },
          { data: [{ employee_id: 'u1' }, { employee_id: 'u2' }], error: null },
        ],
      });

      const scope = await getVisibilityScope(user, sb);
      assert.strictEqual(scope.bypass, false);
      // Should only see own team (hierarchical, no perm_all_records)
      assert.deepStrictEqual(scope.teamIds, ['team1']);
    });
  });

  describe('access_level determines fullAccessTeamIds', () => {
    it('manage_team access_level grants full R/W on that team', async () => {
      const user = {
        id: 'u1',
        role: 'employee',
        tenant_id: 't1',
      };

      const sb = mockSupabase({
        modulesettings: { data: null, error: null },
        team_members: [
          {
            data: [
              { team_id: 'team1', role: 'member', access_level: 'manage_team', employee_id: 'u1' },
            ],
            error: null,
          },
          { data: [{ employee_id: 'u1' }], error: null },
        ],
      });

      const scope = await getVisibilityScope(user, sb);
      assert.ok(scope.fullAccessTeamIds.includes('team1'));
    });

    it('view_team access_level does NOT grant full R/W', async () => {
      const user = {
        id: 'u1',
        role: 'employee',
        tenant_id: 't1',
      };

      const sb = mockSupabase({
        modulesettings: { data: null, error: null },
        team_members: [
          {
            data: [
              { team_id: 'team1', role: 'member', access_level: 'view_team', employee_id: 'u1' },
            ],
            error: null,
          },
          { data: [{ employee_id: 'u1' }], error: null },
        ],
      });

      const scope = await getVisibilityScope(user, sb);
      // view_team should be in viewTeamIds but NOT in fullAccessTeamIds
      assert.ok(!scope.fullAccessTeamIds.includes('team1'));
      assert.ok(scope.viewTeamIds.includes('team1'));
    });

    it('view_own access_level does NOT grant view_team or full access', async () => {
      const user = {
        id: 'u1',
        role: 'employee',
        tenant_id: 't1',
      };

      const sb = mockSupabase({
        modulesettings: { data: null, error: null },
        team_members: [
          {
            data: [
              { team_id: 'team1', role: 'member', access_level: 'view_own', employee_id: 'u1' },
            ],
            error: null,
          },
          { data: [{ employee_id: 'u1' }], error: null },
        ],
      });

      const scope = await getVisibilityScope(user, sb);
      // view_own should NOT be in fullAccessTeamIds or viewTeamIds
      assert.ok(!scope.fullAccessTeamIds.includes('team1'));
      assert.ok(!scope.viewTeamIds.includes('team1'));
      // But team should still be in teamIds (user is a member)
      assert.ok(scope.teamIds.includes('team1'));
    });

    it('null access_level falls back to role-based logic (manager=manage)', async () => {
      const user = {
        id: 'u1',
        role: 'employee',
        tenant_id: 't1',
      };

      const sb = mockSupabase({
        modulesettings: { data: null, error: null },
        team_members: [
          {
            data: [{ team_id: 'team1', role: 'manager', access_level: null, employee_id: 'u1' }],
            error: null,
          },
          { data: [{ employee_id: 'u1' }], error: null },
        ],
      });

      const scope = await getVisibilityScope(user, sb);
      // Fallback: manager role → manage_team equivalent
      assert.ok(scope.fullAccessTeamIds.includes('team1'));
    });

    it('null access_level falls back to role-based logic (member=view_team)', async () => {
      const user = {
        id: 'u1',
        role: 'employee',
        tenant_id: 't1',
      };

      const sb = mockSupabase({
        modulesettings: { data: null, error: null },
        team_members: [
          {
            data: [{ team_id: 'team1', role: 'member', access_level: null, employee_id: 'u1' }],
            error: null,
          },
          { data: [{ employee_id: 'u1' }], error: null },
        ],
      });

      const scope = await getVisibilityScope(user, sb);
      // Fallback: member role → view_team equivalent (viewTeamIds has it)
      assert.ok(scope.viewTeamIds.includes('team1'));
      // But NOT in fullAccessTeamIds
      assert.ok(!scope.fullAccessTeamIds.includes('team1'));
    });

    it('mixed access_levels across teams are handled correctly', async () => {
      const user = {
        id: 'u1',
        role: 'employee',
        tenant_id: 't1',
      };

      const sb = mockSupabase({
        modulesettings: { data: null, error: null },
        team_members: [
          {
            data: [
              { team_id: 'team1', role: 'manager', access_level: 'manage_team', employee_id: 'u1' },
              { team_id: 'team2', role: 'member', access_level: 'view_team', employee_id: 'u1' },
              { team_id: 'team3', role: 'member', access_level: 'view_own', employee_id: 'u1' },
            ],
            error: null,
          },
          { data: [{ employee_id: 'u1' }], error: null },
        ],
      });

      const scope = await getVisibilityScope(user, sb);
      // team1: manage_team → fullAccessTeamIds
      assert.ok(scope.fullAccessTeamIds.includes('team1'));
      // team2: view_team → viewTeamIds only
      assert.ok(!scope.fullAccessTeamIds.includes('team2'));
      assert.ok(scope.viewTeamIds.includes('team2'));
      // team3: view_own → neither
      assert.ok(!scope.fullAccessTeamIds.includes('team3'));
      assert.ok(!scope.viewTeamIds.includes('team3'));
      // All teams in teamIds
      assert.ok(scope.teamIds.includes('team1'));
      assert.ok(scope.teamIds.includes('team2'));
      assert.ok(scope.teamIds.includes('team3'));
    });
  });

  describe('perm_notes_anywhere in scope', () => {
    it('perm_notes_anywhere=true is included in scope', async () => {
      const user = {
        id: 'u1',
        role: 'employee',
        tenant_id: 't1',
        perm_notes_anywhere: true,
      };

      const sb = mockSupabase({
        modulesettings: { data: null, error: null },
        team_members: [
          {
            data: [
              { team_id: 'team1', role: 'member', access_level: 'view_team', employee_id: 'u1' },
            ],
            error: null,
          },
          { data: [{ employee_id: 'u1' }], error: null },
        ],
      });

      const scope = await getVisibilityScope(user, sb);
      assert.strictEqual(scope.permNotesAnywhere, true);
    });

    it('perm_notes_anywhere=false is included in scope', async () => {
      const user = {
        id: 'u1',
        role: 'employee',
        tenant_id: 't1',
        perm_notes_anywhere: false,
      };

      const sb = mockSupabase({
        modulesettings: { data: null, error: null },
        team_members: [
          {
            data: [
              { team_id: 'team1', role: 'member', access_level: 'view_team', employee_id: 'u1' },
            ],
            error: null,
          },
          { data: [{ employee_id: 'u1' }], error: null },
        ],
      });

      const scope = await getVisibilityScope(user, sb);
      assert.strictEqual(scope.permNotesAnywhere, false);
    });

    it('undefined perm_notes_anywhere defaults to true', async () => {
      const user = {
        id: 'u1',
        role: 'employee',
        tenant_id: 't1',
        // perm_notes_anywhere not set
      };

      const sb = mockSupabase({
        modulesettings: { data: null, error: null },
        team_members: [
          {
            data: [
              { team_id: 'team1', role: 'member', access_level: 'view_team', employee_id: 'u1' },
            ],
            error: null,
          },
          { data: [{ employee_id: 'u1' }], error: null },
        ],
      });

      const scope = await getVisibilityScope(user, sb);
      assert.strictEqual(scope.permNotesAnywhere, true);
    });
  });
});

// ─── getAccessLevel tests ────────────────────────────────────────────────────

describe('teamVisibility — getAccessLevel', () => {
  it('admin bypass always returns full', () => {
    const scope = {
      bypass: true,
      mode: 'bypass',
      teamIds: [],
      fullAccessTeamIds: [],
      viewTeamIds: [],
      permNotesAnywhere: true,
    };
    assert.strictEqual(getAccessLevel(scope, 'team1', 'u2', 'u1'), 'full');
    assert.strictEqual(getAccessLevel(scope, null, null, 'u1'), 'full');
  });

  it('own record always returns full', () => {
    const scope = {
      bypass: false,
      mode: 'hierarchical',
      teamIds: ['t1'],
      fullAccessTeamIds: ['t1'],
      viewTeamIds: ['t1'],
      permNotesAnywhere: true,
    };
    assert.strictEqual(getAccessLevel(scope, 'other-team', 'u1', 'u1'), 'full');
  });

  it('full-access team record returns full', () => {
    const scope = {
      bypass: false,
      mode: 'hierarchical',
      teamIds: ['team1'],
      fullAccessTeamIds: ['team1'],
      viewTeamIds: ['team1'],
      highestRole: 'member',
      permNotesAnywhere: true,
    };
    assert.strictEqual(getAccessLevel(scope, 'team1', 'u2', 'u1'), 'full');
  });

  it('visible-but-not-full-access team returns read_notes', () => {
    const scope = {
      bypass: false,
      mode: 'shared',
      teamIds: ['team1', 'team2'],
      fullAccessTeamIds: ['team1'],
      viewTeamIds: ['team1', 'team2'],
      highestRole: 'member',
      permNotesAnywhere: true,
    };
    assert.strictEqual(getAccessLevel(scope, 'team2', 'u2', 'u1'), 'read_notes');
  });

  it('shared mode: other-team record returns read_notes', () => {
    const scope = {
      bypass: false,
      mode: 'shared',
      teamIds: ['team1'],
      fullAccessTeamIds: ['team1'],
      viewTeamIds: ['team1'],
      highestRole: 'member',
      permNotesAnywhere: true,
    };
    assert.strictEqual(getAccessLevel(scope, 'team99', 'u99', 'u1'), 'read_notes');
  });

  it('hierarchical mode: other-team record returns none', () => {
    const scope = {
      bypass: false,
      mode: 'hierarchical',
      teamIds: ['team1'],
      fullAccessTeamIds: ['team1'],
      viewTeamIds: ['team1'],
      highestRole: 'member',
      permNotesAnywhere: true,
    };
    assert.strictEqual(getAccessLevel(scope, 'team99', 'u99', 'u1'), 'none');
  });

  it('unassigned record: managers/directors get full', () => {
    const scope = {
      bypass: false,
      mode: 'hierarchical',
      teamIds: ['team1'],
      fullAccessTeamIds: ['team1'],
      viewTeamIds: ['team1'],
      highestRole: 'manager',
      permNotesAnywhere: true,
    };
    assert.strictEqual(getAccessLevel(scope, null, null, 'u1'), 'full');
  });

  it('unassigned record: members get read_notes (with permNotesAnywhere=true)', () => {
    const scope = {
      bypass: false,
      mode: 'hierarchical',
      teamIds: ['team1'],
      fullAccessTeamIds: ['team1'],
      viewTeamIds: ['team1'],
      highestRole: 'member',
      permNotesAnywhere: true,
    };
    assert.strictEqual(getAccessLevel(scope, null, null, 'u1'), 'read_notes');
  });

  it('unassigned record: shared mode team members get full', () => {
    const scope = {
      bypass: false,
      mode: 'shared',
      teamIds: ['team1'],
      fullAccessTeamIds: [],
      viewTeamIds: ['team1'],
      sharedTeamWriteIds: ['team1'],
      highestRole: 'member',
      permNotesAnywhere: true,
    };
    assert.strictEqual(getAccessLevel(scope, null, null, 'u1'), 'full');
  });

  // ── New tests for perm_notes_anywhere ──────────────────────────────────

  describe('permNotesAnywhere=false returns read_only instead of read_notes', () => {
    it('unassigned record: members get read_only when permNotesAnywhere=false', () => {
      const scope = {
        bypass: false,
        mode: 'hierarchical',
        teamIds: ['team1'],
        fullAccessTeamIds: ['team1'],
        viewTeamIds: ['team1'],
        highestRole: 'member',
        permNotesAnywhere: false,
      };
      assert.strictEqual(getAccessLevel(scope, null, null, 'u1'), 'read_only');
    });

    it('view_team record returns read_only when permNotesAnywhere=false', () => {
      const scope = {
        bypass: false,
        mode: 'hierarchical',
        teamIds: ['team1'],
        fullAccessTeamIds: [],
        viewTeamIds: ['team1'],
        highestRole: 'member',
        permNotesAnywhere: false,
      };
      assert.strictEqual(getAccessLevel(scope, 'team1', 'u2', 'u1'), 'read_only');
    });

    it('shared mode: other-team record returns read_only when permNotesAnywhere=false', () => {
      const scope = {
        bypass: false,
        mode: 'shared',
        teamIds: ['team1'],
        fullAccessTeamIds: ['team1'],
        viewTeamIds: ['team1'],
        highestRole: 'member',
        permNotesAnywhere: false,
      };
      assert.strictEqual(getAccessLevel(scope, 'team99', 'u99', 'u1'), 'read_only');
    });

    it('own record still returns full even when permNotesAnywhere=false', () => {
      const scope = {
        bypass: false,
        mode: 'hierarchical',
        teamIds: ['team1'],
        fullAccessTeamIds: [],
        viewTeamIds: ['team1'],
        highestRole: 'member',
        permNotesAnywhere: false,
      };
      // Own record is always full regardless of notes permission
      assert.strictEqual(getAccessLevel(scope, 'team1', 'u1', 'u1'), 'full');
    });

    it('manage_team record still returns full even when permNotesAnywhere=false', () => {
      const scope = {
        bypass: false,
        mode: 'hierarchical',
        teamIds: ['team1'],
        fullAccessTeamIds: ['team1'],
        viewTeamIds: ['team1'],
        highestRole: 'manager',
        permNotesAnywhere: false,
      };
      // Full access team is always full regardless of notes permission
      assert.strictEqual(getAccessLevel(scope, 'team1', 'u2', 'u1'), 'full');
    });
  });

  // ── New tests for viewTeamIds ──────────────────────────────────────────

  describe('viewTeamIds determines read access', () => {
    it('record on viewTeamIds team returns read_notes', () => {
      const scope = {
        bypass: false,
        mode: 'hierarchical',
        teamIds: ['team1', 'team2'],
        fullAccessTeamIds: ['team1'],
        viewTeamIds: ['team1', 'team2'], // team2 is view_team, not manage_team
        highestRole: 'member',
        permNotesAnywhere: true,
      };
      // team2 is in viewTeamIds but not fullAccessTeamIds
      assert.strictEqual(getAccessLevel(scope, 'team2', 'u2', 'u1'), 'read_notes');
    });

    it('record on team NOT in viewTeamIds returns read_notes in shared mode', () => {
      const scope = {
        bypass: false,
        mode: 'shared',
        teamIds: ['team1', 'team2', 'team3'],
        fullAccessTeamIds: ['team1'],
        viewTeamIds: ['team1'], // Only manage_team on team1
        highestRole: 'member',
        permNotesAnywhere: true,
      };
      // team3 is visible (shared mode) but not in viewTeamIds
      assert.strictEqual(getAccessLevel(scope, 'team3', 'u3', 'u1'), 'read_notes');
    });

    it('record on team NOT in viewTeamIds returns none in hierarchical mode', () => {
      const scope = {
        bypass: false,
        mode: 'hierarchical',
        teamIds: ['team1'],
        fullAccessTeamIds: ['team1'],
        viewTeamIds: ['team1'],
        highestRole: 'member',
        permNotesAnywhere: true,
      };
      // team99 is outside user's teams entirely
      assert.strictEqual(getAccessLevel(scope, 'team99', 'u99', 'u1'), 'none');
    });

    it('shared mode view_team record returns full when sharedTeamWriteIds includes team', () => {
      const scope = {
        bypass: false,
        mode: 'shared',
        teamIds: ['team1', 'team2'],
        fullAccessTeamIds: ['team1'],
        viewTeamIds: ['team1', 'team2'],
        sharedTeamWriteIds: ['team2'],
        highestRole: 'member',
        permNotesAnywhere: true,
      };
      assert.strictEqual(getAccessLevel(scope, 'team2', 'u2', 'u1'), 'full');
    });
  });
});
