/**
 * opportunityEngine — turn demand signals into scored growth_opportunities
 * (OSINT Opportunity Intelligence, Phase 1 / Task 5).
 *
 * Why this exists
 * ---------------
 * An insight run produces a pile of `demand_signals` (trends / autocomplete /
 * community / web). This module converts the v1-relevant signals into concrete,
 * deduplicated, scored `growth_opportunities` rows the UI can present and act on.
 *
 * Design: pure logic vs I/O
 * -------------------------
 * The candidate-derivation, deduplication, honesty-sanitizer and default copy
 * are all PURE functions (no DB, no LLM, no clock) so they are trivially
 * unit-testable. Only `generateForInsight` and `expireStale` touch Supabase, and
 * the client + `scoreFn` + `now()` are injected so even those run against a fake.
 *
 * Honesty guardrail
 * -----------------
 * Trends is a RELATIVE interest index — we never publish invented absolute counts
 * or percentages. Any reason attached to a trends-sourced opportunity is run
 * through `sanitizeReason`, which strips `NN%` tokens and bare large digit runs,
 * leaving directional language ("rising" / "increasing") intact. The final stored
 * reason for a trends candidate is guaranteed not to match /\d+\s*%/.
 *
 * Idempotency / cooldown
 * ----------------------
 * `generateForInsight` is safe to call repeatedly: it fetches the tenant's OPEN
 * opportunities (status new/viewed/actioned) and dedupes candidates against them,
 * so a re-run inserts nothing new. The per-run cooldown that decides WHEN a run
 * happens lives at the route/worker layer (Task 9), not here.
 */

// Opportunity statuses considered "open" for dedupe purposes.
const OPEN_STATUSES = ['new', 'viewed', 'actioned'];

// Statuses eligible to be expired (only un-acted, un-dismissed ones).
const EXPIRABLE_STATUSES = ['new', 'viewed'];

const MS_PER_DAY = 86_400_000;

/**
 * Build the dedupe key for a candidate or an existing opportunity.
 * Stable across both shapes: `${type}|${subject}|${region}`, subject lowercased
 * and trimmed, region defaulted to ''.
 *
 * @param {{type:string, subject:string, region?:string|null}} item
 * @returns {string}
 */
export function candidateKey(item) {
  const type = item && item.type != null ? String(item.type) : '';
  const subject = item && item.subject != null ? String(item.subject) : '';
  const region = item && item.region != null ? String(item.region) : '';
  return `${type}|${subject.toLowerCase().trim()}|${region}`;
}

/**
 * Does a keyword match any service in the catalog? Case-insensitive against each
 * service's `name`, `slug`, or any entry in its `keywords[]`.
 *
 * @param {string} keyword
 * @param {Array<{name?:string, slug?:string, keywords?:string[]}>} serviceCatalog
 * @returns {boolean}
 */
function keywordMatchesService(keyword, serviceCatalog) {
  const needle = String(keyword == null ? '' : keyword)
    .trim()
    .toLowerCase();
  if (!needle) return false;
  if (!Array.isArray(serviceCatalog)) return false;

  for (const service of serviceCatalog) {
    if (!service) continue;
    const haystack = [];
    if (service.name) haystack.push(service.name);
    if (service.slug) haystack.push(service.slug);
    if (Array.isArray(service.keywords)) {
      for (const kw of service.keywords) {
        if (kw != null) haystack.push(kw);
      }
    }
    for (const candidate of haystack) {
      if (String(candidate).trim().toLowerCase() === needle) return true;
    }
  }
  return false;
}

/**
 * Derive deterministic candidate objects from demand signals. PURE — no I/O.
 *
 * Rules (v1):
 *  - `trends` signal with `delta_pct > 0` AND a non-empty `region`
 *      → geographic candidate (action_type: create_campaign).
 *  - `autocomplete` signal whose `subject` does NOT match any service in
 *    `profile.service_catalog` → content candidate (action_type: create_task).
 *  - all other signal types are ignored.
 *
 * Each candidate carries `signal_type` (its source) so downstream sanitization
 * can apply the right honesty rules.
 *
 * @param {Array<object>} signals - demand_signals rows
 * @param {{service_catalog?:Array}} [profile]
 * @returns {Array<object>} candidate objects
 */
