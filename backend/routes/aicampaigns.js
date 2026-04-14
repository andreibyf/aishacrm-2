// [2026-02-23 Claude] — AiCampaigns overhaul: aligned route with DB schema,
// expanded campaign types, delivery adapter pattern foundation
import express from 'express';
import { validateTenantAccess, enforceEmployeeDataScope } from '../middleware/validateTenant.js';
import { emitTenantWebhooks } from '../lib/webhookEmitter.js';
import logger from '../lib/logger.js';
import { resolveAudience } from '../lib/campaigns/resolveAudience.js';

// Valid campaign types — must match DB CHECK constraint
const VALID_CAMPAIGN_TYPES = [
  'call',
  'email',
  'sms',
  'linkedin',
  'whatsapp',
  'api_connector',
  'social_post',
  'sequence',
];

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeOptionalUuid(value) {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) {
    if (value.length !== 1) return null;
    return normalizeOptionalUuid(value[0]);
  }

  const asString = String(value).trim();
  if (!asString || asString === 'null' || asString === '[]') return null;
  return UUID_REGEX.test(asString) ? asString : null;
}

function normalizeTargetContacts(value) {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value) && value.length === 0) return null;
  return JSON.stringify(value);
}

export default function createAICampaignRoutes(pgPool) {
  const router = express.Router();
  router.use(validateTenantAccess);
  router.use(enforceEmployeeDataScope);

  // POST /api/aicampaigns/audience-preview
  router.post('/audience-preview', async (req, res) => {
    try {
      const { tenant_id, target_audience = {}, campaign_type = 'email' } = req.body || {};
      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const rows = await resolveAudience(pgPool, {
        tenant_id,
        audience: target_audience,
        campaignType: campaign_type,
      });

      return res.json({
        status: 'success',
        data: {
          total: rows.length,
          preview: rows.slice(0, 25),
        },
      });
    } catch (err) {
      logger.error('[AI Campaigns] Audience preview error:', err.message);
      return res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // ─── GET /api/aicampaigns — list with filters + pagination ──────────────────
  router.get('/', async (req, res) => {
    try {
      const { tenant_id, status, campaign_type, search, limit = 200, offset = 0 } = req.query;

      if (!tenant_id) {
        return res.json({
          status: 'success',
          data: { campaigns: [], total: 0, limit: 0, offset: 0 },
        });
      }

      const params = [tenant_id];
      let where = 'WHERE tenant_id = $1';

      if (status) {
        params.push(status);
        where += ` AND status = $${params.length}`;
      }
      if (campaign_type) {
        params.push(campaign_type);
        where += ` AND campaign_type = $${params.length}`;
      }
      if (search) {
        params.push(`%${search}%`);
        where += ` AND (name ILIKE $${params.length} OR description ILIKE $${params.length})`;
      }

      // Exclude test data from production queries unless explicitly requested
      if (req.query.include_test_data !== 'true') {
        where += ' AND (is_test_data = false OR is_test_data IS NULL)';
      }

      params.push(parseInt(limit), parseInt(offset));
      const query = `
        SELECT * FROM ai_campaign
        ${where}
        ORDER BY created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}
      `;
      const result = await pgPool.query(query, params);

      const countQuery = `SELECT COUNT(*) FROM ai_campaign ${where}`;
      const countResult = await pgPool.query(countQuery, params.slice(0, params.length - 2));

      res.json({
        status: 'success',
        data: {
          campaigns: result.rows,
          total: parseInt(countResult.rows[0].count, 10),
          limit: parseInt(limit),
          offset: parseInt(offset),
        },
      });
    } catch (err) {
      logger.error('[AI Campaigns] List error:', err.message);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // ─── GET /api/aicampaigns/:id ───────────────────────────────────────────────
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query || {};
      if (!tenant_id)
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });

      const result = await pgPool.query(
        'SELECT * FROM ai_campaign WHERE tenant_id = $1 AND id = $2',
        [tenant_id, id],
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'AI Campaign not found' });
      }
      res.json({ status: 'success', data: result.rows[0] });
    } catch (err) {
      logger.error('[AI Campaigns] Get error:', err.message);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // ─── POST /api/aicampaigns ──────────────────────────────────────────────────
  router.post('/', async (req, res) => {
    try {
      const {
        tenant_id,
        name,
        campaign_type = 'email',
        status = 'draft',
        description = null,
        assigned_to = null,
        target_contacts = [],
        target_audience = {},
        content = {},
        performance_metrics = {},
        metadata = {},
        is_test_data = false,
      } = req.body;

      if (!tenant_id)
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      if (!name) return res.status(400).json({ status: 'error', message: 'name is required' });

      // Validate campaign_type
      if (!VALID_CAMPAIGN_TYPES.includes(campaign_type)) {
        return res.status(400).json({
          status: 'error',
          message: `Invalid campaign_type: ${campaign_type}. Valid types: ${VALID_CAMPAIGN_TYPES.join(', ')}`,
        });
      }

      const safeAssignedTo = normalizeOptionalUuid(assigned_to);

      const query = `
        INSERT INTO ai_campaign (
          tenant_id, name, campaign_type, type, status, description,
          assigned_to, target_contacts, target_audience, content,
          performance_metrics, metadata, is_test_data, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
        RETURNING *
      `;
      const values = [
        tenant_id,
        name,
        campaign_type,
        campaign_type,
        status,
        description,
        safeAssignedTo,
        normalizeTargetContacts(target_contacts),
        JSON.stringify(target_audience),
        JSON.stringify(content),
        JSON.stringify(performance_metrics),
        JSON.stringify(metadata),
        is_test_data,
      ];

      const result = await pgPool.query(query, values);
      const created = result.rows[0];

      emitTenantWebhooks(pgPool, tenant_id, 'aicampaign.created', {
        id: created.id,
        name: created.name,
        status: created.status,
        campaign_type: created.campaign_type,
      }).catch(() => undefined);

      res.status(201).json({ status: 'success', data: created });
    } catch (err) {
      logger.error('[AI Campaigns] Create error:', err.message);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // ─── PUT /api/aicampaigns/:id ───────────────────────────────────────────────
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const {
        tenant_id: body_tenant_id,
        name,
        campaign_type,
        status,
        description,
        assigned_to,
        target_contacts,
        target_audience,
        content,
        performance_metrics,
        metadata,
      } = req.body;
      // Resolve tenant_id consistently: body → query → middleware-resolved tenant
      const tenant_id = body_tenant_id || req.query.tenant_id || req.tenant?.id;

      if (!tenant_id)
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });

      // Validate campaign_type if provided
      if (campaign_type && !VALID_CAMPAIGN_TYPES.includes(campaign_type)) {
        return res.status(400).json({
          status: 'error',
          message: `Invalid campaign_type: ${campaign_type}. Valid types: ${VALID_CAMPAIGN_TYPES.join(', ')}`,
        });
      }

      const safeAssignedTo = normalizeOptionalUuid(assigned_to);

      const update = `
        UPDATE ai_campaign
        SET name = COALESCE($3, name),
            campaign_type = COALESCE($4, campaign_type),
            type = COALESCE($4, type),
            status = COALESCE($5, status),
            description = COALESCE($6, description),
            assigned_to = COALESCE($7, assigned_to),
            target_contacts = COALESCE($8, target_contacts),
            target_audience = COALESCE($9, target_audience),
            content = COALESCE($10, content),
            performance_metrics = COALESCE($11, performance_metrics),
            metadata = COALESCE($12, metadata),
            updated_at = NOW()
        WHERE tenant_id = $1 AND id = $2
        RETURNING *
      `;
      const values = [
        tenant_id,
        id,
        name,
        campaign_type,
        status,
        description,
        safeAssignedTo,
        normalizeTargetContacts(target_contacts),
        target_audience ? JSON.stringify(target_audience) : null,
        content ? JSON.stringify(content) : null,
        performance_metrics ? JSON.stringify(performance_metrics) : null,
        metadata ? JSON.stringify(metadata) : null,
      ];
      const result = await pgPool.query(update, values);

      if (result.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'AI Campaign not found' });
      }
      res.json({ status: 'success', data: result.rows[0] });
    } catch (err) {
      logger.error('[AI Campaigns] Update error:', err.message);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // ─── DELETE /api/aicampaigns/:id ────────────────────────────────────────────
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query || {};
      if (!tenant_id)
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });

      const result = await pgPool.query(
        'DELETE FROM ai_campaign WHERE tenant_id = $1 AND id = $2 RETURNING id',
        [tenant_id, id],
      );
      if (result.rowCount === 0) {
        return res.status(404).json({ status: 'error', message: 'AI Campaign not found' });
      }
      res.json({ status: 'success', data: { id } });
    } catch (err) {
      logger.error('[AI Campaigns] Delete error:', err.message);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // ─── POST /api/aicampaigns/:id/start ────────────────────────────────────────
  router.post('/:id/start', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.body || {};
      if (!tenant_id)
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });

      const getR = await pgPool.query(
        'SELECT * FROM ai_campaign WHERE tenant_id = $1 AND id = $2 LIMIT 1',
        [tenant_id, id],
      );
      if (getR.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'AI Campaign not found' });
      }
      const campaign = getR.rows[0];
      let metadataObj =
        typeof campaign.metadata === 'object' && campaign.metadata !== null
          ? campaign.metadata
          : {};
      const cType = campaign.campaign_type || metadataObj.campaign_type || 'email';

      // Validate integration ownership for channel-specific types
      if (cType === 'email') {
        const profileId = metadataObj.ai_email_config?.sending_profile_id;
        if (profileId) {
          const profR = await pgPool.query(
            'SELECT id FROM tenant_integrations WHERE tenant_id = $1 AND id = $2 AND is_active = TRUE LIMIT 1',
            [tenant_id, profileId],
          );
          if (profR.rows.length === 0) {
            return res.status(403).json({
              status: 'error',
              message: 'Email sending profile not found for tenant or inactive',
            });
          }
        }
      } else if (cType === 'call') {
        const callId = metadataObj.ai_call_integration_id;
        if (callId) {
          const callR = await pgPool.query(
            'SELECT id FROM tenant_integrations WHERE tenant_id = $1 AND id = $2 AND is_active = TRUE LIMIT 1',
            [tenant_id, callId],
          );
          if (callR.rows.length === 0) {
            return res.status(403).json({
              status: 'error',
              message: 'Call provider integration not found for tenant or inactive',
            });
          }
        }
      }
      // Other types (sms, linkedin, whatsapp, api_connector, social_post)
      // will validate their own integrations when delivery adapters are built

      const requiredChannel = cType === 'email' ? 'email' : 'phone';
      let audienceRows = [];
      const target_audience =
        campaign.target_audience &&
        typeof campaign.target_audience === 'object' &&
        !Array.isArray(campaign.target_audience) &&
        Object.keys(campaign.target_audience).length > 0
          ? campaign.target_audience
          : null;
      const target_contacts = Array.isArray(campaign.target_contacts)
        ? campaign.target_contacts
        : [];

      if (target_audience && (!target_contacts || target_contacts.length === 0)) {
        audienceRows = await resolveAudience(pgPool, {
          tenant_id,
          audience: target_audience,
          campaignType: cType,
        });
        if (!Array.isArray(audienceRows) || audienceRows.length === 0) {
          return res.status(400).json({ status: 'error', message: 'No audience resolved' });
        }
      } else if (target_contacts && target_contacts.length > 0) {
        audienceRows = target_contacts
          .map((item) => {
            if (item && typeof item === 'object') {
              return {
                contact_id: item.contact_id || item.id || null,
                contact_name: item.contact_name || item.name || null,
                email: item.email || null,
                phone: item.phone || null,
                company: item.company || null,
              };
            }
            if (typeof item === 'string') {
              return {
                contact_id: item,
                contact_name: null,
                email: null,
                phone: null,
                company: null,
              };
            }
            return null;
          })
          .filter(Boolean);
      }

      const recipients = audienceRows.filter((row) => {
        if (!row?.contact_id) return false;
        if (requiredChannel === 'email') return Boolean(row.email);
        return Boolean(row.phone);
      });

      const seen = new Set();
      const uniqueRecipients = recipients.filter((row) => {
        if (seen.has(row.contact_id)) return false;
        seen.add(row.contact_id);
        return true;
      });

      if (uniqueRecipients.length === 0) {
        return res.status(400).json({ status: 'error', message: 'No audience resolved' });
      }

      if (uniqueRecipients.length > 0) {
        const insertTargetSql = `
          INSERT INTO ai_campaign_targets (
            tenant_id,
            campaign_id,
            contact_id,
            channel,
            status,
            destination,
            target_payload,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, 'pending', $5, $6::jsonb, NOW(), NOW())
        `;

        for (const row of uniqueRecipients) {
          const destination = requiredChannel === 'email' ? row.email : row.phone;
          await pgPool.query(insertTargetSql, [
            tenant_id,
            id,
            row.contact_id,
            requiredChannel,
            destination,
            JSON.stringify({
              contact_name: row.contact_name || null,
              company: row.company || null,
              email: row.email || null,
              phone: row.phone || null,
            }),
          ]);
        }
      }

      const schedule = metadataObj.schedule || {};
      const scheduledAtRaw = schedule.scheduled_at;
      const scheduledAt = scheduledAtRaw ? new Date(scheduledAtRaw) : null;
      const isFutureSchedule =
        schedule.type === 'scheduled' &&
        scheduledAt instanceof Date &&
        !Number.isNaN(scheduledAt.getTime()) &&
        scheduledAt.getTime() > Date.now();
      const nextStatus = isFutureSchedule ? 'scheduled' : 'running';
      const eventType = isFutureSchedule ? 'campaign_scheduled' : 'campaign_started';

      const lifecycle = {
        ...(metadataObj.lifecycle || {}),
        scheduled_at: isFutureSchedule ? scheduledAt.toISOString() : new Date().toISOString(),
        scheduled_by: req.user?.email || null,
      };
      const newMeta = { ...metadataObj, lifecycle };

      const updR = await pgPool.query(
        `UPDATE ai_campaign SET status = $3, metadata = $4, updated_at = NOW()
         WHERE tenant_id = $1 AND id = $2 RETURNING *`,
        [tenant_id, id, nextStatus, JSON.stringify(newMeta)],
      );
      const updated = updR.rows[0];

      await pgPool.query(
        `INSERT INTO ai_campaign_events (
          tenant_id,
          campaign_id,
          contact_id,
          status,
          event_type,
          attempt_no,
          payload,
          created_at
        ) VALUES ($1, $2, NULL, $3, $4, 0, $5::jsonb, NOW())`,
        [
          tenant_id,
          id,
          nextStatus,
          eventType,
          JSON.stringify({
            campaign_type: cType,
            resolved_targets: uniqueRecipients.length,
            channel: requiredChannel,
          }),
        ],
      );

      emitTenantWebhooks(pgPool, tenant_id, 'aicampaign.start', {
        id: updated.id,
        status: updated.status,
        campaign_type: cType,
        counts: {
          totalTargets: uniqueRecipients.length,
        },
      }).catch(() => undefined);

      res.json({ status: 'success', data: updated });
    } catch (err) {
      logger.error('[AI Campaigns] Start error:', err.message);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // ─── POST /api/aicampaigns/:id/pause ────────────────────────────────────────
  router.post('/:id/pause', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.body || {};
      if (!tenant_id)
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });

      const getR = await pgPool.query(
        'SELECT * FROM ai_campaign WHERE tenant_id = $1 AND id = $2 LIMIT 1',
        [tenant_id, id],
      );
      if (getR.rows.length === 0)
        return res.status(404).json({ status: 'error', message: 'AI Campaign not found' });

      let metadataObj =
        typeof getR.rows[0].metadata === 'object' && getR.rows[0].metadata !== null
          ? getR.rows[0].metadata
          : {};
      const lifecycle = {
        ...(metadataObj.lifecycle || {}),
        paused_at: new Date().toISOString(),
        paused_by: req.user?.email || null,
      };
      const newMeta = { ...metadataObj, lifecycle };

      const upd = await pgPool.query(
        `UPDATE ai_campaign SET status = 'paused', metadata = $3, updated_at = NOW()
         WHERE tenant_id = $1 AND id = $2 RETURNING *`,
        [tenant_id, id, JSON.stringify(newMeta)],
      );
      const updated = upd.rows[0];

      emitTenantWebhooks(pgPool, tenant_id, 'aicampaign.pause', {
        id: updated.id,
        status: updated.status,
      }).catch(() => undefined);

      res.json({ status: 'success', data: updated });
    } catch (err) {
      logger.error('[AI Campaigns] Pause error:', err.message);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // ─── POST /api/aicampaigns/:id/resume ───────────────────────────────────────
  router.post('/:id/resume', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.body || {};
      if (!tenant_id)
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });

      const getR = await pgPool.query(
        'SELECT * FROM ai_campaign WHERE tenant_id = $1 AND id = $2 LIMIT 1',
        [tenant_id, id],
      );
      if (getR.rows.length === 0)
        return res.status(404).json({ status: 'error', message: 'AI Campaign not found' });

      let metadataObj =
        typeof getR.rows[0].metadata === 'object' && getR.rows[0].metadata !== null
          ? getR.rows[0].metadata
          : {};
      const lifecycle = {
        ...(metadataObj.lifecycle || {}),
        resumed_at: new Date().toISOString(),
        resumed_by: req.user?.email || null,
      };
      const newMeta = { ...metadataObj, lifecycle };

      const upd = await pgPool.query(
        `UPDATE ai_campaign SET status = 'scheduled', metadata = $3, updated_at = NOW()
         WHERE tenant_id = $1 AND id = $2 RETURNING *`,
        [tenant_id, id, JSON.stringify(newMeta)],
      );
      const updated = upd.rows[0];

      emitTenantWebhooks(pgPool, tenant_id, 'aicampaign.resume', {
        id: updated.id,
        status: updated.status,
      }).catch(() => undefined);

      res.json({ status: 'success', data: updated });
    } catch (err) {
      logger.error('[AI Campaigns] Resume error:', err.message);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  return router;
}
