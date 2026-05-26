/**
 * Opportunity stage normalization (4VD-63).
 *
 * Background
 * ----------
 * Canonical opportunity stages are defined in backend/config/constants.js as:
 *   prospecting, qualification, proposal, negotiation, closed_won, closed_lost
 *
 * Historically the React form wrote the legacy short forms `won` / `lost`
 * directly to the `opportunities.stage` column, while the stat cards,
 * Kanban board and read endpoints used the canonical `closed_won` /
 * `closed_lost`. The result: clicking the "Closed Won" stat card produced
 * a query for stage='closed_won' that excluded every legacy record stored
 * with stage='won' — they showed in the count (stats normalize at the
 * aggregation layer) but vanished from the list.
 *
 * This module is the single source of truth for two operations:
 *
 *   - expandStageFilter(stage):
 *       Used at READ time. Given a user-supplied filter value, returns
 *       the array of DB stage values that should match. Legacy and
 *       canonical aliases collapse to the same set so existing records
 *       are visible regardless of which spelling lives in the row.
 *
 *   - canonicalizeStage(stage):
 *       Used at WRITE time. Maps any legacy or odd casing variant to its
 *       canonical form before INSERT/UPDATE so new rows never reintroduce
 *       the divergence.
 *
 * Both helpers are pure and exported for direct unit testing — they do
 * not touch the database or any Express context.
 */

/**
 * Map of every accepted alias to the set of DB values it expands to.
 * Keys are stored lowercased; callers are expected to lowercase the
 * incoming string before lookup (the helpers below do this).
 */
const STAGE_ALIASES = Object.freeze({
  // Canonical → expand to itself plus all legacy/typo variants
  closed_won: ['won', 'closed_won', 'closedwon'],
  closed_lost: ['lost', 'closed_lost', 'closedlost'],

  // Legacy → expand to canonical + legacy so callers using either spelling
  // see the same dataset
  won: ['won', 'closed_won', 'closedwon'],
  lost: ['lost', 'closed_lost', 'closedlost'],
  closedwon: ['won', 'closed_won', 'closedwon'],
  closedlost: ['lost', 'closed_lost', 'closedlost'],

  // Other canonical stages — no aliases, but listed for completeness so
  // callers can rely on a stable contract (the helper always returns an
  // array when given a non-empty string).
  prospecting: ['prospecting'],
  qualification: ['qualification'],
  proposal: ['proposal'],
  negotiation: ['negotiation'],
});

/**
 * Expand a stage filter value to the array of DB stage strings that
 * should match it. Returns `null` for falsy / non-string input so
 * callers can use a single guard:
 *
 *   const stages = expandStageFilter(req.query.stage);
 *   if (stages) q = q.in('stage', stages);
 *
 * For unknown stage values the helper falls back to `[normalized]` —
 * preserving forward-compatibility with any new stage added to
 * `constants.STATUS.OPPORTUNITY` without requiring a code change here.
 *
 * @param {string|null|undefined} stage
 * @returns {string[]|null}
 */
export function expandStageFilter(stage) {
  if (!stage || typeof stage !== 'string') return null;
  const normalized = stage.trim().toLowerCase();
  if (!normalized) return null;
  return STAGE_ALIASES[normalized] || [normalized];
}

/**
 * Convert a legacy / casing-variant stage value to its canonical form
 * before persisting. Unknown values are returned lower-cased and
 * trimmed but otherwise unchanged.
 *
 * @param {unknown} stage
 * @returns {string|null|undefined} canonical stage, or the original
 *   falsy / non-string value passed through unchanged
 */
export function canonicalizeStage(stage) {
  if (stage === null || stage === undefined) return stage;
  if (typeof stage !== 'string') return stage;
  const normalized = stage.trim().toLowerCase();
  if (!normalized) return normalized;
  if (normalized === 'won' || normalized === 'closedwon') return 'closed_won';
  if (normalized === 'lost' || normalized === 'closedlost') return 'closed_lost';
  return normalized;
}

/**
 * Set of values treated as "no stage filter" by route handlers.
 * Exported for parity with existing route guards.
 */
export const STAGE_FILTER_BYPASS_VALUES = new Set(['all', 'any', '', 'undefined']);

export default { expandStageFilter, canonicalizeStage, STAGE_FILTER_BYPASS_VALUES };
