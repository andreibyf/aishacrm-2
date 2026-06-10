/**
 * Growth — insightRunner tests (Task 7)
 *
 * Pure-unit coverage for backend/lib/growth/insightRunner.js. No live DB /
 * network / LLM / timers: a hand-rolled fake supabase records inserts/updates
 * and returns inserted demand_signals + opportunities WITH synthetic ids; the
 * existing-open opportunity fetch resolves to []. trendsClient/autocompleteClient
 * are stubbed, scoreFn is deterministic, now is fixed, and notify is a spy.
 *
 * Run: node --test backend/__tests__/growth.insightRunner.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  runInsight,
  resolveQuerySet,
  collectSignals,
  buildReport,
  buildSignalSummary,
} from '../lib/growth/insightRunner.js';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const INSIGHT_ID = '22222222-2222-2222-2222-222222222222';
const FIXED_NOW = 1_700_000_000_000;

/**
 * Build a fake supabase that mimics the call sequences used by the runner and
 * by opportunityEngine.generateForInsight.
 *
 * - demand_signals: `.insert(rows).select('*')` resolves to the rows with
 *   synthetic ids (ds-1, ds-2, ...), unless `failDemandInsert` is set (then the
 *   terminal select rejects-as-error).
 * - growth_opportunities (existing-open fetch): `.select().eq().in()` awaited
 *   directly → resolves to { data: [], error: null }.
 * - growth_opportunities (insert): `.insert(rows).select('*')` → rows with
 *   synthetic ids (opp-1, ...).
 * - growth_insights: `.update(patch).eq('id', ...)` awaited → { error: null },
 *   recording the patch.
 *
 * `calls` records every method invocation with its table + args.
 *
 * @param {{failDemandInsert?:boolean}} [opts]
 */
function makeFakeSupabase({ failDemandInsert = false } = {}) {
  const calls = [];

  function makeBuilder(table) {
    const builder = {
      table,
      _op: null, // 'select' | 'insert' | 'update'
      _insertRows: null,
      _updatePatch: null,
    };

    const record = (method, args) => calls.push({ table, method, args });

    builder.select = (...args) => {
      record('select', args);
      // Terminal select after an insert resolves to echoed rows-with-ids.
      if (builder._op === 'insert') {
        return Promise.resolve(resolveInsert());
      }
      // select() as part of a read chain — return builder for further filters.
      builder._op = builder._op || 'read';
      return builder;
    };

    builder.insert = (...args) => {
      record('insert', args);
      builder._op = 'insert';
      builder._insertRows = args[0];
      return builder;
    };

    builder.update = (...args) => {
      record('update', args);
      builder._op = 'update';
      builder._updatePatch = args[0];
      return builder;
    };

    builder.eq = (...args) => {
      record('eq', args);
      return builder;
    };
    builder.in = (...args) => {
      record('in', args);
      return builder;
    };
    builder.lt = (...args) => {
      record('lt', args);
      return builder;
    };

    function resolveInsert() {
      if (table === 'demand_signals') {
        if (failDemandInsert) {
          return { data: null, error: new Error('demand_signals insert boom') };
        }
        const rows = (builder._insertRows || []).map((r, i) => ({
          ...r,
          id: `ds-${i + 1}`,
        }));
        return { data: rows, error: null };
      }
      if (table === 'growth_opportunities') {
        const rows = (builder._insertRows || []).map((r, i) => ({
          ...r,
          id: `opp-${i + 1}`,
        }));
        return { data: rows, error: null };
      }
      return { data: null, error: null };
    }

    function resolveTerminal() {
      if (builder._op === 'insert') return resolveInsert();
      if (builder._op === 'update') return { data: null, error: null };
      // read chain (growth_opportunities existing-open fetch)
      if (table === 'growth_opportunities') return { data: [], error: null };
      return { data: null, error: null };
    }

    // `await builder` resolves the current operation directly (used by the
    // existing-open read chain and by the growth_insights update().eq()).
    builder.then = (onF, onR) => Promise.resolve(resolveTerminal()).then(onF, onR);

    return builder;
  }

  return {
    calls,
    from(table) {
      calls.push({ table, method: 'from', args: [table] });
      return makeBuilder(table);
    },
  };
}

