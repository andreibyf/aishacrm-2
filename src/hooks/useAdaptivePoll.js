// @ts-check
/**
 * useAdaptivePoll (4VD-48).
 *
 * Generic adaptive polling hook for scenarios where polling frequency
 * should be high immediately after an event (e.g., "I just submitted a
 * document") and then back off to steady-state.
 *
 * Usage:
 *   const interval = useAdaptivePoll({
 *     recentlySubmitted: documentWasJustSent,
 *     shortPollMs: 5000,      // high-frequency window (default 5s)
 *     longPollMs: 15000,      // steady-state window (default 15s)
 *     shortWindowDurationMs: 30000, // how long to stay in high-frequency (default 30s)
 *   });
 *
 * Returns the current interval in milliseconds. Caller's polling loop
 * should use this as the interval and re-check on each tick.
 *
 * Pattern: used by useSigningSessions to cut per-panel load when users
 * have multiple detail panels open. Also suitable for useEntityActivity,
 * notification checks, etc.
 */

import { useEffect, useRef, useState } from 'react';

export function useAdaptivePoll({
  recentlySubmitted = false,
  shortPollMs = 5000,
  longPollMs = 15000,
  shortWindowDurationMs = 30000,
}) {
  const [interval, setInterval] = useState(longPollMs);
  const shortWindowTimerRef = useRef(null);

  useEffect(() => {
    // If recentlySubmitted is false and there's no active timer,
    // stay in steady-state (longPollMs).
    if (!recentlySubmitted) {
      if (shortWindowTimerRef.current) {
        clearTimeout(shortWindowTimerRef.current);
        shortWindowTimerRef.current = null;
      }
      setInterval(longPollMs);
      return;
    }

    // recentlySubmitted is true: switch to short window and start the timer.
    setInterval(shortPollMs);

    if (shortWindowTimerRef.current) {
      clearTimeout(shortWindowTimerRef.current);
    }

    shortWindowTimerRef.current = setTimeout(() => {
      setInterval(longPollMs);
      shortWindowTimerRef.current = null;
    }, shortWindowDurationMs);

    return () => {
      if (shortWindowTimerRef.current) {
        clearTimeout(shortWindowTimerRef.current);
        shortWindowTimerRef.current = null;
      }
    };
  }, [recentlySubmitted, shortPollMs, longPollMs, shortWindowDurationMs]);

  return interval;
}
