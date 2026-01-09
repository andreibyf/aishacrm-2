/**
 * Bundle API - Optimized endpoints for page data loading
 *
 * These functions fetch all data needed for a page in a single request,
 * eliminating N+1 query problems and reducing API round-trips.
 *
 * Pattern: Each bundle function includes in-flight request deduplication
 * and short-term result caching to prevent duplicate concurrent calls.
 *
 * ============================================================================
 * INTEGRATION STATUS (January 2026)
 * ============================================================================
 *
 * These bundle endpoints are COMPLETE and TESTED but NOT YET INTEGRATED into
 * the main CRM pages (Leads.jsx, Contacts.jsx, Opportunities.jsx).
 *
 * WHY NOT INTEGRATED:
 * - Leads.jsx has complex age filtering with hybrid client/server pagination
 * - Contacts.jsx and Opportunities.jsx have similar sophisticated filter logic
 * - The existing pages use Promise.all() for supporting data + separate stats calls
 * - Risk of breaking existing functionality outweighed the benefit
 *
 * WHEN TO USE THESE BUNDLES:
 * - New features needing combined entity data
 * - Simpler pages without complex client-side filtering
 * - AI/Braid tools that need tenant data snapshots
 * - Mobile clients or external integrations
 * - Dashboard widgets needing combined data
 *
 * BACKEND: /api/bundles/leads, /api/bundles/contacts, /api/bundles/opportunities
 * DOCS: docs/BUNDLE_ENDPOINTS_TESTING.md
 * TESTS: backend/__tests__/bundles.test.js
 * ============================================================================
 */

import { BACKEND_URL } from './entities';
import logger from '../lib/logger';

// In-flight request deduplication map
const pendingRequests = new Map();

// Short-term result cache to prevent rapid successive calls
const recentResults = new Map();
const RESULT_CACHE_TTL = 5000; // 5 seconds

/**
 * Fetch leads bundle - includes leads, users, employees, accounts, and stats
 *
 * @param {Object} options - Query options
 * @param {string} options.tenant_id - Tenant UUID (required)
 * @param {number} options.page - Page number (default 1)
 * @param {number} options.page_size - Items per page (default 25, max 100)
 * @param {string} options.search - Search term (optional)
 * @param {string} options.status - Status filter (optional)
 * @param {string} options.assigned_to - Assigned to filter (optional)
 * @param {boolean} options.include_test_data - Include test data (default true)
 * @param {string} options.tags - Comma-separated tag IDs (optional)
 * @param {number} options.age_min - Minimum age in days (optional)
 * @param {number} options.age_max - Maximum age in days (optional)
 * @returns {Promise<Object>} Bundle containing leads, stats, users, employees, accounts, pagination, meta
 */
export async function getLeadsBundle(options = {}) {
  const {
    tenant_id,
    page = 1,
    page_size = 25,
    search = '',
    status = 'all',
    assigned_to = 'all',
    include_test_data = true,
    tags = '',
    age_min,
    age_max
  } = options;

  // Create cache key for deduplication
  const cacheKey = JSON.stringify({
    type: 'leads',
    tenant_id,
    page,
    page_size,
    search,
    status,
    assigned_to,
    include_test_data,
    tags,
    age_min,
    age_max
  });

  // Check short-term result cache first
  const cached = recentResults.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < RESULT_CACHE_TTL) {
    if (import.meta.env.DEV) {
      console.log('[Bundles] Returning cached result for leads:', cacheKey);
    }
    return cached.data;
  }

  // If there's already an in-flight request, return that promise
  if (pendingRequests.has(cacheKey)) {
    if (import.meta.env.DEV) {
      console.log('[Bundles] Deduplicating in-flight request for leads:', cacheKey);
    }
    return pendingRequests.get(cacheKey);
  }

  // Create the fetch promise
  const fetchPromise = _fetchLeadsBundle(options).then(result => {
    // Cache the successful result
    recentResults.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
  });

  // Store it for deduplication
  pendingRequests.set(cacheKey, fetchPromise);

  // Clean up after resolution
  fetchPromise.finally(() => {
    pendingRequests.delete(cacheKey);
  });

  return fetchPromise;
}

/**
 * Internal fetch implementation for leads bundle
 */
async function _fetchLeadsBundle(options) {
  try {
    const queryParams = new URLSearchParams();

    // Add all options as query params
    Object.entries(options).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        queryParams.append(key, value);
      }
    });

    const url = `${BACKEND_URL}/api/bundles/leads?${queryParams}`;
    const response = await fetch(url, {
      credentials: 'include',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const json = await response.json();
    return json?.data || json;

  } catch (error) {
    logger.error('[Bundles] Error fetching leads bundle:', error);
    // Return empty bundle on error
    return {
      leads: [],
      stats: { total: 0, new: 0, contacted: 0, qualified: 0, unqualified: 0, converted: 0, lost: 0 },
      users: [],
      employees: [],
      accounts: [],
      pagination: { page: 1, page_size: 25, total_items: 0, total_pages: 0 },
      meta: { tenant_id: options.tenant_id, generated_at: new Date().toISOString(), source: 'error_fallback' }
    };
  }
}

/**
 * Fetch contacts bundle - includes contacts, users, employees, accounts, and stats
 *
 * @param {Object} options - Query options (similar to getLeadsBundle)
 * @returns {Promise<Object>} Bundle containing contacts, stats, users, employees, accounts, pagination, meta
 */
