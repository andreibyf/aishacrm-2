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
import { estimate } from '../lib/growth/etaEstimator.js';
import {
  createInsightRun,
  getCurrentInsight,
  getInsightById,
  listOpportunities,
  getOpportunityDetail,
  dismissOpportunity,
  actionOpportunity,
  getDashboard,
} from '../lib/growth/insightService.js';
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

  // -------------------------------------------------------------------------
  // Insight runs
  // -------------------------------------------------------------------------

  /**
   * POST /api/v2/growth/insights
   * Kick off an async insight run. 7-day cooldown (superadmin-exempt); the
   * background worker performs the synthesis — this only gates + inserts the
   * `running` row and returns an ETA.
   */
  router.post('/insights', async (req, res) => {
    const tenantId = req.tenant?.id;
    if (!tenantId) {
      return res.status(400).json({ status: 'error', message: 'tenant context is required' });
    }

    try {
      const supabase = getSupabaseClient();
      const { status, body } = await createInsightRun(
        supabase,
        { tenantId, user: req.user },
        { getProfile: getOrSeedProfile, estimate },
      );
      res.status(status).json(body);
    } catch (error) {
      logger.error('[Growth] Error creating insight run:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  /**
   * GET /api/v2/growth/insights/current
   * Latest insight row for the tenant (or { insight: null }).
   */
  router.get('/insights/current', async (req, res) => {
    const tenantId = req.tenant?.id;
    if (!tenantId) {
      return res.status(400).json({ status: 'error', message: 'tenant context is required' });
    }

    try {
      const supabase = getSupabaseClient();
      const { status, body } = await getCurrentInsight(supabase, { tenantId });
      res.status(status).json(body);
    } catch (error) {
      logger.error('[Growth] Error getting current insight:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  /**
   * GET /api/v2/growth/insights/:id
   * A specific insight run (tenant-scoped; 404 if not found).
   */
  router.get('/insights/:id', async (req, res) => {
    const tenantId = req.tenant?.id;
    if (!tenantId) {
      return res.status(400).json({ status: 'error', message: 'tenant context is required' });
    }

    try {
      const supabase = getSupabaseClient();
      const { status, body } = await getInsightById(supabase, { tenantId, id: req.params.id });
      res.status(status).json(body);
    } catch (error) {
      logger.error('[Growth] Error getting insight by id:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // -------------------------------------------------------------------------
  // Opportunities
  // -------------------------------------------------------------------------

  /**
   * GET /api/v2/growth/opportunities
   * List opportunities. Query params: type, status (default excludes
   * dismissed/expired), min_score. Sorted by score desc.
   */
  router.get('/opportunities', async (req, res) => {
    const tenantId = req.tenant?.id;
    if (!tenantId) {
      return res.status(400).json({ status: 'error', message: 'tenant context is required' });
    }

    try {
      const supabase = getSupabaseClient();
      const { status, body } = await listOpportunities(supabase, {
        tenantId,
        // `category` is the alias used by the Braid tool (`type` is a reserved
        // word in the Braid DSL and cannot be an object key there).
        type: req.query.type || req.query.category,
        status: req.query.status,
        min_score: req.query.min_score,
      });
      res.status(status).json(body);
    } catch (error) {
      logger.error('[Growth] Error listing opportunities:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  /**
   * GET /api/v2/growth/opportunities/:id
   * One opportunity plus its provenance demand_signals (signal_ids).
   */
  router.get('/opportunities/:id', async (req, res) => {
    const tenantId = req.tenant?.id;
    if (!tenantId) {
      return res.status(400).json({ status: 'error', message: 'tenant context is required' });
    }

    try {
      const supabase = getSupabaseClient();
      const { status, body } = await getOpportunityDetail(supabase, {
        tenantId,
        id: req.params.id,
      });
      res.status(status).json(body);
    } catch (error) {
      logger.error('[Growth] Error getting opportunity detail:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  /**
   * POST /api/v2/growth/opportunities/:id/dismiss
   * Dismiss an opportunity, stashing an optional reason.
   */
  router.post('/opportunities/:id/dismiss', async (req, res) => {
    const tenantId = req.tenant?.id;
    if (!tenantId) {
      return res.status(400).json({ status: 'error', message: 'tenant context is required' });
    }

    try {
      const supabase = getSupabaseClient();
      const { status, body } = await dismissOpportunity(supabase, {
        tenantId,
        id: req.params.id,
        reason: req.body?.reason,
      });
      res.status(status).json(body);
    } catch (error) {
      logger.error('[Growth] Error dismissing opportunity:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  /**
   * POST /api/v2/growth/opportunities/:id/action
   * Execute the opportunity's action via the (default) dispatcher, stamp
   * actioned_entity, and mark it actioned.
   */
  router.post('/opportunities/:id/action', async (req, res) => {
    const tenantId = req.tenant?.id;
    if (!tenantId) {
      return res.status(400).json({ status: 'error', message: 'tenant context is required' });
    }

    try {
      const supabase = getSupabaseClient();
      const { status, body } = await actionOpportunity(supabase, {
        tenantId,
        id: req.params.id,
        overrides: req.body?.overrides || {},
      });
      res.status(status).json(body);
    } catch (error) {
      logger.error('[Growth] Error actioning opportunity:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // -------------------------------------------------------------------------
  // Dashboard bundle
  // -------------------------------------------------------------------------

  /**
   * GET /api/v2/growth/dashboard
   * Bundle: latest insight + top 3 open opportunities by score.
   */
  router.get('/dashboard', async (req, res) => {
    const tenantId = req.tenant?.id;
    if (!tenantId) {
      return res.status(400).json({ status: 'error', message: 'tenant context is required' });
    }

    try {
      const supabase = getSupabaseClient();
      const { status, body } = await getDashboard(supabase, { tenantId });
      res.status(status).json(body);
    } catch (error) {
      logger.error('[Growth] Error getting dashboard:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
