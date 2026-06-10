/**
 * Growth — insight-run + opportunity logic tests (Task 9)
 *
 * Pure-unit coverage for backend/lib/growth/insightService.js. No live DB /
 * network / timers: a hand-rolled fake supabase records every builder call so we
 * can assert tenant isolation, filters, sort order, and the cooldown/superadmin
 * gate. The clock (`now`), the profile loader, the ETA estimator, and the action
 * dispatcher are all injected.
 *
 * Run: node --test backend/__tests__/growth.insights.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  isSuperadmin,
  createInsightRun,
  getCurrentInsight,
  getInsightById,
  listOpportunities,
  getOpportunityDetail,
  dismissOpportunity,
  actionOpportunity,
  dispatchOpportunityAction,
  getDashboard,
} from '../lib/growth/insightService.js';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_ID = '22222222-2222-2222-2222-222222222222';

/**
 * Build a fake supabase client. `.from(table)` returns a chainable builder.
 * Every chain method (select/insert/update/eq/in/gte/order/limit) records its
 * args and returns the builder. Terminal calls (`.single()` / `.maybeSingle()`)
 * and `await` resolve to the next queued result for that table. The builder is
 * itself thenable so `await query` (no terminal selector) also resolves.
 *
 * @param {Record<string, Array<{data:any,error:any}>>} resultsByTable
 */
function makeFakeSupabase(resultsByTable = {}) {
  const calls = [];
  const builders = [];
  const queues = {};
  for (const [table, results] of Object.entries(resultsByTable)) {
    queues[table] = [...results];
  }

  function nextResult(table) {
    const q = queues[table];
    const r = (q && q.length ? q.shift() : null) || { data: null, error: null };
    return r;
  }

  function makeBuilder(table) {
    const builder = {
      table,
      eqArgs: [],
      inArgs: [],
      gteArgs: [],
      orderArgs: [],
      limitArgs: [],
      selectArgs: [],
      insertArgs: [],
      updateArgs: [],
      _resolve() {
        return nextResult(table);
      },
    };
    const chain =
      (name) =>
      (...args) => {
        calls.push({ table, method: name, args });
        if (name === 'eq') builder.eqArgs.push(args);
        if (name === 'in') builder.inArgs.push(args);
        if (name === 'gte') builder.gteArgs.push(args);
        if (name === 'order') builder.orderArgs.push(args);
        if (name === 'limit') builder.limitArgs.push(args);
        if (name === 'select') builder.selectArgs.push(args);
        if (name === 'insert') builder.insertArgs.push(args);
        if (name === 'update') builder.updateArgs.push(args);
        return builder;
      };
    builder.select = chain('select');
    builder.insert = chain('insert');
    builder.update = chain('update');
    builder.eq = chain('eq');
    builder.in = chain('in');
    builder.gte = chain('gte');
    builder.order = chain('order');
    builder.limit = chain('limit');
    builder.single = (...args) => {
      calls.push({ table, method: 'single', args });
      return Promise.resolve(builder._resolve());
    };
    builder.maybeSingle = (...args) => {
      calls.push({ table, method: 'maybeSingle', args });
      return Promise.resolve(builder._resolve());
    };
    builder.then = (onF, onR) => Promise.resolve(builder._resolve()).then(onF, onR);
    builders.push(builder);
    return builder;
  }

  return {
    calls,
    builders,
    from(table) {
      calls.push({ table, method: 'from', args: [table] });
      return makeBuilder(table);
    },
  };
}

const fixedNow = (iso) => () => new Date(iso).getTime();

// ---------------------------------------------------------------------------
// isSuperadmin
// ---------------------------------------------------------------------------

test('isSuperadmin recognises role + flag, rejects others', () => {
  assert.equal(isSuperadmin({ role: 'superadmin' }), true);
  assert.equal(isSuperadmin({ is_superadmin: true }), true);
  assert.equal(isSuperadmin({ role: 'admin' }), false);
  assert.equal(isSuperadmin({}), false);
  assert.equal(isSuperadmin(undefined), false);
});

// ---------------------------------------------------------------------------
// createInsightRun — cooldown gate
// ---------------------------------------------------------------------------

