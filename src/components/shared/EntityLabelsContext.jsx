import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BACKEND_URL } from '@/api/entities';
import { DEFAULT_LABELS, HREF_TO_ENTITY_KEY } from './entityLabelsUtils';
import { EntityLabelsContext } from './entityLabelsContextDefinition';

export function EntityLabelsProvider({ children, tenantId }) {
  console.log('[EntityLabelsContext] Provider rendered with tenantId:', tenantId);
  const [labels, setLabels] = useState(DEFAULT_LABELS);
  const [loading, setLoading] = useState(false);
  const lastFetchedTenantIdRef = useRef(null); // Use ref to persist across strict mode remounts

  const fetchLabels = useCallback(async (tid) => {
    if (!tid) {
      console.log('[EntityLabelsContext] No tenant ID, using defaults');
      setLabels(DEFAULT_LABELS);
      return;
    }

    try {
      setLoading(true);
      console.log('[EntityLabelsContext] Fetching labels for tenant:', tid);
      // Add cache-busting timestamp to prevent 304 responses
      const cacheBuster = Date.now();
      const response = await fetch(`${BACKEND_URL}/api/entity-labels/${tid}?_t=${cacheBuster}`, {
        credentials: 'include',
        headers: {
          'Cache-Control': 'no-cache',
        },
      });

      if (response.ok) {
        const data = await response.json();
        console.log('[EntityLabelsContext] RAW API response for tenant', tid, ':', JSON.stringify(data, null, 2));
        if (data.status === 'success' && data.data?.labels) {
          console.log('[EntityLabelsContext] Setting labels for', tid, ':', JSON.stringify(data.data.labels));
          console.log('[EntityLabelsContext] Customized entities:', data.data.customized);
          // Force a new object reference to ensure React detects the change
          setLabels({ ...data.data.labels });
        }
      } else {
        // Fallback to defaults on error
        console.warn('[EntityLabelsContext] Failed to fetch labels, using defaults');
        setLabels(DEFAULT_LABELS);
      }
    } catch (error) {
      console.error('[EntityLabelsContext] Error fetching entity labels:', error);
      setLabels(DEFAULT_LABELS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tenantId && tenantId !== lastFetchedTenantIdRef.current) {
      console.log('[EntityLabelsContext] Tenant changed, fetching labels for:', tenantId);
      lastFetchedTenantIdRef.current = tenantId;
      fetchLabels(tenantId);
    } else if (!tenantId && lastFetchedTenantIdRef.current) {
      // Tenant cleared, reset to defaults
      console.log('[EntityLabelsContext] Tenant cleared, resetting to defaults');
      setLabels(DEFAULT_LABELS);
      lastFetchedTenantIdRef.current = null;
    }
  }, [tenantId, fetchLabels]);

  /**
   * Get the plural label for an entity
   * @param {string} entityKey - e.g., 'leads', 'accounts'
   * @returns {string} - e.g., 'Prospects' or 'Leads'
   */
  const getLabel = useCallback((entityKey) => {
    const key = entityKey?.toLowerCase();
    return labels[key]?.plural || DEFAULT_LABELS[key]?.plural || entityKey;
  }, [labels]);

  /**
   * Get the singular label for an entity
   * @param {string} entityKey - e.g., 'leads', 'accounts'
   * @returns {string} - e.g., 'Prospect' or 'Lead'
   */
  const getLabelSingular = useCallback((entityKey) => {
    const key = entityKey?.toLowerCase();
    return labels[key]?.singular || DEFAULT_LABELS[key]?.singular || entityKey;
  }, [labels]);

  /**
   * Get the label for a navigation href
   * @param {string} href - e.g., 'Leads', 'BizDevSources'
   * @returns {string} - custom label or original
   */
  const getNavLabel = useCallback((href) => {
    const entityKey = HREF_TO_ENTITY_KEY[href];
    if (entityKey) {
      return getLabel(entityKey);
    }
    return null; // Return null if not a customizable entity
  }, [getLabel]);

  const refresh = useCallback(() => {
    console.log('[EntityLabelsContext] refresh() called, tenantId:', tenantId);
    if (tenantId) {
      fetchLabels(tenantId);
    }
  }, [tenantId, fetchLabels]);

  const value = {
    labels,
    getLabel,
    getLabelSingular,
    getNavLabel,
    loading,
    refresh,
  };

  return (
    <EntityLabelsContext.Provider value={value}>
      {children}
    </EntityLabelsContext.Provider>
  );
}


