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
import { importGoogleEvents } from '../lib/googleCalendarService.js';
import { importOutlookEvents } from '../lib/outlookCalendarService.js';
import { getSupabaseClient } from '../lib/supabase-db.js';
import { getCalcomDb } from '../lib/calcomDb.js';
import { validateCalcomLink } from '../lib/calcomLinkValidation.js';
import logger from '../lib/logger.js';

async function updateCalcomIntegrationStatus(tenantId, updates) {
  const supabase = getSupabaseClient();
  const nextUpdates = {
    ...updates,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('tenant_integrations')
    .update(nextUpdates)
    .eq('tenant_id', tenantId)
    .eq('integration_type', 'calcom');

  if (error) {
    logger.warn('[CalcomSync] Could not persist integration sync status', {
      tenantId,
      error: error.message,
    });
  }
}

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
        .select('id, is_active, config, api_credentials, sync_status, error_message, last_sync, updated_at')
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
          sync_status: data.sync_status || 'pending',
          error_message: data.error_message || null,
          last_sync: data.last_sync || null,
          cal_link: data.config?.cal_link || null,
          calcom_user_id: data.config?.calcom_user_id || null,
          event_type_id: data.config?.event_type_id || null,
          auto_provision: data.config?.auto_provision !== false,
          webhook_configured: !!data.api_credentials?.webhook_secret,
          calcom_db_available: !!getCalcomDb(),
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

      const hasErrors = (result.errors || []).length > 0;
      await updateCalcomIntegrationStatus(tenant_id, {
        sync_status: hasErrors ? 'error' : 'connected',
        error_message: hasErrors ? result.errors.slice(0, 5).join(' | ') : null,
        last_sync: hasErrors ? undefined : new Date().toISOString(),
      });

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

  // GET /api/calcom-sync/resolve-link?tenant_id=<uuid>
  // Derives the cal_link (username/event-slug) from the tenant's stored calcom_user_id + event_type_id.
  // Falls back to cal_link if already stored in config.
  router.get('/resolve-link', async (req, res) => {
    try {
      const { tenant_id, error } = resolveTenantId(req);
      if (error) return res.status(400).json({ status: 'error', message: error });

      const supabase = getSupabaseClient();
      const { data: integration } = await supabase
        .from('tenant_integrations')
        .select('config')
        .eq('tenant_id', tenant_id)
        .eq('integration_type', 'calcom')
        .eq('is_active', true)
        .maybeSingle();

      if (!integration) {
        return res
          .status(404)
          .json({ status: 'error', message: 'No active Cal.com integration found' });
      }

      const config = integration.config || {};

      // Already stored — return it directly
      if (config.cal_link) {
        const validation = await validateCalcomLink(getCalcomDb(), config.cal_link);
        if (validation.valid) {
          return res.json({ status: 'success', data: { cal_link: validation.calLink } });
        }
        return res.status(404).json({
          status: 'error',
          message: 'Cal.com booking page not configured or no longer exists',
        });
      }

      const userId = config.calcom_user_id;
      const eventTypeId = config.event_type_id;

      if (!userId) {
        return res
          .status(404)
          .json({ status: 'error', message: 'calcom_user_id not configured in integration' });
      }

      const db = getCalcomDb();
      if (!db) {
        return res.status(503).json({ status: 'error', message: 'Cal.com database not available' });
      }

      const userResult = await db.query('SELECT username FROM users WHERE id = $1 LIMIT 1', [
        userId,
      ]);
      if (!userResult.rows.length) {
        return res
          .status(404)
          .json({ status: 'error', message: `Cal.com user ${userId} not found` });
      }
      const username = userResult.rows[0].username;

      let slug = null;
      if (eventTypeId) {
        const etResult = await db.query('SELECT slug FROM "EventType" WHERE id = $1 LIMIT 1', [
          eventTypeId,
        ]);
        if (etResult.rows.length) slug = etResult.rows[0].slug;
      }

      const cal_link = slug ? `${username}/${slug}` : username;
      const validation = await validateCalcomLink(db, cal_link);

      if (!validation.valid) {
        return res.status(404).json({
          status: 'error',
          message: 'Cal.com booking page not configured or no longer exists',
        });
      }

      // Persist it back so future calls are instant
      await supabase
        .from('tenant_integrations')
        .update({ config: { ...config, cal_link: validation.calLink } })
        .eq('tenant_id', tenant_id)
        .eq('integration_type', 'calcom');

      res.json({ status: 'success', data: { cal_link: validation.calLink } });
    } catch (err) {
      logger.error('[CalcomSync] Resolve link error:', err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // GET /api/calcom-sync/validate-link?cal_link=<username/event-slug>
  router.get('/validate-link', async (req, res) => {
    try {
      const raw = req.query.cal_link || '';
      const db = getCalcomDb();
      if (!db) {
        return res.status(503).json({ status: 'error', message: 'Cal.com database not available' });
      }

      const validation = await validateCalcomLink(db, raw);
      if (!validation.valid) {
        return res.status(404).json({
          status: 'error',
          valid: false,
          reason: validation.reason,
          message: 'Cal.com booking page not configured or no longer exists',
        });
      }

      return res.json({
        status: 'success',
        valid: true,
        data: {
          cal_link: validation.calLink,
          username: validation.username,
          slug: validation.slug,
        },
      });
    } catch (err) {
      logger.error('[CalcomSync] Validate link error:', err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // GET /api/calcom-sync/lookup-user?username=<username>
  // Resolve a Cal.com username to numeric user ID + available event types.
  // The username is extracted from the cal link slug (e.g. "jane/30min" → "jane").
  router.get('/lookup-user', async (req, res) => {
    try {
      const raw = req.query.username || '';
      // Accept either "username" or "username/event-slug" formats
      const username = raw.split('/')[0].trim();
      if (!username) {
        return res
          .status(400)
          .json({ status: 'error', message: 'username query param is required' });
      }

      const db = getCalcomDb();
      if (!db) {
        return res
          .status(503)
          .json({ status: 'error', message: 'Cal.com database not configured' });
      }

      const userResult = await db.query(
        'SELECT id, name, email, username FROM users WHERE username = $1 LIMIT 1',
        [username],
      );

      if (!userResult.rows.length) {
        return res.status(404).json({
          status: 'error',
          message: `No Cal.com user found with username "${username}"`,
        });
      }

      const user = userResult.rows[0];

      const etResult = await db.query(
        `SELECT id, title, slug, length FROM "EventType"
         WHERE "userId" = $1 AND hidden = false
         ORDER BY id`,
        [user.id],
      );

      res.json({
        status: 'success',
        data: {
          user_id: user.id,
          name: user.name,
          email: user.email,
          username: user.username,
          event_types: etResult.rows.map((et) => ({
            id: et.id,
            title: et.title,
            slug: et.slug,
            length: et.length,
          })),
        },
      });
    } catch (err) {
      logger.error('[CalcomSync] Lookup user error:', err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // GET /api/calcom-sync/import-personal-calendar
  // Pull events from connected Google/Outlook calendars and create CRM activities.
  // Optional query param: ?since=<ISO8601> (defaults to 30 days ago)
  router.get('/import-personal-calendar', async (req, res) => {
    try {
      const { tenant_id, error } = resolveTenantId(req);
      if (error) return res.status(400).json({ status: 'error', message: error });

      const since = req.query.since || null;

      const [googleResult, outlookResult] = await Promise.all([
        importGoogleEvents(tenant_id, since).catch((err) => {
          logger.error('[CalcomSync] Google import error', { err: err.message });
          return { imported: 0, errors: 1 };
        }),
        importOutlookEvents(tenant_id, since).catch((err) => {
          logger.error('[CalcomSync] Outlook import error', { err: err.message });
          return { imported: 0, errors: 1 };
        }),
      ]);

      logger.info('[CalcomSync] Personal calendar import complete', {
        tenant_id,
        google: googleResult,
        outlook: outlookResult,
      });

      const totalErrors = (googleResult.errors || 0) + (outlookResult.errors || 0);
      await updateCalcomIntegrationStatus(tenant_id, {
        sync_status: totalErrors > 0 ? 'error' : 'connected',
        error_message: totalErrors > 0 ? 'One or more personal calendar imports failed' : null,
        last_sync: totalErrors > 0 ? undefined : new Date().toISOString(),
      });

      res.json({
        status: 'success',
        data: {
          google: googleResult,
          outlook: outlookResult,
          total_imported: googleResult.imported + outlookResult.imported,
          total_errors: googleResult.errors + outlookResult.errors,
        },
      });
    } catch (err) {
      logger.error('[CalcomSync] Import personal calendar error:', err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  return router;
}
