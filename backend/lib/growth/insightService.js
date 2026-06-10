/**
 * insightService — insight-run + opportunity logic for the Growth routes
 * (OSINT Opportunity Intelligence, Phase 1 / Task 9).
 *
 * These are the "core logic" functions behind the /api/v2/growth insight and
 * opportunity endpoints. They are deliberately framework-free: each takes an
 * injected Supabase client plus a small `args`/`deps` bag (tenant id, user,
 * clock, profile loader, action dispatcher) and returns a plain
 * `{ status, body }` envelope. The route handlers in routes/growth.js are thin
 * wrappers that resolve the real client/clock and translate the envelope to an
 * Express response.
 *
 * Tenant isolation: EVERY query filters by the caller-supplied tenantId (a UUID
 * from req.tenant.id). tenant_id is never trusted from client input.
 *
 * Pure-unit testable: no live DB / network / timers — inject a fake supabase, a
 * fixed `now`, a fake `getProfile`, and a fake `dispatch`.
 */

const COOLDOWN_DAYS = 7;
const COOLDOWN_MS = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

// Opportunity statuses considered "open" (not dismissed/expired).
const OPEN_STATUSES = ['new', 'viewed', 'actioned'];

/**
 * Is this user a superadmin (cooldown-exempt)?
 * @param {{role?:string, is_superadmin?:boolean}} [user]
 * @returns {boolean}
 */
export function isSuperadmin(user) {
  return user?.role === 'superadmin' || user?.is_superadmin === true;
}

/**
 * Count helper for an array-ish value.
 * @param {*} v
 * @returns {number}
 */
function countOf(v) {
  return Array.isArray(v) ? v.length : 0;
}

/**
 * Kick off an async insight run (the worker does the synthesis; this only
 * gates + inserts the `running` row).
 *
 * Cooldown: if the tenant's most recent run was created within COOLDOWN_DAYS and
 * the caller is NOT a superadmin → returns 429 with `next_available_at`.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} args
 * @param {string} args.tenantId
 * @param {{id?:string, email?:string, role?:string, is_superadmin?:boolean}} [args.user]
 * @param {object} deps
 * @param {(supabase, tenantId)=>Promise<object>} deps.getProfile - profile loader (getOrSeedProfile)
 * @param {(opts:object)=>{eta_seconds:number, low:number, high:number}} deps.estimate
 * @param {()=>number} [deps.now=Date.now]
 * @returns {Promise<{status:number, body:object}>}
 */