test('createInsightRun: 429 when a non-superadmin ran within 7 days', async () => {
  const now = '2026-06-09T00:00:00.000Z';
  const recent = '2026-06-05T00:00:00.000Z'; // 4 days ago
  const supabase = makeFakeSupabase({
    growth_insights: [{ data: { id: 'i1', created_at: recent }, error: null }],
  });

  let profileCalled = false;
  const res = await createInsightRun(
    supabase,
    { tenantId: TENANT_ID, user: { id: 'u1', email: 'u@x.com', role: 'employee' } },
    {
      getProfile: async () => {
        profileCalled = true;
        return {};
      },
      estimate: () => ({ eta_seconds: 60, low: 42, high: 78 }),
      now: fixedNow(now),
    },
  );

  assert.equal(res.status, 429);
  assert.equal(res.body.status, 'error');
  // next_available_at = created_at + 7 days.
  assert.equal(res.body.next_available_at, '2026-06-12T00:00:00.000Z');
  // Short-circuits before computing ETA / inserting.
  assert.equal(profileCalled, false);
  assert.ok(!supabase.calls.some((c) => c.method === 'insert'));
  // The cooldown lookup was tenant-scoped.
  const eqCall = supabase.calls.find((c) => c.method === 'eq');
  assert.deepEqual(eqCall.args, ['tenant_id', TENANT_ID]);
});

test('createInsightRun: allowed when the last run was > 7 days ago', async () => {
  const now = '2026-06-09T00:00:00.000Z';
  const old = '2026-05-01T00:00:00.000Z'; // way over 7 days
  const inserted = { id: 'new-run', status: 'running' };
  const supabase = makeFakeSupabase({
    growth_insights: [
      { data: { id: 'i1', created_at: old }, error: null }, // cooldown lookup
      { data: [], error: null }, // completed-durations lookup
      { data: inserted, error: null }, // insert ... returning
    ],
  });

  const res = await createInsightRun(
    supabase,
    { tenantId: TENANT_ID, user: { id: 'u1', email: 'u@x.com', role: 'employee' } },
    {
      getProfile: async () => ({ service_catalog: [{}], target_regions: [{}, {}] }),
      estimate: () => ({ eta_seconds: 90, low: 63, high: 117 }),
      now: fixedNow(now),
    },
  );

  assert.equal(res.status, 202);
  assert.equal(res.body.status, 'success');
  assert.equal(res.body.data.id, 'new-run');
  assert.equal(res.body.data.status, 'running');
  assert.equal(res.body.data.eta_seconds, 90);
  assert.deepEqual(res.body.data.eta_range, { low: 63, high: 117 });

  const insertCall = supabase.calls.find((c) => c.method === 'insert');
  assert.ok(insertCall, 'should insert a running row');
  assert.equal(insertCall.args[0].tenant_id, TENANT_ID);
  assert.equal(insertCall.args[0].status, 'running');
  assert.equal(insertCall.args[0].trigger, 'manual');
  assert.equal(insertCall.args[0].generated_by, 'u1');
  assert.equal(insertCall.args[0].generated_by_email, 'u@x.com');
  assert.equal(insertCall.args[0].eta_seconds, 90);
});

test('createInsightRun: superadmin bypasses cooldown → admin_adhoc', async () => {
  const now = '2026-06-09T00:00:00.000Z';
  const recent = '2026-06-08T00:00:00.000Z'; // 1 day ago (would block a normal user)
  const inserted = { id: 'admin-run', status: 'running' };
  const supabase = makeFakeSupabase({
    growth_insights: [
      { data: { id: 'i1', created_at: recent }, error: null }, // cooldown lookup (ignored)
      { data: [], error: null }, // completed-durations lookup
      { data: inserted, error: null }, // insert ... returning
    ],
  });

  const res = await createInsightRun(
    supabase,
    { tenantId: TENANT_ID, user: { id: 'admin', email: 'a@x.com', is_superadmin: true } },
    {
      getProfile: async () => ({ service_catalog: [], target_regions: [] }),
      estimate: () => ({ eta_seconds: 60, low: 42, high: 78 }),
      now: fixedNow(now),
    },
  );

  assert.equal(res.status, 202);
  assert.equal(res.body.data.id, 'admin-run');
  const insertCall = supabase.calls.find((c) => c.method === 'insert');
  assert.equal(insertCall.args[0].trigger, 'admin_adhoc');
});