// Deterministic scorer relying on engine default title/reason.
function defaultScoreFn() {
  return {
    score: 75,
    expected_impact: 'medium',
    difficulty: 'low',
    recommended_action: 'Do the thing',
  };
}

const PROFILE = {
  tracked_keywords: [{ keyword: 'solar panels', source: 'manual', services: [] }],
  service_catalog: [{ name: 'Heat Pumps', slug: 'heat-pumps', keywords: ['hvac'] }],
  target_regions: [{ type: 'city', name: 'Wellington' }],
};

const baseInsight = {
  id: INSIGHT_ID,
  tenant_id: TENANT_ID,
  generated_by_email: 'owner@example.com',
};

// ---------------------------------------------------------------------------
// resolveQuerySet (pure)
// ---------------------------------------------------------------------------

test('resolveQuerySet: keywords from tracked_keywords + service names; region names', () => {
  const out = resolveQuerySet(PROFILE);
  assert.deepEqual(out.keywords, ['solar panels', 'Heat Pumps']);
  assert.deepEqual(out.regions, ['Wellington']);
});

test('resolveQuerySet: no regions → single empty-string region; dedupes keywords', () => {
  const out = resolveQuerySet({
    tracked_keywords: [{ keyword: 'Solar' }, { keyword: 'solar' }],
    service_catalog: [{ name: 'Solar' }],
    target_regions: [],
  });
  assert.deepEqual(out.keywords, ['Solar']); // case-insensitive dedupe, first wins
  assert.deepEqual(out.regions, ['']);
});

// ---------------------------------------------------------------------------
// collectSignals (fail-soft)
// ---------------------------------------------------------------------------

test('collectSignals: a thrown getTrend for one source is skipped, autocomplete still collected', async () => {
  const trendsClient = {
    getTrend: async (kw) => {
      throw new Error(`trends down for ${kw}`);
    },
  };
  const autocompleteClient = {
    expand: async (seed) => [{ keyword: `${seed} cost`, source: 'autocomplete', seed }],
  };

  const signals = await collectSignals({
    keywords: ['solar'],
    regions: ['Wellington'],
    trendsClient,
    autocompleteClient,
  });

  // trends skipped (threw), autocomplete produced one signal.
  assert.equal(signals.length, 1);
  assert.equal(signals[0].signal_type, 'autocomplete');
  assert.equal(signals[0].subject, 'solar cost');
  assert.equal(signals[0].source, 'google_autocomplete');
  assert.deepEqual(signals[0].payload, { seed: 'solar' });
});

// ---------------------------------------------------------------------------
// buildReport / buildSignalSummary (pure)
// ---------------------------------------------------------------------------

test('buildReport: counts by type and top-3 by score', () => {
  const signals = [
    { signal_type: 'trends' },
    { signal_type: 'autocomplete' },
    { signal_type: 'autocomplete' },
  ];
  const opportunities = [
    { title: 'A', score: 50, type: 'content' },
    { title: 'B', score: 90, type: 'geographic' },
    { title: 'C', score: 70, type: 'content' },
    { title: 'D', score: 10, type: 'content' },
  ];
  const report = buildReport({ nowMs: FIXED_NOW, signals, opportunities });

  assert.equal(report.generated_at, new Date(FIXED_NOW).toISOString());
  assert.deepEqual(report.signal_counts, { trends: 1, autocomplete: 2 });
  assert.equal(report.opportunity_count, 4);
  assert.deepEqual(
    report.top.map((t) => t.title),
    ['B', 'C', 'A'],
  );
});

