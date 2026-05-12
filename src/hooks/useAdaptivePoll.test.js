// @ts-check
/**
 * useAdaptivePoll test suite (4VD-48).
 *
 * Tests the adaptive polling hook behavior:
 * - Defaults to long poll interval (15s) in steady-state
 * - Switches to short poll interval (5s) when recentlySubmitted=true
 * - Auto-reverts to long poll after ~30s
 * - Accepts custom poll intervals
 */

import { renderHook } from '@testing-library/react';
import { useAdaptivePoll } from './useAdaptivePoll';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('useAdaptivePoll', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('defaults to long poll interval', () => {
    const { result } = renderHook(() =>
      useAdaptivePoll({
        recentlySubmitted: false,
        shortPollMs: 5000,
        longPollMs: 15000,
        shortWindowDurationMs: 30000,
      }),
    );

    expect(result.current).toBe(15000);
  });

  it('switches to short poll when recentlySubmitted becomes true', () => {
    const { result, rerender } = renderHook(
      ({ recentlySubmitted }) =>
        useAdaptivePoll({
          recentlySubmitted,
          shortPollMs: 5000,
          longPollMs: 15000,
          shortWindowDurationMs: 30000,
        }),
      { initialProps: { recentlySubmitted: false } },
    );

    expect(result.current).toBe(15000);

    rerender({ recentlySubmitted: true });

    expect(result.current).toBe(5000);
  });

  it('reverts to long poll after short window expires', () => {
    const { result, rerender } = renderHook(
      ({ recentlySubmitted }) =>
        useAdaptivePoll({
          recentlySubmitted,
          shortPollMs: 5000,
          longPollMs: 15000,
          shortWindowDurationMs: 30000,
        }),
      { initialProps: { recentlySubmitted: false } },
    );

    rerender({ recentlySubmitted: true });
    expect(result.current).toBe(5000);

    // Advance time past the 30s window
    vi.advanceTimersByTime(31000);

    expect(result.current).toBe(15000);
  });

  it('accepts custom poll intervals', () => {
    const { result } = renderHook(() =>
      useAdaptivePoll({
        recentlySubmitted: false,
        shortPollMs: 3000,
        longPollMs: 20000,
        shortWindowDurationMs: 60000,
      }),
    );

    expect(result.current).toBe(20000);
  });

  it('handles rapid toggling of recentlySubmitted flag', () => {
    const { result, rerender } = renderHook(
      ({ recentlySubmitted }) =>
        useAdaptivePoll({
          recentlySubmitted,
          shortPollMs: 5000,
          longPollMs: 15000,
          shortWindowDurationMs: 30000,
        }),
      { initialProps: { recentlySubmitted: false } },
    );

    // Toggle multiple times
    rerender({ recentlySubmitted: true });
    expect(result.current).toBe(5000);

    rerender({ recentlySubmitted: false });
    expect(result.current).toBe(15000);

    rerender({ recentlySubmitted: true });
    expect(result.current).toBe(5000);

    // Advance time 15s (halfway through window)
    vi.advanceTimersByTime(15000);

    rerender({ recentlySubmitted: false });
    expect(result.current).toBe(15000);

    // Advance time to complete any pending timers
    vi.advanceTimersByTime(20000);

    expect(result.current).toBe(15000);
  });

  it('clears timeout when recentlySubmitted becomes false', () => {
    const { result, rerender } = renderHook(
      ({ recentlySubmitted }) =>
        useAdaptivePoll({
          recentlySubmitted,
          shortPollMs: 5000,
          longPollMs: 15000,
          shortWindowDurationMs: 30000,
        }),
      { initialProps: { recentlySubmitted: false } },
    );

    rerender({ recentlySubmitted: true });
    expect(result.current).toBe(5000);

    // Immediately set to false
    rerender({ recentlySubmitted: false });
    expect(result.current).toBe(15000);

    // Advance past where the timer would have fired
    vi.advanceTimersByTime(31000);

    // Should still be in long poll, not reverted again
    expect(result.current).toBe(15000);
  });
});
