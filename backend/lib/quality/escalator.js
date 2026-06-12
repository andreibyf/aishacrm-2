/**
 * Lite→full escalation decisions — Phase 4 of the lite-tier quality pipeline.
 *
 * Two signals, both tied to relevance (Decision 3):
 *  - SEVERITY (hot path): a severe relevance miss — or a multi-step/sequenced task
 *    that isn't lite-appropriate — escalates immediately; after the refine cap is
 *    spent with defects still present, escalate as a capability gap.
 *  - FREQUENCY (telemetry): a per-(agent, task-type) rolling escalation rate. When
 *    a role escalates too often, that's the signal it should just be `full` — we
 *    surface a recommendation (flip via AISHA_<ROLE>_MODEL_TIER, no code change),
 *    we don't auto-flip.
 *
 * See docs/plans/2026-06-11-lite-tier-supervisor-refine.md (component 6).
 */

const SEVERITY_RANK = { severe: 3, mild: 2, minor: 1 };

/** Numeric rank of a defect's severity (0 if unknown). */
export function severityOf(defect) {
  return SEVERITY_RANK[defect?.severity] || 0;
}

/**
 * Hot-path escalation decision.
 * @param {Object} opts
 * @param {Array<{severity?: string}>} [opts.defects]
 * @param {boolean} [opts.isMultiStep]
 * @param {number} [opts.attempts] - refine passes already spent.
 * @param {number} [opts.cap] - max refine passes before escalation.
 * @returns {{ escalate: boolean, reason: string|null }}
 */
export function shouldEscalateNow({ defects = [], isMultiStep = false, attempts = 0, cap = 1 }) {
  if (isMultiStep) return { escalate: true, reason: 'multi_step' };
  if (defects.some((d) => d.severity === 'severe')) {
    return { escalate: true, reason: 'severe_defect' };
  }
  if (attempts >= cap && defects.length > 0) {
    return { escalate: true, reason: 'refine_cap_exhausted' };
  }
  return { escalate: false, reason: null };
}

// ── Frequency: per-(agent, task-type) rolling escalation rate ────────────────
// In-memory only — a drift signal across a process's lifetime, not durable state.
// Bounded so a long-running worker can't grow it without limit.
const MAX_TOTAL = 200;
const _counters = new Map(); // key → { total, escalated }

function keyOf(agent, taskType) {
  return `${agent || 'unknown'}::${taskType || 'generic_text'}`;
}

/** Record one task outcome for the (agent, task-type) escalation-rate counter. */
export function recordOutcome({ agent, taskType, escalated }) {
  const key = keyOf(agent, taskType);
  const c = _counters.get(key) || { total: 0, escalated: 0 };
  if (c.total >= MAX_TOTAL) {
    // Halve both to keep a rolling (decaying) rate rather than unbounded growth.
    c.total = Math.floor(c.total / 2);
    c.escalated = Math.floor(c.escalated / 2);
  }
  c.total += 1;
  if (escalated) c.escalated += 1;
  _counters.set(key, c);
  return c;
}

/** Current escalation rate for an (agent, task-type), 0 if no samples. */
export function escalationRate(agent, taskType) {
  const c = _counters.get(keyOf(agent, taskType));
  return c && c.total > 0 ? c.escalated / c.total : 0;
}

/**
 * Should we recommend flipping this role to the full tier? True when it escalates
 * above `threshold` over at least `minSamples` observations.
 */
export function shouldRecommendFull(agent, taskType, { threshold = 0.5, minSamples = 10 } = {}) {
  const c = _counters.get(keyOf(agent, taskType));
  if (!c || c.total < minSamples) return false;
  return c.escalated / c.total >= threshold;
}

/** Test/maintenance hook — clear the in-memory counters. */
export function _resetCounters() {
  _counters.clear();
}

export default shouldEscalateNow;
