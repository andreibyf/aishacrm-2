// @ts-check
/**
 * useAdaptivePoll test suite (4VD-48).
 *
 * Tests the adaptive polling hook behavior:
 * - Defaults to long poll interval (15s) in steady-state (submissionSeq=0)
 * - Switches to short poll interval (5s) when submissionSeq increments
 * - Auto-reverts to long poll after ~30s window
 * - Restarts the 30s window on every subsequent send (the regression fixed
 *   by switching from boolean to counter: seq 1→2 must reset the timer)
 * - Accepts custom poll intervals
 */

import { renderHook, act } from '@testing-library/react';
import { useAdaptivePoll } from './useAdaptivePoll';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('useAdaptivePoll', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('defaults to long poll interval when no submissions', () => {
    const { result } = renderHook(() =>
      useAdaptivePoll({
        submissionSeq: 0,
        shortPollMs: 5000,
        longPollMs: 15000,
        shortWindowDurationMs: 30000,
      }),
    );

    expect(result.current).toBe(15000);
  });

  it('switches to short poll when submissionSeq increments from 0', () => {
    const { result, rerender } = renderHook(
      ({ submissionSeq }) =>
        useAdaptivePoll({
          submissionSeq,
          shortPollMs: 5000,
          longPollMs: 15000,
          shortWindowDurationMs: 30000,
        }),
      { initialProps: { submissionSeq: 0 } },
    );

    expect(result.current).toBe(15000);

    rerender({ submissionSeq: 1 });

    expect(result.current).toBe(5000);
  });

  it('reverts to long poll after short window expires', () => {
    const { result, rerender } = renderHook(
      ({ submissionSeq }) =>
        useAdaptivePoll({
          submissionSeq,
          shortPollMs: 5000,
          longPollMs: 15000,
          shortWindowDurationMs: 30000,
        }),
      { initialProps: { submissionSeq: 0 } },
    );

    rerender({ submissionSeq: 1 });
    expect(result.current).toBe(5000);

    // Advance time past the 30s window
    act(() => {
      vi.advanceTimersByTime(31000);
    });

    expect(result.current).toBe(15000);
  });

  it('restarts the 30s window on each subsequent send (regression: seq 1→2)', () => {
    const { result, rerender } = renderHook(
      ({ submissionSeq }) =>
        useAdaptivePoll({
          submissionSeq,
          shortPollMs: 5000,
          longPollMs: 15000,
          shortWindowDurationMs: 30000,
        }),
      { initialProps: { submissionSeq: 0 } },
    );

    // First send at t=0
    rerender({ submissionSeq: 1 });
    expect(result.current).toBe(5000);

    // Advance 20s — still in the first window
    act(() => {
      vi.advanceTimersByTime(20000);
    });
    expect(result.current).toBe(5000);

    // Second send at t=20s — must restart the 30s window
    rerender({ submissionSeq: 2 });
    expect(result.current).toBe(5000);

    // Advance 25s (t=45s total, t=25s since second send) —
    // the first window would have expired at t=30s, but the second send
    // reset it; we should still be in short poll.
    act(() => {
      vi.advanceTimersByTime(25000);
    });
    expect(result.current).toBe(5000);

    // Advance another 10s (t=35s since second send) — window has now expired.
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(result.current).toBe(15000);
  });

  it('accepts custom poll intervals', () => {
    const { result } = renderHook(() =>
      useAdaptivePoll({
        submissionSeq: 0,
        shortPollMs: 3000,
        longPollMs: 20000,
        shortWindowDurationMs: 60000,
      }),
    );

    expect(result.current).toBe(20000);
  });

  it('stays in long poll when submissionSeq stays at 0', () => {
    const { result, rerender } = renderHook(
      ({ submissionSeq }) =>
        useAdaptivePoll({
          submissionSeq,
          shortPollMs: 5000,
          longPollMs: 15000,
          shortWindowDurationMs: 30000,
        }),
      { initialProps: { submissionSeq: 0 } },
    );

    expect(result.current).toBe(15000);

    act(() => {
      vi.advanceTimersByTime(60000);
    });

    expect(result.current).toBe(15000);

    rerender({ submissionSeq: 0 });
    expect(result.current).toBe(15000);
  });
});
