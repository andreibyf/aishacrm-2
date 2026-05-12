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
 *     submissionSeq: sendCount,    // increment on every send; 0 = never sent
 *     shortPollMs: 5000,           // high-frequency window (default 5s)
 *     longPollMs: 15000,           // steady-state window (default 15s)
 *     shortWindowDurationMs: 30000, // how long to stay in high-frequency (default 30s)
 *   });
 *
 * Returns the current interval in milliseconds. Caller's polling loop
 * should use this as the interval and re-check on each tick.
 *
 * Why submissionSeq instead of recentlySubmitted: boolean?
 * A boolean stays true after the first send, so React sees no state change
 * on subsequent sends within the same session and the effect never re-runs —
 * meaning the 30s short-poll window is never restarted. A monotonically
 * increasing counter always changes on each send, guaranteeing the effect
 * fires and the window resets correctly every time.
 *
 * Pattern: used by useSigningSessions to cut per-panel load when users
 * have multiple detail panels open. Also suitable for useEntityActivity,
 * notification checks, etc.
 */

import { useEffect, useRef, useState } from 'react';

export function useAdaptivePoll({
  submissionSeq = 0,
  shortPollMs = 5000,
  longPollMs = 15000,
  shortWindowDurationMs = 30000,
}) {
  const [interval, setInterval] = useState(longPollMs);
  const shortWindowTimerRef = useRef(null);

  useEffect(() => {
    // No submissions yet — stay in steady-state.
    if (submissionSeq === 0) {
      if (shortWindowTimerRef.current) {
        clearTimeout(shortWindowTimerRef.current);
        shortWindowTimerRef.current = null;
      }
      setInterval(longPollMs);
      return;
    }

    // A new submission (or a repeated one — seq always increments):
    // switch to short poll and restart the 30s window from zero.
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
  }, [submissionSeq, shortPollMs, longPollMs, shortWindowDurationMs]);

  return interval;
}
