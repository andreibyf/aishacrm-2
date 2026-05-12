// @ts-check
/**
 * useSigningSessions test suite (4VD-48).
 *
 * Tests adaptive polling behavior integrated into useSigningSessions:
 * - Default polling is 15s (longPollMs) in steady-state
 * - Polling is 5s (shortPollMs) for ~30s after recentlySubmitted=true
 * - Manual refresh continues to work
 * - Handles enable/disable transitions
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { useSigningSessions } from './useSigningSessions';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch globally
globalThis.fetch = vi.fn();
globalThis.localStorage = {
  getItem: vi.fn((key) => {
    if (key === 'tenant_id') return 'test-tenant-id';
    return null;
  }),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

// Mock getAuthorizationHeader
vi.mock('@/api/functions', () => ({
  getAuthorizationHeader: vi.fn(async () => 'Bearer test-token'),
}));

// Mock getBackendUrl
vi.mock('@/api/backendUrl', () => ({
  getBackendUrl: vi.fn(() => 'http://localhost:3001'),
}));

describe('useSigningSessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('accepts recentlySubmitted prop', () => {
    const { result } = renderHook(() =>
      useSigningSessions({
        enabled: true,
        relatedTo: 'contact',
        relatedId: 'test-id',
        recentlySubmitted: false,
      }),
    );

    // Should render without error
    expect(result.current).toBeDefined();
    expect(result.current.sessions).toBeDefined();
  });

  it('uses shortPollMs when recentlySubmitted=true', async () => {
    const { rerender } = renderHook(
      ({ recentlySubmitted }) =>
        useSigningSessions({
          enabled: true,
          relatedTo: 'contact',
          relatedId: 'test-id',
          shortPollMs: 5000,
          longPollMs: 15000,
          recentlySubmitted,
        }),
      { initialProps: { recentlySubmitted: false } },
    );

    // Wait for initial fetch
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });

    const initialCallCount = globalThis.fetch.mock.calls.length;

    // Advance 5 seconds - no new call yet in long poll (15s)
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(initialCallCount);

    // Trigger short poll by setting recentlySubmitted
    rerender({ recentlySubmitted: true });

    // Advance 5 seconds - should trigger in short poll (5s)
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    await waitFor(() => {
      expect(globalThis.fetch.mock.calls.length).toBeGreaterThan(initialCallCount);
    });
  });

  it('reverts to longPollMs after short window expires', async () => {
    renderHook(
      ({ recentlySubmitted }) =>
        useSigningSessions({
          enabled: true,
          relatedTo: 'contact',
          relatedId: 'test-id',
          shortPollMs: 5000,
          longPollMs: 15000,
          recentlySubmitted,
        }),
      { initialProps: { recentlySubmitted: true } },
    );

    // Wait for initial fetch
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });

    // Advance 35 seconds (past the 30s short window)
    act(() => {
      vi.advanceTimersByTime(35000);
    });

    // After the window expires, polling should revert to long interval
    // This is observable by the lack of frequent fetches
    const callCountBefore = globalThis.fetch.mock.calls.length;

    // Advance 5 seconds - should NOT trigger (in long poll now)
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(globalThis.fetch.mock.calls.length).toBe(callCountBefore);

    // Advance another 10 seconds (total 15s) - should trigger in long poll
    act(() => {
      vi.advanceTimersByTime(10000);
    });

    await waitFor(() => {
      expect(globalThis.fetch.mock.calls.length).toBeGreaterThan(callCountBefore);
    });
  });

  it('preserves backwards compatibility with legacy pollMs prop', () => {
    const { result } = renderHook(() =>
      useSigningSessions({
        enabled: true,
        relatedTo: 'contact',
        relatedId: 'test-id',
        pollMs: 10000, // Legacy prop
      }),
    );

    expect(result.current).toBeDefined();
  });

  it('handles manual refresh independent of polling cadence', async () => {
    const { result } = renderHook(() =>
      useSigningSessions({
        enabled: true,
        relatedTo: 'contact',
        relatedId: 'test-id',
        shortPollMs: 5000,
        longPollMs: 15000,
        recentlySubmitted: false,
      }),
    );

    // Wait for initial fetch
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });

    const callCount = globalThis.fetch.mock.calls.length;

    // Call refresh manually
    result.current.refresh();

    await waitFor(() => {
      expect(globalThis.fetch.mock.calls.length).toBeGreaterThan(callCount);
    });
  });

  it('disables polling when enabled=false', async () => {
    globalThis.fetch.mockClear();

    const { rerender } = renderHook(
      ({ enabled }) =>
        useSigningSessions({
          enabled,
          relatedTo: 'contact',
          relatedId: 'test-id',
          shortPollMs: 5000,
          recentlySubmitted: true,
        }),
      { initialProps: { enabled: true } },
    );

    // Wait for initial fetch
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });

    globalThis.fetch.mockClear();

    // Disable
    rerender({ enabled: false });

    // Advance time - no polling should occur
    vi.advanceTimersByTime(10000);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
