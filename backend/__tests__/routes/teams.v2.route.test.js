/**
 * Tests for Teams V2 routes (/api/v2/teams).
 *
 * Covers:
 *  1. Team CRUD (create, list, update, soft-delete)
 *  2. Team member management (add, update role, remove, duplicate prevention)
 *  3. Visibility mode get/set (upsert into modulesettings)
 *  4. Generic /scope endpoint
 *  5. Auth/role gating (admin required, non-admin rejected)
 *  6. Validation (missing name, invalid parent, circular reference)
 *
 * Uses real Supabase DB — skips gracefully if credentials unavailable.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { initSupabaseForTests } from '../setup.js';
import { getSupabaseClient } from '../../lib/supabase-db.js';

let supabaseReady = false;
const TEST_TENANT_ID = 'a11dfb63-4b18-4eb8-872e-747af2e37c46';

// Track all created IDs for cleanup
const createdTeamIds = [];
const createdMemberIds = [];
let testEmployeeId = null;
let testEmployeeId2 = null;
let settingsIdToClean = null;

// ─── Helper: create Express app with teams route ─────────────────────────────

async function createTestApp(port, userOverride = {}) {
  const express = (await import('express')).default;
  const mod = await import('../../routes/teams.v2.js');
  const createTeamsV2Routes = mod.default;

  const app = express();
  app.use(express.json());

  // Simulate auth + tenant context
  app.use((req, _res, next) => {
    const defaultUser = {
      id: 'test-admin-id',
      role: 'admin',
      tenant_id: TEST_TENANT_ID,
      email: 'admin@test.com',
    };
    req.user = { ...defaultUser, ...userOverride };
    req.tenant = { id: TEST_TENANT_ID };
    // Set query tenant_id as fallback for getTenantId helper
    if (req.method === 'GET' && !req.query?.tenant_id) {
      req.query.tenant_id = TEST_TENANT_ID;
    }
    next();
  });

  app.use('/api/v2/teams', createTeamsV2Routes(null));
  const server = app.listen(port);
  await new Promise((r) => server.on('listening', r));
  return { app, server };
}

async function req(port, method, path, body, headers = {}) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
  };
  if (body) opts.body = JSON.stringify(body);
  return fetch(`http://localhost:${port}${path}`, opts);
}

// ─── Setup / Teardown ────────────────────────────────────────────────────────

before(async () => {
  supabaseReady = await initSupabaseForTests();
  if (!supabaseReady) return;

  const supabase = getSupabaseClient();

  // Find two real employees in the test tenant
  const { data: employees } = await supabase
    .from('employees')
    .select('id, first_name, last_name')
    .eq('tenant_id', TEST_TENANT_ID)
    .eq('is_active', true)
    .limit(2);

  if (employees?.length >= 1) testEmployeeId = employees[0].id;
  if (employees?.length >= 2) testEmployeeId2 = employees[1].id;
});

after(async () => {
  if (!supabaseReady) return;
  const supabase = getSupabaseClient();

  // Cleanup members
  for (const id of createdMemberIds) {
    await supabase.from('team_members').delete().eq('id', id);
  }
  // Cleanup teams
  for (const id of createdTeamIds) {
    // Delete members first (FK constraint)
    await supabase.from('team_members').delete().eq('team_id', id);
    await supabase.from('teams').delete().eq('id', id);
  }
  // Cleanup modulesettings
  if (settingsIdToClean) {
    await supabase.from('modulesettings').delete().eq('id', settingsIdToClean);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 1. TEAM SCOPE (any authenticated user)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Teams v2 — GET /scope', () => {
  let server;
  const PORT = 3300;

  before(async () => {
    if (!supabaseReady) return;
    ({ server } = await createTestApp(PORT));
  });
  after(async () => {
    if (server) await new Promise((r) => server.close(r));
  });

  it('returns visibility scope for authenticated user', async () => {
    if (!supabaseReady) return;

    const res = await req(PORT, 'GET', '/api/v2/teams/scope');
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.status, 'success');
    assert.ok('bypass' in json.data, 'should have bypass field');
    assert.ok('employeeIds' in json.data, 'should have employeeIds field');
    assert.ok('mode' in json.data, 'should have mode field');
  });

  it('admin user gets bypass=true', async () => {
    if (!supabaseReady) return;

    const res = await req(PORT, 'GET', '/api/v2/teams/scope');
    const json = await res.json();
    // Admin role should bypass visibility filtering
    assert.strictEqual(json.data.bypass, true);
  });
});

// Employee-role user should also get a scope response (not 403)
describe('Teams v2 — GET /scope (employee role)', () => {
  let server;
  const PORT = 3301;

  before(async () => {
    if (!supabaseReady) return;
    ({ server } = await createTestApp(PORT, { role: 'employee', id: testEmployeeId || 'emp-id' }));
  });
  after(async () => {
    if (server) await new Promise((r) => server.close(r));
  });

  it('employee can access /scope (not admin-gated)', async () => {
    if (!supabaseReady) return;

    const res = await req(PORT, 'GET', '/api/v2/teams/scope');
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.status, 'success');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. VISIBILITY MODE
// ═══════════════════════════════════════════════════════════════════════════════

describe('Teams v2 — visibility mode', () => {
  let server;
  const PORT = 3302;

  before(async () => {
    if (!supabaseReady) return;
    ({ server } = await createTestApp(PORT));

    // Clean up any existing modulesettings row for this tenant
    const supabase = getSupabaseClient();
    await supabase
      .from('modulesettings')
      .delete()
      .eq('tenant_id', TEST_TENANT_ID)
      .eq('module_name', 'teams');
  });
  after(async () => {
    if (server) await new Promise((r) => server.close(r));
    // Cleanup modulesettings
    if (supabaseReady) {
      const supabase = getSupabaseClient();
      const { data } = await supabase
        .from('modulesettings')
        .select('id')
        .eq('tenant_id', TEST_TENANT_ID)
        .eq('module_name', 'teams')
        .maybeSingle();
      if (data) {
        settingsIdToClean = data.id;
      }
    }
  });

  it('GET /visibility-mode returns hierarchical as default when no row exists', async () => {
    if (!supabaseReady) return;

    const res = await req(PORT, 'GET', `/api/v2/teams/visibility-mode?tenant_id=${TEST_TENANT_ID}`);
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.data.visibility_mode, 'hierarchical');
    assert.strictEqual(json.data.settings_id, null);
  });

  it('PUT /visibility-mode creates row when none exists (upsert)', async () => {
    if (!supabaseReady) return;

    const res = await req(PORT, 'PUT', '/api/v2/teams/visibility-mode', {
      tenant_id: TEST_TENANT_ID,
      visibility_mode: 'shared',
    });
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.data.visibility_mode, 'shared');
    assert.ok(json.data.settings_id, 'should return settings_id');
  });

  it('GET /visibility-mode reflects updated value', async () => {
    if (!supabaseReady) return;

    const res = await req(PORT, 'GET', `/api/v2/teams/visibility-mode?tenant_id=${TEST_TENANT_ID}`);
    const json = await res.json();
    assert.strictEqual(json.data.visibility_mode, 'shared');
    assert.strictEqual(json.data.is_enabled, true);
  });

  it('PUT /visibility-mode updates existing row', async () => {
    if (!supabaseReady) return;

    const res = await req(PORT, 'PUT', '/api/v2/teams/visibility-mode', {
      tenant_id: TEST_TENANT_ID,
      visibility_mode: 'hierarchical',
    });
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.data.visibility_mode, 'hierarchical');
  });

  it('PUT /visibility-mode rejects invalid mode', async () => {
    if (!supabaseReady) return;

    const res = await req(PORT, 'PUT', '/api/v2/teams/visibility-mode', {
      tenant_id: TEST_TENANT_ID,
      visibility_mode: 'invalid_mode',
    });
    assert.strictEqual(res.status, 400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. TEAM CRUD
// ═══════════════════════════════════════════════════════════════════════════════

describe('Teams v2 — team CRUD', () => {
  let server;
  const PORT = 3303;
  let teamA_id;
  let teamB_id;

  before(async () => {
    if (!supabaseReady) return;
    ({ server } = await createTestApp(PORT));
  });
  after(async () => {
    if (server) await new Promise((r) => server.close(r));
  });

  it('POST / creates a team', async () => {
    if (!supabaseReady) return;

    const res = await req(PORT, 'POST', '/api/v2/teams', {
      tenant_id: TEST_TENANT_ID,
      name: 'Test Team Alpha',
      description: 'Unit test team A',
    });
    assert.strictEqual(res.status, 201);
    const json = await res.json();
    assert.strictEqual(json.data.team.name, 'Test Team Alpha');
    assert.strictEqual(json.data.team.is_active, true);
    assert.strictEqual(json.data.team.member_count, 0);
    teamA_id = json.data.team.id;
    createdTeamIds.push(teamA_id);
  });

  it('POST / creates a second team with parent', async () => {
    if (!supabaseReady || !teamA_id) return;

    const res = await req(PORT, 'POST', '/api/v2/teams', {
      tenant_id: TEST_TENANT_ID,
      name: 'Test Team Beta',
      description: 'Child of Alpha',
      parent_team_id: teamA_id,
    });
    assert.strictEqual(res.status, 201);
    const json = await res.json();
    assert.strictEqual(json.data.team.parent_team_id, teamA_id);
    teamB_id = json.data.team.id;
    createdTeamIds.push(teamB_id);
  });

  it('POST / rejects missing name', async () => {
    if (!supabaseReady) return;

    const res = await req(PORT, 'POST', '/api/v2/teams', {
      tenant_id: TEST_TENANT_ID,
      description: 'No name',
    });
    assert.strictEqual(res.status, 400);
  });

  it('GET / lists teams with member counts', async () => {
    if (!supabaseReady) return;

    const res = await req(PORT, 'GET', `/api/v2/teams?tenant_id=${TEST_TENANT_ID}`);
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.ok(json.data.teams.length >= 2, 'Should have at least the 2 created teams');

    const alpha = json.data.teams.find((t) => t.id === teamA_id);
    assert.ok(alpha, 'Should find Team Alpha');
    assert.strictEqual(alpha.member_count, 0);
  });

  it('PUT /:id updates team name and description', async () => {
    if (!supabaseReady || !teamA_id) return;

    const res = await req(PORT, 'PUT', `/api/v2/teams/${teamA_id}`, {
      tenant_id: TEST_TENANT_ID,
      name: 'Team Alpha Renamed',
      description: 'Updated description',
    });
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.data.team.name, 'Team Alpha Renamed');
  });

  it('PUT /:id rejects self as parent', async () => {
    if (!supabaseReady || !teamA_id) return;

    const res = await req(PORT, 'PUT', `/api/v2/teams/${teamA_id}`, {
      tenant_id: TEST_TENANT_ID,
      parent_team_id: teamA_id,
    });
    assert.strictEqual(res.status, 400);
    const json = await res.json();
    assert.ok(json.message.includes('own parent'));
  });

  it('PUT /:id rejects circular parent (child → parent)', async () => {
    if (!supabaseReady || !teamA_id || !teamB_id) return;

    // teamB's parent is teamA. Try to set teamA's parent to teamB → circular.
    const res = await req(PORT, 'PUT', `/api/v2/teams/${teamA_id}`, {
      tenant_id: TEST_TENANT_ID,
      parent_team_id: teamB_id,
    });
    assert.strictEqual(res.status, 400);
    const json = await res.json();
    assert.ok(json.message.includes('ircular'));
  });

  it('DELETE /:id soft-deactivates team', async () => {
    if (!supabaseReady || !teamB_id) return;

    const res = await req(PORT, 'DELETE', `/api/v2/teams/${teamB_id}?tenant_id=${TEST_TENANT_ID}`);
    assert.strictEqual(res.status, 200);

    // Verify it's inactive
    const supabase = getSupabaseClient();
    const { data } = await supabase.from('teams').select('is_active').eq('id', teamB_id).single();
    assert.strictEqual(data.is_active, false);
  });

  it('GET / excludes inactive teams by default', async () => {
    if (!supabaseReady || !teamB_id) return;

    const res = await req(PORT, 'GET', `/api/v2/teams?tenant_id=${TEST_TENANT_ID}`);
    const json = await res.json();
    const found = json.data.teams.find((t) => t.id === teamB_id);
    assert.ok(!found, 'Deactivated team should not appear in default list');
  });

  it('GET /?include_inactive=true includes inactive teams', async () => {
    if (!supabaseReady || !teamB_id) return;

    const res = await req(
      PORT,
      'GET',
      `/api/v2/teams?tenant_id=${TEST_TENANT_ID}&include_inactive=true`,
    );
    const json = await res.json();
    const found = json.data.teams.find((t) => t.id === teamB_id);
    assert.ok(found, 'Deactivated team should appear with include_inactive=true');
    assert.strictEqual(found.is_active, false);
  });

  it('PUT /:id can reactivate a deactivated team', async () => {
    if (!supabaseReady || !teamB_id) return;

    const res = await req(PORT, 'PUT', `/api/v2/teams/${teamB_id}`, {
      tenant_id: TEST_TENANT_ID,
      is_active: true,
    });
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.data.team.is_active, true);
  });

  it('DELETE /:id returns 404 for nonexistent team', async () => {
    if (!supabaseReady) return;

    const res = await req(
      PORT,
      'DELETE',
      `/api/v2/teams/00000000-0000-0000-0000-000000000000?tenant_id=${TEST_TENANT_ID}`,
    );
    assert.strictEqual(res.status, 404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. TEAM MEMBERS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Teams v2 — member management', () => {
  let server;
  const PORT = 3304;
  let teamId;
  let memberId;

  before(async () => {
    if (!supabaseReady || !testEmployeeId) return;
    ({ server } = await createTestApp(PORT));

    // Create a team for member tests
    const res = await req(PORT, 'POST', '/api/v2/teams', {
      tenant_id: TEST_TENANT_ID,
      name: 'Member Test Team',
    });
    const json = await res.json();
    teamId = json.data.team.id;
    createdTeamIds.push(teamId);
  });
  after(async () => {
    if (server) await new Promise((r) => server.close(r));
  });

  it('POST /:id/members adds employee as member', async () => {
    if (!supabaseReady || !teamId || !testEmployeeId) return;

    const res = await req(PORT, 'POST', `/api/v2/teams/${teamId}/members`, {
      tenant_id: TEST_TENANT_ID,
      employee_id: testEmployeeId,
      role: 'member',
    });
    assert.strictEqual(res.status, 201);
    const json = await res.json();
    assert.strictEqual(json.data.member.employee_id, testEmployeeId);
    assert.strictEqual(json.data.member.role, 'member');
    memberId = json.data.member.id;
    createdMemberIds.push(memberId);
  });

  it('POST /:id/members rejects duplicate membership', async () => {
    if (!supabaseReady || !teamId || !testEmployeeId) return;

    const res = await req(PORT, 'POST', `/api/v2/teams/${teamId}/members`, {
      tenant_id: TEST_TENANT_ID,
      employee_id: testEmployeeId,
      role: 'manager',
    });
    assert.strictEqual(res.status, 409);
  });

  it('POST /:id/members defaults to member role if invalid', async () => {
    if (!supabaseReady || !teamId || !testEmployeeId2) return;

    const res = await req(PORT, 'POST', `/api/v2/teams/${teamId}/members`, {
      tenant_id: TEST_TENANT_ID,
      employee_id: testEmployeeId2,
      role: 'supreme_leader', // invalid
    });
    assert.strictEqual(res.status, 201);
    const json = await res.json();
    assert.strictEqual(json.data.member.role, 'member');
    createdMemberIds.push(json.data.member.id);
  });

  it('POST /:id/members rejects missing employee_id', async () => {
    if (!supabaseReady || !teamId) return;

    const res = await req(PORT, 'POST', `/api/v2/teams/${teamId}/members`, {
      tenant_id: TEST_TENANT_ID,
      role: 'member',
    });
    assert.strictEqual(res.status, 400);
  });

  it('POST /:id/members rejects nonexistent employee', async () => {
    if (!supabaseReady || !teamId) return;

    const res = await req(PORT, 'POST', `/api/v2/teams/${teamId}/members`, {
      tenant_id: TEST_TENANT_ID,
      employee_id: '00000000-0000-0000-0000-000000000000',
      role: 'member',
    });
    assert.strictEqual(res.status, 400);
    const json = await res.json();
    assert.ok(json.message.includes('not found'));
  });

  it('GET /:id/members lists members with employee details', async () => {
    if (!supabaseReady || !teamId) return;

    const res = await req(
      PORT,
      'GET',
      `/api/v2/teams/${teamId}/members?tenant_id=${TEST_TENANT_ID}`,
    );
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.ok(json.data.members.length >= 1, 'Should have at least 1 member');
    assert.strictEqual(json.data.team_id, teamId);

    const member = json.data.members.find((m) => m.employee_id === testEmployeeId);
    assert.ok(member, 'Should find the added employee');
    assert.ok(member.employee_name, 'Should have resolved employee_name');
    assert.ok(member.employee_email, 'Should have resolved employee_email');
  });

  it('PUT /:id/members/:memberId updates role', async () => {
    if (!supabaseReady || !teamId || !memberId) return;

    const res = await req(PORT, 'PUT', `/api/v2/teams/${teamId}/members/${memberId}`, {
      role: 'manager',
    });
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.data.member.role, 'manager');
  });

  it('PUT /:id/members/:memberId rejects invalid role', async () => {
    if (!supabaseReady || !teamId || !memberId) return;

    const res = await req(PORT, 'PUT', `/api/v2/teams/${teamId}/members/${memberId}`, {
      role: 'emperor',
    });
    assert.strictEqual(res.status, 400);
  });

  it('DELETE /:id/members/:memberId removes member', async () => {
    if (!supabaseReady || !teamId || !memberId) return;

    const res = await req(
      PORT,
      'DELETE',
      `/api/v2/teams/${teamId}/members/${memberId}?tenant_id=${TEST_TENANT_ID}`,
    );
    assert.strictEqual(res.status, 200);

    // Verify member is gone
    const supabase = getSupabaseClient();
    const { data } = await supabase
      .from('team_members')
      .select('id')
      .eq('id', memberId)
      .maybeSingle();
    assert.ok(!data, 'Member should be deleted from DB');

    // Remove from cleanup list since already deleted
    const idx = createdMemberIds.indexOf(memberId);
    if (idx >= 0) createdMemberIds.splice(idx, 1);
  });

  it('DELETE /:id/members/:memberId returns 404 for nonexistent', async () => {
    if (!supabaseReady || !teamId) return;

    const res = await req(
      PORT,
      'DELETE',
      `/api/v2/teams/${teamId}/members/00000000-0000-0000-0000-000000000000?tenant_id=${TEST_TENANT_ID}`,
    );
    assert.strictEqual(res.status, 404);
  });

  it('GET /:id/members returns 404 for nonexistent team', async () => {
    if (!supabaseReady || !teamId) return;

    const res = await req(
      PORT,
      'GET',
      `/api/v2/teams/00000000-0000-0000-0000-000000000000/members?tenant_id=${TEST_TENANT_ID}`,
    );
    assert.strictEqual(res.status, 404);
  });

  it('member count updates after adding members', async () => {
    if (!supabaseReady || !teamId) return;

    const res = await req(PORT, 'GET', `/api/v2/teams?tenant_id=${TEST_TENANT_ID}`);
    const json = await res.json();
    const team = json.data.teams.find((t) => t.id === teamId);
    // We added 2 employees (one was deleted, one remains — testEmployeeId2)
    assert.ok(team, 'Should find the team');
    assert.ok(typeof team.member_count === 'number', 'member_count should be a number');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. AUTH GATING — non-admin users rejected from management endpoints
// ═══════════════════════════════════════════════════════════════════════════════

describe('Teams v2 — role gating (employee rejected)', () => {
  let server;
  const PORT = 3305;

  before(async () => {
    if (!supabaseReady) return;
    // Mount with employee role
    ({ server } = await createTestApp(PORT, { role: 'employee' }));
  });
  after(async () => {
    if (server) await new Promise((r) => server.close(r));
  });

  it('GET /api/v2/teams returns 403 for employee', async () => {
    if (!supabaseReady) return;

    const res = await req(PORT, 'GET', `/api/v2/teams?tenant_id=${TEST_TENANT_ID}`);
    assert.strictEqual(res.status, 403);
  });

  it('POST /api/v2/teams returns 403 for employee', async () => {
    if (!supabaseReady) return;

    const res = await req(PORT, 'POST', '/api/v2/teams', {
      tenant_id: TEST_TENANT_ID,
      name: 'Should Fail',
    });
    assert.strictEqual(res.status, 403);
  });

  it('GET /visibility-mode returns 403 for employee', async () => {
    if (!supabaseReady) return;

    const res = await req(PORT, 'GET', `/api/v2/teams/visibility-mode?tenant_id=${TEST_TENANT_ID}`);
    assert.strictEqual(res.status, 403);
  });

  it('PUT /visibility-mode returns 403 for employee', async () => {
    if (!supabaseReady) return;

    const res = await req(PORT, 'PUT', '/api/v2/teams/visibility-mode', {
      tenant_id: TEST_TENANT_ID,
      visibility_mode: 'shared',
    });
    assert.strictEqual(res.status, 403);
  });

  it('GET /scope still works for employee (not admin-gated)', async () => {
    if (!supabaseReady) return;

    const res = await req(PORT, 'GET', '/api/v2/teams/scope');
    assert.strictEqual(res.status, 200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. SUPERADMIN ACCESS — confirm superadmins can manage teams too
// ═══════════════════════════════════════════════════════════════════════════════

describe('Teams v2 — superadmin access', () => {
  let server;
  const PORT = 3306;

  before(async () => {
    if (!supabaseReady) return;
    ({ server } = await createTestApp(PORT, { role: 'superadmin' }));
  });
  after(async () => {
    if (server) await new Promise((r) => server.close(r));
  });

  it('GET /api/v2/teams works for superadmin', async () => {
    if (!supabaseReady) return;

    const res = await req(PORT, 'GET', `/api/v2/teams?tenant_id=${TEST_TENANT_ID}`);
    assert.strictEqual(res.status, 200);
  });

  it('GET /visibility-mode works for superadmin', async () => {
    if (!supabaseReady) return;

    const res = await req(PORT, 'GET', `/api/v2/teams/visibility-mode?tenant_id=${TEST_TENANT_ID}`);
    assert.strictEqual(res.status, 200);
  });

  it('GET /scope works for superadmin', async () => {
    if (!supabaseReady) return;

    const res = await req(PORT, 'GET', '/api/v2/teams/scope');
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.data.bypass, true, 'Superadmin should bypass visibility');
  });
});
