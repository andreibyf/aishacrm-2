/**
 * etaEstimator — approximate completion time for an insight run
 * (OSINT Opportunity Intelligence, Phase 1 / Task 6).
 *
 * An insight run is asynchronous: the client kicks it off and gets back an
 * estimated completion time to display ("Running — about ~N minutes"). This
 * module produces that estimate.
 *
 * Strategy:
 *  - If we have enough recent completed-run durations (>= MIN_SAMPLES), use the
 *    rolling MEDIAN of those — empirical and self-correcting.
 *  - Otherwise fall back to a heuristic: a fixed base cost plus a per-(service ×
 *    region) collection/synthesis cost.
 *
 * Returns { eta_seconds, low, high } where low/high bracket the estimate (±30%)
 * so the UI can show a range. PURE — no I/O.
 */

const BASE_SECONDS = 60; // fixed overhead (fetch setup + LLM synthesis pass)
const PER_PAIR_SECONDS = 15; // marginal cost per service×region pair
const MIN_SAMPLES = 3; // recent durations needed before we trust the empirical median
const BAND = 0.3; // ±30% range around the point estimate

/**
 * Median of a numeric array. Returns 0 for an empty array.
 * @param {number[]} nums
 * @returns {number}
 */
function median(nums) {
  const xs = nums
    .filter((n) => Number.isFinite(n))
    .slice()
    .sort((a, b) => a - b);
  if (xs.length === 0) return 0;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 === 0 ? (xs[mid - 1] + xs[mid]) / 2 : xs[mid];
}

/**
 * Estimate the duration of an insight run.
 *
 * @param {object} [opts]
 * @param {number} [opts.serviceCount=0] - number of declared services
 * @param {number} [opts.regionCount=0]  - number of declared target regions
 * @param {number[]} [opts.recentDurations=[]] - durations (seconds) of recent completed runs
 * @returns {{eta_seconds:number, low:number, high:number}}
 */
export function estimate({ serviceCount = 0, regionCount = 0, recentDurations = [] } = {}) {
  const samples = Array.isArray(recentDurations)
    ? recentDurations.filter((n) => Number.isFinite(n) && n > 0)
    : [];

  let point;
  if (samples.length >= MIN_SAMPLES) {
    point = median(samples);
  } else {
    const work = Math.max(0, serviceCount) * Math.max(0, regionCount);
    point = BASE_SECONDS + PER_PAIR_SECONDS * work;
  }

  const eta_seconds = Math.round(point);
  return {
    eta_seconds,
    low: Math.round(eta_seconds * (1 - BAND)),
    high: Math.round(eta_seconds * (1 + BAND)),
  };
}

export default { estimate };
