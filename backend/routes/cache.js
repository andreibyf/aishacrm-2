/**
 * Cache management routes
 * Provides API endpoints for cache invalidation (used by frontend Refresh buttons)
 */

import express from 'express';
import cacheManager from '../lib/cacheManager.js';
import logger from '../lib/logger.js';

export default function createCacheRoutes() {
  const router = express.Router();

  /**
   * POST /api/cache/invalidate
   * Invalidate backend Redis cache for specific modules within a tenant.
   *
   * Body: { tenant_id: string, modules: string[] }
   * modules: array of module names matching cacheList keys
   *   e.g. ['leads', 'contacts', 'accounts', 'opportunities', 'activities', 'bizdevsources', 'users', 'employees']
   *
   * If modules is empty or ['*'], invalidates ALL cache for the tenant.
   */
  router.post('/invalidate', async (req, res) => {
    try {
      const { tenant_id, modules = [] } = req.body;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      let invalidated = 0;

      if (modules.length === 0 || (modules.length === 1 && modules[0] === '*')) {
        // Invalidate ALL cache for this tenant
        await cacheManager.invalidateAllTenant(tenant_id);
        invalidated = -1; // -1 means "all"
        logger.info(`[Cache API] Invalidated ALL cache for tenant ${tenant_id}`);
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
