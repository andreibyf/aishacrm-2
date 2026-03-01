// AuditLog entity - direct backend API calls with clear() method
// Extracted from src/api/entities.js
import { BACKEND_URL, getAuthFetchOptions } from '../core/httpClient';
import { logDev } from '../../utils/devLogger';

export const AuditLog = {
  async list(filters = {}, _orderBy = '-created_at', limit = 100) {
    try {
      // Build query parameters
      const params = new URLSearchParams();
      if (filters.tenant_id) params.append('tenant_id', filters.tenant_id);
      if (filters.user_email) params.append('user_email', filters.user_email);
      if (filters.action) params.append('action', filters.action);
      if (filters.entity_type) {
        params.append('entity_type', filters.entity_type);
      }
      if (filters.entity_id) params.append('entity_id', filters.entity_id);
      if (limit) params.append('limit', limit);
      params.append('offset', filters.offset || 0);

      const url = `${BACKEND_URL}/api/audit-logs?${params}`;
      logDev('[AuditLog.list] Fetching from:', url);

      const authOpts = await getAuthFetchOptions({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      });
      const response = await fetch(url, {
        method: 'GET',
        ...authOpts,
      });

      logDev('[AuditLog.list] Response status:', response.status, response.statusText);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      logDev('[AuditLog.list] Response data:', result);

      // Handle {status: 'success', data: {'audit-logs': [...], total: N}} format
      if (result.status === 'success' && result.data && result.data['audit-logs']) {
        logDev('[AuditLog.list] Returning', result.data['audit-logs'].length, 'audit logs');
        return result.data['audit-logs'];
      }

      // Fallback: return data directly if format is different
      logDev('[AuditLog.list] Using fallback return format');
      return result.data || result;
    } catch (error) {
      console.error('[AuditLog.list] Error fetching audit logs:', error);
      return [];
    }
  },

  async get(id) {
    try {
      const authOpts = await getAuthFetchOptions();
      const response = await fetch(`${BACKEND_URL}/api/audit-logs/${id}`, {
        method: 'GET',
        ...authOpts,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result.data || result;
    } catch (error) {
      console.error(`[AuditLog.get] Error fetching audit log ${id}:`, error);
      throw error;
    }
  },

  async create(data) {
    try {
      const authOpts = await getAuthFetchOptions();
      const response = await fetch(`${BACKEND_URL}/api/audit-logs`, {
        method: 'POST',
        ...authOpts,
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result.data || result;
    } catch (error) {
      console.error('[AuditLog.create] Error creating audit log:', error);
      throw error;
    }
  },

  async delete(id) {
    try {
      const authOpts = await getAuthFetchOptions();
      const response = await fetch(`${BACKEND_URL}/api/audit-logs/${id}`, {
        method: 'DELETE',
        ...authOpts,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result.data || result;
    } catch (error) {
      console.error(`[AuditLog.delete] Error deleting audit log ${id}:`, error);
      throw error;
    }
  },

  async clear(filters = {}) {
    try {
      // Build query parameters for bulk delete
      const params = new URLSearchParams();
      if (filters.tenant_id) params.append('tenant_id', filters.tenant_id);
      if (filters.user_email) params.append('user_email', filters.user_email);
      if (filters.entity_type) {
        params.append('entity_type', filters.entity_type);
      }
      if (filters.older_than_days) {
        params.append('older_than_days', filters.older_than_days);
      }

      const authOpts = await getAuthFetchOptions();
      const response = await fetch(`${BACKEND_URL}/api/audit-logs?${params}`, {
        method: 'DELETE',
        ...authOpts,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result.data || result;
    } catch (error) {
      console.error('[AuditLog.clear] Error clearing audit logs:', error);
      throw error;
    }
  },
};
