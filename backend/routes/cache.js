/**
 * Cache management routes
 * Provides API endpoints for cache invalidation (used by frontend Refresh buttons)
 */

import express from 'express';
import cacheManager from '../lib/cacheManager.js';
import logger from '../lib/logger.js';

/** Allowlist of valid cache module names — prevents arbitrary keyspace scans. */
const VALID_MODULES = new Set([
  'leads',
  'contacts',
  'accounts',
  'opportunities',
  'activities',
  'bizdevsources',
  'users',
  'employees',
  'notes',
  'documents',
  'workflows',
  'reports',
]);

const MAX_MODULES = 20;

export default function createCacheRoutes() {
  const router = express.Router();

  /**
   * POST /api/cache/invalidate
   * Invalidate backend Redis cache for specific modules within a tenant.
   *
   * Uses req.tenant.id from validateTenantAccess middleware (body tenant_id is ignored).
   * Body: { modules: string[] }
   * modules: array of module names matching VALID_MODULES allowlist
   *   e.g. ['leads', 'contacts', 'accounts', 'opportunities', 'activities', 'bizdevsources', 'users', 'employees']
   *
   * If modules is empty or ['*'], invalidates ALL cache for the tenant.
   */
  router.post('/invalidate', async (req, res) => {
    try {
      // Use validated tenant from middleware — never trust body tenant_id
      const tenant_id = req.tenant?.id;
      const { modules: rawModules = [] } = req.body;

      if (!tenant_id) {
        return res
          .status(400)
          .json({ status: 'error', message: 'tenant_id is required (must be authenticated)' });
      }

      // Validate and de-duplicate modules against allowlist
      const isWildcard =
        rawModules.length === 0 || (rawModules.length === 1 && rawModules[0] === '*');
      const modules = isWildcard
        ? []
        : [
            ...new Set(rawModules.filter((m) => typeof m === 'string' && VALID_MODULES.has(m))),
          ].slice(0, MAX_MODULES);

      let invalidated = 0;

      if (isWildcard) {
        // Invalidate ALL cache for this tenant
        await cacheManager.invalidateAllTenant(tenant_id);
        invalidated = -1; // -1 means "all"
        logger.info(`[Cache API] Invalidated ALL cache for tenant ${tenant_id}`);
      } else if (modules.length === 0) {
        return res.status(400).json({
          status: 'error',
          message: 'No valid modules provided. Valid modules: ' + [...VALID_MODULES].join(', '),
        });
      } else {
        // Invalidate specific modules
        for (const mod of modules) {
          try {
            await cacheManager.invalidateTenant(tenant_id, mod);
            invalidated++;
          } catch (err) {
            logger.warn(`[Cache API] Failed to invalidate ${mod} for ${tenant_id}:`, err.message);
          }
        }
        logger.info(
          `[Cache API] Invalidated ${invalidated} module(s) for tenant ${tenant_id}: ${modules.join(', ')}`,
        );
      }

      // Also invalidate dashboard if any CRM entity modules were busted
      const DASHBOARD_MODULES = new Set([
        'leads',
        'contacts',
        'accounts',
        'opportunities',
        'activities',
        'bizdevsources',
      ]);
      const hasDashboardModule = modules.some((m) => DASHBOARD_MODULES.has(m));
      if (hasDashboardModule || invalidated === -1) {
        try {
          await cacheManager.invalidateDashboard(tenant_id);
        } catch {
          // non-fatal
        }
      }

      res.json({
        status: 'success',
        data: {
          tenant_id,
          modules: invalidated === -1 ? ['*'] : modules,
          invalidated: invalidated === -1 ? 'all' : invalidated,
        },
      });
    } catch (error) {
      logger.error('[Cache API] Error:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
