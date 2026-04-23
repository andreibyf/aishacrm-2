/**
 * Regression test for the shared-refresh-promise dedup in fetchWithBackoff.
 *
 * Before the fix: every 401 response from the backend triggered its own call to
 * /api/auth/refresh. A normal page load with 8 parallel API calls (all hitting
 * an expired access cookie at the same moment) would fire 8 simultaneous refresh
 * requests — each counted toward the authLimiter (10/min), triggering 429s.
 *
 * After the fix: fetchWithBackoff uses a module-level `refreshPromise` so N
 * concurrent 401s share ONE refresh call. This test pins that behavior.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/api/backendUrl', () => ({
  getBackendUrl: () => 'http://api.test.local',
}));

describe('fetchWithBackoff: shared refresh promise dedup', () => {
  let initRateLimitBackoff;
  let originalFetchMock;
  let refreshCallCount;
  let retryCallCount;

  beforeEach(async () => {
    delete window.__fetchBackoffInstalled;
    delete window.__originalFetch;
    delete window.__rateLimitStats;

    refreshCallCount = 0;
    retryCallCount = 0;

    originalFetchMock = vi.fn(async (input, init) => {
      const url = typeof input === 'string' ? input : input.url;

      if (url.includes('/api/auth/refresh')) {
        refreshCallCount += 1;
        // Small delay so parallel callers can queue behind the shared promise.
        await new Promise((r) => setTimeout(r, 20));
        return new Response(JSON.stringify({ status: 'success' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const hdrs = new Headers(init?.headers || {});
      if (hdrs.get('x-auth-retry') === '1') {
        retryCallCount += 1;
        return new Response(JSON.stringify({ data: 'ok' }), { status: 200 });
      }

      // First-pass API calls return 401 to trigger the refresh flow.
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
    });

    window.fetch = originalFetchMock;

    vi.resetModules();
    initRateLimitBackoff = (await import('./fetchWithBackoff.js')).initRateLimitBackoff;
    initRateLimitBackoff({ enable: true });
  });

  afterEach(() => {
    delete window.__fetchBackoffInstalled;
  });

  it('10 parallel 401s trigger exactly 1 call to /api/auth/refresh', async () => {
    const urls = Array.from(
      { length: 10 },
      (_, i) => `http://api.test.local/api/v2/accounts?tenant_id=t${i}`,
    );

    const results = await Promise.all(urls.map((u) => window.fetch(u)));

    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(refreshCallCount).toBe(1);
    expect(retryCallCount).toBe(10);
  });

  it('a second burst of 401s AFTER the first refresh resolves triggers a NEW refresh', async () => {
    await Promise.all([
      window.fetch('http://api.test.local/api/v2/accounts?t=1'),
      window.fetch('http://api.test.local/api/v2/accounts?t=2'),
    ]);
    expect(refreshCallCount).toBe(1);

    // Let the finally() block clear the shared promise.
    await new Promise((r) => setTimeout(r, 10));

    await Promise.all([
      window.fetch('http://api.test.local/api/v2/accounts?t=3'),
      window.fetch('http://api.test.local/api/v2/accounts?t=4'),
    ]);
    expect(refreshCallCount).toBe(2);
  });

  it('does NOT dedup a direct call to /api/auth/refresh itself (avoid infinite loop)', async () => {
    // Directly calling /api/auth/refresh should pass straight through — the
    // wrapper only dedups refresh calls SPAWNED BY 401 interception.
    const resp = await window.fetch('http://api.test.local/api/auth/refresh', { method: 'POST' });

    expect(resp.status).toBe(200);
    expect(refreshCallCount).toBe(1);
    expect(retryCallCount).toBe(0);
  });
});
