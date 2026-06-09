/**
 * Growth — growthInsightWorker tests (Task 8)
 *
 * Pure-unit coverage for backend/workers/growthInsightWorker.js#claimAndRunOne.
 * No live DB / network / timers: a hand-rolled fake supabase models the
 * growth_insights queue AND the ATOMIC conditional claim. `runInsight`,
 * `buildDeps` and `now` are all injected (spy / fake / fixed clock), so the
 * claim race and run dispatch are fully deterministic.
 *
 * The crux is the atomic claim: an
 *   update({claimed_at}).eq('id', id).is('claimed_at', null).select('*')
 * flips claimed_at from NULL → the timestamp and echoes the row ONLY when it was
 * still NULL; once claimed, the same conditional update returns [] (the loser of
 * the race). claimAndRunOne must run exactly once across two concurrent pollers.
 *
 * Run: node --test backend/__tests__/growth.insightWorker.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { claimAndRunOne } from '../workers/growthInsightWorker.js';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const INSIGHT_ID = '22222222-2222-2222-2222-222222222222';
const FIXED_NOW = 1_700_000_000_000;

/**
 * Build a fake supabase over a shared, mutable set of growth_insights rows.
 *
 * Supported chains (only what claimAndRunOne uses):
 *
 *   FIND (read):
 *     .from('growth_insights').select('*').eq('status','running')
 *       .is('claimed_at', null).order('created_at',{ascending:true}).limit(1)
 *     → awaited → { data: [oldest matching row] | [], error }
 *
 *   CLAIM (conditional update):
 *     .from('growth_insights').update({ claimed_at }).eq('id', id)
 *       .is('claimed_at', null).select('*')
 *     → awaited → { data: [row] (and claimed_at mutated) | [], error }
 *       The update applies ONLY to rows matching ALL filters (id + claimed_at
 *       still null); the echoed rows reflect the post-update state.
 *
 * Filters accumulate on the builder; the terminal (`.limit()` for find, or
 * `.select()` for the claim update) resolves against the in-memory rows.
 *
 * @param {{rows?:Array<object>, findError?:Error, claimError?:Error}} [opts]
 */
function makeFakeSupabase({ rows = [], findError = null, claimError = null } = {}) {
  const store = { rows };
  const calls = [];

  function makeBuilder(table) {
    const builder = {
      table,
      _op: null, // 'read' | 'update'
      _patch: null,
      _eq: {}, // equality filters: { column: value }
      _isNull: {}, // IS NULL filters: { column: true }
      _ordered: false,
    };

    const record = (method, args) => calls.push({ table, method, args });

    // Apply the builder's accumulated filters to a row.
    const matches = (row) => {
      for (const [col, val] of Object.entries(builder._eq)) {
        if (row[col] !== val) return false;
      }
      for (const col of Object.keys(builder._isNull)) {
        if (row[col] != null) return false;
      }
      return true;
    };

    builder.select = (...args) => {
      record('select', args);
      // Terminal select after an update = the conditional claim.
      if (builder._op === 'update') {
        if (claimError) return Promise.resolve({ data: null, error: claimError });
        const affected = store.rows.filter(matches);
        // Apply the patch to all matching rows, then echo them (post-update).
        for (const row of affected) Object.assign(row, builder._patch);
        return Promise.resolve({ data: affected.map((r) => ({ ...r })), error: null });
      }
      builder._op = 'read';
      return builder;
    };

    builder.update = (...args) => {
      record('update', args);
      builder._op = 'update';
      builder._patch = args[0];
      return builder;
    };

    builder.eq = (...args) => {
      record('eq', args);
      builder._eq[args[0]] = args[1];
      return builder;
    };

    builder.is = (...args) => {
      record('is', args);
      // Only model the IS NULL case used here.
      if (args[1] === null) builder._isNull[args[0]] = true;
      return builder;
    };

    builder.order = (...args) => {
      record('order', args);
      builder._ordered = true;
      return builder;
    };

    // Terminal for the FIND read chain.
    builder.limit = (...args) => {
      record('limit', args);
      const n = args[0];
      if (findError) return Promise.resolve({ data: null, error: findError });
      const matching = store.rows.filter(matches);
      // ascending by created_at to mirror the real query.
      matching.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
      return Promise.resolve({ data: matching.slice(0, n).map((r) => ({ ...r })), error: null });
    };

    return builder;
  }

  return {
    store,
    calls,
    from(table) {
      calls.push({ table, method: 'from', args: [table] });
      return makeBuilder(table);
    },
  };
}