test('buildSignalSummary: counts by source', () => {
  const signals = [
    { source: 'google_trends' },
    { source: 'google_autocomplete' },
    { source: 'google_autocomplete' },
  ];
  assert.deepEqual(buildSignalSummary(signals), {
    google_trends: 1,
    google_autocomplete: 2,
  });
});

// ---------------------------------------------------------------------------
// runInsight — happy path
// ---------------------------------------------------------------------------

test('runInsight: happy path — signals inserted, opportunities generated, insight completed, success notified', async () => {
  const supabase = makeFakeSupabase();

  const trendsClient = {
    // delta_pct > 0 + region → a geographic opportunity from the engine.
    getTrend: async (kw, region) => ({ subject: kw, region, value: 80, delta_pct: 15 }),
  };
  const autocompleteClient = {
    expand: async (seed) => [{ keyword: `${seed} reviews`, source: 'autocomplete', seed }],
  };

  const notifyCalls = [];
  const notify = async (_sb, row) => {
    notifyCalls.push(row);
  };

  const result = await runInsight(supabase, baseInsight, {
    profile: PROFILE,
    trendsClient,
    autocompleteClient,
    scoreFn: defaultScoreFn,
    now: () => FIXED_NOW,
    notify,
  });

  // --- demand_signals insert tagged with tenant_id + insight_id ----------
  const dsInsert = supabase.calls.find(
    (c) => c.table === 'demand_signals' && c.method === 'insert',
  );
  assert.ok(dsInsert, 'demand_signals insert should have happened');
  const insertedRows = dsInsert.args[0];
  assert.ok(insertedRows.length >= 1);
  for (const row of insertedRows) {
    assert.equal(row.tenant_id, TENANT_ID);
    assert.equal(row.insight_id, INSIGHT_ID);
  }
  // Both source types present: 2 keywords (solar panels, Heat Pumps) × 1 region.
  const types = insertedRows.map((r) => r.signal_type);
  assert.ok(types.includes('trends'));
  assert.ok(types.includes('autocomplete'));

  // --- engine inserted opportunities -------------------------------------
  const oppInsert = supabase.calls.find(
    (c) => c.table === 'growth_opportunities' && c.method === 'insert',
  );
  assert.ok(oppInsert, 'growth_opportunities insert should have happened');

  // --- insight updated to complete with report/ids/summary/completed_at --
  const insightUpdate = supabase.calls.find(
    (c) => c.table === 'growth_insights' && c.method === 'update',
  );
  assert.ok(insightUpdate, 'growth_insights update should have happened');
  const patch = insightUpdate.args[0];
  assert.equal(patch.status, 'complete');
  assert.ok(patch.report && typeof patch.report === 'object');
  assert.equal(patch.report.generated_at, new Date(FIXED_NOW).toISOString());
  assert.ok(Array.isArray(patch.opportunity_ids));
  assert.ok(patch.opportunity_ids.length >= 1);
  assert.ok(patch.opportunity_ids.every((id) => typeof id === 'string'));
  assert.ok(patch.signal_summary && typeof patch.signal_summary === 'object');
  assert.equal(patch.completed_at, new Date(FIXED_NOW).toISOString());

  // update was filtered by insight id.
  const updateEq = supabase.calls.find((c) => c.table === 'growth_insights' && c.method === 'eq');
  assert.deepEqual(updateEq.args, ['id', INSIGHT_ID]);

  // --- success notification ----------------------------------------------
  assert.equal(notifyCalls.length, 1);
  const note = notifyCalls[0];
  assert.equal(note.type, 'success');
  assert.equal(note.title, 'Market insight ready');
  assert.equal(note.user_email, 'owner@example.com');
  assert.equal(note.tenant_id, TENANT_ID); // passed through as-is (TEXT column)
  assert.equal(note.is_read, false);
  assert.equal(note.metadata.link, '/reports?tab=insights'); // link lives in metadata
  assert.equal(note.metadata.insight_id, INSIGHT_ID);
  assert.equal(note.metadata.status, 'complete');

  // --- return summary ----------------------------------------------------
  assert.equal(result.status, 'complete');
  assert.ok(result.opportunity_count >= 1);
  assert.ok(result.signal_count >= 1);
});

