// Lightweight global fetch backoff wrapper for 429 storms
// Provides exponential backoff with jitter and a short cooling period after repeated 429s.
// Safe to import early (before app render). Keeps original fetch at window.__originalFetch.

import { getBackendUrl } from '@/api/backendUrl';

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
  const BACKEND_URL = getBackendUrl();

  const urlString = typeof input === 'string' ? input : (input && input.url) || '';
  
  // Skip Supabase URLs entirely - they handle their own credentials and CORS
  // Supabase returns Access-Control-Allow-Origin: * which conflicts with credentials: 'include'
  const isSupabaseUrl = urlString.includes('.supabase.co');
  if (isSupabaseUrl) {
    return originalFetch(input, init);
  }
  
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

  // Ensure cookies are sent by default unless explicitly overridden
  const initWithCreds = { ...(init || {}) };
  if (!('credentials' in initWithCreds)) {
    initWithCreds.credentials = 'include';
  }

  // Normalize headers to a plain object to allow mutation
  const hdrs = new Headers(initWithCreds.headers || {});
  initWithCreds.headers = hdrs;

  const resp = await originalFetch(input, initWithCreds);

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

  // Seamless short-lived auth: if 401 from backend, attempt refresh once then retry
  // If refresh fails multiple times, notify user and redirect to login
  try {
    const u = new URL(urlString, window.location.origin);
    const isBackendCall = u.pathname.startsWith('/api') || u.origin === new URL(BACKEND_URL, window.location.origin).origin;
    const isRefreshCall = u.pathname === '/api/auth/refresh';
    const isLoginCall = u.pathname === '/api/auth/login';
    const alreadyRetried = hdrs.get('x-auth-retry') === '1';
    
    if (resp && resp.status === 401 && isBackendCall && !isRefreshCall && !isLoginCall && !alreadyRetried) {
      if (import.meta.env.DEV) {
        console.log('[fetchWithBackoff] 401 detected, attempting token refresh');
      }
      
      // Call refresh endpoint - use absolute URL to ensure it hits the backend
      const refreshUrl = `${BACKEND_URL}/api/auth/refresh`;
      const refreshResp = await originalFetch(refreshUrl, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (refreshResp && refreshResp.ok) {
        // Refresh succeeded - retry original request
        if (import.meta.env.DEV) {
          console.log('[fetchWithBackoff] Token refreshed successfully, retrying request');
        }
        const retryInit = { ...initWithCreds, headers: new Headers(hdrs) };
        retryInit.headers.set('x-auth-retry', '1');
        const retryResp = await originalFetch(input, retryInit);
        return retryResp;
      } else {
        // Refresh failed - session truly expired
        if (import.meta.env.DEV) {
          console.warn('[fetchWithBackoff] Token refresh failed, session expired');
        }
        
        // Dispatch custom event to notify token refresh hook
        window.dispatchEvent(new CustomEvent('auth-session-expired', {
          detail: { reason: 'refresh_failed', status: refreshResp?.status }
        }));
      }
    }
  } catch {
    // ignore refresh path errors; fall through to response handling
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
