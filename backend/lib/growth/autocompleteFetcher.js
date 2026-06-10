/**
 * autocompleteFetcher — real Google Autocomplete (suggest) fetcher.
 *
 * Keyless, free, and reliable: the public suggest endpoint returns the classic
 * `[query, [suggestion, ...]]` shape that `autocompleteClient.normalizeSuggestions`
 * already parses. This is the production `fetchImpl` wired into the
 * autocompleteClient by the insight worker, turning the OSINT pipeline from an
 * empty skeleton into a source of real content-gap opportunities.
 *
 * Fail-soft: any error (network, non-2xx, bad JSON) returns `[seed, []]` so the
 * run degrades gracefully (insightRunner wraps each source independently too).
 *
 * `fetchImpl` is injectable for unit testing (no live network in tests).
 */

import nodeFetch from 'node-fetch';
import logger from '../logger.js';

const SUGGEST_URL = 'https://suggestqueries.google.com/complete/search';
const USER_AGENT = 'AishaCRM/1.0 (autocomplete; contact@aishacrm.com)';

/**
 * Fetch raw Google autocomplete suggestions for a seed keyword.
 *
 * @param {string} seed - the seed keyword (e.g. a declared service name)
 * @param {string} [region] - currently used only for cache-keying upstream; the
 *   suggest endpoint is national, so it is not sent as a geo param (a future
 *   refinement could map region → `gl` country code).
 * @param {{fetchImpl?:Function}} [deps]
 * @returns {Promise<[string, string[]]>} the classic suggest 2-tuple
 */
export async function fetchAutocomplete(seed, region, deps = {}) {
  const fetchImpl = deps.fetchImpl || nodeFetch;
  const q = String(seed == null ? '' : seed).trim();
  if (!q) return [seed, []];

  const url = `${SUGGEST_URL}?${new URLSearchParams({ client: 'firefox', hl: 'en', q })}`;

  try {
    const res = await fetchImpl(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res || !res.ok) return [seed, []];
    const data = await res.json();
    // Expected shape: [query, [ "sug1", "sug2", ... ], ...metadata]
    if (Array.isArray(data) && Array.isArray(data[1])) return data;
    return [seed, []];
  } catch (err) {
    logger.warn('[growth autocompleteFetcher] suggest fetch failed', {
      seed: q,
      message: err?.message,
    });
    return [seed, []];
  }
}

export default { fetchAutocomplete };
