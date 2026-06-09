/**
 * Growth routes — OSINT Opportunity Intelligence (Phase 1).
 *
 * Mounted at /api/v2/growth. Phase 1 / Task 2 exposes the per-tenant
 * business_profile (manually-declared services × regions), seeded from the
 * tenant's own fields on first access.
 *
 * Tenant isolation: every route requires req.tenant.id (a UUID) populated by
 * the global tenant middleware. The tenant_id is stamped from that context;
 * client-supplied tenant_id / id are never trusted (see profileService).
 *
 * Factory pattern mirrors routes/suggestions.js: `createGrowthRoutes(pgPool)`
 * returns an express.Router and obtains the Supabase client via
 * getSupabaseClient().
 */

import express from 'express';
import { getSupabaseClient } from '../lib/supabase-db.js';
import { getOrSeedProfile, saveProfile } from '../lib/growth/profileService.js';
import logger from '../lib/logger.js';

// eslint-disable-next-line no-unused-vars -- pgPool kept for factory-signature parity with sibling routes
export default function createGrowthRoutes(pgPool) {
  const router = express.Router();

  /**
   * GET /api/v2/growth/profile
   * Return the tenant's business_profile, seeding one from the tenant row if
   * none exists yet.
   */
  router.get('/profile', async (req, res) => {
    const tenantId = req.tenant?.id;
    if (!tenantId) {
      return res.status(400).json({ status: 'error', message: 'tenant context is required' });
    }

    try {
      const supabase = getSupabaseClient();
      const profile = await getOrSeedProfile(supabase, tenantId);
      res.json({ status: 'success', data: { profile } });
    } catch (error) {
      logger.error('[Growth] Error getting business profile:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  /**
   * PUT /api/v2/growth/profile
   * Update the tenant's business_profile. Only whitelisted fields are persisted;
   * unknown keys (including tenant_id / id) are dropped server-side.
   */
  router.put('/profile', async (req, res) => {
    const tenantId = req.tenant?.id;
    if (!tenantId) {
      return res.status(400).json({ status: 'error', message: 'tenant context is required' });
    }

    try {
      const supabase = getSupabaseClient();
      const profile = await saveProfile(supabase, tenantId, req.body || {});
      res.json({ status: 'success', data: { profile } });
    } catch (error) {
      logger.error('[Growth] Error saving business profile:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
