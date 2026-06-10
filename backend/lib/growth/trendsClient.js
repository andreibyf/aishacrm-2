/**
 * trendsClient — directional Google-Trends client with a circuit breaker
 * (OSINT Opportunity Intelligence, Phase 1 / Task 3).
 *
 * Why this exists
 * ---------------
 * Public trends widgets are flaky and rate-limited. We must (a) NEVER surface
 * absolute search volumes — only a RELATIVE interest index and a directional
 * delta — and (b) degrade gracefully when the upstream is failing, serving the
 * last-known-good value from cache rather than hammering a dead endpoint.
 *
 * Directional contract
 * --------------------
 * The normalized output is intentionally limited to:
 *   { subject, region, value, delta_pct }
 *  - `value`     — latest relative interest index in [0, 100].
 *  - `delta_pct` — percent change of the latest point vs the FIRST comparable
 *                  point in the series ((latest - first) / first * 100), rounded
 *                  to one decimal. 0 when the first point is 0 (no baseline).
 * There is deliberately NO `volume` / `count` / `searches` key — absolute
 * counts are never derived or returned.
 *
 * Circuit breaker state machine (state persists in the closure across calls)
 * -------------------------------------------------------------------------
 *   CLOSED    — normal. Every call invokes fetchImpl.
 *               - success: reset failure counter, cache last-good.
 *               - throw:   increment failure counter; when it reaches
 *                          failureThreshold → OPEN (record openedAt = now()).
 *   OPEN      — tripped. Calls do NOT invoke fetchImpl. Return cached last-good
 *               (via cache.get) or null. When now() - openedAt >= cooldownMs the
 *               breaker becomes HALF-OPEN on the NEXT call.
 *   HALF_OPEN — one trial. The next call makes exactly ONE fetchImpl call.
 *               - success: → CLOSED, reset failure counter, cache last-good.
 *               - throw:   → OPEN again, reset the cooldown clock (openedAt = now()).
 *
 * All dependencies are injected so the core logic is pure-unit testable with a
 * fake cache, a stubbed fetchImpl, and a controllable now() (no live network,
 * no real Redis, no real timers).
 */

import { getCacheClient } from '../cacheClient.js';

const STATE_CLOSED = 'CLOSED';
const STATE_OPEN = 'OPEN';
const STATE_HALF_OPEN = 'HALF_OPEN';

const DEFAULT_TTL_SECONDS = 21_600; // 6h

/**
 * Build the cache key for a (keyword, region) pair.
 * @param {string} keyword
 * @param {string} region
 * @returns {string}
 */
function cacheKey(keyword, region) {
  return `trends:${keyword}:${region}`;
}

/**
 * Extract a points array from raw Google-Trends-widget-style data.
 *
 * Accepts a few shapes defensively:
 *  - { default: { timelineData: [{ value: [n] | n }, ...] } }  (widget shape)
 *  - { timelineData: [...] }
 *  - { points: [{ value }, ...] }
 *  - [ { value }, ... ]  (already a points array)
 *
 * Each point's interest value is read from `value` (number, or first element of
 * an array — the widget nests single-keyword series as a one-element array).
 *
 * @param {any} raw
 * @returns {number[]} ordered interest values (oldest → newest)
 */
function extractPoints(raw) {
  if (!raw) return [];

  let series = null;
  if (Array.isArray(raw)) {
    series = raw;
  } else if (Array.isArray(raw.points)) {
    series = raw.points;
  } else if (Array.isArray(raw.timelineData)) {
    series = raw.timelineData;
  } else if (raw.default && Array.isArray(raw.default.timelineData)) {
    series = raw.default.timelineData;
  }

  if (!Array.isArray(series)) return [];

  return series
    .map((pt) => {
      if (typeof pt === 'number') return pt;
      const v = pt && pt.value;
      if (Array.isArray(v)) return Number(v[0]);
      return Number(v);
    })
    .filter((n) => Number.isFinite(n));
}

/**
 * Clamp a number into the [0, 100] relative-interest range.
 * @param {number} n
 * @returns {number}
 */
