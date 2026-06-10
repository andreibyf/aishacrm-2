/**
 * insightRunner — orchestrate one async market-insight run end to end
 * (OSINT Opportunity Intelligence, Phase 1 / Task 7).
 *
 * Why this exists
 * ---------------
 * A `growth_insights` row is created in `status:'running'` by the route/worker
 * (Task 9). This module takes that row and drives the whole pipeline:
 *
 *   resolve query set (from the business_profile)
 *     → collect demand signals (trends + autocomplete, FAIL-SOFT per source)
 *     → persist `demand_signals` (getting their ids back)
 *     → `opportunityEngine.generateForInsight` (scored opportunities)
 *     → build a `report` + `signal_summary`
 *     → mark the insight `complete`
 *     → notify the requesting user
 *
 * Fail-soft vs fatal
 * ------------------
 * SIGNAL COLLECTION is best-effort: each upstream call (`getTrend` / `expand`)
 * is wrapped individually, so one flaky source or one bad keyword never aborts
 * the run — we log and skip it. Everything AFTER collection (signal insert,
 * engine, report build, insight update, notify) is wrapped in a single
 * try/catch: any unexpected error there marks the insight `failed`, emits a
 * warning notification, and STILL resolves — `runInsight` never rejects.
 *
 * Injected dependencies (pure-unit testable)
 * -----------------------------------------
 * `deps` carries every external collaborator so the runner can be exercised
 * with a fake supabase, stubbed clients, a deterministic `scoreFn`, a fixed
 * `now`, and a spy `notify` — no live DB / LLM / network / timers.
 */

import { generateForInsight, supersedePreviousOpportunities } from './opportunityEngine.js';

/**
 * Default notifier: insert one row into `notifications`.
 *
 * NOTE: `notifications.tenant_id` is a TEXT column (verified schema) and there
 * is NO `link` column — the link lives inside `metadata`. We pass `tenant_id`
 * through AS-IS (no UUID coercion) so the caller controls its exact value.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} notificationRow
 * @returns {Promise<void>}
 */
export async function defaultNotify(supabase, notificationRow) {
  await supabase.from('notifications').insert(notificationRow);
}

/**
 * Resolve the keyword × region query set from a business profile. PURE.
 *
 * Keywords = `tracked_keywords[].keyword` ∪ `service_catalog[].name`
 * (trimmed, non-empty, de-duped case-insensitively, first occurrence wins).
 * Regions = `target_regions[].name` (trimmed, non-empty); falls back to a
 * single `''` region when the profile declares none.
 *
 * @param {{tracked_keywords?:Array, service_catalog?:Array, target_regions?:Array}} [profile]
 * @returns {{keywords:string[], regions:Array<string|null>}}
 */
export function resolveQuerySet(profile = {}) {
  const trackedKeywords = Array.isArray(profile.tracked_keywords) ? profile.tracked_keywords : [];
  const serviceCatalog = Array.isArray(profile.service_catalog) ? profile.service_catalog : [];
  const targetRegions = Array.isArray(profile.target_regions) ? profile.target_regions : [];

  const seen = new Set();
  const keywords = [];
  const pushKeyword = (raw) => {
    const kw = String(raw == null ? '' : raw).trim();
    if (!kw) return;
    const key = kw.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    keywords.push(kw);
  };

  for (const tk of trackedKeywords) {
    if (tk) pushKeyword(tk.keyword);
  }
  for (const svc of serviceCatalog) {
    if (svc) pushKeyword(svc.name);
  }

  const regions = [];
  for (const region of targetRegions) {
    if (!region) continue;
    const name = String(region.name == null ? '' : region.name).trim();
    if (name) regions.push(name);
  }
  if (regions.length === 0) regions.push('');

  return { keywords, regions };
}

/**
 * Collect demand signals for the query set, FAIL-SOFT per upstream call.
 *
 * Each `getTrend` / `expand` call is wrapped individually; a throw is logged
 * and skipped so it never aborts the run. Returns plain signal objects WITHOUT
 * ids (the caller stamps tenant_id/insight_id and inserts them).
 *
 * @param {object} opts
 * @param {string[]} opts.keywords
 * @param {Array<string|null>} opts.regions
 * @param {{getTrend:Function}} opts.trendsClient
 * @param {{expand:Function}} opts.autocompleteClient
 * @returns {Promise<Array<object>>} demand_signal rows (no ids yet)
 */
