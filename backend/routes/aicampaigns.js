// [2026-02-23 Claude] — AiCampaigns overhaul: aligned route with DB schema,
// expanded campaign types, delivery adapter pattern foundation
import express from 'express';
import { validateTenantAccess, enforceEmployeeDataScope } from '../middleware/validateTenant.js';
import { emitTenantWebhooks } from '../lib/webhookEmitter.js';
import logger from '../lib/logger.js';

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

export default function createAICampaignRoutes(pgPool) {
  const router = express.Router();
  router.use(validateTenantAccess);
  router.use(enforceEmployeeDataScope);

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

      const query = `
        INSERT INTO ai_campaign (
          tenant_id, name, campaign_type, type, status, description,
          assigned_to, target_contacts, target_audience, content,
          performance_metrics, metadata, is_test_data, created_at
        )
        VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
        RETURNING *
      `;
      const values = [
        tenant_id,
        name,
        campaign_type,
        status,
        description,
        assigned_to,
        JSON.stringify(target_contacts),
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
        tenant_id,
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

      if (!tenant_id)
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });

      // Validate campaign_type if provided
      if (campaign_type && !VALID_CAMPAIGN_TYPES.includes(campaign_type)) {
        return res.status(400).json({
          status: 'error',
          message: `Invalid campaign_type: ${campaign_type}. Valid types: ${VALID_CAMPAIGN_TYPES.join(', ')}`,
        });
      }

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
        assigned_to,
        target_contacts ? JSON.stringify(target_contacts) : null,
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
      const meta = campaign.metadata || {};
      const cType = campaign.campaign_type || meta.campaign_type || 'email';

      // Validate integration ownership for channel-specific types
      if (cType === 'email') {
        const profileId = meta.ai_email_config?.sending_profile_id;
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
        const callId = meta.ai_call_integration_id;
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

      const lifecycle = {
        ...(meta.lifecycle || {}),
        scheduled_at: new Date().toISOString(),
        scheduled_by: req.user?.email || null,
      };
      const newMeta = { ...meta, lifecycle };

      const updR = await pgPool.query(
        `UPDATE ai_campaign SET status = 'scheduled', metadata = $3, updated_at = NOW()
         WHERE tenant_id = $1 AND id = $2 RETURNING *`,
        [tenant_id, id, JSON.stringify(newMeta)],
      );
      const updated = updR.rows[0];

      emitTenantWebhooks(pgPool, tenant_id, 'aicampaign.start', {
        id: updated.id,
        status: updated.status,
        campaign_type: cType,
        counts: {
          totalTargets: Array.isArray(updated.target_contacts) ? updated.target_contacts.length : 0,
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

      const meta = getR.rows[0].metadata || {};
      const lifecycle = {
        ...(meta.lifecycle || {}),
        paused_at: new Date().toISOString(),
        paused_by: req.user?.email || null,
      };
      const newMeta = { ...meta, lifecycle };

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

      const meta = getR.rows[0].metadata || {};
      const lifecycle = {
        ...(meta.lifecycle || {}),
        resumed_at: new Date().toISOString(),
        resumed_by: req.user?.email || null,
      };
      const newMeta = { ...meta, lifecycle };

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
