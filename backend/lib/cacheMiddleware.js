/**
 * Cache middleware for API routes
 * Provides request-level caching for GET endpoints
 */

import cacheManager from './cacheManager.js';

/**
 * Cache middleware for list endpoints
 * @param {string} module - Module name (accounts, leads, contacts, bizdevsources)
 * @param {number} ttl - Cache TTL in seconds (optional)
 */
export function cacheList(module, ttl = 180) {
  return async (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Get tenant_id from query params first (explicit override), then fall back to authenticated user's tenant
    const tenantId = req.query?.tenant_id || req.user?.tenant_id;
    if (!tenantId) {
      return next();
    }

    // Generate cache key from query params + user ID
    // User ID is included because visibility scoping means different users
    // see different data for the same query params.
    const operation = 'list';
    const userId = req.user?.id || 'anon';
    const params = {
      query: req.query,
      path: req.path,
      userId,
    };

    try {
      const key = cacheManager.generateKey(module, tenantId, operation, params);
      const cached = await cacheManager.get(key);

      if (cached !== null) {
        console.log(`[Cache] Hit: ${module} list for tenant ${tenantId}`);
        // Disable browser caching - use server-side Redis cache only
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
        return res.status(200).json(cached);
      }

      // Store original json method
      const originalJson = res.json.bind(res);

      // Override json method to cache response
      res.json = function (data) {
        if (res.statusCode === 200) {
          // Disable browser caching - use server-side Redis cache only
          res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
          cacheManager.set(key, data, ttl).catch((err) => {
            console.error('[Cache] Failed to cache response:', err);
          });
        }
        return originalJson(data);
      };

      next();
    } catch (error) {
      console.error('[Cache] Middleware error:', error);
      next();
    }
  };
}

/**
 * Cache middleware for detail endpoints
 * @param {string} module - Module name (accounts, leads, contacts, etc.)
 * @param {number} ttl - Cache TTL in seconds (optional, default 300s for detail views)
 */
export function cacheDetail(module, ttl = 300) {
  return async (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Get tenant_id from req.user (if validateTenant middleware was applied) or query params
    const tenantId = req.user?.tenant_id || req.query?.tenant_id;
    if (!tenantId) {
      return next();
    }

    // Generate cache key from resource ID, query params + user ID
    const operation = 'detail';
    const userId = req.user?.id || 'anon';
    const params = {
      id: req.params.id,
      query: req.query,
      path: req.path,
      userId,
    };

    try {
      const key = cacheManager.generateKey(module, tenantId, operation, params);
      const cached = await cacheManager.get(key);

      if (cached !== null) {
        console.log(`[Cache] Hit: ${module} detail ${req.params.id} for tenant ${tenantId}`);
        // Disable browser caching - use server-side Redis cache only
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
        return res.status(200).json(cached);
      }

      // Store original json method
      const originalJson = res.json.bind(res);

      // Override json method to cache response
      res.json = function (data) {
        if (res.statusCode === 200) {
          // Disable browser caching - use server-side Redis cache only
          res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
          cacheManager.set(key, data, ttl).catch((err) => {
            console.error('[Cache] Failed to cache detail response:', err);
          });
        }
        return originalJson(data);
      };

      next();
    } catch (error) {
      console.error('[Cache] Detail middleware error:', error);
      next();
    }
  };
}

/**
 * Invalidate cache after mutations (POST, PUT, DELETE)
 * Also invalidates dashboard bundle cache for CRM entity modules
 * @param {string} module - Module name
 */
// CRM modules that affect dashboard stats
const DASHBOARD_AFFECTING_MODULES = new Set([
  'leads',
  'contacts',
  'accounts',
  'opportunities',
  'activities',
  'bizdevsources',
]);

export function invalidateCache(module) {
  return async (req, res, next) => {
    // Store original json method (don't override res.send to avoid double-invalidation,
    // since Express's res.json internally calls res.send)
    const originalJson = res.json.bind(res);

    // Override res.json to invalidate cache on success before sending response
    res.json = async function (data) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        // Prefer canonical UUID from tenant middleware, fall back to query/body
        const tenantId =
          req.tenant?.id || req.user?.tenant_id || req.query?.tenant_id || req.body?.tenant_id;
        if (tenantId) {
          await cacheManager.invalidateTenant(tenantId, module);
          console.log(`[Cache] Invalidated: ${module} for tenant ${tenantId}`);

          if (DASHBOARD_AFFECTING_MODULES.has(module)) {
            await cacheManager.invalidateDashboard(tenantId);
            console.log(`[Cache] Invalidated: dashboard bundle for tenant ${tenantId}`);
          }
        }
      }
      return originalJson(data);
    };

    next();
  };
}

/**
 * Manual cache invalidation helper
 * Use in route handlers for fine-grained control.
 * For CRM entity mutations, prefer invalidateTenantAndDashboardCache()
 * which also busts the dashboard bundle cache.
 */
export async function invalidateTenantCache(tenantId, module) {
  try {
    await cacheManager.invalidateTenant(tenantId, module);
    console.log(`[Cache] Manual invalidation: ${module} for tenant ${tenantId}`);
  } catch (error) {
    console.error('[Cache] Manual invalidation failed:', error);
  }
}

/**
 * Invalidate both entity cache AND dashboard bundle cache.
 * Use this for any CRM entity mutation (create/update/delete) that
 * is NOT already wrapped by the invalidateCache() middleware.
 */
export async function invalidateTenantAndDashboardCache(tenantId, module) {
  await invalidateTenantCache(tenantId, module);
  if (DASHBOARD_AFFECTING_MODULES.has(module)) {
    try {
      await cacheManager.invalidateDashboard(tenantId);
      console.log(`[Cache] Manual dashboard invalidation for tenant ${tenantId}`);
    } catch (error) {
      console.error('[Cache] Manual dashboard invalidation failed:', error);
    }
  }
}

/**
 * Cache statistics endpoint helper
 */
export async function getCacheStats() {
  return await cacheManager.getStats();
}

export default {
  cacheList,
  cacheDetail,
  invalidateCache,
  invalidateTenantCache,
  invalidateTenantAndDashboardCache,
  getCacheStats,
};