export async function createInsightRun(supabase, args, deps) {
  const { tenantId, user } = args || {};
  const { getProfile, estimate, now = Date.now } = deps || {};
  const superadmin = isSuperadmin(user);
  const nowMs = now();

  // --- Cooldown gate: latest SUCCESSFUL/in-flight run for this tenant --------
  // Only `running`/`complete` runs start the 7-day cooldown. A `failed` run must
  // NOT lock the tenant out — the UI offers a Retry, so a transient worker/
  // provider failure should be immediately retryable.
  const { data: latest, error: latestError } = await supabase
    .from('growth_insights')
    .select('id, created_at, status')
    .eq('tenant_id', tenantId)
    .in('status', ['running', 'complete'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) throw latestError;

  if (latest && latest.created_at && !superadmin) {
    const createdMs = new Date(latest.created_at).getTime();
    if (Number.isFinite(createdMs) && nowMs - createdMs < COOLDOWN_MS) {
      const nextAvailable = new Date(createdMs + COOLDOWN_MS).toISOString();
      return {
        status: 429,
        body: {
          status: 'error',
          message: `A market insight was generated recently. The next run is available on ${nextAvailable}.`,
          next_available_at: nextAvailable,
        },
      };
    }
  }

  // --- Compute ETA from profile scope + recent completed-run durations -------
  const profile = await getProfile(supabase, tenantId);
  const serviceCount = countOf(profile?.service_catalog);
  const regionCount = countOf(profile?.target_regions);

  const { data: completed, error: completedError } = await supabase
    .from('growth_insights')
    .select('started_at, completed_at')
    .eq('tenant_id', tenantId)
    .eq('status', 'complete')
    .order('created_at', { ascending: false })
    .limit(10);
  if (completedError) throw completedError;

  const recentDurations = (completed || [])
    .map((r) => {
      const s = r?.started_at ? new Date(r.started_at).getTime() : NaN;
      const c = r?.completed_at ? new Date(r.completed_at).getTime() : NaN;
      if (!Number.isFinite(s) || !Number.isFinite(c)) return NaN;
      return (c - s) / 1000;
    })
    .filter((n) => Number.isFinite(n) && n > 0);

  const eta = estimate({ serviceCount, regionCount, recentDurations });

  // --- Insert the running row (worker picks it up; no synthesis here) --------
  const insertRow = {
    tenant_id: tenantId,
    status: 'running',
    trigger: superadmin ? 'admin_adhoc' : 'manual',
    generated_by: user?.id ?? null,
    generated_by_email: user?.email ?? null,
    eta_seconds: eta.eta_seconds,
  };

  const { data: inserted, error: insertError } = await supabase
    .from('growth_insights')
    .insert(insertRow)
    .select('*')
    .single();
  if (insertError) throw insertError;

  return {
    status: 202,
    body: {
      status: 'success',
      data: {
        id: inserted.id,
        status: 'running',
        eta_seconds: eta.eta_seconds,
        eta_range: { low: eta.low, high: eta.high },
      },
    },
  };
}

/**
 * Latest insight row for the tenant (the "current" insight). Returns
 * `{ insight: null }` when none exists.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{tenantId:string}} args
 * @returns {Promise<{status:number, body:object}>}
 */
export async function getCurrentInsight(supabase, args) {
  const { tenantId } = args || {};
  const { data, error } = await supabase
    .from('growth_insights')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;

  return { status: 200, body: { status: 'success', data: { insight: data || null } } };
}

/**
 * A specific insight run (tenant-scoped). 404 when not found for this tenant.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{tenantId:string, id:string}} args
 * @returns {Promise<{status:number, body:object}>}
 */
export async function getInsightById(supabase, args) {
  const { tenantId, id } = args || {};
  const { data, error } = await supabase
    .from('growth_insights')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;

  if (!data) {
    return { status: 404, body: { status: 'error', message: 'Insight not found' } };
  }
  return { status: 200, body: { status: 'success', data: { insight: data } } };
}

/**
 * List opportunities for the tenant. Filters: `type`, `status` (defaults to the
 * open set new/viewed/actioned), `min_score`. Sorted by score desc.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{tenantId:string, type?:string, status?:string, min_score?:number|string}} args
 * @returns {Promise<{status:number, body:object}>}
 */
export async function listOpportunities(supabase, args) {
  const { tenantId, type, status, min_score } = args || {};

  let query = supabase.from('growth_opportunities').select('*').eq('tenant_id', tenantId);

  if (status) {
    query = query.eq('status', status);
  } else {
    // Default: exclude dismissed/expired.
    query = query.in('status', OPEN_STATUSES);
  }

  if (type) {
    query = query.eq('type', type);
  }

  if (min_score !== undefined && min_score !== null && min_score !== '') {
    const min = Number(min_score);
    if (Number.isFinite(min)) {
      query = query.gte('score', min);
    }
  }

  query = query.order('score', { ascending: false });

  const { data, error } = await query;
  if (error) throw error;

  return { status: 200, body: { status: 'success', data: { opportunities: data || [] } } };
}

/**
 * One opportunity (tenant-scoped) plus its provenance demand_signals
 * (signal_ids → demand_signals). 404 when not found for this tenant.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{tenantId:string, id:string}} args
 * @returns {Promise<{status:number, body:object}>}
 */
export async function getOpportunityDetail(supabase, args) {
  const { tenantId, id } = args || {};

  const { data: opportunity, error } = await supabase
    .from('growth_opportunities')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;

  if (!opportunity) {
    return { status: 404, body: { status: 'error', message: 'Opportunity not found' } };
  }

  let signals = [];
  const signalIds = Array.isArray(opportunity.signal_ids) ? opportunity.signal_ids : [];
  if (signalIds.length > 0) {
    const { data: sigRows, error: sigError } = await supabase
      .from('demand_signals')
      .select('*')
      .eq('tenant_id', tenantId)
      .in('id', signalIds);
    if (sigError) throw sigError;
    signals = sigRows || [];
  }

  return { status: 200, body: { status: 'success', data: { opportunity, signals } } };
}

/**
 * Dismiss an opportunity: status='dismissed', stash `{ reason }` into
 * actioned_entity. Tenant-scoped. 404 when not found.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{tenantId:string, id:string, reason?:string}} args
 * @returns {Promise<{status:number, body:object}>}
 */
export async function dismissOpportunity(supabase, args) {
  const { tenantId, id, reason } = args || {};

  const { data, error } = await supabase
    .from('growth_opportunities')
    .update({ status: 'dismissed', actioned_entity: { reason: reason ?? null } })
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) throw error;

  if (!data) {
    return { status: 404, body: { status: 'error', message: 'Opportunity not found' } };
  }
  return { status: 200, body: { status: 'success', data: { opportunity: data } } };
}