test('createInsightRun: allowed when no prior run exists', async () => {
  const inserted = { id: 'first-run', status: 'running' };
  const supabase = makeFakeSupabase({
    growth_insights: [
      { data: null, error: null }, // cooldown lookup → none
      { data: [], error: null }, // completed-durations lookup
      { data: inserted, error: null }, // insert ... returning
    ],
  });

  let estimateArgs = null;
  const res = await createInsightRun(
    supabase,
    { tenantId: TENANT_ID, user: { id: 'u1', email: 'u@x.com' } },
    {
      getProfile: async () => ({ service_catalog: [{}, {}], target_regions: [{}] }),
      estimate: (a) => {
        estimateArgs = a;
        return { eta_seconds: 90, low: 63, high: 117 };
      },
      now: fixedNow('2026-06-09T00:00:00.000Z'),
    },
  );

  assert.equal(res.status, 202);
  // ETA was computed from the profile scope.
  assert.equal(estimateArgs.serviceCount, 2);
  assert.equal(estimateArgs.regionCount, 1);
  assert.deepEqual(estimateArgs.recentDurations, []);
});

test('createInsightRun: derives recentDurations from completed runs (seconds)', async () => {
  const supabase = makeFakeSupabase({
    growth_insights: [
      { data: null, error: null }, // cooldown lookup → none
      {
        // completed-durations lookup: two complete runs (120s and 90s)
        data: [
          { started_at: '2026-06-01T00:00:00.000Z', completed_at: '2026-06-01T00:02:00.000Z' },
          { started_at: '2026-06-02T00:00:00.000Z', completed_at: '2026-06-02T00:01:30.000Z' },
          { started_at: null, completed_at: null }, // skipped (not finite)
        ],
        error: null,
      },
      { data: { id: 'r', status: 'running' }, error: null }, // insert
    ],
  });

  let estimateArgs = null;
  await createInsightRun(
    supabase,
    { tenantId: TENANT_ID, user: { id: 'u1', email: 'u@x.com' } },
    {
      getProfile: async () => ({ service_catalog: [], target_regions: [] }),
      estimate: (a) => {
        estimateArgs = a;
        return { eta_seconds: 60, low: 42, high: 78 };
      },
      now: fixedNow('2026-06-09T00:00:00.000Z'),
    },
  );

  assert.deepEqual(estimateArgs.recentDurations, [120, 90]);
  // The completed-runs query filtered status='complete'.
  const completedQuery = supabase.builders.find(
    (b) => b.table === 'growth_insights' && b.eqArgs.some((a) => a[0] === 'status'),
  );
  assert.ok(completedQuery, 'a status=complete query should exist');
  assert.ok(completedQuery.eqArgs.some((a) => a[0] === 'status' && a[1] === 'complete'));
});

test('createInsightRun: 202 path does NOT perform synthesis (no opportunities inserted)', async () => {
  const supabase = makeFakeSupabase({
    growth_insights: [
      { data: null, error: null },
      { data: [], error: null },
      { data: { id: 'r', status: 'running' }, error: null },
    ],
  });

  await createInsightRun(
    supabase,
    { tenantId: TENANT_ID, user: { id: 'u1', email: 'u@x.com' } },
    {
      getProfile: async () => ({}),
      estimate: () => ({ eta_seconds: 60, low: 42, high: 78 }),
      now: fixedNow('2026-06-09T00:00:00.000Z'),
    },
  );

  // No touches to demand_signals or growth_opportunities in the POST path.
  assert.ok(!supabase.calls.some((c) => c.table === 'demand_signals'));
  assert.ok(!supabase.calls.some((c) => c.table === 'growth_opportunities'));
});

// ---------------------------------------------------------------------------
// getCurrentInsight / getInsightById
// ---------------------------------------------------------------------------

test('getCurrentInsight returns the latest row', async () => {
  const latest = { id: 'i9', status: 'complete', created_at: '2026-06-08T00:00:00.000Z' };
  const supabase = makeFakeSupabase({
    growth_insights: [{ data: latest, error: null }],
  });

  const res = await getCurrentInsight(supabase, { tenantId: TENANT_ID });

  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data.insight, latest);
  // Tenant-scoped + ordered created_at desc, limit 1.
  const b = supabase.builders[0];
  assert.deepEqual(b.eqArgs[0], ['tenant_id', TENANT_ID]);
  assert.deepEqual(b.orderArgs[0], ['created_at', { ascending: false }]);
  assert.deepEqual(b.limitArgs[0], [1]);
});