export async function collectSignals({ keywords, regions, trendsClient, autocompleteClient }) {
  const signals = [];

  for (const keyword of keywords) {
    for (const region of regions) {
      // Trends: one signal per (keyword, region) when the upstream returns one.
      try {
        const trend = await trendsClient.getTrend(keyword, region);
        if (trend != null) {
          signals.push({
            signal_type: 'trends',
            subject: keyword,
            region,
            value: trend.value,
            delta_pct: trend.delta_pct,
            source: 'google_trends',
            payload: {},
          });
        }
      } catch (err) {
        // Fail-soft: skip this (keyword, region) trends signal, keep going.
        console.warn(
          `[insightRunner] trends collect failed for "${keyword}" (${region}): ${err && err.message ? err.message : err}`,
        );
      }

      // Autocomplete: one signal per suggestion for this (keyword, region).
      try {
        const suggestions = await autocompleteClient.expand(keyword, region);
        if (Array.isArray(suggestions)) {
          for (const suggestion of suggestions) {
            if (!suggestion || !suggestion.keyword) continue;
            signals.push({
              signal_type: 'autocomplete',
              subject: suggestion.keyword,
              region,
              source: 'google_autocomplete',
              payload: { seed: suggestion.seed },
            });
          }
        }
      } catch (err) {
        // Fail-soft: skip this (keyword, region) autocomplete expansion.
        console.warn(
          `[insightRunner] autocomplete collect failed for "${keyword}" (${region}): ${err && err.message ? err.message : err}`,
        );
      }
    }
  }

  return signals;
}

/**
 * Build the `report` object stored on the insight row. PURE.
 *
 * @param {object} opts
 * @param {number} opts.nowMs - clock value in ms
 * @param {Array<object>} opts.signals - inserted demand_signals
 * @param {Array<object>} opts.opportunities - generated opportunities
 * @param {object|null} [opts.marketInsights] - rich market-intelligence report (Claude), nested under `market_insights`
 * @param {string|null} [opts.marketInsightsError] - synthesis error message when the rich report failed (fail-soft)
 * @returns {object} report
 */
export function buildReport({
  nowMs,
  signals,
  opportunities,
  marketInsights = null,
  marketInsightsError = null,
}) {
  const trends = signals.filter((s) => s.signal_type === 'trends').length;
  const autocomplete = signals.filter((s) => s.signal_type === 'autocomplete').length;

  const top = [...opportunities]
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
    .slice(0, 3)
    .map((o) => ({ title: o.title, score: o.score, type: o.type }));

  // Thin fields stay at the top level (existing FE/report consumers); the rich
  // Market Intelligence report is nested so it is additive and fail-soft.
  const report = {
    generated_at: new Date(nowMs).toISOString(),
    signal_counts: { trends, autocomplete },
    opportunity_count: opportunities.length,
    top,
  };
  if (marketInsights) report.market_insights = marketInsights;
  if (marketInsightsError) report.market_insights_error = marketInsightsError;
  return report;
}

/**
 * Build the `signal_summary` (counts by source). PURE.
 *
 * @param {Array<object>} signals
 * @returns {Record<string, number>}
 */
export function buildSignalSummary(signals) {
  const summary = {};
  for (const signal of signals) {
    const source = signal && signal.source != null ? String(signal.source) : 'unknown';
    summary[source] = (summary[source] || 0) + 1;
  }
  return summary;
}

/**
 * Run one insight end to end. ALWAYS resolves (never rejects): on unexpected
 * failure the insight is marked `failed` and a warning notification is sent.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{id:string, tenant_id:string, generated_by_email?:string}} insight
 *   A `growth_insights` row already in `status:'running'`.
 * @param {object} deps
 * @param {object} deps.profile - business_profile (query set source)
 * @param {{getTrend:Function}} deps.trendsClient
 * @param {{expand:Function}} deps.autocompleteClient
 * @param {(candidate:object)=>object} deps.scoreFn - opportunity scorer
 * @param {()=>number} [deps.now=Date.now] - clock in ms (injectable)
 * @param {(supabase, row)=>Promise<void>} [deps.notify=defaultNotify]
 * @returns {Promise<{status:string, opportunity_count:number, signal_count:number}>}
 */