/**
 * Default opportunity-action dispatcher (INJECTABLE — tests pass a fake).
 *
 * Phase 1 keeps this minimal but structured: it returns a descriptive
 * actioned_entity stub keyed by the opportunity's action_type. The richer wiring
 * (actually creating a campaign / email / SMS / social / workflow / task entity
 * from action_payload + overrides) lands in a later task.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} _supabase
 * @param {{action_type?:string, action_payload?:object}} opportunity
 * @param {object} [overrides]
 * @param {object} [_deps]
 * @returns {Promise<{type:string, status:string, overrides?:object}>}
 */
export async function dispatchOpportunityAction(
  _supabase,
  opportunity,
  overrides = {},
  _deps = {},
) {
  const actionType = opportunity?.action_type || 'create_task';
  // TODO (later task): branch per action_type and create the real CRM entity
  //   (campaign/email/sms/social/workflow/task) from action_payload + overrides,
  //   returning the created entity's id/type in actioned_entity.
  return {
    type: actionType,
    status: 'created',
    overrides: overrides && Object.keys(overrides).length > 0 ? overrides : undefined,
  };
}

/**
 * Execute an opportunity's action: load it (tenant-scoped), run the injected
 * dispatcher, merge the dispatcher result into actioned_entity, and set
 * status='actioned'. 404 when not found.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{tenantId:string, id:string, overrides?:object}} args
 * @param {object} [deps]
 * @param {Function} [deps.dispatch=dispatchOpportunityAction]
 * @returns {Promise<{status:number, body:object}>}
 */
export async function actionOpportunity(supabase, args, deps = {}) {
  const { tenantId, id, overrides = {} } = args || {};
  const { dispatch = dispatchOpportunityAction } = deps;

  const { data: opportunity, error } = await supabase
    .from('growth_opportunities')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;

  if (!opportunity) {
    return { status: 404, body: { status: 'error', message: 'Opportunity not found' } };
  }

  const result = await dispatch(supabase, opportunity, overrides, deps);

  const actionedEntity = {
    ...(opportunity.actioned_entity && typeof opportunity.actioned_entity === 'object'
      ? opportunity.actioned_entity
      : {}),
    ...(result && typeof result === 'object' ? result : {}),
  };

  const { data: updated, error: updateError } = await supabase
    .from('growth_opportunities')
    .update({ status: 'actioned', actioned_entity: actionedEntity })
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (updateError) throw updateError;

  return { status: 200, body: { status: 'success', data: { opportunity: updated } } };
}

/**
 * Dashboard bundle: latest insight + top 3 open opportunities by score.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{tenantId:string}} args
 * @returns {Promise<{status:number, body:object}>}
 */
export async function getDashboard(supabase, args) {
  const { tenantId } = args || {};

  const { data: currentInsight, error: insightError } = await supabase
    .from('growth_insights')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (insightError) throw insightError;

  const { data: topOpps, error: oppsError } = await supabase
    .from('growth_opportunities')
    .select('*')
    .eq('tenant_id', tenantId)
    .in('status', OPEN_STATUSES)
    .order('score', { ascending: false })
    .limit(3);
  if (oppsError) throw oppsError;

  return {
    status: 200,
    body: {
      status: 'success',
      data: {
        current_insight: currentInsight || null,
        top_opportunities: topOpps || [],
      },
    },
  };
}

export default {
  isSuperadmin,
  createInsightRun,
  getCurrentInsight,
  getInsightById,
  listOpportunities,
  getOpportunityDetail,
  dismissOpportunity,
  dispatchOpportunityAction,
  actionOpportunity,
  getDashboard,
};
