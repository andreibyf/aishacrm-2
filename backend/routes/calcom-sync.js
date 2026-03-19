/**
 * Cal.com Bidirectional Sync Routes
 *
 * GET  /api/calcom-sync/status   — check Cal.com integration status for this tenant
 * POST /api/calcom-sync/trigger  — admin: run a full bidirectional sync
 *
 * Admin-only (requireAdminRole).
 */

import express from 'express';
import { validateTenantAccess, requireAdminRole } from '../middleware/validateTenant.js';
import { fullBidirectionalSync } from '../lib/calcomSyncService.js';
import { getSupabaseClient } from '../lib/supabase-db.js';
import logger from '../lib/logger.js';

export default function createCalcomSyncRoutes() {
  const router = express.Router();
  router.use(validateTenantAccess);
  router.use(requireAdminRole);

  function resolveTenantId(req) {
    const id = req.tenant?.id || req.query?.tenant_id || req.body?.tenant_id;
    if (!id) return { error: 'tenant_id is required' };
    return { tenant_id: id };
  }

  // GET /api/calcom-sync/status
  router.get('/status', async (req, res) => {
    try {
      const { tenant_id, error } = resolveTenantId(req);
      if (error) return res.status(400).json({ status: 'error', message: error });

      const supabase = getSupabaseClient();
      const { data } = await supabase
        .from('tenant_integrations')
        .select('id, is_active, config, updated_at')
        .eq('tenant_id', tenant_id)
        .eq('integration_type', 'calcom')
        .maybeSingle();

      if (!data) {
        return res.json({
          status: 'success',
          data: { connected: false, bidirectional_sync_enabled: false },
        });
      }

      res.json({
        status: 'success',
        data: {
          connected: data.is_active,
          cal_link: data.config?.cal_link || null,
          event_type_id: data.config?.event_type_id || null,
          // CRM→Cal.com push only works when event_type_id is configured
          bidirectional_sync_enabled: !!(data.is_active && data.config?.event_type_id),
          last_updated: data.updated_at,
        },
      });
    } catch (err) {
      logger.error('[CalcomSync] Status check error:', err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // POST /api/calcom-sync/trigger
  router.post('/trigger', async (req, res) => {
    try {
      const { tenant_id, error } = resolveTenantId(req);
      if (error) return res.status(400).json({ status: 'error', message: error });

      logger.info('[CalcomSync] Full sync triggered', { tenant_id });
      const result = await fullBidirectionalSync(tenant_id);

      res.json({
        status: 'success',
        data: {
          bookings_pulled: result.pulled,
          activities_pushed: result.pushed,
          errors: result.errors,
        },
      });
    } catch (err) {
      logger.error('[CalcomSync] Trigger error:', err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  return router;
}