export async function runInsight(supabase, insight, deps) {
  const {
    profile,
    trendsClient,
    autocompleteClient,
    scoreFn,
    synthesize = null,
    now = Date.now,
    notify = defaultNotify,
  } = deps || {};

  const insightId = insight.id;
  const tenantId = insight.tenant_id;
  const userEmail = insight.generated_by_email;

  // --- Collection is best-effort and never aborts the run (fail-soft inside) -
  const { keywords, regions } = resolveQuerySet(profile);
  const collected = await collectSignals({
    keywords,
    regions,
    trendsClient,
    autocompleteClient,
  });

  // --- Everything below is the "fatal" path: failures → mark insight failed. -
  try {
    // 1. Persist demand_signals, stamping tenant + insight, getting ids back.
    let signals = [];
    if (collected.length > 0) {
      const rows = collected.map((s) => ({
        ...s,
        tenant_id: tenantId,
        insight_id: insightId,
      }));
      const { data: inserted, error: insertError } = await supabase
        .from('demand_signals')
        .insert(rows)
        .select('*');
      if (insertError) throw insertError;
      // Prefer the echoed rows (WITH ids); fall back to what we built.
      signals = inserted != null ? inserted : rows;
    }

    // 2. Signals → scored opportunities (vLLM scorer). Each run generates a
    // fresh full set (dedupeExisting:false), then supersedes the previous run's
    // open opportunities below — so "Generate" visibly refreshes them.
    const opportunities = await generateForInsight(supabase, {
      tenantId,
      insightId,
      signals,
      profile,
      scoreFn,
      now,
      dedupeExisting: false,
    });

    // 2a. Replace prior runs' opportunities with this run's set — but ONLY when
    // this run actually produced opportunities, so a 0-result run never blanks
    // the Opportunities tab. Fail-soft: a supersede error doesn't fail the run.
    if (opportunities.length > 0) {
      try {
        await supersedePreviousOpportunities(supabase, { tenantId, currentInsightId: insightId });
      } catch (err) {
        console.warn(
          `[insightRunner] failed to supersede previous opportunities for ${insightId}: ${err && err.message ? err.message : err}`,
        );
      }
    }

    // 2b. Rich Market Intelligence report (Claude via aisha-mcp). FAIL-SOFT: a
    // synthesis failure records an error on the report but never fails the run
    // (the opportunities are still persisted).
    let marketInsights = null;
    let marketInsightsError = null;
    if (typeof synthesize === 'function') {
      try {
        const synth = await synthesize({ supabase, tenantId, profile });
        marketInsights = (synth && synth.insights) || null;
      } catch (err) {
        marketInsightsError = err && err.message ? err.message : String(err);
        console.warn(
          `[insightRunner] market-insights synthesis failed for ${insightId}: ${marketInsightsError}`,
        );
      }
    }

    // 3. Build report + summary.
    const nowMs = now();
    const report = buildReport({
      nowMs,
      signals,
      opportunities,
      marketInsights,
      marketInsightsError,
    });
    const signalSummary = buildSignalSummary(signals);
    const opportunityIds = opportunities.map((o) => o.id).filter((id) => id != null);
    const completedAt = new Date(nowMs).toISOString();

    // 4. Mark the insight complete.
    const { error: updateError } = await supabase
      .from('growth_insights')
      .update({
        status: 'complete',
        report,
        opportunity_ids: opportunityIds,
        signal_summary: signalSummary,
        completed_at: completedAt,
      })
      .eq('id', insightId);
    if (updateError) throw updateError;

    // 5. Notify success.
    const oppCount = opportunities.length;
    await notify(supabase, {
      tenant_id: tenantId,
      user_email: userEmail,
      type: 'success',
      title: 'Market insight ready',
      message:
        oppCount > 0
          ? `Your market insight is ready with ${oppCount} ${oppCount === 1 ? 'opportunity' : 'opportunities'}.`
          : 'Your market insight is ready.',
      is_read: false,
      metadata: {
        link: '/reports?tab=insights',
        insight_id: insightId,
        status: 'complete',
      },
    });

    return {
      status: 'complete',
      opportunity_count: oppCount,
      signal_count: signals.length,
    };
  } catch (err) {
    // --- Failure path: mark failed + warn, but NEVER rethrow. ----------------
    const message = err && err.message ? err.message : String(err);
    const completedAt = new Date(now()).toISOString();

    try {
      await supabase
        .from('growth_insights')
        .update({ status: 'failed', error: message, completed_at: completedAt })
        .eq('id', insightId);
    } catch (updateErr) {
      console.error(
        `[insightRunner] failed to mark insight ${insightId} as failed: ${updateErr && updateErr.message ? updateErr.message : updateErr}`,
      );
    }

    try {
      await notify(supabase, {
        tenant_id: tenantId,
        user_email: userEmail,
        type: 'warning',
        title: 'Market insight failed',
        message: 'We could not complete your market insight. Please try again later.',
        is_read: false,
        metadata: {
          link: '/reports?tab=insights',
          insight_id: insightId,
          status: 'failed',
        },
      });
    } catch (notifyErr) {
      console.error(
        `[insightRunner] failed to send failure notification for insight ${insightId}: ${notifyErr && notifyErr.message ? notifyErr.message : notifyErr}`,
      );
    }

    return { status: 'failed', opportunity_count: 0, signal_count: 0 };
  }
}

export default {
  runInsight,
  resolveQuerySet,
  collectSignals,
  buildReport,
  buildSignalSummary,
  defaultNotify,
};
