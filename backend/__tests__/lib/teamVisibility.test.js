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

    it('admin gets bypass=true', async () => {
      const user = { id: 'u2', role: 'admin', tenant_id: 't1' };
      const scope = await getVisibilityScope(user, mockSupabase());
      assert.strictEqual(scope.bypass, true);
    });

    it('Admin (mixed case) gets bypass=true', async () => {
      const user = { id: 'u3', role: 'Admin', tenant_id: 't1' };
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
          { data: [{ team_id: 'team1', role: 'member', employee_id: 'u1' }], error: null },
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
      // fullAccessTeamIds should be only own teams (not all org teams for members)
      assert.ok(scope.fullAccessTeamIds.includes('team1'));
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
    it('member sees team members in hierarchical mode (full R/W on own team)', async () => {
      const user = { id: 'u1', role: 'employee', tenant_id: 't1' };

      const sb = mockSupabase({
        modulesettings: {
          data: { settings: { visibility_mode: 'hierarchical' } },
          error: null,
        },
        team_members: [
          { data: [{ team_id: 'team1', role: 'member', employee_id: 'u1' }], error: null },
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
      // fullAccessTeamIds should include own team
      assert.ok(scope.fullAccessTeamIds.includes('team1'));
      // teamIds only includes own team (not all org)
      assert.deepStrictEqual(scope.teamIds, ['team1']);
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

// ─── getAccessLevel tests ────────────────────────────────────────────────────

describe('teamVisibility — getAccessLevel', () => {
  it('admin bypass always returns full', () => {
    const scope = { bypass: true, mode: 'bypass', teamIds: [], fullAccessTeamIds: [] };
    assert.strictEqual(getAccessLevel(scope, 'team1', 'u2', 'u1'), 'full');
    assert.strictEqual(getAccessLevel(scope, null, null, 'u1'), 'full');
  });

  it('own record always returns full', () => {
    const scope = {
      bypass: false,
      mode: 'hierarchical',
      teamIds: ['t1'],
      fullAccessTeamIds: ['t1'],
    };
    assert.strictEqual(getAccessLevel(scope, 'other-team', 'u1', 'u1'), 'full');
  });

  it('full-access team record returns full', () => {
    const scope = {
      bypass: false,
      mode: 'hierarchical',
      teamIds: ['team1'],
      fullAccessTeamIds: ['team1'],
      highestRole: 'member',
    };
    assert.strictEqual(getAccessLevel(scope, 'team1', 'u2', 'u1'), 'full');
  });

  it('visible-but-not-full-access team returns read_notes', () => {
    const scope = {
      bypass: false,
      mode: 'shared',
      teamIds: ['team1', 'team2'],
      fullAccessTeamIds: ['team1'],
      highestRole: 'member',
    };
    assert.strictEqual(getAccessLevel(scope, 'team2', 'u2', 'u1'), 'read_notes');
  });

  it('shared mode: other-team record returns read_notes', () => {
    const scope = {
      bypass: false,
      mode: 'shared',
      teamIds: ['team1'],
      fullAccessTeamIds: ['team1'],
      highestRole: 'member',
    };
    assert.strictEqual(getAccessLevel(scope, 'team99', 'u99', 'u1'), 'read_notes');
  });

  it('hierarchical mode: other-team record returns none', () => {
    const scope = {
      bypass: false,
      mode: 'hierarchical',
      teamIds: ['team1'],
      fullAccessTeamIds: ['team1'],
      highestRole: 'member',
    };
    assert.strictEqual(getAccessLevel(scope, 'team99', 'u99', 'u1'), 'none');
  });

  it('unassigned record: managers/directors get full', () => {
    const scope = {
      bypass: false,
      mode: 'hierarchical',
      teamIds: ['team1'],
      fullAccessTeamIds: ['team1'],
      highestRole: 'manager',
    };
    assert.strictEqual(getAccessLevel(scope, null, null, 'u1'), 'full');
  });

  it('unassigned record: members get read_notes', () => {
    const scope = {
      bypass: false,
      mode: 'hierarchical',
      teamIds: ['team1'],
      fullAccessTeamIds: ['team1'],
      highestRole: 'member',
    };
    assert.strictEqual(getAccessLevel(scope, null, null, 'u1'), 'read_notes');
  });
});