function runningRow(overrides = {}) {
  return {
    id: INSIGHT_ID,
    tenant_id: TENANT_ID,
    status: 'running',
    claimed_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    generated_by_email: 'owner@example.com',
    ...overrides,
  };
}

const FAKE_DEPS = { profile: {}, scoreFn: () => ({ score: 1 }) };
const buildDeps = async () => FAKE_DEPS;
const fixedNow = () => FIXED_NOW;

// ---------------------------------------------------------------------------
// no running rows
// ---------------------------------------------------------------------------

test('claimAndRunOne: no running rows → {processed:false}, runInsight NOT called', async () => {
  const supabase = makeFakeSupabase({ rows: [] });
  let runCalls = 0;
  const runInsight = async () => {
    runCalls += 1;
  };

  const result = await claimAndRunOne(supabase, { runInsight, buildDeps, now: fixedNow });

  assert.deepEqual(result, { processed: false });
  assert.equal(runCalls, 0, 'runInsight must not be called when there is nothing to claim');
});

// ---------------------------------------------------------------------------
// happy path: claim + run once
// ---------------------------------------------------------------------------

test('claimAndRunOne: running unclaimed row → claimed_at set, runInsight called once with claimed row + deps', async () => {
  const supabase = makeFakeSupabase({ rows: [runningRow()] });
  const runArgs = [];
  const runInsight = async (sb, insight, deps) => {
    runArgs.push({ sb, insight, deps });
  };

  const result = await claimAndRunOne(supabase, { runInsight, buildDeps, now: fixedNow });

  assert.deepEqual(result, { processed: true, insightId: INSIGHT_ID });

  // claimed_at was flipped on the stored row.
  assert.equal(supabase.store.rows[0].claimed_at, new Date(FIXED_NOW).toISOString());

  // runInsight called exactly once with the claimed row + deps from buildDeps.
  assert.equal(runArgs.length, 1);
  assert.equal(runArgs[0].sb, supabase);
  assert.equal(runArgs[0].insight.id, INSIGHT_ID);
  assert.equal(runArgs[0].insight.claimed_at, new Date(FIXED_NOW).toISOString());
  assert.equal(runArgs[0].deps, FAKE_DEPS);

  // The claim was the conditional update guarded on claimed_at IS NULL.
  const updateCall = supabase.calls.find(
    (c) => c.table === 'growth_insights' && c.method === 'update',
  );
  assert.ok(updateCall, 'a conditional update should have been issued');
  assert.deepEqual(updateCall.args[0], { claimed_at: new Date(FIXED_NOW).toISOString() });
  // both eq('id') and is('claimed_at', null) guards present.
  const isNullClaim = supabase.calls.some(
    (c) => c.method === 'is' && c.args[0] === 'claimed_at' && c.args[1] === null,
  );
  assert.ok(isNullClaim, 'claim must be guarded on claimed_at IS NULL');
});

// ---------------------------------------------------------------------------
// atomic claim — no double processing across two pollers
// ---------------------------------------------------------------------------

