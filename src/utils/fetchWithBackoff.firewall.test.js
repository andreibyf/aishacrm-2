/**
 * 403 firewall-block circuit breaker in fetchWithBackoff.
 *
 * Production Cloudflare logs showed ~25 GET /api/users?email=... from a
 * single client over ~85 seconds *after the WAF had already 403'd the IP*.
 * Every retry was another 403, keeping the block warm. This test pins the
 * circuit-breaker behavior: 3+ consecutive 403s (tracked globally, because
 * Cloudflare blocks are IP-wide not route-wide) trigger a 60s cooldown
 * during which fetches short-circuit without touching the network.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/api/backendUrl', () => ({
  getBackendUrl: () => 'http://api.test.local',
}));

describe('fetchWithBackoff: 403 firewall circuit breaker', () => {
  let initRateLimitBackoff;
  let originalFetchMock;
  let responseQueue;

  beforeEach(async () => {
    delete window.__fetchBackoffInstalled;
    delete window.__originalFetch;
    delete window.__rateLimitStats;
    delete window.__firewallStats;

    responseQueue = [];

    originalFetchMock = vi.fn(async () => {
      const status = responseQueue.shift() ?? 200;
      return new Response(JSON.stringify({ ok: status < 400 }), { status });
    });

    window.fetch = originalFetchMock;

    vi.resetModules();
    initRateLimitBackoff = (await import('./fetchWithBackoff.js')).initRateLimitBackoff;
    initRateLimitBackoff({ enable: true });
  });

  afterEach(() => {
    delete window.__fetchBackoffInstalled;
    vi.useRealTimers();
  });

  it('a single 403 does NOT trigger cooldown', async () => {
    responseQueue = [403, 200];

    const first = await window.fetch('http://api.test.local/api/v2/accounts');
    expect(first.status).toBe(403);

    // Next request should hit the wire normally, not be short-circuited
    const second = await window.fetch('http://api.test.local/api/v2/accounts');
    expect(second.status).toBe(200);
    expect(originalFetchMock).toHaveBeenCalledTimes(2);
  });

  it('3 consecutive 403s across ANY paths trigger cooldown (global, not per-path)', async () => {
    responseQueue = [403, 403, 403];

    await window.fetch('http://api.test.local/api/users?email=a');
    await window.fetch('http://api.test.local/api/tenants'); // different path
    await window.fetch('http://api.test.local/socket.io/'); // different path again
    expect(originalFetchMock).toHaveBeenCalledTimes(3);

    // Fourth request — should short-circuit without hitting the wire
    await expect(window.fetch('http://api.test.local/api/users?email=b')).rejects.toThrow(
      /Firewall|Cooling|Block/i,
    );
    expect(originalFetchMock).toHaveBeenCalledTimes(3); // no new wire call
  });

  it('cooldown error exposes retryAt for callers', async () => {
    responseQueue = [403, 403, 403];

    for (let i = 0; i < 3; i++) {
      await window.fetch(`http://api.test.local/api/x${i}`);
    }

    try {
      await window.fetch('http://api.test.local/api/after-trip');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err.isFirewall || err.isCooling).toBe(true);
      expect(typeof err.retryAt).toBe('number');
      expect(err.retryAt).toBeGreaterThan(Date.now());
    }
  });

  it('a 2xx between 403s resets the consecutive counter', async () => {
    responseQueue = [403, 403, 200, 403, 403];

    await window.fetch('http://api.test.local/api/a');
    await window.fetch('http://api.test.local/api/b');
    await window.fetch('http://api.test.local/api/c'); // 200 — resets counter
    await window.fetch('http://api.test.local/api/d'); // count=1
    await window.fetch('http://api.test.local/api/e'); // count=2 — still not tripped

    expect(originalFetchMock).toHaveBeenCalledTimes(5);

    // Next should still hit the wire (counter is at 2, trip threshold is 3)
    responseQueue = [200];
    const resp = await window.fetch('http://api.test.local/api/f');
    expect(resp.status).toBe(200);
    expect(originalFetchMock).toHaveBeenCalledTimes(6);
  });

  it('cooldown expires and new requests resume hitting the wire', async () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);

    responseQueue = [403, 403, 403];
    await window.fetch('http://api.test.local/api/a');
    await window.fetch('http://api.test.local/api/b');
    await window.fetch('http://api.test.local/api/c');

    // Short-circuited
    await expect(window.fetch('http://api.test.local/api/d')).rejects.toThrow();
    expect(originalFetchMock).toHaveBeenCalledTimes(3);

    // Advance past cooldown (60s should be plenty; allow some margin)
    vi.setSystemTime(now + 61_000);

    responseQueue = [200];
    const resp = await window.fetch('http://api.test.local/api/e');
    expect(resp.status).toBe(200);
    expect(originalFetchMock).toHaveBeenCalledTimes(4);
  });

  it('403s that are NOT consecutive (spread across 2xx) do not accumulate', async () => {
    responseQueue = [403, 200, 403, 200, 403];

    for (let i = 0; i < 5; i++) {
      await window.fetch(`http://api.test.local/api/x${i}`);
    }
    expect(originalFetchMock).toHaveBeenCalledTimes(5);

    // Should still be uncooled — the 200s keep resetting the counter
    responseQueue = [200];
    const resp = await window.fetch('http://api.test.local/api/y');
    expect(resp.status).toBe(200);
    expect(originalFetchMock).toHaveBeenCalledTimes(6);
  });

  it('any non-403 response (including 429/500) resets the counter — true "consecutive" semantic', async () => {
    // 403 → 429 → 403 → 403. Per the "consecutive 403" contract, this is only
    // 2 consecutive 403s at the end (the 429 broke the streak). Should NOT trip.
    responseQueue = [403, 429, 403, 403];

    for (let i = 0; i < 4; i++) {
      await window.fetch(`http://api.test.local/api/x${i}`);
    }
    expect(originalFetchMock).toHaveBeenCalledTimes(4);

    // Next request should reach the wire — breaker not tripped
    responseQueue = [200];
    const resp = await window.fetch('http://api.test.local/api/y');
    expect(resp.status).toBe(200);
    expect(originalFetchMock).toHaveBeenCalledTimes(5);
  });

  it('after cooldown expires, counter is reset — a single 403 does not re-trip', async () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);

    responseQueue = [403, 403, 403];
    await window.fetch('http://api.test.local/api/a');
    await window.fetch('http://api.test.local/api/b');
    await window.fetch('http://api.test.local/api/c'); // trips breaker

    // Short-circuit confirmed
    await expect(window.fetch('http://api.test.local/api/d')).rejects.toThrow();

    // Cooldown expires
    vi.setSystemTime(now + 61_000);

    // First request after cooldown gets another 403. Counter should have
    // been reset when the breaker tripped, so this single 403 does NOT
    // immediately re-trigger the 60s block.
    responseQueue = [403, 200];
    const afterCooldown = await window.fetch('http://api.test.local/api/e');
    expect(afterCooldown.status).toBe(403);

    // Next request should STILL hit the wire — breaker not re-tripped by
    // a single post-cooldown 403.
    const followup = await window.fetch('http://api.test.local/api/f');
    expect(followup.status).toBe(200);
    expect(originalFetchMock).toHaveBeenCalledTimes(5);
  });

  it('firewall breaker only applies to backend requests — third-party URLs are exempt', async () => {
    // 3 consecutive 403s from a third-party origin (NOT the backend) must not
    // trip the breaker — otherwise one misbehaving external service could
    // lock out the whole app.
    responseQueue = [403, 403, 403];
    const thirdParty = 'http://third-party-mcp.example.com/query';

    for (let i = 0; i < 3; i++) {
      await window.fetch(thirdParty);
    }
    expect(originalFetchMock).toHaveBeenCalledTimes(3);

    // Next backend request should hit the wire — breaker state not polluted
    responseQueue = [200];
    const backend = await window.fetch('http://api.test.local/api/ok');
    expect(backend.status).toBe(200);
    expect(originalFetchMock).toHaveBeenCalledTimes(4);
  });
});
