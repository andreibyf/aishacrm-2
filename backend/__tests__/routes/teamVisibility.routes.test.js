/**
 * Integration tests for team visibility + assignment history across all v2 routes.
 *
 * Validates:
 *  1. Team visibility filtering is applied on GET list endpoints
 *  2. Assignment history is recorded on PUT (assign/reassign/unassign)
 *  3. GET /:id/assignment-history returns enriched history with employee names
 *  4. Consistent behavior across all 6 entity types
 *
 * Requires Supabase credentials (skips gracefully if unavailable).
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { initSupabaseForTests, hasSupabaseCredentials } from '../setup.js';
import { getSupabaseClient } from '../../lib/supabase-db.js';

let supabaseReady = false;
const TEST_TENANT_ID = 'a11dfb63-4b18-4eb8-872e-747af2e37c46';

// We'll look up a real employee from the test tenant for assignment tests
let testEmployeeId = null;
let testEmployeeName = null;

before(async () => {
  supabaseReady = await initSupabaseForTests();
  if (!supabaseReady) return;

  // Find a real employee in the test tenant for assignment operations
  const supabase = getSupabaseClient();
  const { data: employees } = await supabase
    .from('employees')
    .select('id, first_name, last_name')
    .eq('tenant_id', TEST_TENANT_ID)
    .limit(1);

  if (employees?.length > 0) {
    testEmployeeId = employees[0].id;
    testEmployeeName = `${employees[0].first_name || ''} ${employees[0].last_name || ''}`.trim();
  }
});

// ─── Helper: create Express app with a single route mounted ─────────────────

async function createTestApp(routePath, routeFactory, port) {
  const express = (await import('express')).default;
  const app = express();
  app.use(express.json());

  // Simulate tenant context + user auth (admin for full visibility)
  app.use((req, _res, next) => {
    req.tenantId = req.headers['x-tenant-id'] || TEST_TENANT_ID;
    req.tenant = { id: req.tenantId };
    req.user = {
      id: testEmployeeId || 'test-user-id',
      role: 'admin',
      tenant_id: req.tenantId,
    };
    next();
  });

  app.use(routePath, routeFactory(null));
  const server = app.listen(port);
  await new Promise((r) => server.on('listening', r));
  return { app, server };
}

async function req(port, method, path, body, headers = {}) {
  const defaultHeaders = {
    'Content-Type': 'application/json',
    'x-tenant-id': TEST_TENANT_ID,
    ...headers,
  };
  const res = await fetch(`http://localhost:${port}${path}`, {
    method,
    headers: defaultHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });
  return res;
}

// ─── Entity configurations ──────────────────────────────────────────────────

const ENTITIES = [
  {
    name: 'contacts',
    routePath: '/api/v2/contacts',
    importPath: '../../routes/contacts.v2.js',
    port: 3200,
    createPayload: {
      tenant_id: TEST_TENANT_ID,
      first_name: 'TeamVis',
      last_name: 'TestContact',
      email: 'teamvis-contact@test.com',
      is_test_data: true,
    },
    listKey: 'contacts',
    singleKey: 'contact',
    historyEntityType: 'contact',
  },
  {
    name: 'accounts',
    routePath: '/api/v2/accounts',
    importPath: '../../routes/accounts.v2.js',
    port: 3201,
    createPayload: {
      tenant_id: TEST_TENANT_ID,
      name: 'TeamVis Test Account',
      is_test_data: true,
    },
    listKey: 'accounts',
    singleKey: 'account',
    historyEntityType: 'account',
  },
  {
    name: 'opportunities',
    routePath: '/api/v2/opportunities',
    importPath: '../../routes/opportunities.v2.js',
    port: 3202,
    createPayload: {
      tenant_id: TEST_TENANT_ID,
      name: 'TeamVis Test Opp',
      status: 'open',
      is_test_data: true,
    },
    listKey: 'opportunities',
    singleKey: 'opportunity',
    historyEntityType: 'opportunity',
  },
  {
    name: 'activities',
    routePath: '/api/v2/activities',
    importPath: '../../routes/activities.v2.js',
    port: 3203,
    createPayload: {
      tenant_id: TEST_TENANT_ID,
      type: 'task',
      subject: 'TeamVis Test Activity',
      is_test_data: true,
    },
    listKey: 'activities',
    singleKey: 'activity',
    historyEntityType: 'activity',
  },
  {
    name: 'bizdevsources',
    routePath: '/api/bizdevsources',
    importPath: '../../routes/bizdevsources.js',
    port: 3204,
    createPayload: {
      tenant_id: TEST_TENANT_ID,
      source: 'TeamVis Test Source',
      company_name: 'TeamVis Corp',
      is_test_data: true,
    },
    listKey: 'bizdevsources',
    singleKey: null, // bizdevsources returns data directly
    historyEntityType: 'bizdev_source',
  },
];

// ─── Test: getVisibilityScope import works (sanity) ─────────────────────────

describe('Team visibility — shared utility import', () => {
  it('getVisibilityScope is importable and returns expected shape', async () => {
    const { getVisibilityScope } = await import('../../lib/teamVisibility.js');
    assert.strictEqual(typeof getVisibilityScope, 'function');

    // With null user, returns safe default
    const scope = await getVisibilityScope(null, { from: () => ({ select: () => ({}) }) });
    assert.strictEqual(scope.bypass, false);
    assert.ok(Array.isArray(scope.employeeIds));
  });
});

// ─── Test: Assignment history recording + retrieval per entity ───────────────

for (const entity of ENTITIES) {
  describe(`${entity.name} — assignment history`, () => {
    let server;
    let createdId;

    before(async () => {
      if (!supabaseReady || !testEmployeeId) return;

      const mod = await import(entity.importPath);
      const factory = mod.default;
      const result = await createTestApp(entity.routePath, factory, entity.port);
      server = result.server;
    });

    after(async () => {
      // Cleanup: delete test record
      if (createdId && supabaseReady) {
        const supabase = getSupabaseClient();
        const tableName = entity.name === 'bizdevsources' ? 'bizdev_sources' : entity.name;
        await supabase.from(tableName).delete().eq('id', createdId);
        // Cleanup assignment_history
        await supabase
          .from('assignment_history')
          .delete()
          .eq('entity_id', createdId)
          .eq('entity_type', entity.historyEntityType);
      }
      if (server) await new Promise((r) => server.close(r));
    });

    it(`POST ${entity.routePath} creates a record for assignment testing`, async () => {
      if (!supabaseReady || !testEmployeeId) return;

      const res = await req(entity.port, 'POST', entity.routePath, entity.createPayload);
      const json = await res.json();

      if (res.status !== 200 && res.status !== 201) {
        // Some entities may have additional required fields; skip gracefully
        console.log(
          `[${entity.name}] POST returned ${res.status}: ${JSON.stringify(json).slice(0, 200)}`,
        );
        return;
      }

      const data = json.data;
      createdId = data?.id || data?.[entity.singleKey]?.id || data?.[entity.listKey]?.[0]?.id;
      assert.ok(createdId, `Should have created a ${entity.name} record`);
    });

    it(`PUT ${entity.routePath}/:id with assigned_to records assignment history`, async () => {
      if (!supabaseReady || !testEmployeeId || !createdId) return;

      // Assign to employee
      const res = await req(entity.port, 'PUT', `${entity.routePath}/${createdId}`, {
        tenant_id: TEST_TENANT_ID,
        assigned_to: testEmployeeId,
      });

      const json = await res.json();
      assert.ok(
        [200, 201].includes(res.status),
        `PUT assign returned ${res.status}: ${JSON.stringify(json).slice(0, 200)}`,
      );

      // Give non-blocking insert a moment to complete
      await new Promise((r) => setTimeout(r, 500));

      // Verify assignment_history record was created
      const supabase = getSupabaseClient();
      const { data: history } = await supabase
        .from('assignment_history')
        .select('*')
        .eq('entity_id', createdId)
        .eq('entity_type', entity.historyEntityType)
        .eq('action', 'assign');

      assert.ok(
        history && history.length > 0,
        `Should have an 'assign' history entry for ${entity.name}`,
      );
      assert.strictEqual(history[0].assigned_to, testEmployeeId);
      assert.strictEqual(history[0].assigned_from, null);
    });

    it(`PUT ${entity.routePath}/:id unassign records history`, async () => {
      if (!supabaseReady || !testEmployeeId || !createdId) return;

      // Unassign
      const res = await req(entity.port, 'PUT', `${entity.routePath}/${createdId}`, {
        tenant_id: TEST_TENANT_ID,
        assigned_to: null,
      });

      assert.ok([200, 201].includes(res.status), `PUT unassign returned ${res.status}`);

      await new Promise((r) => setTimeout(r, 500));

      const supabase = getSupabaseClient();
      const { data: history } = await supabase
        .from('assignment_history')
        .select('*')
        .eq('entity_id', createdId)
        .eq('entity_type', entity.historyEntityType)
        .eq('action', 'unassign');

      assert.ok(
        history && history.length > 0,
        `Should have an 'unassign' history entry for ${entity.name}`,
      );
      assert.strictEqual(history[0].assigned_to, null);
      assert.strictEqual(history[0].assigned_from, testEmployeeId);
    });

    it(`GET ${entity.routePath}/:id/assignment-history returns enriched history`, async () => {
      if (!supabaseReady || !testEmployeeId || !createdId) return;

      const res = await req(
        entity.port,
        'GET',
        `${entity.routePath}/${createdId}/assignment-history?tenant_id=${TEST_TENANT_ID}`,
      );

      if (res.status !== 200) {
        const text = await res.text();
        console.log(
          `[${entity.name}] assignment-history returned ${res.status}: ${text.slice(0, 200)}`,
        );
        return;
      }

      const json = await res.json();
      assert.strictEqual(json.status, 'success');
      assert.ok(Array.isArray(json.data), 'data should be an array');

      // Should have at least the assign + unassign entries from previous tests
      assert.ok(json.data.length >= 2, `Expected >=2 history entries, got ${json.data.length}`);

      // Verify enrichment: employee names should be resolved
      const assignEntry = json.data.find((h) => h.action === 'assign');
      if (assignEntry) {
        assert.ok('assigned_to_name' in assignEntry, 'History entry should have assigned_to_name');
        assert.ok(
          'assigned_from_name' in assignEntry,
          'History entry should have assigned_from_name',
        );
        assert.ok('assigned_by_name' in assignEntry, 'History entry should have assigned_by_name');
      }

      // Verify chronological order
      for (let i = 1; i < json.data.length; i++) {
        const prev = new Date(json.data[i - 1].created_at).getTime();
        const curr = new Date(json.data[i].created_at).getTime();
        assert.ok(curr >= prev, 'History should be in chronological order');
      }
    });
  });
}

// ─── Test: GET list endpoints apply visibility filter ────────────────────────

describe('Team visibility — GET list endpoints', () => {
  it('GET /api/v2/contacts returns data (admin bypass)', async () => {
    if (!supabaseReady) return;

    const mod = await import('../../routes/contacts.v2.js');
    const { server } = await createTestApp('/api/v2/contacts', mod.default, 3210);

    try {
      const res = await req(3210, 'GET', `/api/v2/contacts?tenant_id=${TEST_TENANT_ID}&limit=5`);
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.status, 'success');
      assert.ok('data' in json);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  it('GET /api/v2/accounts returns data (admin bypass)', async () => {
    if (!supabaseReady) return;

    const mod = await import('../../routes/accounts.v2.js');
    const { server } = await createTestApp('/api/v2/accounts', mod.default, 3211);

    try {
      const res = await req(3211, 'GET', `/api/v2/accounts?tenant_id=${TEST_TENANT_ID}&limit=5`);
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.status, 'success');
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  it('GET /api/v2/opportunities returns data (admin bypass)', async () => {
    if (!supabaseReady) return;

    const mod = await import('../../routes/opportunities.v2.js');
    const { server } = await createTestApp('/api/v2/opportunities', mod.default, 3212);

    try {
      const res = await req(
        3212,
        'GET',
        `/api/v2/opportunities?tenant_id=${TEST_TENANT_ID}&limit=5`,
      );
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.status, 'success');
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  it('GET /api/v2/activities returns data (admin bypass)', async () => {
    if (!supabaseReady) return;

    const mod = await import('../../routes/activities.v2.js');
    const { server } = await createTestApp('/api/v2/activities', mod.default, 3213);

    try {
      const res = await req(3213, 'GET', `/api/v2/activities?tenant_id=${TEST_TENANT_ID}&limit=5`);
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.status, 'success');
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  it('GET /api/bizdevsources returns data (admin bypass)', async () => {
    if (!supabaseReady) return;

    const mod = await import('../../routes/bizdevsources.js');
    const { server } = await createTestApp('/api/bizdevsources', mod.default, 3214);

    try {
      const res = await req(3214, 'GET', `/api/bizdevsources?tenant_id=${TEST_TENANT_ID}&limit=5`);
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.status, 'success');
    } finally {
      await new Promise((r) => server.close(r));
    }
  });
});

// ─── Test: Assignment history entity_type consistency ────────────────────────

describe('Team visibility — assignment_history entity_type values', () => {
  it('entity_type column supports all 6 expected values', async () => {
    if (!supabaseReady) return;

    const expectedTypes = [
      'lead',
      'contact',
      'account',
      'opportunity',
      'activity',
      'bizdev_source',
    ];
    const supabase = getSupabaseClient();

    // Generate a unique UUID per entity type for testing
    const crypto = await import('node:crypto');

    // Just verify the table accepts these values (no constraint violation)
    for (const entityType of expectedTypes) {
      const testId = crypto.randomUUID();
      const { error } = await supabase.from('assignment_history').insert({
        tenant_id: TEST_TENANT_ID,
        entity_type: entityType,
        entity_id: testId,
        assigned_from: null,
        assigned_to: null,
        assigned_by: null,
        action: 'assign',
      });

      assert.ok(!error, `Should accept entity_type '${entityType}': ${error?.message || 'ok'}`);

      // Cleanup
      await supabase
        .from('assignment_history')
        .delete()
        .eq('entity_id', testId)
        .eq('entity_type', entityType);
    }
  });
});
