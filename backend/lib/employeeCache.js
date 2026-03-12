/**
 * Employee Cache
 * Redis-backed cache for employee ID → name lookups
 * Employees don't change frequently, so we can cache aggressively
 */

import cacheManager from './cacheManager.js';
import logger from './logger.js';

// Cache TTL: 1 hour - employees don't change frequently
const EMPLOYEE_CACHE_TTL = 3600;

// Key prefix for employee lookups.
// Format: employeeCache:tenant:<uuid> — use KEYS employeeCache:* to inspect.
const CACHE_PREFIX = 'employeeCache';

/**
 * Generate cache key for tenant's employee map
 * @param {string} tenantId - Tenant UUID
 * @returns {string} Cache key
 */
function getTenantKey(tenantId) {
  return `${CACHE_PREFIX}:tenant:${tenantId}`;
}
// Resulting key shape: employeeCache:tenant:<uuid>

/**
 * Get cached employee map for a tenant
 * @param {string} tenantId - Tenant UUID
 * @returns {Promise<Object|null>} Map of employee_id → name, or null if not cached
 */
export async function getCachedEmployeeMap(tenantId) {
  if (!cacheManager.connected) return null;

  try {
    const key = getTenantKey(tenantId);
    const data = await cacheManager.client.get(key);
    
    if (!data) return null;
    
    const parsed = JSON.parse(data);
    logger.debug({ tenantId, count: Object.keys(parsed).length }, '[EmployeeCache] Cache hit');
    return parsed;
  } catch (error) {
    logger.error({ err: error, tenantId }, '[EmployeeCache] Get error');
    return null;
  }
}

/**
 * Set employee map cache for a tenant
 * @param {string} tenantId - Tenant UUID
 * @param {Object} employeeMap - Map of employee_id → name
 * @returns {Promise<boolean>} Success status
 */
export async function setCachedEmployeeMap(tenantId, employeeMap) {
  if (!cacheManager.connected) return false;

  try {
    const key = getTenantKey(tenantId);
    await cacheManager.client.setEx(key, EMPLOYEE_CACHE_TTL, JSON.stringify(employeeMap));
    logger.debug({ tenantId, count: Object.keys(employeeMap).length }, '[EmployeeCache] Cache set');
    return true;
  } catch (error) {
    logger.error({ err: error, tenantId }, '[EmployeeCache] Set error');
    return false;
  }
}

/**
 * Invalidate employee cache for a tenant
 * Call this when employees are created, updated, or deleted
 * @param {string} tenantId - Tenant UUID
 * @returns {Promise<boolean>} Success status
 */
export async function invalidateEmployeeCache(tenantId) {
  if (!cacheManager.connected) return false;

  try {
    const key = getTenantKey(tenantId);
    await cacheManager.client.del(key);
    logger.debug({ tenantId }, '[EmployeeCache] Cache invalidated');
    return true;
  } catch (error) {
    logger.error({ err: error, tenantId }, '[EmployeeCache] Invalidate error');
    return false;
  }
}

/**
 * Build employee map from database and cache it
 * @param {object} supabase - Supabase client
 * @param {string} tenantId - Tenant UUID
 * @returns {Promise<Object>} Map of employee_id → name
 */
export async function buildAndCacheEmployeeMap(supabase, tenantId) {
  try {
    // Fetch ALL employees (including inactive/terminated) so historical
    // assigned_to references still resolve to a name.
    const { data: employees, error } = await supabase
      .from('employees')
      .select('id, first_name, last_name, email')
      .eq('tenant_id', tenantId);

    if (error) {
      logger.error({ err: error, tenantId }, '[EmployeeCache] Failed to fetch employees');
      return {};
    }

    // Build map: employee_id → full name
    const employeeMap = {};
    for (const emp of employees || []) {
      const name = [emp.first_name, emp.last_name].filter(Boolean).join(' ').trim();
      employeeMap[emp.id] = name || emp.email || 'Unknown';
    }

    // Cache the map
    await setCachedEmployeeMap(tenantId, employeeMap);

    logger.info({ tenantId, count: Object.keys(employeeMap).length }, '[EmployeeCache] Built and cached employee map');
    return employeeMap;
  } catch (error) {
    logger.error({ err: error, tenantId }, '[EmployeeCache] Build error');
    return {};
  }
}

/**
 * Get employee map with cache-through pattern
 * Returns cached data if available, otherwise fetches from DB and caches
 * @param {object} supabase - Supabase client
 * @param {string} tenantId - Tenant UUID
 * @returns {Promise<Object>} Map of employee_id → name
 */
export async function getEmployeeMap(supabase, tenantId) {
  // Try cache first
  const cached = await getCachedEmployeeMap(tenantId);
  if (cached) {
    return cached;
  }

  // Cache miss - build from DB
  return buildAndCacheEmployeeMap(supabase, tenantId);
}

/**
 * Bulk resolve employee IDs to names
 * @param {object} supabase - Supabase client
 * @param {string} tenantId - Tenant UUID
 * @param {string[]} employeeIds - Array of employee UUIDs
 * @returns {Promise<Object>} Map of employee_id → name (only for requested IDs)
 */
export async function resolveEmployeeNames(supabase, tenantId, employeeIds) {
  if (!employeeIds || employeeIds.length === 0) {
    return {};
  }

  // Filter out nulls and invalid IDs
  const validIds = [...new Set(employeeIds.filter(id => id && typeof id === 'string'))];
  if (validIds.length === 0) {
    return {};
  }

  // Get full tenant map (leverages cache)
  const fullMap = await getEmployeeMap(supabase, tenantId);

  // Return only requested IDs
  const result = {};
  for (const id of validIds) {
    if (fullMap[id]) {
      result[id] = fullMap[id];
    }
  }

  return result;
}

export default {
  getCachedEmployeeMap,
  setCachedEmployeeMap,
  invalidateEmployeeCache,
  buildAndCacheEmployeeMap,
  getEmployeeMap,
  resolveEmployeeNames,
};
