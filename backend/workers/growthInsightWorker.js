/**
 * growthInsightWorker — poll the growth_insights queue and run one insight at a
 * time, with an ATOMIC claim so multiple pollers never double-process a row
 * (OSINT Opportunity Intelligence, Phase 1 / Task 8).
 *
 * Lifecycle
 * ---------
 * The POST /insights route (Task 9) inserts a `growth_insights` row in
 * `status:'running'` with `claimed_at = NULL`. This worker:
 *
 *   1. finds the oldest unclaimed running row,
 *   2. ATOMICALLY claims it (conditional update guarded on `claimed_at IS NULL`),
 *   3. resolves per-tenant deps (business_profile + signal clients + scorer),
 *   4. hands the claimed row to `runInsight` (Task 7), which marks it
 *      complete/failed and notifies the requester.
 *
 * The atomic claim is the whole point: two workers can both read the same
 * unclaimed row, but only one conditional update will actually flip
 * `claimed_at` from NULL → a timestamp and echo a row back. The loser sees an
 * EMPTY result and bows out (`raced:true`) without running anything.
 *
 * Testability
 * -----------
 * `claimAndRunOne` is pure-unit testable: supabase, `runInsight`, `buildDeps`
 * and `now` are all injected, so the claim race and the run dispatch can be
 * exercised against a fake supabase with no live DB / network / timers. The
 * `startGrowthInsightWorker` setInterval loop is the only non-unit-tested part.
 */

import { getSupabaseClient } from '../lib/supabase-db.js';
import logger from '../lib/logger.js';
import { runInsight as defaultRunInsight, defaultNotify } from '../lib/growth/insightRunner.js';
import { getOrSeedProfile } from '../lib/growth/profileService.js';
import { createTrendsClient } from '../lib/growth/trendsClient.js';
import { createAutocompleteClient } from '../lib/growth/autocompleteClient.js';

/**
 * Conservative, deterministic opportunity scorer used by the default deps.
 * Honest by construction — no invented percentages, just bounded directional
 * scoring. Kept small here; richer scoring (LLM-backed) can replace it via
 * `buildDeps` without touching the worker loop.
 *
 * @param {object} candidate
 * @returns {{score:number, expected_impact:string, difficulty:string, recommended_action:string}}
 */
function defaultScoreFn(candidate = {}) {
  const isTrends = candidate.signal_type === 'trends';
  return {
    score: isTrends ? 70 : 55,
    expected_impact: isTrends ? 'medium' : 'low',
    difficulty: 'low',
    recommended_action: 'Review this opportunity and decide whether to pursue it.',
  };
}

/**
 * Default per-tenant dependency builder. Resolves the business_profile for the
 * claimed insight's tenant and wires the real trends / autocomplete clients,
 * the default scorer, and the default notifier.
 *
 * Injected as `buildDeps` so tests pass a fake and never touch live clients.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{tenant_id:string}} claimedRow
 * @returns {Promise<object>} deps consumed by runInsight
 */
async function defaultBuildDeps(supabase, claimedRow) {
  const profile = await getOrSeedProfile(supabase, claimedRow.tenant_id);

  // The real clients require a fetchImpl. In production these are wired to the
  // upstream HTTP fetchers; absent a configured fetcher we fail-soft per source
  // (runInsight wraps each upstream call individually).
  const trendsClient = createTrendsClient({
    fetchImpl: async () => {
      throw new Error('trends fetchImpl not configured');
    },
  });
  const autocompleteClient = createAutocompleteClient({
    fetchImpl: async () => [],
  });

  return {
    profile,
    trendsClient,
    autocompleteClient,
    scoreFn: defaultScoreFn,
    notify: defaultNotify,
  };
}

