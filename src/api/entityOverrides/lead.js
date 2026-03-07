// Lead entity with bulkDelete and getStats extensions
// Extracted from src/api/entities.js
import { createEntity } from '../core/createEntity';
import { BACKEND_URL, getAuthFetchOptions } from '../core/httpClient';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';

export const Lead = {
  ...createEntity('Lead'),

  // Bulk delete leads by IDs — single DB round-trip, avoids N×429 from individual deletes
  async bulkDelete(ids, tenantId) {
    if (!Array.isArray(ids) || ids.length === 0) return { deleted: 0 };
    if (!tenantId) throw new Error('tenantId is required for Lead.bulkDelete');

    let session = null;
    if (isSupabaseConfigured()) {
      try {
        const { data } = await supabase.auth.getSession();
        session = data?.session;
      } catch {
        /* ignore */
      }
    }

    const response = await fetch(`${BACKEND_URL}/api/v2/leads/bulk-delete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      credentials: 'include',
      body: JSON.stringify({ tenant_id: tenantId, ids }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Bulk delete failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    return result.data || { deleted: ids.length };
  },

  // Bulk assign leads to an employee (or unassign) — single DB round-trip
  async bulkAssign(ids, assignedTo, tenantId, { overrideTeam = false } = {}) {
    if (!Array.isArray(ids) || ids.length === 0) return { updated: 0, skipped: 0, errors: [] };
    if (!tenantId) throw new Error('tenantId is required for Lead.bulkAssign');
    const authOpts = await getAuthFetchOptions();
    const response = await fetch(`${BACKEND_URL}/api/v2/leads/bulk-assign`, {
      method: 'POST',
      ...authOpts,
      body: JSON.stringify({
        ids,
        assigned_to: assignedTo,
        tenant_id: tenantId,
        override_team: overrideTeam,
      }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || `Bulk assign failed: ${response.status}`);
    }
    const result = await response.json();
    return result.data || { updated: 0, skipped: 0, errors: [] };
  },

  // Optimized stats endpoint - returns aggregated counts by status
  async getStats(filter = {}) {
    try {
      const params = new URLSearchParams();
      if (filter.tenant_id) params.append('tenant_id', filter.tenant_id);
      if (filter.assigned_to !== undefined) params.append('assigned_to', filter.assigned_to);
      if (filter.is_test_data !== undefined)
        params.append('is_test_data', String(filter.is_test_data));

      const response = await fetch(`${BACKEND_URL}/api/v2/leads/stats?${params}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result.data;
    } catch (error) {
      console.error('[Lead.getStats] Error:', error);
      return {
        total: 0,
        new: 0,
        contacted: 0,
        qualified: 0,
        unqualified: 0,
        converted: 0,
        lost: 0,
      };
    }
  },
};