// ---------------------------------------------------------------------------
// runInsight — failure path (does NOT reject)
// ---------------------------------------------------------------------------

test('runInsight: demand_signals insert failure → insight failed, warning notified, resolves', async () => {
  const supabase = makeFakeSupabase({ failDemandInsert: true });

  const trendsClient = {
    getTrend: async (kw, region) => ({ subject: kw, region, value: 50, delta_pct: 10 }),
  };
  const autocompleteClient = {
    expand: async () => [],
  };

  const notifyCalls = [];
  const notify = async (_sb, row) => {
    notifyCalls.push(row);
  };

  let rejected = false;
  let result;
  try {
    result = await runInsight(supabase, baseInsight, {
      profile: PROFILE,
      trendsClient,
      autocompleteClient,
      scoreFn: defaultScoreFn,
      now: () => FIXED_NOW,
      notify,
    });
  } catch {
    rejected = true;
  }

  assert.equal(rejected, false, 'runInsight must never reject');

  // insight updated to failed with an error message + completed_at.
  const insightUpdate = supabase.calls.find(
    (c) => c.table === 'growth_insights' && c.method === 'update',
  );
  assert.ok(insightUpdate, 'growth_insights update should have happened');
  const patch = insightUpdate.args[0];
  assert.equal(patch.status, 'failed');
  assert.ok(patch.error && /boom/i.test(patch.error), `error should be set: ${patch.error}`);
  assert.equal(patch.completed_at, new Date(FIXED_NOW).toISOString());

  // warning notification.
  assert.equal(notifyCalls.length, 1);
  const note = notifyCalls[0];
  assert.equal(note.type, 'warning');
  assert.equal(note.title, 'Market insight failed');
  assert.equal(note.metadata.link, '/reports?tab=insights');
  assert.equal(note.metadata.status, 'failed');
  assert.equal(note.metadata.insight_id, INSIGHT_ID);

  assert.equal(result.status, 'failed');
});

// ---------------------------------------------------------------------------
// runInsight — fail-soft per source (one bad source does not abort the run)
// ---------------------------------------------------------------------------

test('runInsight: getTrend throws but expand succeeds → run still completes with autocomplete signals', async () => {
  const supabase = makeFakeSupabase();

  const trendsClient = {
    getTrend: async (kw) => {
      throw new Error(`trends outage for ${kw}`);
    },
  };
  const autocompleteClient = {
    expand: async (seed) => [{ keyword: `${seed} near me`, source: 'autocomplete', seed }],
  };

  const notifyCalls = [];
  const notify = async (_sb, row) => {
    notifyCalls.push(row);
  };

  const result = await runInsight(supabase, baseInsight, {
    profile: PROFILE,
    trendsClient,
    autocompleteClient,
    scoreFn: defaultScoreFn,
    now: () => FIXED_NOW,
    notify,
  });

  // Run completed despite all trends calls throwing.
  assert.equal(result.status, 'complete');

  const dsInsert = supabase.calls.find(
    (c) => c.table === 'demand_signals' && c.method === 'insert',
  );
  assert.ok(dsInsert, 'demand_signals insert should have happened');
  const insertedRows = dsInsert.args[0];
  // Only autocomplete signals survived (trends all skipped).
  assert.ok(insertedRows.length >= 1);
  assert.ok(insertedRows.every((r) => r.signal_type === 'autocomplete'));

  // Success notification (not a failure).
  assert.equal(notifyCalls.length, 1);
  assert.equal(notifyCalls[0].type, 'success');
});