export function generateCandidates(signals, profile = {}) {
  const list = Array.isArray(signals) ? signals : [];
  const serviceCatalog = (profile && profile.service_catalog) || [];
  const candidates = [];

  for (const signal of list) {
    if (!signal) continue;

    if (signal.signal_type === 'trends') {
      const delta = Number(signal.delta_pct);
      const region = signal.region;
      if (Number.isFinite(delta) && delta > 0 && region) {
        candidates.push({
          type: 'geographic',
          subject: signal.subject,
          region,
          signal_ids: [signal.id],
          signal_type: 'trends',
          action_type: 'create_campaign',
        });
      }
      continue;
    }

    if (signal.signal_type === 'autocomplete') {
      if (!keywordMatchesService(signal.subject, serviceCatalog)) {
        candidates.push({
          type: 'content',
          subject: signal.subject,
          region: signal.region || null,
          signal_ids: [signal.id],
          signal_type: 'autocomplete',
          action_type: 'create_task',
        });
      }
      continue;
    }

    // Ignore community / web (and anything else) in v1.
  }

  return candidates;
}

/**
 * Drop candidates that collide (by `candidateKey`) with an existing OPEN
 * opportunity, and de-dupe candidates against each other (first wins). PURE.
 *
 * @param {Array<object>} candidates
 * @param {Array<{type:string, subject:string, region?:string|null}>} existingOpen
 * @returns {Array<object>}
 */
export function dedupeCandidates(candidates, existingOpen = []) {
  const list = Array.isArray(candidates) ? candidates : [];
  const seen = new Set();

  if (Array.isArray(existingOpen)) {
    for (const existing of existingOpen) {
      if (existing) seen.add(candidateKey(existing));
    }
  }

  const out = [];
  for (const candidate of list) {
    if (!candidate) continue;
    const key = candidateKey(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }
  return out;
}

/**
 * Honesty guardrail: scrub invented numbers from a reason. PURE.
 *
 * For `trends`-sourced candidates the relative index must never be presented as
 * an absolute number or percentage. We:
 *   - replace `NN%` / `NN.N %` tokens with directional language ("rising"),
 *   - strip standalone large digit runs (3+ digits), e.g. "1200 searches",
 *   - collapse the resulting whitespace.
 * The result is guaranteed not to match /\d+\s*%/.
 *
 * For non-trends sources the reason is returned trimmed but otherwise untouched
 * (web / community sources may legitimately carry concrete numbers).
 *
 * @param {string} reason
 * @param {string} signalType
 * @returns {string}
 */
export function sanitizeReason(reason, signalType) {
  const text = String(reason == null ? '' : reason);
  if (signalType !== 'trends') {
    return text.trim();
  }

  let out = text;
  // "up 21%", "21 %", "21.5%" → directional word. Handles an optional leading
  // direction word so "up 21%" doesn't become "up rising".
  out = out.replace(/\b(?:up|down|by)?\s*\d+(?:\.\d+)?\s*%/gi, 'rising');
  // Any leftover percent tokens (defensive) → directional.
  out = out.replace(/\d+(?:\.\d+)?\s*%/g, 'rising');
  // Standalone large digit runs (3+ digits), e.g. "1200 searches".
  out = out.replace(/\b\d{3,}\b/g, '');
  // Collapse whitespace and tidy stray spacing before punctuation.
  out = out
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,;])/g, '$1')
    .trim();
  return out;
}

/**
 * Deterministic fallback title for a candidate. PURE — directional, no numbers.
 *
 * @param {{type:string, subject:string, region?:string|null}} candidate
 * @returns {string}
 */
export function buildDefaultTitle(candidate = {}) {
  const subject = candidate.subject == null ? '' : String(candidate.subject);
  if (candidate.type === 'geographic') {
    return `Target ${subject} in ${candidate.region == null ? '' : String(candidate.region)}`;
  }
  if (candidate.type === 'content') {
    return `Create content for "${subject}"`;
  }
  return `Opportunity: ${subject}`;
}

/**
 * Deterministic fallback reason for a candidate. PURE — directional, no numbers.
 *
 * @param {{type:string, subject:string, region?:string|null}} candidate
 * @returns {string}
 */
