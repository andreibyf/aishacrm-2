// BizDevSource entity with create/update overrides and promote()
// Extracted from src/api/entities.js
import { createEntity } from '../core/createEntity';
import { BACKEND_URL, getAuthFetchOptions } from '../core/httpClient';
import { logDev } from '../../utils/devLogger';

export const BizDevSource = {
  ...createEntity('BizDevSource'),
  schema: async () => {
    // Import and return the full BizDevSource schema
    const { BizDevSourceSchema } = await import('../../entities/BizDevSource.js');
    return BizDevSourceSchema;
  },
  /**
   * Override create to handle response format properly
   */
  create: async (data) => {
    try {
      const tenant_id = data?.tenant_id || data?.tenantId;
      if (!tenant_id) {
        throw new Error('tenant_id is required for BizDevSource.create');
      }
      const url = `${BACKEND_URL}/api/bizdevsources`;
      logDev('[BizDevSource.create] POST', { url, tenant_id });

      const authOpts = await getAuthFetchOptions();
      const response = await fetch(url, {
        method: 'POST',
        ...authOpts,
        body: JSON.stringify(data),
      });
      logDev('[BizDevSource.create] Response', { status: response.status, ok: response.ok });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[BizDevSource.create] Error', errorData);
        throw new Error(errorData.message || `Failed to create BizDevSource: ${response.status}`);
      }
      const result = await response.json();
      logDev('[BizDevSource.create] Success', result);
      return result.data || result;
    } catch (err) {
      console.error('[BizDevSource.create] Exception', err);
      throw err;
    }
  },
  /**
   * Override update to ensure tenant_id is passed via query string per backend route requirements.
   * Generic createEntity update doesn't append tenant_id, causing 400 errors.
   */
  update: async (id, data) => {
    try {
      const tenant_id = data?.tenant_id || data?.tenantId;
      if (!tenant_id) {
        throw new Error('tenant_id is required for BizDevSource.update');
      }
      const url = `${BACKEND_URL}/api/bizdevsources/${id}?tenant_id=${encodeURIComponent(tenant_id)}`;
      logDev('[BizDevSource.update] PUT', { url, id, tenant_id });
      // Exclude tenant_id from body (route expects it only in query for validation)
      const { tenant_id: _omit, tenantId: _omit2, ...rest } = data || {};
      const authOpts = await getAuthFetchOptions();
      const response = await fetch(url, {
        method: 'PUT',
        ...authOpts,
        body: JSON.stringify(rest),
      });
      logDev('[BizDevSource.update] Response', { status: response.status, ok: response.ok });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[BizDevSource.update] Error', errorData);
        throw new Error(errorData.message || `Failed to update BizDevSource: ${response.status}`);
      }
      const result = await response.json();
      logDev('[BizDevSource.update] Success', result);
      return result.data || result;
    } catch (err) {
      console.error('[BizDevSource.update] Exception', err);
      throw err;
    }
  },
  /**
   * Promote a BizDev source to a Lead (v3.0.0 workflow)
   * @param {string} id - BizDev source ID
   * @param {string} tenant_id - Tenant ID
   * @returns {Promise<{lead: Object, account: Object, bizdev_source_id: string, lead_type: string}>}
   */
  promote: async (id, tenant_id) => {
    try {
      const url = `${BACKEND_URL}/api/bizdevsources/${id}/promote`;
      const startedAt = performance.now();
      logDev('[BizDevSource.promote] Making API call:', { url, id, tenant_id, startedAt });

      // Abort after 8s to avoid infinite spinner when network stalls
      const controller = new AbortController();
      const timeoutMs = 8000;
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, timeoutMs);

      let response;
      const authOpts = await getAuthFetchOptions();
      try {
        response = await fetch(url, {
          method: 'POST',
          ...authOpts,
          // Keep source after promotion so UI can gray it out and stats reflect immediately
          body: JSON.stringify({ tenant_id, delete_source: false }),
          signal: controller.signal,
        });
      } catch (fetchErr) {
        const elapsed = Math.round(performance.now() - startedAt);
        if (fetchErr?.name === 'AbortError') {
          console.error('[BizDevSource.promote] Timeout abort', {
            id,
            tenant_id,
            elapsed,
            timeoutMs,
          });
          throw new Error('PROMOTE_TIMEOUT');
        }
        console.error('[BizDevSource.promote] Network fetch error before response', {
          error: fetchErr,
          elapsed,
        });
        throw fetchErr;
      } finally {
        clearTimeout(timeoutId);
      }

      const afterFetch = performance.now();
      logDev('[BizDevSource.promote] Response received:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        elapsedMs: Math.round(afterFetch - startedAt),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[BizDevSource.promote] API error:', { errorData, status: response.status });
        // Distinguish production safety guard / rate limit / generic errors
        const isGuard = errorData?.code === 'PRODUCTION_SAFETY_GUARD' || response.status === 403;
        const isRateLimit = response.status === 429;
        if (isGuard) {
          throw new Error('PROMOTE_BLOCKED_PRODUCTION_GUARD');
        }
        if (isRateLimit) {
          throw new Error('PROMOTE_RATE_LIMITED');
        }
        throw new Error(errorData.message || `Failed to promote bizdev source: ${response.status}`);
      }

      const parseStarted = performance.now();
      const result = await response.json();
      logDev('[BizDevSource.promote] Success:', {
        result,
        parseElapsedMs: Math.round(performance.now() - parseStarted),
      });
      return result.data;
    } catch (error) {
      console.error('[BizDevSource.promote] Error:', error);
      throw error;
    }
  },

  // Bulk assign bizdev sources to an employee (or unassign)
  bulkAssign: async (ids, assignedTo, tenantId, { overrideTeam = false } = {}) => {
    if (!Array.isArray(ids) || ids.length === 0) return { updated: 0, skipped: 0, errors: [] };
    if (!tenantId) throw new Error('tenantId is required for BizDevSource.bulkAssign');
    const authOpts = await getAuthFetchOptions();
    const response = await fetch(`${BACKEND_URL}/api/bizdevsources/bulk-assign`, {
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
};
