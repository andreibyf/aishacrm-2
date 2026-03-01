// Tenant entity - direct backend API calls
// Extracted from src/api/entities.js
import { BACKEND_URL } from '../core/httpClient';
import { logDev } from '../../utils/devLogger';

export const Tenant = {
  async list(orderBy = 'display_order') {
    try {
      const response = await fetch(`${BACKEND_URL}/api/tenants`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      // Handle {status: 'success', data: {tenants: [...], total: N}} format
      if (result.status === 'success' && result.data && result.data.tenants) {
        const tenants = result.data.tenants;

        // Sort by requested field
        if (orderBy) {
          return tenants.sort((a, b) => {
            if (a[orderBy] < b[orderBy]) return -1;
            if (a[orderBy] > b[orderBy]) return 1;
            return 0;
          });
        }

        return tenants;
      }

      // Fallback: return data directly if format is different
      return result.data || result;
    } catch (error) {
      console.error('[Tenant.list] Error fetching tenants:', error);
      return [];
    }
  },

  async get(id) {
    try {
      const response = await fetch(`${BACKEND_URL}/api/tenants/${id}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      // Handle {status: 'success', data: {...}} format
      return result.data || result;
    } catch (error) {
      console.error(`[Tenant.get] Error fetching tenant ${id}:`, error);
      throw error;
    }
  },

  async create(data) {
    try {
      const response = await fetch(`${BACKEND_URL}/api/tenants`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result.data || result;
    } catch (error) {
      console.error('[Tenant.create] Error creating tenant:', error);
      throw error;
    }
  },

  async update(id, data) {
    try {
      logDev('[Tenant.update] Updating tenant:', id, 'with data:', data);

      const response = await fetch(`${BACKEND_URL}/api/tenants/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      logDev('[Tenant.update] Response status:', response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Tenant.update] Error response:', errorText);
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      logDev('[Tenant.update] Response data:', result);
      return result.data || result;
    } catch (error) {
      console.error(`[Tenant.update] Error updating tenant ${id}:`, error);
      throw error;
    }
  },

  async delete(id) {
    try {
      const response = await fetch(`${BACKEND_URL}/api/tenants/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result.data || result;
    } catch (error) {
      console.error(`[Tenant.delete] Error deleting tenant ${id}:`, error);
      throw error;
    }
  },
};
