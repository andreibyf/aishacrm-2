/**
 * Tenant Resolution Helpers
 * 
 * Provides utilities for converting tenant name strings to UUIDs
 * and managing tenant context across the application.
 * 
 * After migration 032_normalize_foreign_keys.sql, all tenant_id columns
 * are UUID foreign keys referencing tenant.id. This module handles the
 * conversion from the tenant name string (e.g., 'labor-depot') to the UUID.
 */

import pgPool from './pgPool.js';

// In-memory cache for tenant UUID lookups
const tenantCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get tenant UUID from tenant name string
 * @param {string} tenantName - The tenant name (e.g., 'labor-depot', 'local-tenant-001')
 * @returns {Promise<string>} - The tenant UUID
 * @throws {Error} - If tenant not found
 */
export async function getTenantUuid(tenantName) {
  if (!tenantName) {
    throw new Error('Tenant name is required');
  }

  // Check cache first
  const cached = tenantCache.get(tenantName);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.uuid;
  }

  // Query database
  const result = await pgPool.query(
    'SELECT id FROM tenant WHERE tenant_id = $1',
    [tenantName]
  );

  if (!result.rows[0]) {
    throw new Error(`Tenant not found: ${tenantName}`);
  }

  const uuid = result.rows[0].id;

  // Cache the result
  tenantCache.set(tenantName, {
    uuid,
    timestamp: Date.now()
  });

  return uuid;
}

/**
 * Get tenant name from UUID
 * @param {string} tenantUuid - The tenant UUID
 * @returns {Promise<string>} - The tenant name
 * @throws {Error} - If tenant not found
 */
export async function getTenantName(tenantUuid) {
  if (!tenantUuid) {
    throw new Error('Tenant UUID is required');
  }

  // Check cache (reverse lookup)
  for (const [name, cached] of tenantCache.entries()) {
    if (cached.uuid === tenantUuid && Date.now() - cached.timestamp < CACHE_TTL) {
      return name;
    }
  }

  // Query database
  const result = await pgPool.query(
    'SELECT tenant_id FROM tenant WHERE id = $1',
    [tenantUuid]
  );

  if (!result.rows[0]) {
    throw new Error(`Tenant not found with UUID: ${tenantUuid}`);
  }

  const name = result.rows[0].tenant_id;

  // Cache the result
  tenantCache.set(name, {
    uuid: tenantUuid,
    timestamp: Date.now()
  });

  return name;
}

/**
 * Batch convert tenant names to UUIDs
 * @param {string[]} tenantNames - Array of tenant names
 * @returns {Promise<Map<string, string>>} - Map of tenant name -> UUID
 */
export async function getTenantUuidBatch(tenantNames) {
  if (!tenantNames || tenantNames.length === 0) {
    return new Map();
  }

  const uniqueNames = [...new Set(tenantNames)];
  const result = new Map();
  const uncached = [];

  // Check cache first
  for (const name of uniqueNames) {
    const cached = tenantCache.get(name);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      result.set(name, cached.uuid);
    } else {
      uncached.push(name);
    }
  }

  // Query for uncached names
  if (uncached.length > 0) {
    const queryResult = await pgPool.query(
      'SELECT tenant_id, id FROM tenant WHERE tenant_id = ANY($1::text[])',
      [uncached]
    );

    for (const row of queryResult.rows) {
      const uuid = row.id;
      const name = row.tenant_id;
      
      result.set(name, uuid);
      
      // Cache the result
      tenantCache.set(name, {
        uuid,
        timestamp: Date.now()
      });
    }
  }

  // Check for missing tenants
  for (const name of uniqueNames) {
    if (!result.has(name)) {
      throw new Error(`Tenant not found: ${name}`);
    }
  }

  return result;
}

/**
 * Middleware to convert tenant_id from string to UUID
 * Use this middleware on routes that need tenant context
 */
export function resolveTenantMiddleware(req, res, next) {
  const extractTenantId = async () => {
    // Check query params, body, and params for tenant_id
    const tenantName = req.query.tenant_id || req.body.tenant_id || req.params.tenant_id;
    
    if (!tenantName) {
      return next(); // No tenant_id provided, let route handle it
    }

    try {
      const tenantUuid = await getTenantUuid(tenantName);
      
      // Store both the original name and UUID for convenience
      req.tenantName = tenantName;
      req.tenantUuid = tenantUuid;
      
      // Override tenant_id in query/body with UUID
      if (req.query.tenant_id) {
        req.query.tenant_id_uuid = tenantUuid;
      }
      if (req.body.tenant_id) {
        req.body.tenant_id_uuid = tenantUuid;
      }
      
      next();
    } catch (error) {
      res.status(404).json({
        status: 'error',
        message: error.message
      });
    }
  };

  extractTenantId();
}

/**
 * Clear the tenant cache (useful for testing or after tenant updates)
 */
export function clearTenantCache() {
  tenantCache.clear();
}

/**
 * Get cache statistics
 */
export function getTenantCacheStats() {
  return {
    size: tenantCache.size,
    entries: Array.from(tenantCache.entries()).map(([name, data]) => ({
      name,
      uuid: data.uuid,
      age_ms: Date.now() - data.timestamp
    }))
  };
}

export default {
  getTenantUuid,
  getTenantName,
  getTenantUuidBatch,
  resolveTenantMiddleware,
  clearTenantCache,
  getTenantCacheStats
};
