/**
 * Tests for the per-key TTL override on ApiManager.cachedRequest.
 *
 * Motivation: Tenant.list() and ModuleSettings.list() data changes rarely
 * mid-session. The global 1-2s TTL causes superadmins to refetch these on
 * every page navigation, inflating request count. A per-call ttlMs override
 * lets callers opt into a longer cache window without changing the global
 * default (which is intentionally short to avoid serving stale mutation
 * results after saves elsewhere).
 */

import { describe, it, expect, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import React from 'react';
import { ApiProvider, useApiManager } from '../ApiManager.jsx';

function makeHarness() {
  const ref = { current: null };
  function Probe() {
    ref.current = useApiManager();
    return null;
  }
  render(
    <ApiProvider>
      <Probe />
    </ApiProvider>,
  );
  return ref.current;
}

describe('ApiManager.cachedRequest per-key TTL override', () => {
  it('default TTL still applies when no override is provided', async () => {
    vi.useFakeTimers();
    try {
      const { cachedRequest } = makeHarness();
      const fetcher = vi.fn().mockResolvedValue('fresh');

      const first = await cachedRequest('Ent', 'list', {}, fetcher);
      expect(first).toBe('fresh');
      expect(fetcher).toHaveBeenCalledTimes(1);

      // Well within default TTL (1s dev / 2s prod) — cache hit, no new fetch
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
      const second = await cachedRequest('Ent', 'list', {}, fetcher);
      expect(second).toBe('fresh');
      expect(fetcher).toHaveBeenCalledTimes(1);

      // Past the default TTL — triggers a fresh fetch
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      fetcher.mockResolvedValue('fresher');
      const third = await cachedRequest('Ent', 'list', {}, fetcher);
      expect(third).toBe('fresher');
      expect(fetcher).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('custom ttlMs extends the cache window beyond the default', async () => {
    vi.useFakeTimers();
    try {
      const { cachedRequest } = makeHarness();
      const fetcher = vi.fn().mockResolvedValue('tenants-list');

      await cachedRequest('Tenant', 'list', {}, fetcher, { ttlMs: 300000 });
      expect(fetcher).toHaveBeenCalledTimes(1);

      // 10 seconds later — would miss the default TTL but stays within 5-min override
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });
      const hit = await cachedRequest('Tenant', 'list', {}, fetcher, { ttlMs: 300000 });
      expect(hit).toBe('tenants-list');
      expect(fetcher).toHaveBeenCalledTimes(1);

      // 5 min later from here (5 min 10s total since caching) — beyond the override TTL
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300000);
      });
      fetcher.mockResolvedValue('tenants-list-refreshed');
      const miss = await cachedRequest('Tenant', 'list', {}, fetcher, { ttlMs: 300000 });
      expect(miss).toBe('tenants-list-refreshed');
      expect(fetcher).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('different keys can have independent TTLs in the same session', async () => {
    vi.useFakeTimers();
    try {
      const { cachedRequest } = makeHarness();
      const longFetcher = vi.fn().mockResolvedValue('long');
      const shortFetcher = vi.fn().mockResolvedValue('short');

      await cachedRequest('Tenant', 'list', {}, longFetcher, { ttlMs: 300000 });
      await cachedRequest('Entity', 'other', {}, shortFetcher); // default TTL

      // 10s later — long-TTL key still cached, default-TTL key expired
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });
      await cachedRequest('Tenant', 'list', {}, longFetcher, { ttlMs: 300000 });
      await cachedRequest('Entity', 'other', {}, shortFetcher);

      expect(longFetcher).toHaveBeenCalledTimes(1);
      expect(shortFetcher).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('NaN and Infinity ttlMs fall back to the default TTL', async () => {
    vi.useFakeTimers();
    try {
      const { cachedRequest } = makeHarness();
      const fetcher = vi.fn().mockResolvedValue('v1');

      // NaN should be treated as invalid and fall back to default (1-2s)
      await cachedRequest('Ent', 'x', {}, fetcher, { ttlMs: Number.NaN });
      expect(fetcher).toHaveBeenCalledTimes(1);

      // 5s later — default TTL has definitely expired, so fetcher should re-run
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      fetcher.mockResolvedValue('v2');
      const after = await cachedRequest('Ent', 'x', {}, fetcher, { ttlMs: Number.NaN });
      expect(after).toBe('v2');
      expect(fetcher).toHaveBeenCalledTimes(2);

      // Infinity should also fall back — otherwise cache would never expire
      const key2Fetcher = vi.fn().mockResolvedValue('inf-1');
      await cachedRequest('Ent', 'y', {}, key2Fetcher, { ttlMs: Number.POSITIVE_INFINITY });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      key2Fetcher.mockResolvedValue('inf-2');
      const inf = await cachedRequest('Ent', 'y', {}, key2Fetcher, {
        ttlMs: Number.POSITIVE_INFINITY,
      });
      expect(inf).toBe('inf-2');
      expect(key2Fetcher).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('peek(name, method, params, {ttlMs}) returns true iff cache is fresh', async () => {
    vi.useFakeTimers();
    try {
      const { cachedRequest, peek } = makeHarness();

      // Cache miss before any request
      expect(peek('Tenant', 'list', {}, { ttlMs: 300000 })).toBe(false);

      await cachedRequest('Tenant', 'list', {}, async () => 'hit', { ttlMs: 300000 });

      // Fresh entry within TTL — hit
      expect(peek('Tenant', 'list', {}, { ttlMs: 300000 })).toBe(true);

      // Advance past TTL — miss
      await act(async () => {
        await vi.advanceTimersByTimeAsync(301000);
      });
      expect(peek('Tenant', 'list', {}, { ttlMs: 300000 })).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('clearCache invalidates entries regardless of their TTL override', async () => {
    vi.useFakeTimers();
    try {
      const { cachedRequest, clearCache } = makeHarness();
      const fetcher = vi.fn().mockResolvedValue('v1');

      await cachedRequest('Tenant', 'list', {}, fetcher, { ttlMs: 300000 });
      expect(fetcher).toHaveBeenCalledTimes(1);

      // Mutating the tenants elsewhere should allow explicit invalidation
      clearCache('Tenant');

      fetcher.mockResolvedValue('v2');
      const after = await cachedRequest('Tenant', 'list', {}, fetcher, { ttlMs: 300000 });
      expect(after).toBe('v2');
      expect(fetcher).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