export async function getContactsBundle(options = {}) {
  const {
    tenant_id,
    page = 1,
    page_size = 25,
    search = '',
    status = 'all',
    assigned_to = 'all',
    include_test_data = true,
    tags = ''
  } = options;

  const cacheKey = JSON.stringify({
    type: 'contacts',
    tenant_id,
    page,
    page_size,
    search,
    status,
    assigned_to,
    include_test_data,
    tags
  });

  const cached = recentResults.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < RESULT_CACHE_TTL) {
    if (import.meta.env.DEV) {
      console.log('[Bundles] Returning cached result for contacts:', cacheKey);
    }
    return cached.data;
  }

  if (pendingRequests.has(cacheKey)) {
    if (import.meta.env.DEV) {
      console.log('[Bundles] Deduplicating in-flight request for contacts:', cacheKey);
    }
    return pendingRequests.get(cacheKey);
  }

  const fetchPromise = _fetchContactsBundle(options).then(result => {
    recentResults.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
  });

  pendingRequests.set(cacheKey, fetchPromise);
  fetchPromise.finally(() => {
    pendingRequests.delete(cacheKey);
  });

  return fetchPromise;
}

async function _fetchContactsBundle(options) {
  try {
    const queryParams = new URLSearchParams();

    Object.entries(options).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        queryParams.append(key, value);
      }
    });

    const url = `${BACKEND_URL}/api/bundles/contacts?${queryParams}`;
    const response = await fetch(url, {
      credentials: 'include',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const json = await response.json();
    return json?.data || json;

  } catch (error) {
    logger.error('[Bundles] Error fetching contacts bundle:', error);
    return {
      contacts: [],
      stats: { total: 0, active: 0, prospect: 0, customer: 0, inactive: 0 },
      users: [],
      employees: [],
      accounts: [],
      pagination: { page: 1, page_size: 25, total_items: 0, total_pages: 0 },
      meta: { tenant_id: options.tenant_id, generated_at: new Date().toISOString(), source: 'error_fallback' }
    };
  }
}

/**
 * Fetch opportunities bundle - includes opportunities, users, employees, accounts, contacts, leads, and stats
 *
 * @param {Object} options - Query options (stage instead of status)
 * @returns {Promise<Object>} Bundle containing opportunities, stats, users, employees, accounts, contacts, leads, pagination, meta
 */
export async function getOpportunitiesBundle(options = {}) {
  const {
    tenant_id,
    page = 1,
    page_size = 25,
    search = '',
    stage = 'all',
    assigned_to = 'all',
    include_test_data = true,
    tags = ''
  } = options;

  const cacheKey = JSON.stringify({
    type: 'opportunities',
    tenant_id,
    page,
    page_size,
    search,
    stage,
    assigned_to,
    include_test_data,
    tags
  });

  const cached = recentResults.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < RESULT_CACHE_TTL) {
    if (import.meta.env.DEV) {
      console.log('[Bundles] Returning cached result for opportunities:', cacheKey);
    }
    return cached.data;
  }

  if (pendingRequests.has(cacheKey)) {
    if (import.meta.env.DEV) {
      console.log('[Bundles] Deduplicating in-flight request for opportunities:', cacheKey);
    }
    return pendingRequests.get(cacheKey);
  }

  const fetchPromise = _fetchOpportunitiesBundle(options).then(result => {
    recentResults.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
  });

  pendingRequests.set(cacheKey, fetchPromise);
  fetchPromise.finally(() => {
    pendingRequests.delete(cacheKey);
  });

  return fetchPromise;
}

async function _fetchOpportunitiesBundle(options) {
  try {
    const queryParams = new URLSearchParams();

    Object.entries(options).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        queryParams.append(key, value);
      }
    });

    const url = `${BACKEND_URL}/api/bundles/opportunities?${queryParams}`;
    const response = await fetch(url, {
      credentials: 'include',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const json = await response.json();
    return json?.data || json;

  } catch (error) {
    logger.error('[Bundles] Error fetching opportunities bundle:', error);
    return {
      opportunities: [],
      stats: { total: 0, prospecting: 0, qualification: 0, proposal: 0, negotiation: 0, closed_won: 0, closed_lost: 0 },
      users: [],
      employees: [],
      accounts: [],
      contacts: [],
      leads: [],
      pagination: { page: 1, page_size: 25, total_items: 0, total_pages: 0 },
      meta: { tenant_id: options.tenant_id, generated_at: new Date().toISOString(), source: 'error_fallback' }
    };
  }
}

/**
 * Clear bundle cache (useful after mutations)
 * @param {string} type - Bundle type ('leads', 'contacts', 'opportunities', or 'all')
 */
export function clearBundleCache(type = 'all') {
  if (type === 'all') {
    recentResults.clear();
    pendingRequests.clear();
  } else {
    // Clear only matching cache keys
    for (const [key, value] of recentResults.entries()) {
      try {
        const parsed = JSON.parse(key);
        if (parsed.type === type) {
          recentResults.delete(key);
        }
      } catch {
        // Invalid key, skip
      }
    }
    for (const [key] of pendingRequests.entries()) {
      try {
        const parsed = JSON.parse(key);
        if (parsed.type === type) {
          pendingRequests.delete(key);
        }
      } catch {
        // Invalid key, skip
      }
    }
  }

  if (import.meta.env.DEV) {
    console.log(`[Bundles] Cleared ${type} cache`);
  }
}
