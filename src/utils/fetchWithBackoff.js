// Lightweight global fetch backoff wrapper for 429 storms
// Provides exponential backoff with jitter and a short cooling period after repeated 429s.
// Safe to import early (before app render). Keeps original fetch at window.__originalFetch.

/*
Contract:
initRateLimitBackoff(options?) -> installs global fetch wrapper.

Backoff strategy:
 - Track consecutive 429s per pathname key (ignoring query params to aggregate variants).
 - delay = min( (2^(count-1))*500ms + jitter(0-150ms), 15s ) applied by setting coolingUntil timestamp.
 - After >=3 consecutive 429s, extend cooling window (max 60s) to prevent hammering.
 - Successful (non-429) responses reset counters.
 - Exposes window.__rateLimitStats for diagnostics (per key: {count, coolingUntil}).

Reset:
 - Dispatch a custom event `rate-limit-reset` to clear all backoff state.
 - Cooling errors throw an Error with `isCooling=true` so callers can surface passive UI states instead of hard failures.
*/

const backoffState = {};
let originalFetch = null;

function computeDelay(count) {
  const base = Math.pow(2, Math.max(0, count - 1)) * 500; // 500, 1000, 2000, 4000...
  const jitter = Math.floor(Math.random() * 150); // Add small jitter
  return Math.min(base + jitter, 15000); // Cap individual delay at 15s
}

async function fetchWithBackoff(input, init) {
  const urlString = typeof input === 'string' ? input : (input && input.url) || '';
  let key = 'unknown';
  try {
    const u = new URL(urlString, window.location.origin);
    key = u.pathname; // group by path only (avoid query param fragmentation)
  } catch {
    key = urlString || 'unknown';
  }

  const now = Date.now();
  const state = backoffState[key] || { count: 0, coolingUntil: 0 };
  if (state.coolingUntil && now < state.coolingUntil) {
    const err = new Error('RateLimitCooling');
    err.isCooling = true;
    err.retryAt = state.coolingUntil;
    throw err;
  }

  const resp = await originalFetch(input, init);

  if (resp && resp.status === 429) {
    state.count += 1;
    const delay = computeDelay(state.count);
    // After 3+ consecutive 429s, escalate cooling (double delay, cap 60s)
    const cooling = state.count >= 3 ? Math.min(delay * 2, 60000) : delay;
    state.coolingUntil = Date.now() + cooling;
    backoffState[key] = state;
    window.__rateLimitStats[key] = { ...state };
    return resp; // Let caller inspect 429 body (CORS headers now present)
  }

  // Non-429 -> reset
  if (state.count > 0 || state.coolingUntil !== 0) {
    state.count = 0;
    state.coolingUntil = 0;
    backoffState[key] = state;
    window.__rateLimitStats[key] = { ...state };
  }

  return resp;
}

export function initRateLimitBackoff({ enable = true } = {}) {
  if (!enable) return;
  if (typeof window === 'undefined') return;
  if (window.__fetchBackoffInstalled) return;
  if (!window.fetch) return;

  originalFetch = window.fetch;
  window.__originalFetch = originalFetch;
  window.__rateLimitStats = window.__rateLimitStats || {};

  window.fetch = (...args) => fetchWithBackoff(...args);

  // Reset handler
  window.addEventListener('rate-limit-reset', () => {
    Object.keys(backoffState).forEach(k => { backoffState[k] = { count: 0, coolingUntil: 0 }; });
    window.__rateLimitStats = {};
  });

  window.__fetchBackoffInstalled = true;
  if (import.meta?.env?.DEV) {
    console.log('[Backoff] Global fetch backoff installed');
  }
}

export function getRateLimitStats() {
  return { ...(window.__rateLimitStats || {}) };
}

export function forceRateLimitReset() {
  window.dispatchEvent(new Event('rate-limit-reset'));
}
