// @ts-check
/**
 * useSigningSessions (4VD-43 day 2).
 *
 * React hook: fetches signing_sessions scoped to a CRM entity (related_to +
 * related_id) and polls every 30s while open. Returns { sessions, loading,
 * error, refresh } so the caller's "Document signatures" section can render
 * status badges and trigger a manual refresh after sending.
 *
 * Tenant isolation: x-tenant-id header on every request; backend filters by
 * tenant_id at the route layer.
 */

import { useCallback, useEffect, useState } from 'react';
import { getBackendUrl } from '@/api/backendUrl';
import { getAuthorizationHeader } from '@/api/functions';
import { useAdaptivePoll } from '@/hooks/useAdaptivePoll';

async function authHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const auth = await getAuthorizationHeader();
  if (auth) headers['Authorization'] = auth;
  if (typeof localStorage !== 'undefined') {
    const t = localStorage.getItem('selected_tenant_id') || localStorage.getItem('tenant_id') || '';
    if (t) headers['x-tenant-id'] = t;
  }
  return headers;
}

/**
 * @param {Object} params
 * @param {boolean} params.enabled  — only fetch + poll when true (typically
 *                                    when the panel is open).
 * @param {'contact'|'lead'|'account'|'opportunity'} params.relatedTo
 * @param {string} params.relatedId
 * @param {number} [params.pollMs] — deprecated; use shortPollMs/longPollMs instead.
 *                                   If provided, acts as override for adaptive window.
 * @param {number} [params.shortPollMs] — default 5000ms; poll interval immediately
 *                                         after document send (for ~30s).
 * @param {number} [params.longPollMs] — default 15000ms; steady-state poll interval.
 * @param {number} [params.submissionSeq] — monotonically increasing counter; increment
 *                                          on every send. Using a counter (not a boolean)
 *                                          ensures useAdaptivePoll restarts its 30s window
 *                                          even when the user sends a second document in
 *                                          the same session (boolean true→true is invisible
 *                                          to React's effect dep comparison).
 *
 * Adaptive polling (4VD-48):
 *
 * Previously polled at a fixed 5s interval, which is fine for a single
 * panel but multiplies load when users have 3 detail panels open
 * (36 req/min instead of 6). Now:
 *
 * - After user sends a document: poll at shortPollMs (5s) for ~30s
 *   to catch the finalize-pipeline async race within one cycle.
 * - Steady-state: poll at longPollMs (15s), acceptable for a "rarely changes"
 *   entity and covers most normal UI refresh needs.
 * - Manual refresh button still works at any cadence.
 *
 * Acceptance (4VD-48):
 * ✓ Default poll reverts to 15-20s for steady-state
 * ✓ First ~30s after submit: poll at 5s
 * ✓ Manual refresh button continues to work
 * ✓ Backend /api/submissions load ≤ 10 req/min per mounted panel
 * ✓ Adaptive switchover is testable
 */
export function useSigningSessions({
  enabled,
  relatedTo,
  relatedId,
  pollMs,
  shortPollMs = 5000,
  longPollMs = 15000,
  submissionSeq = 0,
}) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // If legacy pollMs is passed, use it to override both short and long windows.
  // This preserves backwards compatibility for callers.
  const effectiveShortPollMs = pollMs ?? shortPollMs;
  const effectiveLongPollMs = pollMs ?? longPollMs;

  // Calculate the current poll interval based on submissionSeq counter.
  const currentInterval = useAdaptivePoll({
    submissionSeq,
    shortPollMs: effectiveShortPollMs,
    longPollMs: effectiveLongPollMs,
    shortWindowDurationMs: 30000,
  });

  const fetchOnce = useCallback(
    async (signal) => {
      if (!relatedTo || !relatedId) return;
      const url = `${getBackendUrl()}/api/submissions?related_to=${encodeURIComponent(relatedTo)}&related_id=${encodeURIComponent(relatedId)}`;
      const resp = await fetch(url, {
        headers: await authHeaders(),
        credentials: 'include',
        signal,
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const err = new Error(
          json?.message || json?.error || `Failed to load signatures (${resp.status})`,
        );
        err.status = resp.status;
        throw err;
      }
      setSessions(Array.isArray(json?.data) ? json.data : []);
    },
    [relatedTo, relatedId],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await fetchOnce();
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }, [fetchOnce]);

  useEffect(() => {
    if (!enabled || !relatedTo || !relatedId) return undefined;
    const controller = new AbortController();
    let cancelled = false;
    let intervalId;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        await fetchOnce(controller.signal);
      } catch (err) {
        if (!cancelled && err.name !== 'AbortError') setError(err.message || String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    // Use the adaptive poll interval. If currentInterval > 0, start polling.
    if (currentInterval > 0) {
      intervalId = setInterval(async () => {
        try {
          await fetchOnce(controller.signal);
        } catch {
          // Silent on poll errors — surfacing every transient blip would
          // be noisy; the next successful poll heals the UI.
        }
      }, currentInterval);
    }

    return () => {
      cancelled = true;
      controller.abort();
      if (intervalId) clearInterval(intervalId);
    };
  }, [enabled, relatedTo, relatedId, currentInterval, fetchOnce]);

  return { sessions, loading, error, refresh };
}
