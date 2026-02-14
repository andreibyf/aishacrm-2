/* eslint-disable no-undef, no-empty */

// ── Ensure localStorage has proper function methods ──────────────────
// Node.js 22+ ships a built-in `localStorage` that can interfere with
// jsdom's implementation.  When `--localstorage-file` isn't configured
// the built-in exposes an object whose methods fail as "not a function".
// Patching early guarantees all downstream code (devLogger, etc.) works.
(() => {
  if (typeof globalThis.localStorage === 'undefined') return;            // nothing to fix
  if (typeof globalThis.localStorage.getItem === 'function') return;     // already OK (jsdom)

  const store = new Map();
  const ls = {
    getItem:    (k) => (store.has(k) ? store.get(k) : null),
    setItem:    (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear:      () => store.clear(),
    get length() { return store.size; },
    key:        (i) => [...store.keys()][i] ?? null,
  };
  Object.defineProperty(globalThis, 'localStorage', { value: ls, writable: true, configurable: true });
})();

import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// ── Global Supabase client mock ──────────────────────────────────────
// Prevents `storage.getItem is not a function` crashes when any test
// transitively imports @/lib/supabase (which calls createClient at
// module-evaluation time with window.localStorage as storage).
vi.mock('@/lib/supabase', () => {
  const mockAuth = {
    getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    signInWithPassword: vi.fn().mockResolvedValue({ data: {}, error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
  };
  const mockSupabase = {
    auth: mockAuth,
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: vi.fn(),
    })),
  };
  return {
    supabase: mockSupabase,
    auth: mockAuth,
    isSupabaseConfigured: () => false,
    default: mockSupabase,
  };
});

// Cleanup after each test
afterEach(() => {
  cleanup();
  // Reset browser storage to avoid cross-test leakage
  try { localStorage.clear(); } catch { }
  try { sessionStorage.clear(); } catch { }
});

// Lightweight auth and fetch stubs for stability in full runs
// Provide a faux Supabase session where code reads from storage
try {
  const mockSession = {
    user: { id: 'test-user-id', email: 'test@example.com', role: 'admin', tenant_id: '00000000-0000-0000-0000-000000000000' },
    access_token: 'test-token',
  };
  sessionStorage.setItem('supabase:auth', JSON.stringify(mockSession));
} catch { }

// Allow test suites to opt-out by setting window.__DISABLE_GLOBAL_FETCH_STUB = true
if (typeof window !== 'undefined' && !window.__DISABLE_GLOBAL_FETCH_STUB) {
  const realFetch = global.fetch;
  global.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : (input?.url || '');
    const method = (init.method || 'GET').toUpperCase();

    // Allow AI endpoints and explicit test targets to hit the real fetch when needed
    const allowList = [/\/api\/ai\/chat/i, /\/api\/ai\/brain-test/i, /\/health$/i];
    if (allowList.some((re) => re.test(url))) {
      return realFetch(input, init);
    }

    // Default stub response: 200 OK with minimal JSON
    return new Response(JSON.stringify({ status: 'ok', mocked: true, url, method }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
}