test('getCurrentInsight returns { insight: null } when none', async () => {
  const supabase = makeFakeSupabase({
    growth_insights: [{ data: null, error: null }],
  });
  const res = await getCurrentInsight(supabase, { tenantId: TENANT_ID });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.insight, null);
});

test('getInsightById returns the run; 404 when not found', async () => {
  const found = { id: 'i1', tenant_id: TENANT_ID };
  const ok = await getInsightById(
    makeFakeSupabase({ growth_insights: [{ data: found, error: null }] }),
    { tenantId: TENANT_ID, id: 'i1' },
  );
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body.data.insight, found);

  const missing = await getInsightById(
    makeFakeSupabase({ growth_insights: [{ data: null, error: null }] }),
    { tenantId: TENANT_ID, id: 'nope' },
  );
  assert.equal(missing.status, 404);
  assert.equal(missing.body.status, 'error');
});

test('getInsightById is tenant-scoped', async () => {
  const supabase = makeFakeSupabase({ growth_insights: [{ data: null, error: null }] });
  await getInsightById(supabase, { tenantId: TENANT_ID, id: 'i1' });
  const b = supabase.builders[0];
  assert.ok(b.eqArgs.some((a) => a[0] === 'tenant_id' && a[1] === TENANT_ID));
  assert.ok(b.eqArgs.some((a) => a[0] === 'id' && a[1] === 'i1'));
});

// ---------------------------------------------------------------------------
// listOpportunities
// ---------------------------------------------------------------------------

test('listOpportunities excludes dismissed/expired by default + sorts score desc', async () => {
  const rows = [{ id: 'o1', score: 80 }];
  const supabase = makeFakeSupabase({
    growth_opportunities: [{ data: rows, error: null }],
  });

  const res = await listOpportunities(supabase, { tenantId: TENANT_ID });

  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data.opportunities, rows);
  const b = supabase.builders[0];
  assert.deepEqual(b.eqArgs[0], ['tenant_id', TENANT_ID]);
  // Default open set via .in('status', [...]).
  assert.deepEqual(b.inArgs[0], ['status', ['new', 'viewed', 'actioned']]);
  assert.deepEqual(b.orderArgs[0], ['score', { ascending: false }]);
});

test('listOpportunities applies type, explicit status, and min_score filters', async () => {
  const supabase = makeFakeSupabase({
    growth_opportunities: [{ data: [], error: null }],
  });

  await listOpportunities(supabase, {
    tenantId: TENANT_ID,
    type: 'geographic',
    status: 'dismissed',
    min_score: '40',
  });

  const b = supabase.builders[0];
  // Explicit status → .eq('status', ...), not the default .in(...).
  assert.ok(b.eqArgs.some((a) => a[0] === 'status' && a[1] === 'dismissed'));
  assert.equal(b.inArgs.length, 0);
  assert.ok(b.eqArgs.some((a) => a[0] === 'type' && a[1] === 'geographic'));
  // min_score coerced to a number for .gte.
  assert.deepEqual(b.gteArgs[0], ['score', 40]);
});

test('listOpportunities ignores a non-numeric min_score', async () => {
  const supabase = makeFakeSupabase({ growth_opportunities: [{ data: [], error: null }] });
  await listOpportunities(supabase, { tenantId: TENANT_ID, min_score: 'abc' });
  const b = supabase.builders[0];
  assert.equal(b.gteArgs.length, 0);
});

// ---------------------------------------------------------------------------
// getOpportunityDetail (provenance)
// ---------------------------------------------------------------------------