function clampIndex(n) {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

/**
 * Normalize raw widget data to the directional output. PURE — no I/O.
 *
 * @param {string} keyword
 * @param {string} region
 * @param {any} raw
 * @returns {{subject:string, region:string, value:number, delta_pct:number}}
 */
export function normalizeTrend(keyword, region, raw) {
  const points = extractPoints(raw);
  const latest = points.length ? points[points.length - 1] : 0;
  const first = points.length ? points[0] : 0;

  const value = clampIndex(latest);

  let delta_pct = 0;
  if (first > 0) {
    delta_pct = Math.round(((latest - first) / first) * 1000) / 10;
  }

  return { subject: keyword, region, value, delta_pct };
}

/**
 * Default cache adapter over the production Redis cache layer. Lazily resolves
 * the ioredis-style client. Production callers omit `cache` and get this; tests
 * inject their own fake.
 *
 * @returns {{get(key:string):Promise<any>, set(key:string, value:any, ttlSeconds:number):Promise<void>}}
 */
export function createDefaultCacheAdapter() {
  return {
    async get(key) {
      const client = await getCacheClient();
      const raw = await client.get(key);
      if (raw == null) return null;
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    },
    async set(key, value, ttlSeconds) {
      const client = await getCacheClient();
      await client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    },
  };
}

/**
 * Create a trends client with a circuit breaker. All deps injectable.
 *
 * @param {object} opts
 * @param {(keyword:string, region:string)=>Promise<any>} opts.fetchImpl
 *   Fetches raw widget data; may throw on upstream failure.
 * @param {{get:Function, set:Function}} [opts.cache]
 *   Cache with async get(key)/set(key, value, ttlSeconds). Defaults to Redis.
 * @param {()=>number} [opts.now] Clock in ms (injectable for tests).
 * @param {number} [opts.failureThreshold] Consecutive failures to OPEN.
 * @param {number} [opts.cooldownMs] OPEN duration before HALF-OPEN.
 * @param {number} [opts.ttlSeconds] Cache TTL for last-good.
 * @returns {{ getTrend(keyword:string, region:string):Promise<object|null> }}
 */
export function createTrendsClient({
  fetchImpl,
  cache,
  now = Date.now,
  failureThreshold = 3,
  cooldownMs = 60_000,
  ttlSeconds = DEFAULT_TTL_SECONDS,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('createTrendsClient requires a fetchImpl function');
  }
  const store = cache || createDefaultCacheAdapter();

  // Breaker state — persists in this closure across getTrend calls.
  let state = STATE_CLOSED;
  let failureCount = 0;
  let openedAt = 0; // timestamp (ms) the breaker last entered OPEN

  function open() {
    state = STATE_OPEN;
    openedAt = now();
  }

  function close() {
    state = STATE_CLOSED;
    failureCount = 0;
  }

  /**
   * Perform the upstream fetch + normalize + cache. On success returns the
   * normalized result and resets/closes the breaker. On throw, updates the
   * breaker per the current state and re-throws so the caller falls back.
   */
  async function attempt(keyword, region, fromHalfOpen) {
    try {
      const raw = await fetchImpl(keyword, region);
      const normalized = normalizeTrend(keyword, region, raw);
      await store.set(cacheKey(keyword, region), normalized, ttlSeconds);
      close(); // success in CLOSED or HALF_OPEN → CLOSED, counter reset
      return normalized;
    } catch (err) {
      if (fromHalfOpen) {
        // Trial failed → back to OPEN, restart the cooldown clock.
        open();
      } else {
        failureCount += 1;
        if (failureCount >= failureThreshold) {
          open();
        }
      }
      throw err;
    }
  }

  /**
   * Return the cached last-good value, or null when none is stored.
   */
  async function lastGood(keyword, region) {
    const cached = await store.get(cacheKey(keyword, region));
    return cached == null ? null : cached;
  }

  return {
    /**
     * Get the directional trend for (keyword, region), honoring the breaker.
     * @returns {Promise<{subject,region,value,delta_pct}|null>}
     */
    async getTrend(keyword, region) {
      // OPEN → maybe transition to HALF-OPEN once cooldown has elapsed.
      if (state === STATE_OPEN) {
        if (now() - openedAt >= cooldownMs) {
          state = STATE_HALF_OPEN;
        } else {
          // Still cooling down: do NOT call fetchImpl; serve last-good/null.
          return lastGood(keyword, region);
        }
      }

      if (state === STATE_HALF_OPEN) {
        try {
          return await attempt(keyword, region, /* fromHalfOpen */ true);
        } catch {
          // Trial failed (breaker re-opened in attempt) → fall back.
          return lastGood(keyword, region);
        }
      }

      // CLOSED.
      try {
        return await attempt(keyword, region, /* fromHalfOpen */ false);
      } catch {
        // If this failure tripped the breaker, fall back to last-good/null.
        if (state === STATE_OPEN) {
          return lastGood(keyword, region);
        }
        // Still CLOSED (below threshold): surface the error to the caller.
        throw new Error(`trendsClient: fetch failed for "${keyword}" (${region})`);
      }
    },
  };
}

export default { createTrendsClient, normalizeTrend, createDefaultCacheAdapter };