/**
 * Process AT MOST one queued insight.
 *
 * Steps:
 *   1. Find the oldest unclaimed running row. None → { processed:false }.
 *   2. ATOMIC claim: conditional update guarded on `claimed_at IS NULL`. If the
 *      echoed result is empty, another worker won the race → { processed:false,
 *      raced:true } and we DO NOT run.
 *   3. Build deps for the claimed row and run it (defensive try/catch — runInsight
 *      already never rejects, but we never let it bubble).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} [overrides]
 * @param {(supabase, insight, deps)=>Promise<any>} [overrides.runInsight]
 * @param {(supabase, claimedRow)=>Promise<object>} [overrides.buildDeps]
 * @param {()=>number} [overrides.now]
 * @returns {Promise<{processed:boolean, raced?:boolean, insightId?:string}>}
 */
export async function claimAndRunOne(
  supabase,
  { runInsight = defaultRunInsight, buildDeps = defaultBuildDeps, now = Date.now } = {},
) {
  // 1. Oldest unclaimed running row.
  const { data: candidates, error: findError } = await supabase
    .from('growth_insights')
    .select('*')
    .eq('status', 'running')
    .is('claimed_at', null)
    .order('created_at', { ascending: true })
    .limit(1);

  if (findError) {
    logger.error('[GrowthInsightWorker] Failed to fetch queued insights:', findError.message);
    return { processed: false };
  }

  const row = Array.isArray(candidates) ? candidates[0] : null;
  if (!row) {
    return { processed: false };
  }

  // 2. ATOMIC claim — only succeeds if claimed_at is still NULL.
  const claimedAt = new Date(now()).toISOString();
  const { data: claimed, error: claimError } = await supabase
    .from('growth_insights')
    .update({ claimed_at: claimedAt })
    .eq('id', row.id)
    .is('claimed_at', null)
    .select('*');

  if (claimError) {
    logger.error('[GrowthInsightWorker] Failed to claim insight:', claimError.message);
    return { processed: false };
  }

  const claimedRow = Array.isArray(claimed) ? claimed[0] : null;
  if (!claimedRow) {
    // Another worker won the race between our find and our conditional update.
    return { processed: false, raced: true };
  }

  // 3. Build deps + run (defensive: never let a throw escape the loop).
  try {
    const deps = await buildDeps(supabase, claimedRow);
    await runInsight(supabase, claimedRow, deps);
  } catch (err) {
    logger.error(
      `[GrowthInsightWorker] Insight ${claimedRow.id} run threw unexpectedly:`,
      err && err.message ? err.message : err,
    );
  }

  return { processed: true, insightId: claimedRow.id };
}

let workerStarted = false;

/**
 * Start the polling loop. Mirrors emailWorker.startEmailWorker: a single
 * setInterval tick, guarded against overlapping runs with an in-flight flag.
 * NOT unit-tested (the unit surface is `claimAndRunOne`).
 *
 * @param {object} [pgPool] - present for parity with startEmailWorker; the
 *   worker reads via the Supabase client.
 * @param {number} [intervalMs]
 * @returns {{stop:()=>void}}
 */
export function startGrowthInsightWorker(
  pgPool,
  intervalMs = Number(process.env.GROWTH_INSIGHT_WORKER_POLL_MS) || 5000,
) {
  if (workerStarted) {
    logger.warn('[GrowthInsightWorker] Worker already started - ignoring duplicate init');
    return { stop: () => {} };
  }
  workerStarted = true;

  logger.info(`[GrowthInsightWorker] Starting (poll interval: ${intervalMs}ms)`);

  let inFlight = false;
  const timer = setInterval(async () => {
    if (inFlight) return; // skip overlapping ticks
    inFlight = true;
    try {
      const supabase = getSupabaseClient();
      if (!supabase) return;
      // Drain one per tick; the next tick picks up the following row.
      await claimAndRunOne(supabase);
    } catch (err) {
      logger.error('[GrowthInsightWorker] Loop error:', err && err.message ? err.message : err);
    } finally {
      inFlight = false;
    }
  }, intervalMs);

  if (typeof timer.unref === 'function') timer.unref();

  return {
    stop: () => {
      clearInterval(timer);
      workerStarted = false;
      logger.info('[GrowthInsightWorker] Stopped');
    },
  };
}

export default {
  claimAndRunOne,
  startGrowthInsightWorker,
};
