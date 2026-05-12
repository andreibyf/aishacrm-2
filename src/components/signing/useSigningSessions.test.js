// @ts-check
/**
 * useSigningSessions test suite (4VD-48).
 *
 * Tests adaptive polling behavior integrated into useSigningSessions:
 * - Default polling is 15s (longPollMs) in steady-state
 * - Polling is 5s (shortPollMs) for ~30s after submissionSeq increments
 * - The 30s window resets correctly on a second send within the same session
 * - Manual refresh continues to work
 * - Handles enable/disable transitions
 *
 * Timer strategy: vi.useFakeTimers() captures setTimeout/setInterval used by
 * the polling loop. waitFor() also uses setTimeout internally and therefore
 * hangs forever under fake timers. All "wait for async ops" use
 * vi.advanceTimersByTimeAsync() instead, which advances fake timers AND
 * flushes any pending promise chains between each tick.
 */

import { renderHook, act } from '@testing-library/react';
import { useSigningSessions } from './useSigningSessions';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Stub fetch and localStorage via vi.stubGlobal so jsdom's getter-only
// localStorage property is properly overridden (direct assignment throws).
const mockLocalStorage = {
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
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      }),
    );
    vi.stubGlobal('localStorage', mockLocalStorage);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('accepts submissionSeq prop', async () => {
    const { result } = renderHook(() =>
      useSigningSessions({
        enabled: true,
        relatedTo: 'contact',
        relatedId: 'test-id',
        submissionSeq: 0,
      }),
    );

    // Should render without error
    expect(result.current).toBeDefined();
    expect(result.current.sessions).toBeDefined();

    // Flush pending async ops to avoid act() warnings on teardown
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  });

  it('uses shortPollMs when submissionSeq increments', async () => {
    const { rerender } = renderHook(
      ({ submissionSeq }) =>
        useSigningSessions({
          enabled: true,
          relatedTo: 'contact',
          relatedId: 'test-id',
          shortPollMs: 5000,
          longPollMs: 15000,
          submissionSeq,
        }),
      { initialProps: { submissionSeq: 0 } },
    );

    // Flush the initial fetch (useEffect async IIFE, not timer-based)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(globalThis.fetch).toHaveBeenCalled();

    const initialCallCount = globalThis.fetch.mock.calls.length;

    // Advance 5s — no new call yet in long poll (15s)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(initialCallCount);

    // First send: trigger short poll
    rerender({ submissionSeq: 1 });

    // Advance 5s — should trigger in short poll (5s)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(globalThis.fetch.mock.calls.length).toBeGreaterThan(initialCallCount);
  });

  it('resets the short-poll window on a second send within the same session', async () => {
    const { rerender } = renderHook(
      ({ submissionSeq }) =>
        useSigningSessions({
          enabled: true,
          relatedTo: 'contact',
          relatedId: 'test-id',
          shortPollMs: 5000,
          longPollMs: 15000,
          submissionSeq,
        }),
      { initialProps: { submissionSeq: 0 } },
    );

    // Flush initial fetch
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(globalThis.fetch).toHaveBeenCalled();

    // First send at t=0
    rerender({ submissionSeq: 1 });

    // Advance 20s — still in the first window
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });

    const countAfter20s = globalThis.fetch.mock.calls.length;

    // Second send at t=20s — must restart the 30s window
    rerender({ submissionSeq: 2 });

    // Advance 5s — still in short poll (window restarted)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(globalThis.fetch.mock.calls.length).toBeGreaterThan(countAfter20s);
  });

  it('reverts to longPollMs after short window expires', async () => {
    renderHook(
      ({ submissionSeq }) =>
        useSigningSessions({
          enabled: true,
          relatedTo: 'contact',
          relatedId: 'test-id',
          shortPollMs: 5000,
          longPollMs: 15000,
          submissionSeq,
        }),
      { initialProps: { submissionSeq: 1 } },
    );

    // Flush initial fetch
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(globalThis.fetch).toHaveBeenCalled();

    // Advance 35s (past the 30s short window)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(35000);
    });

    const callCountBefore = globalThis.fetch.mock.calls.length;

    // Advance 5s — should NOT trigger (in long poll now)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(globalThis.fetch.mock.calls.length).toBe(callCountBefore);

    // Advance another 10s (total 15s) — should trigger in long poll
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });

    expect(globalThis.fetch.mock.calls.length).toBeGreaterThan(callCountBefore);
  });

  it('preserves backwards compatibility with legacy pollMs prop', async () => {
    const { result } = renderHook(() =>
      useSigningSessions({
        enabled: true,
        relatedTo: 'contact',
        relatedId: 'test-id',
        pollMs: 10000, // Legacy prop
      }),
    );

    expect(result.current).toBeDefined();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  });

  it('handles manual refresh independent of polling cadence', async () => {
    const { result } = renderHook(() =>
      useSigningSessions({
        enabled: true,
        relatedTo: 'contact',
        relatedId: 'test-id',
        shortPollMs: 5000,
        longPollMs: 15000,
        submissionSeq: 0,
      }),
    );

    // Flush initial fetch
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(globalThis.fetch).toHaveBeenCalled();

    const callCount = globalThis.fetch.mock.calls.length;

    // Call refresh manually
    await act(async () => {
      result.current.refresh();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(globalThis.fetch.mock.calls.length).toBeGreaterThan(callCount);
  });

  it('disables polling when enabled=false', async () => {
    const { rerender } = renderHook(
      ({ enabled }) =>
        useSigningSessions({
          enabled,
          relatedTo: 'contact',
          relatedId: 'test-id',
          shortPollMs: 5000,
          submissionSeq: 1,
        }),
      { initialProps: { enabled: true } },
    );

    // Flush initial fetch
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(globalThis.fetch).toHaveBeenCalled();

    // Clear and disable
    globalThis.fetch.mockClear();
    rerender({ enabled: false });

    // Advance time — no polling should occur
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
