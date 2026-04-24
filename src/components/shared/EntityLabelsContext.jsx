import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BACKEND_URL } from '@/api/entities';
import { DEFAULT_LABELS, HREF_TO_ENTITY_KEY } from './entityLabelsUtils';
import { EntityLabelsContext } from './entityLabelsContextDefinition';
import { useApiManager } from './ApiManager';

// Entity labels change rarely (admin toggles them from Settings). Cache for 5
// minutes so a superadmin flipping between tenants in the session reuses the
// cached labels instead of re-fetching on every tenantId change.
const ENTITY_LABELS_TTL_MS = 5 * 60 * 1000;

export function EntityLabelsProvider({ children, tenantId }) {
  const [labels, setLabels] = useState(DEFAULT_LABELS);
  const [loading, setLoading] = useState(false);
  const lastFetchedTenantIdRef = useRef(null);
  const { cachedRequest, clearCache } = useApiManager();

  const fetchLabels = useCallback(
    async (tid) => {
      if (!tid) {
        setLabels(DEFAULT_LABELS);
        return;
      }

      try {
        setLoading(true);
        const data = await cachedRequest(
          'EntityLabels',
          'get',
          { tenantId: tid },
          async () => {
            const response = await fetch(`${BACKEND_URL}/api/entity-labels/${tid}`, {
              credentials: 'include',
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
          },
          { ttlMs: ENTITY_LABELS_TTL_MS },
        );

        if (data?.status === 'success' && data.data?.labels) {
          setLabels({ ...data.data.labels });
        } else {
          setLabels(DEFAULT_LABELS);
        }
      } catch (error) {
        console.error('[EntityLabelsContext] Error fetching entity labels:', error);
        setLabels(DEFAULT_LABELS);
      } finally {
        setLoading(false);
      }
    },
    [cachedRequest],
  );

  useEffect(() => {
    if (tenantId && tenantId !== lastFetchedTenantIdRef.current) {
      lastFetchedTenantIdRef.current = tenantId;
      fetchLabels(tenantId);
    } else if (!tenantId && lastFetchedTenantIdRef.current) {
      setLabels(DEFAULT_LABELS);
      lastFetchedTenantIdRef.current = null;
    }
  }, [tenantId, fetchLabels]);

  const getLabel = useCallback(
    (entityKey) => {
      const key = entityKey?.toLowerCase();
      return labels[key]?.plural || DEFAULT_LABELS[key]?.plural || entityKey;
    },
    [labels],
  );

  const getLabelSingular = useCallback(
    (entityKey) => {
      const key = entityKey?.toLowerCase();
      return labels[key]?.singular || DEFAULT_LABELS[key]?.singular || entityKey;
    },
    [labels],
  );

  const getNavLabel = useCallback(
    (href) => {
      const entityKey = HREF_TO_ENTITY_KEY[href];
      if (entityKey) {
        return getLabel(entityKey);
      }
      return null;
    },
    [getLabel],
  );

  // Force a refresh by invalidating the cached entry, then refetching.
  // Used after EntityLabelsManager save/reset so nav labels update immediately.
  const refresh = useCallback(() => {
    clearCache('EntityLabels');
    lastFetchedTenantIdRef.current = null;
    if (tenantId) {
      lastFetchedTenantIdRef.current = tenantId;
      fetchLabels(tenantId);
    }
  }, [tenantId, fetchLabels, clearCache]);

  const value = {
    labels,
    getLabel,
    getLabelSingular,
    getNavLabel,
    loading,
    refresh,
  };

  return <EntityLabelsContext.Provider value={value}>{children}</EntityLabelsContext.Provider>;
}