test('getOpportunityDetail includes provenance signals (signal_ids → demand_signals)', async () => {
  const opportunity = {
    id: 'o1',
    tenant_id: TENANT_ID,
    signal_ids: ['s1', 's2'],
  };
  const signals = [
    { id: 's1', subject: 'solar' },
    { id: 's2', subject: 'heat pump' },
  ];
  const supabase = makeFakeSupabase({
    growth_opportunities: [{ data: opportunity, error: null }],
    demand_signals: [{ data: signals, error: null }],
  });

  const res = await getOpportunityDetail(supabase, { tenantId: TENANT_ID, id: 'o1' });

  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data.opportunity, opportunity);
  assert.deepEqual(res.body.data.signals, signals);

  // Signals were fetched by id IN signal_ids, tenant-scoped.
  const sigBuilder = supabase.builders.find((b) => b.table === 'demand_signals');
  assert.ok(sigBuilder, 'demand_signals query should exist');
  assert.deepEqual(sigBuilder.inArgs[0], ['id', ['s1', 's2']]);
  assert.ok(sigBuilder.eqArgs.some((a) => a[0] === 'tenant_id' && a[1] === TENANT_ID));
});

test('getOpportunityDetail returns empty signals when none referenced', async () => {
  const opportunity = { id: 'o1', tenant_id: TENANT_ID, signal_ids: [] };
  const supabase = makeFakeSupabase({
    growth_opportunities: [{ data: opportunity, error: null }],
  });

  const res = await getOpportunityDetail(supabase, { tenantId: TENANT_ID, id: 'o1' });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data.signals, []);
  // No demand_signals query when there are no ids.
  assert.ok(!supabase.calls.some((c) => c.table === 'demand_signals'));
});

test('getOpportunityDetail 404 when not found for this tenant', async () => {
  const supabase = makeFakeSupabase({
    growth_opportunities: [{ data: null, error: null }],
  });
  const res = await getOpportunityDetail(supabase, { tenantId: TENANT_ID, id: 'nope' });
  assert.equal(res.status, 404);
});

// ---------------------------------------------------------------------------
// dismissOpportunity
// ---------------------------------------------------------------------------

test('dismissOpportunity sets status dismissed + stores reason (tenant-scoped)', async () => {
  const updated = { id: 'o1', status: 'dismissed' };
  const supabase = makeFakeSupabase({
    growth_opportunities: [{ data: updated, error: null }],
  });

  const res = await dismissOpportunity(supabase, {
    tenantId: TENANT_ID,
    id: 'o1',
    reason: 'not relevant',
  });

  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data.opportunity, updated);

  const b = supabase.builders[0];
  const patch = b.updateArgs[0][0];
  assert.equal(patch.status, 'dismissed');
  assert.deepEqual(patch.actioned_entity, { reason: 'not relevant' });
  // Cross-tenant safety: filtered by tenant_id AND id.
  assert.ok(b.eqArgs.some((a) => a[0] === 'tenant_id' && a[1] === TENANT_ID));
  assert.ok(b.eqArgs.some((a) => a[0] === 'id' && a[1] === 'o1'));
});

test('dismissOpportunity stores null reason when omitted', async () => {
  const supabase = makeFakeSupabase({
    growth_opportunities: [{ data: { id: 'o1', status: 'dismissed' }, error: null }],
  });
  await dismissOpportunity(supabase, { tenantId: TENANT_ID, id: 'o1' });
  const patch = supabase.builders[0].updateArgs[0][0];
  assert.deepEqual(patch.actioned_entity, { reason: null });
});

test('dismissOpportunity 404 when the row is not in this tenant', async () => {
  const supabase = makeFakeSupabase({
    growth_opportunities: [{ data: null, error: null }],
  });
  const res = await dismissOpportunity(supabase, { tenantId: OTHER_ID, id: 'o1' });
  assert.equal(res.status, 404);
});

// ---------------------------------------------------------------------------
// actionOpportunity
// ---------------------------------------------------------------------------