export function buildDefaultReason(candidate = {}) {
  const subject = candidate.subject == null ? '' : String(candidate.subject);
  if (candidate.type === 'geographic') {
    const region = candidate.region == null ? '' : String(candidate.region);
    return `Interest in ${subject} appears to be rising in ${region} — consider focused outreach.`;
  }
  if (candidate.type === 'content') {
    return `People are searching for "${subject}" but you have no matching service page — consider adding content.`;
  }
  return `${subject} looks like a promising area — consider acting on it.`;
}

/**
 * Orchestrate candidate generation → dedupe → score → insert for one insight.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} opts
 * @param {string} opts.tenantId - tenant UUID
 * @param {string} opts.insightId - parent insight run id
 * @param {Array<object>} opts.signals - demand_signals for the run
 * @param {object} opts.profile - business_profile (service_catalog etc.)
 * @param {(candidate:object)=>object} opts.scoreFn - returns
 *   { score, expected_impact, difficulty, recommended_action, title?, reason? }
 * @param {()=>number} [opts.now] - clock in ms (injectable for tests)
 * @param {number} [opts.ttlDays] - days until the opportunity expires
 * @returns {Promise<Array<object>>} the inserted opportunity rows (as built here)
 */
export async function generateForInsight(
  supabase,
  { tenantId, insightId, signals, profile, scoreFn, now = Date.now, ttlDays = 30 },
) {
  if (typeof scoreFn !== 'function') {
    throw new Error('generateForInsight requires a scoreFn function');
  }

  // 1. Existing OPEN opportunities for this tenant (for dedupe).
  const { data: existingOpen, error: fetchError } = await supabase
    .from('growth_opportunities')
    .select('type, subject, region, status')
    .eq('tenant_id', tenantId)
    .in('status', OPEN_STATUSES);

  if (fetchError) throw fetchError;

  // 2. Derive + dedupe candidates.
  const candidates = generateCandidates(signals, profile);
  const survivors = dedupeCandidates(candidates, existingOpen || []);

  if (survivors.length === 0) return [];

  const expiresAt = new Date(now() + ttlDays * MS_PER_DAY).toISOString();

  // 3. Score + build rows. scoreFn may be async (e.g. an LLM-backed scorer) or
  // sync (a deterministic stub) — awaiting handles both.
  const rows = await Promise.all(
    survivors.map(async (candidate) => {
      const scored = (await scoreFn(candidate)) || {};

      const title = scored.title != null ? scored.title : buildDefaultTitle(candidate);
      const rawReason = scored.reason != null ? scored.reason : buildDefaultReason(candidate);
      const reason = sanitizeReason(rawReason, candidate.signal_type);

      return {
        tenant_id: tenantId,
        insight_id: insightId,
        type: candidate.type,
        title,
        reason,
        score: scored.score,
        expected_impact: scored.expected_impact,
        difficulty: scored.difficulty,
        recommended_action: scored.recommended_action,
        action_type: candidate.action_type != null ? candidate.action_type : null,
        action_payload: scored.action_payload != null ? scored.action_payload : {},
        signal_ids: candidate.signal_ids,
        status: 'new',
        expires_at: expiresAt,
      };
    }),
  );

  // 4. Insert.
  const { data: inserted, error: insertError } = await supabase
    .from('growth_opportunities')
    .insert(rows)
    .select('*');

  if (insertError) throw insertError;

  // Return the inserted rows when the client echoes them; otherwise the rows we
  // built (so callers always get the candidate objects we stamped).
  return inserted != null ? inserted : rows;
}

/**
 * Expire stale opportunities: rows whose `expires_at < now` and whose status is
 * still new/viewed are moved to 'expired'.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} opts
 * @param {string} opts.tenantId - tenant UUID
 * @param {()=>number} [opts.now] - clock in ms (injectable for tests)
 * @returns {Promise<{count:number, data:any}>}
 */
export async function expireStale(supabase, { tenantId, now = Date.now }) {
  const nowIso = new Date(now()).toISOString();

  const { data, error } = await supabase
    .from('growth_opportunities')
    .update({ status: 'expired' })
    .eq('tenant_id', tenantId)
    .lt('expires_at', nowIso)
    .in('status', EXPIRABLE_STATUSES)
    .select('id');

  if (error) throw error;

  const count = Array.isArray(data) ? data.length : 0;
  return { count, data };
}

export default {
  candidateKey,
  generateCandidates,
  dedupeCandidates,
  sanitizeReason,
  buildDefaultTitle,
  buildDefaultReason,
  generateForInsight,
  expireStale,
};
