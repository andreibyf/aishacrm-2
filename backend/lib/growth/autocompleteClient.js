/**
 * autocompleteClient — keyword-expansion client over a search suggest endpoint
 * (OSINT Opportunity Intelligence, Phase 1 / Task 4).
 *
 * Why this exists
 * ---------------
 * Search autocomplete ("suggest") is a cheap, public signal for the long-tail of
 * how people actually phrase a topic. Given a seed term we fetch its suggestions
 * and normalize them into keyword candidates the rest of the pipeline can score.
 *
 * Defensive input shapes
 * ----------------------
 * Suggest endpoints vary. `expand` accepts, defensively:
 *   - The classic Google-suggest shape:  [seed, ["sug1", "sug2", ...]]
 *     (a 2-tuple whose second element is the suggestion list; trailing metadata
 *      elements are ignored).
 *   - A bare array of suggestion strings: ["sug1", "sug2", ...]
 *   - An object wrapper:                  { suggestions: ["sug1", ...] }
 * Each suggestion is coerced to a string; non-strings and empties are dropped.
 *
 * Normalization contract
 * ----------------------
 * `expand` returns an array of `{ keyword, source: 'autocomplete', seed }`:
 *   - case-insensitively de-duplicated (first occurrence wins),
 *   - the seed itself (case-insensitive, trimmed) is dropped,
 *   - empty / whitespace-only suggestions are dropped.
 * Results are cached under `autocomplete:{seed}:{region}` for `ttlSeconds`; a
 * cache hit short-circuits `fetchImpl`.
 *
 * `expandMany` expands several seeds with BOUNDED concurrency, then merges and
 * de-dupes across all seeds (case-insensitive on `keyword`, first occurrence
 * wins → deterministic ordering).
 *
 * All dependencies are injected so the core logic is pure-unit testable with a
 * fake cache and a stubbed fetchImpl (no live network, no real Redis).
 */

import { createDefaultCacheAdapter } from './trendsClient.js';

const DEFAULT_TTL_SECONDS = 86_400; // 24h

/**
 * Build the cache key for a (seed, region) pair.
 * @param {string} seed
 * @param {string} region
 * @returns {string}
 */
function cacheKey(seed, region) {
  return `autocomplete:${seed}:${region}`;
}

/**
 * Extract the raw suggestion list from one of the supported suggest shapes.
 * Always returns an array (possibly empty); does NOT yet coerce/clean entries.
 *
 * @param {any} raw
 * @returns {any[]}
 */
function extractSuggestions(raw) {
  if (!raw) return [];

  // { suggestions: [...] }
  if (!Array.isArray(raw) && Array.isArray(raw.suggestions)) {
    return raw.suggestions;
  }

  if (Array.isArray(raw)) {
    // Classic suggest shape: [seed, [ ...suggestions ], ...metadata]
    // Detected by: first element is a string and second is an array.
    if (raw.length >= 2 && typeof raw[0] === 'string' && Array.isArray(raw[1])) {
      return raw[1];
    }
    // Otherwise treat it as a bare array of suggestion strings.
    return raw;
  }

  return [];
}

/**
 * Normalize raw suggest data into keyword objects. PURE — no I/O.
 *
 * @param {string} seed
 * @param {any} raw
 * @returns {{keyword:string, source:'autocomplete', seed:string}[]}
 */
export function normalizeSuggestions(seed, raw) {
  const list = extractSuggestions(raw);
  const seedKey = String(seed == null ? '' : seed)
    .trim()
    .toLowerCase();

  const seen = new Set();
  const out = [];

  for (const entry of list) {
    if (typeof entry !== 'string') continue;
    const keyword = entry.trim();
    if (!keyword) continue; // drop empties / whitespace-only

    const key = keyword.toLowerCase();
    if (key === seedKey) continue; // drop the seed itself
    if (seen.has(key)) continue; // case-insensitive dedupe, first wins

    seen.add(key);
    out.push({ keyword, source: 'autocomplete', seed });
  }

  return out;
}

/**
 * Run an async mapper over `items` with at most `concurrency` in-flight at once.
 * Preserves input order in the returned results array.
 *
 * @template T, R
 * @param {T[]} items
 * @param {number} concurrency
 * @param {(item:T, index:number)=>Promise<R>} worker
 * @returns {Promise<R[]>}
 */
async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  const limit = Math.max(1, Number(concurrency) || 1);
  let next = 0;

  async function run() {
    // Each runner pulls the next index until the queue is drained. At most
    // `limit` runners exist, so at most `limit` worker() calls are in-flight.
    while (next < items.length) {
      const i = next;
      next += 1;
      results[i] = await worker(items[i], i);
    }
  }

  const runners = [];
  const n = Math.min(limit, items.length);
  for (let i = 0; i < n; i += 1) {
    runners.push(run());
  }
  await Promise.all(runners);
  return results;
}

/**
 * Create an autocomplete client. All deps injectable.
 *
 * @param {object} opts
 * @param {(seed:string, region:string)=>Promise<any>} opts.fetchImpl
 *   Fetches raw suggest data for a seed.
 * @param {{get:Function, set:Function}} [opts.cache]
 *   Cache with async get(key)/set(key, value, ttlSeconds). Defaults to Redis.
 * @param {number} [opts.ttlSeconds] Cache TTL for normalized results.
 * @returns {{
 *   expand(seed:string, region?:string):Promise<object[]>,
 *   expandMany(seeds:string[], region?:string, opts?:{concurrency?:number}):Promise<object[]>,
 * }}
 */
export function createAutocompleteClient({
  fetchImpl,
  cache,
  ttlSeconds = DEFAULT_TTL_SECONDS,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('createAutocompleteClient requires a fetchImpl function');
  }
  const store = cache || createDefaultCacheAdapter();

  /**
   * Expand a single seed into normalized keyword candidates, cached.
   * @param {string} seed
   * @param {string} [region='']
   * @returns {Promise<{keyword:string, source:'autocomplete', seed:string}[]>}
   */
  async function expand(seed, region = '') {
    const key = cacheKey(seed, region);

    const cached = await store.get(key);
    if (cached != null) {
      return cached;
    }

    const raw = await fetchImpl(seed, region);
    const normalized = normalizeSuggestions(seed, raw);
    await store.set(key, normalized, ttlSeconds);
    return normalized;
  }

  /**
   * Expand many seeds with bounded concurrency, then merge + dedupe across all
   * seeds (case-insensitive on `keyword`, first occurrence wins).
   * @param {string[]} seeds
   * @param {string} [region='']
   * @param {{concurrency?:number}} [opts]
   * @returns {Promise<{keyword:string, source:'autocomplete', seed:string}[]>}
   */
  async function expandMany(seeds, region = '', { concurrency = 3 } = {}) {
    const list = Array.isArray(seeds) ? seeds : [];
    const perSeed = await mapWithConcurrency(list, concurrency, (seed) => expand(seed, region));

    const seen = new Set();
    const merged = [];
    for (const results of perSeed) {
      for (const item of results) {
        const key = item.keyword.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(item);
      }
    }
    return merged;
  }

  return { expand, expandMany };
}

export default { createAutocompleteClient, normalizeSuggestions };
