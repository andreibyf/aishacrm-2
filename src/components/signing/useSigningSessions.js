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
 * @param {number} [params.pollMs] — default 5000ms; pass 0 to disable polling.
 *
 * Default poll was 30s historically — visible UI staleness when the
 * finalize pipeline (which runs async ~2-5s after submit) completes
 * but the panel still showed 'viewed'/'signed' until the next poll.
 * 5s is a reasonable balance: catches the typical finalize race
 * within one poll cycle, doesn't hammer the API for entities that
 * rarely change (the GET is cheap — a single supabase row read).
 */
export function useSigningSessions({ enabled, relatedTo, relatedId, pollMs = 5000 }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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

    if (pollMs > 0) {
      intervalId = setInterval(async () => {
        try {
          await fetchOnce(controller.signal);
        } catch {
          // Silent on poll errors — surfacing every transient blip would
          // be noisy; the next successful poll heals the UI.
        }
      }, pollMs);
    }

    return () => {
      cancelled = true;
      controller.abort();
      if (intervalId) clearInterval(intervalId);
    };
  }, [enabled, relatedTo, relatedId, pollMs, fetchOnce]);

  return { sessions, loading, error, refresh };
}
