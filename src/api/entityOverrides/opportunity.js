// Opportunity entity with getStats and getCount extensions
// Extracted from src/api/entities.js
import { createEntity } from '../core/createEntity';
import { BACKEND_URL, getAuthFetchOptions } from '../core/httpClient';

export const Opportunity = {
  ...createEntity('Opportunity'),

  // Optimized stats endpoint - returns aggregated counts by stage
  async getStats(filter = {}) {
    try {
      const params = new URLSearchParams();
      if (filter.tenant_id) params.append('tenant_id', filter.tenant_id);
      if (filter.stage) params.append('stage', filter.stage);
      if (filter.assigned_to !== undefined) params.append('assigned_to', filter.assigned_to);
      if (filter.is_test_data !== undefined) params.append('is_test_data', filter.is_test_data);

      const authOpts = await getAuthFetchOptions();
      const response = await fetch(`${BACKEND_URL}/api/v2/opportunities/stats?${params}`, {
        method: 'GET',
        ...authOpts,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result.data;
    } catch (error) {
      console.error('[Opportunity.getStats] Error:', error);
      return {
        total: 0,
        prospecting: 0,
        qualification: 0,
        proposal: 0,
        negotiation: 0,
        closed_won: 0,
        closed_lost: 0,
      };
    }
  },

  // Optimized count endpoint - returns total count without fetching all records
  async getCount(filter = {}) {
    try {
      const params = new URLSearchParams();
      if (filter.tenant_id) params.append('tenant_id', filter.tenant_id);
      if (filter.stage && filter.stage !== 'all') params.append('stage', filter.stage);
      if (filter.assigned_to !== undefined) params.append('assigned_to', filter.assigned_to);
      if (filter.is_test_data !== undefined) params.append('is_test_data', filter.is_test_data);
      if (filter.$or || filter.searchTerm) {
        // Convert search term to filter format
        const searchFilter = filter.$or ? { $or: filter.$or } : null;
        if (searchFilter) {
          params.append('filter', JSON.stringify(searchFilter));
        }
      }

      const authOpts = await getAuthFetchOptions();
      const response = await fetch(`${BACKEND_URL}/api/v2/opportunities/count?${params}`, {
        method: 'GET',
        ...authOpts,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result.data.count;
    } catch (error) {
      console.error('[Opportunity.getCount] Error:', error);
      return 0;
    }
  },
};