test('actionOpportunity calls the injected dispatcher, stamps actioned_entity, sets actioned', async () => {
  const opportunity = {
    id: 'o1',
    tenant_id: TENANT_ID,
    action_type: 'create_task',
    actioned_entity: { prior: true },
  };
  const updated = { id: 'o1', status: 'actioned' };
  const supabase = makeFakeSupabase({
    growth_opportunities: [
      { data: opportunity, error: null }, // load
      { data: updated, error: null }, // update ... returning
    ],
  });

  let dispatchArgs = null;
  const dispatch = async (sb, opp, overrides) => {
    dispatchArgs = { opp, overrides };
    return { type: 'create_task', status: 'created', task_id: 't1' };
  };

  const res = await actionOpportunity(
    supabase,
    { tenantId: TENANT_ID, id: 'o1', overrides: { note: 'hi' } },
    { dispatch },
  );

  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data.opportunity, updated);
  // Dispatcher received the loaded opportunity + overrides.
  assert.equal(dispatchArgs.opp.id, 'o1');
  assert.deepEqual(dispatchArgs.overrides, { note: 'hi' });

  // The update merged prior actioned_entity with the dispatcher result + actioned.
  const updateBuilder = supabase.builders.find((b) => b.updateArgs.length > 0);
  const patch = updateBuilder.updateArgs[0][0];
  assert.equal(patch.status, 'actioned');
  assert.deepEqual(patch.actioned_entity, {
    prior: true,
    type: 'create_task',
    status: 'created',
    task_id: 't1',
  });
  // Tenant-scoped update.
  assert.ok(updateBuilder.eqArgs.some((a) => a[0] === 'tenant_id' && a[1] === TENANT_ID));
});

test('actionOpportunity 404 when the opportunity is not found', async () => {
  const supabase = makeFakeSupabase({
    growth_opportunities: [{ data: null, error: null }],
  });
  const res = await actionOpportunity(supabase, { tenantId: TENANT_ID, id: 'nope' }, {});
  assert.equal(res.status, 404);
});

test('default dispatchOpportunityAction returns a structured stub', async () => {
  const out = await dispatchOpportunityAction(
    null,
    { action_type: 'create_campaign' },
    { audience: 'x' },
  );
  assert.equal(out.type, 'create_campaign');
  assert.equal(out.status, 'created');
  assert.deepEqual(out.overrides, { audience: 'x' });

  // Falls back to create_task and omits empty overrides.
  const out2 = await dispatchOpportunityAction(null, {}, {});
  assert.equal(out2.type, 'create_task');
  assert.equal(out2.overrides, undefined);
});

// ---------------------------------------------------------------------------
// getDashboard
// ---------------------------------------------------------------------------

test('getDashboard bundles latest insight + top 3 open opportunities', async () => {
  const insight = { id: 'i1', status: 'complete' };
  const opps = [
    { id: 'o1', score: 90 },
    { id: 'o2', score: 70 },
    { id: 'o3', score: 50 },
  ];
  const supabase = makeFakeSupabase({
    growth_insights: [{ data: insight, error: null }],
    growth_opportunities: [{ data: opps, error: null }],
  });

  const res = await getDashboard(supabase, { tenantId: TENANT_ID });

  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data.current_insight, insight);
  assert.deepEqual(res.body.data.top_opportunities, opps);

  const oppBuilder = supabase.builders.find((b) => b.table === 'growth_opportunities');
  assert.deepEqual(oppBuilder.inArgs[0], ['status', ['new', 'viewed', 'actioned']]);
  assert.deepEqual(oppBuilder.orderArgs[0], ['score', { ascending: false }]);
  assert.deepEqual(oppBuilder.limitArgs[0], [3]);
});

test('getDashboard tolerates no insight and no opportunities', async () => {
  const supabase = makeFakeSupabase({
    growth_insights: [{ data: null, error: null }],
    growth_opportunities: [{ data: null, error: null }],
  });
  const res = await getDashboard(supabase, { tenantId: TENANT_ID });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.current_insight, null);
  assert.deepEqual(res.body.data.top_opportunities, []);
});

test('createInsightRun: 409 when a concurrent insert hits the one-running-per-tenant unique index', async () => {
  const now = '2026-06-09T00:00:00.000Z';
  const supabase = makeFakeSupabase({
    growth_insights: [
      { data: null, error: null }, // cooldown lookup → no qualifying recent run
      { data: [], error: null }, // completed-durations lookup
      { data: null, error: { code: '23505', message: 'duplicate key' } }, // insert loses the race
    ],
  });

  const res = await createInsightRun(
    supabase,
    { tenantId: TENANT_ID, user: { id: 'u1', email: 'u@x.com', role: 'employee' } },
    {
      getProfile: async () => ({ service_catalog: [{}], target_regions: [{}] }),
      estimate: () => ({ eta_seconds: 90, low: 63, high: 117 }),
      now: fixedNow(now),
    },
  );

  assert.equal(res.status, 409);
  assert.equal(res.body.status, 'error');
  assert.match(res.body.message, /already in progress/i);
});
