/**
 * usePersistedFilters — persist list-page filter state across navigation.
 *
 * Backed by sessionStorage so filters survive in-session navigation but
 * clear automatically when the tab is closed. This prevents stale filters
 * from surfacing in future sessions or leaking across tenants.
 *
 * Storage key format (caller's responsibility to build):
 *   `aishacrm:filters:${tenantId}:${userId}:${entity}`
 *
 * Tenant + user in the key enforces isolation:
 *   - Different tenants on the same machine get separate filter state.
 *   - Different users on a shared machine get separate filter state.
 *   - Superadmin switching tenant context gets a fresh filter set.
 *
 * @param {string|null} storageKey  Pre-built key. When null/incomplete
 *                                  (user/tenant not yet resolved) the hook
 *                                  silently falls back to defaults — no
 *                                  sessionStorage reads or writes until
 *                                  the key is valid.
 * @param {object}      defaults    Default filter values. Any key present
 *                                  in defaults but missing from a saved
 *                                  snapshot gets its default value, so new
 *                                  filter fields added to a page never
 *                                  produce undefined on restore.
 *
 * @returns {[object, function, function]}
 *   [state, setFilter(field, value), resetFilters()]
 *
 * Usage:
 *   const storageKey = `aishacrm:filters:${tenantId}:${user?.id}:leads`;
 *   const [filters, setFilter, resetFilters] = usePersistedFilters(storageKey, {
 *     searchTerm: '', statusFilter: 'all', selectedTags: [],
 *   });
 *   const { searchTerm, statusFilter, selectedTags } = filters;
 *   const setSearchTerm = (v) => setFilter('searchTerm', v);
 */

import { useState, useCallback, useEffect, useRef } from 'react';

const KEY_READY_RE = /null|undefined/;

function isKeyReady(key) {
  return typeof key === 'string' && key.length > 0 && !KEY_READY_RE.test(key);
}

function readFromStorage(key, defaults) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return defaults;
    // Merge: saved fields win over defaults, but new defaults fill gaps.
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return defaults;
  }
}

function writeToStorage(key, state) {
  try {
    sessionStorage.setItem(key, JSON.stringify(state));
  } catch {
    // sessionStorage unavailable (private mode quota, etc.) — silent no-op.
  }
}

export function usePersistedFilters(storageKey, defaults) {
  // Capture defaults in a ref so the initialiser closure sees a stable object
  // even if the caller passes an inline literal (which changes identity every
  // render but should not change content).
  const defaultsRef = useRef(defaults);

  const [state, setStateRaw] = useState(() => {
    if (!isKeyReady(storageKey)) return defaultsRef.current;
    return readFromStorage(storageKey, defaultsRef.current);
  });

  // Track the key we last hydrated from. When storageKey changes after mount —
  // e.g., tenant/user context resolves from null to a real value, or a
  // superadmin switches tenant — we need to re-read sessionStorage under the
  // new key. Without this, the initial useState snapshot (taken before the key
  // was ready) sticks forever and per-tenant/user isolation breaks.
  const hydratedKeyRef = useRef(storageKey);

  useEffect(() => {
    if (hydratedKeyRef.current === storageKey) return;
    hydratedKeyRef.current = storageKey;
    if (isKeyReady(storageKey)) {
      setStateRaw(readFromStorage(storageKey, defaultsRef.current));
    } else {
      setStateRaw(defaultsRef.current);
    }
  }, [storageKey]);

  const setFilter = useCallback(
    (field, value) => {
      setStateRaw((prev) => {
        const next = { ...prev, [field]: value };
        if (isKeyReady(storageKey)) writeToStorage(storageKey, next);
        return next;
      });
    },
    [storageKey],
  );

  const resetFilters = useCallback(() => {
    setStateRaw(defaultsRef.current);
    if (isKeyReady(storageKey)) {
      try {
        sessionStorage.removeItem(storageKey);
      } catch {
        // sessionStorage unavailable (private mode quota, etc.) — silent no-op.
      }
    }
  }, [storageKey]);

  return [state, setFilter, resetFilters];
}