test('claimAndRunOne: two pollers, one row → runInsight runs EXACTLY once; second is raced', async () => {
  // Single shared row + single shared store across both poller calls.
  const supabase = makeFakeSupabase({ rows: [runningRow()] });
  let runCalls = 0;
  const runInsight = async () => {
    runCalls += 1;
  };

  const first = await claimAndRunOne(supabase, { runInsight, buildDeps, now: fixedNow });
  const second = await claimAndRunOne(supabase, { runInsight, buildDeps, now: fixedNow });

  // First wins the claim and runs; second's find returns nothing (claimed_at no
  // longer null) OR — if it raced the find — its conditional update sees a
  // non-null claimed_at and echoes []. Either way it must NOT run.
  assert.deepEqual(first, { processed: true, insightId: INSIGHT_ID });
  assert.equal(runCalls, 1, 'runInsight must run exactly once across both pollers');
  assert.equal(second.processed, false);
});

test('claimAndRunOne: simulated find-then-race → second update sees non-null claimed_at → raced:true', async () => {
  // Force the race window: both pollers FIND the unclaimed row before either
  // claims, by pre-reading. We model this by claiming the row out from under the
  // second call between its find and its update.
  //
  // Simpler deterministic model: pre-claim the row (claimed_at already set) but
  // leave status='running'. The find filters on claimed_at IS NULL, so it would
  // return nothing — to specifically exercise the conditional-update loser path,
  // we hand a row whose find still matches but whose claim then fails. We do
  // that by making the row visible to find yet already claimed at the moment of
  // update via a getter that nulls once.
  let claimedAtReads = 0;
  const row = runningRow();
  Object.defineProperty(row, 'claimed_at', {
    enumerable: true,
    configurable: true,
    get() {
      // First read (during find's IS NULL filter) → null (eligible).
      // Subsequent reads (during the claim's IS NULL filter) → non-null (lost).
      claimedAtReads += 1;
      return claimedAtReads <= 1 ? null : new Date(FIXED_NOW - 1000).toISOString();
    },
    set() {
      /* swallow: another worker owns it */
    },
  });

  const supabase = makeFakeSupabase({ rows: [row] });
  let runCalls = 0;
  const runInsight = async () => {
    runCalls += 1;
  };

  const result = await claimAndRunOne(supabase, { runInsight, buildDeps, now: fixedNow });

  assert.deepEqual(result, { processed: false, raced: true });
  assert.equal(runCalls, 0, 'lost race must not run the insight');
});

// ---------------------------------------------------------------------------
// defensive: runInsight rejecting still resolves
// ---------------------------------------------------------------------------

test('claimAndRunOne: runInsight rejects → claimAndRunOne still resolves (does not throw)', async () => {
  const supabase = makeFakeSupabase({ rows: [runningRow()] });
  const runInsight = async () => {
    throw new Error('runInsight blew up');
  };

  let threw = false;
  let result;
  try {
    result = await claimAndRunOne(supabase, { runInsight, buildDeps, now: fixedNow });
  } catch {
    threw = true;
  }

  assert.equal(threw, false, 'claimAndRunOne must never reject');
  // It claimed and attempted the run, so it reports processed:true.
  assert.deepEqual(result, { processed: true, insightId: INSIGHT_ID });
});

// ---------------------------------------------------------------------------
// failure during buildDeps/run marks the claimed row failed (not stuck running)
// ---------------------------------------------------------------------------

test('claimAndRunOne: buildDeps throws → claimed row marked failed (not stuck running)', async () => {
  const supabase = makeFakeSupabase({ rows: [runningRow()] });
  let runCalls = 0;
  const runInsight = async () => {
    runCalls += 1;
  };
  const throwingBuildDeps = async () => {
    throw new Error('profile load failed');
  };

  const result = await claimAndRunOne(supabase, {
    runInsight,
    buildDeps: throwingBuildDeps,
    now: fixedNow,
  });

  assert.deepEqual(result, { processed: true, insightId: INSIGHT_ID });
  assert.equal(runCalls, 0); // never reached runInsight

  const row = supabase.store.rows.find((r) => r.id === INSIGHT_ID);
  assert.equal(row.status, 'failed'); // not left 'running'
  assert.equal(row.error, 'profile load failed');
  assert.equal(row.completed_at, new Date(FIXED_NOW).toISOString());
});
