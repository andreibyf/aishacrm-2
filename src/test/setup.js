/* eslint-disable no-undef, no-empty */
import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

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
