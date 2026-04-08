/**
 * Scheduler Bidirectional Sync Routes
 *
 * GET  /api/calcom-sync/status   — check scheduling integration status for this tenant
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

async function assessCalcomIntegrationReadiness(db, { config, apiCredentials }) {
  const issues = [];
  const userId = Number(config?.calcom_user_id);
  const eventTypeId = Number(config?.event_type_id);

  if (!db) {
    issues.push('Scheduler database not available');
    return { ready: false, issues };
  }
  if (!Number.isFinite(userId) || userId <= 0) issues.push('Missing or invalid calcom_user_id');
  if (!Number.isFinite(eventTypeId) || eventTypeId <= 0) {
    issues.push('Missing or invalid event_type_id');
  }
  if (!apiCredentials?.webhook_secret) issues.push('Webhook secret not configured');

  if (Number.isFinite(userId) && userId > 0) {
    const r = await db.query('SELECT id FROM users WHERE id = $1 LIMIT 1', [userId]);
    if (!r.rows.length) issues.push(`Scheduler user ${userId} not found`);
  }

  if (Number.isFinite(eventTypeId) && eventTypeId > 0 && Number.isFinite(userId) && userId > 0) {
    const et = await db.query(
      'SELECT id FROM "EventType" WHERE id = $1 AND "userId" = $2 LIMIT 1',
      [eventTypeId, userId],
    );
    if (!et.rows.length) issues.push(`Event type ${eventTypeId} not found for user ${userId}`);

    const h = await db.query(
      'SELECT 1 FROM "Host" WHERE "eventTypeId" = $1 AND "userId" = $2 LIMIT 1',
      [eventTypeId, userId],
    );
    if (!h.rows.length) {
      issues.push(`Host mapping missing for event type ${eventTypeId} and user ${userId}`);
    }

    const ue = await db.query(
      'SELECT 1 FROM "_user_eventtype" WHERE "A" = $1 AND "B" = $2 LIMIT 1',
      [eventTypeId, userId],
    );
    if (!ue.rows.length) {
      issues.push(`User-event mapping missing for event type ${eventTypeId} and user ${userId}`);
    }
  }

  const rawCalLink = String(config?.cal_link || '').trim();
  if (rawCalLink) {
    const validation = await validateCalcomLink(db, rawCalLink);
    if (!validation.valid) {
      issues.push(`Stored cal_link is invalid (${validation.reason || 'unknown reason'})`);
    }
  }

  return { ready: issues.length === 0, issues };
}

export default function createCalcomSyncRoutes() {
  const router = express.Router();
  router.use(validateTenantAccess);

  function resolveTenantId(req) {
    const id = req.tenant?.id || req.query?.tenant_id || req.body?.tenant_id;
    if (!id) return { error: 'tenant_id is required' };
    return { tenant_id: id };
  }

  // GET /api/calcom-sync/status
  router.get('/status', requireAdminRole, async (req, res) => {
    try {
      const { tenant_id, error } = resolveTenantId(req);
      if (error) return res.status(400).json({ status: 'error', message: error });

      const supabase = getSupabaseClient();
      const { data: rows } = await supabase
        .from('tenant_integrations')
        .select(
          'id, is_active, config, api_credentials, sync_status, error_message, last_sync, updated_at',
        )
        .eq('tenant_id', tenant_id)
        .eq('integration_type', 'calcom')
        .order('is_active', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1);
      const data = rows?.[0] || null;

      if (!data) {
        return res.json({
          status: 'success',
          data: { connected: false, bidirectional_sync_enabled: false },
        });
      }

      const db = getCalcomDb();
      const readiness = await assessCalcomIntegrationReadiness(db, {
        config: data.config || {},
        apiCredentials: data.api_credentials || {},
      });
      const connected = !!(data.is_active && readiness.ready);
      const healthError = readiness.ready ? null : readiness.issues.join(' | ');

      res.json({
        status: 'success',
        data: {
          connected,
          sync_status: connected ? data.sync_status || 'connected' : 'error',
          error_message: healthError || data.error_message || null,
          last_sync: data.last_sync || null,
          cal_link: data.config?.cal_link || null,
          calcom_user_id: data.config?.calcom_user_id || null,
          event_type_id: data.config?.event_type_id || null,
          auto_provision: data.config?.auto_provision !== false,
          webhook_configured: !!data.api_credentials?.webhook_secret,
          calcom_db_available: !!db,
          health_issues: readiness.issues,
          bidirectional_sync_enabled: !!(
            data.is_active &&
            readiness.ready &&
            data.config?.event_type_id
          ),
          last_updated: data.updated_at,
        },
      });
    } catch (err) {
      logger.error('[CalcomSync] Status check error:', err);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // POST /api/calcom-sync/trigger
  router.post('/trigger', requireAdminRole, async (req, res) => {
    try {
      const { tenant_id, error } = resolveTenantId(req);
      if (error) return res.status(400).json({ status: 'error', message: error });

      logger.info('[CalcomSync] Full sync triggered', { tenant_id });
      const result = await fullBidirectionalSync(tenant_id);

      const supabase = getSupabaseClient();
      const { data: rows } = await supabase
        .from('tenant_integrations')
        .select('is_active, config, api_credentials')
        .eq('tenant_id', tenant_id)
        .eq('integration_type', 'calcom')
        .order('is_active', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1);
      const integration = rows?.[0] || null;

      const readiness = integration
        ? await assessCalcomIntegrationReadiness(getCalcomDb(), {
            config: integration.config || {},
            apiCredentials: integration.api_credentials || {},
          })
        : { ready: false, issues: ['No scheduling integration row found'] };

      const allErrors = [...(result.errors || []), ...readiness.issues];
      const hasErrors = allErrors.length > 0;

      await updateCalcomIntegrationStatus(tenant_id, {
        sync_status: hasErrors ? 'error' : 'connected',
        error_message: hasErrors ? allErrors.slice(0, 5).join(' | ') : null,
        last_sync: hasErrors ? undefined : new Date().toISOString(),
      });

      res.json({
        status: 'success',
        data: {
          bookings_pulled: result.pulled,
          activities_pushed: result.pushed,
          errors: allErrors,
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
      const { data: integrationRows } = await supabase
        .from('tenant_integrations')
        .select('config')
        .eq('tenant_id', tenant_id)
        .eq('integration_type', 'calcom')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1);
      const integration = integrationRows?.[0] || null;

      if (!integration) {
        return res
          .status(404)
          .json({ status: 'error', message: 'No active scheduling integration found' });
      }

      const config = integration.config || {};

      // Already stored — validate it; if stale, fall through to re-derive from event_type_id
      if (config.cal_link) {
        const validation = await validateCalcomLink(getCalcomDb(), config.cal_link);
        if (validation.valid) {
          return res.json({ status: 'success', data: { cal_link: validation.calLink } });
        }
        // Stale / deleted slug — fall through to re-derive from event_type_id below
        logger.warn(
          '[CalcomSync] Stored cal_link failed validation, re-deriving from event_type_id',
          {
            cal_link: config.cal_link,
          },
        );
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
        return res
          .status(503)
          .json({ status: 'error', message: 'Scheduler database not available' });
      }

      const userResult = await db.query('SELECT username FROM users WHERE id = $1 LIMIT 1', [
        userId,
      ]);
      if (!userResult.rows.length) {
        return res
          .status(404)
          .json({ status: 'error', message: `Scheduler user ${userId} not found` });
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
          message: 'Booking page is not configured or no longer exists',
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
        return res
          .status(503)
          .json({ status: 'error', message: 'Scheduler database not available' });
      }

      const validation = await validateCalcomLink(db, raw);
      if (!validation.valid) {
        return res.status(404).json({
          status: 'error',
          valid: false,
          reason: validation.reason,
          message: 'Booking page is not configured or no longer exists',
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
  // Resolve a scheduler username to numeric user ID + available event types.
  // The username is extracted from the cal link slug (e.g. "jane/30min" → "jane").
  router.get('/lookup-user', requireAdminRole, async (req, res) => {
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
          .json({ status: 'error', message: 'Scheduler database not configured' });
      }

      const userResult = await db.query(
        'SELECT id, name, email, username FROM users WHERE username = $1 LIMIT 1',
        [username],
      );

      if (!userResult.rows.length) {
        return res.status(404).json({
          status: 'error',
          message: `No scheduler user found with username "${username}"`,
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
  router.get('/import-personal-calendar', requireAdminRole, async (req, res) => {
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
