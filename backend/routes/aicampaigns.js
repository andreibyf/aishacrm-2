import express from 'express';
import { validateTenantAccess, enforceEmployeeDataScope } from '../middleware/validateTenant.js';
import { emitTenantWebhooks } from '../lib/webhookEmitter.js';

// Real routes for AI Campaigns backed by ai_campaign table (singular)
export default function createAICampaignRoutes(pgPool) {
  const router = express.Router();
  router.use(validateTenantAccess);
  router.use(enforceEmployeeDataScope);

  // GET /api/aicampaigns - list with basic filters and pagination
  router.get('/', async (req, res) => {
    try {
      const { tenant_id, status, search, limit = 200, offset = 0 } = req.query;

      if (!tenant_id) {
        // Graceful empty when no tenant (e.g., superadmin with no selection)
        return res.json({ status: 'success', data: { campaigns: [], total: 0, limit: 0, offset: 0 } });
      }

      const params = [tenant_id];
      let where = 'WHERE tenant_id = $1';
      if (status) {
        params.push(status);
        where += ` AND status = $${params.length}`;
      }
      if (search) {
        params.push(`%${search}%`);
        where += ` AND (name ILIKE $${params.length} OR description ILIKE $${params.length})`;
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
        data: { campaigns: result.rows, total: parseInt(countResult.rows[0].count, 10), limit: parseInt(limit), offset: parseInt(offset) }
      });
    } catch (err) {
      console.error('[AI Campaigns] List error:', err.message);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // GET /api/aicampaigns/:id
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query || {};
      if (!tenant_id) return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      const result = await pgPool.query('SELECT * FROM ai_campaign WHERE tenant_id = $1 AND id = $2', [tenant_id, id]);
      if (result.rows.length === 0) return res.status(404).json({ status: 'error', message: 'AI Campaign not found' });
      res.json({ status: 'success', data: result.rows[0] });
    } catch (err) {
      console.error('[AI Campaigns] Get error:', err.message);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // POST /api/aicampaigns
  router.post('/', async (req, res) => {
    try {
      const { tenant_id, name, status = 'draft', description = null, target_contacts = [], performance_metrics = {}, metadata = {} } = req.body;
      if (!tenant_id) return res.status(400).json({ status: 'error', message: 'tenant_id is required' });

      const query = `
        INSERT INTO ai_campaign (tenant_id, name, status, description, target_contacts, performance_metrics, metadata, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        RETURNING *
      `;
      const values = [tenant_id, name, status, description, target_contacts, performance_metrics, metadata];
      const result = await pgPool.query(insert, values);
      const created = result.rows[0];
      // Fire-and-forget webhook (optional)
      emitTenantWebhooks(pgPool, tenant_id, 'aicampaign.created', { id: created.id, name: created.name, status: created.status }).catch(() => undefined);
      res.status(201).json({ status: 'success', data: created });
    } catch (err) {
      console.error('[AI Campaigns] Create error:', err.message);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // PUT /api/aicampaigns/:id
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id, name, status, description, target_contacts, performance_metrics, metadata } = req.body;
      if (!tenant_id) return res.status(400).json({ status: 'error', message: 'tenant_id is required' });

      const update = `
        UPDATE ai_campaign
        SET name = COALESCE($3, name),
            status = COALESCE($4, status),
            description = COALESCE($5, description),
            target_contacts = COALESCE($6, target_contacts),
            performance_metrics = COALESCE($7, performance_metrics),
            metadata = COALESCE($8, metadata),
            updated_at = NOW()
        WHERE tenant_id = $1 AND id = $2
        RETURNING *
      `;
      const values = [tenant_id, id, name, status, description, target_contacts, performance_metrics, metadata];
      const result = await pgPool.query(update, values);
      if (result.rows.length === 0) return res.status(404).json({ status: 'error', message: 'AI Campaign not found' });
      res.json({ status: 'success', data: result.rows[0] });
    } catch (err) {
      console.error('[AI Campaigns] Update error:', err.message);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // DELETE /api/aicampaigns/:id
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query || {};
      if (!tenant_id) return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      const result = await pgPool.query('DELETE FROM ai_campaign WHERE tenant_id = $1 AND id = $2 RETURNING id', [tenant_id, id]);
      if (result.rowCount === 0) return res.status(404).json({ status: 'error', message: 'AI Campaign not found' });
      res.json({ status: 'success', data: { id } });
    } catch (err) {
      console.error('[AI Campaigns] Delete error:', err.message);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // POST /api/aicampaigns/:id/start - queue/start a campaign with tenant-scoped validation
  router.post('/:id/start', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.body || {};
      if (!tenant_id) return res.status(400).json({ status: 'error', message: 'tenant_id is required' });

      // Load campaign (tenant-scoped)
      const getQ = 'SELECT * FROM ai_campaign WHERE tenant_id = $1 AND id = $2 LIMIT 1';
      const getR = await pgPool.query(getQ, [tenant_id, id]);
      if (getR.rows.length === 0) return res.status(404).json({ status: 'error', message: 'AI Campaign not found' });
      const campaign = getR.rows[0];

      const metadata = campaign.metadata || {};
      const type = (metadata.campaign_type || campaign.campaign_type || 'call').toLowerCase();

      // Validate integration ownership per tenant
      if (type === 'email') {
        const sendingProfileId = metadata.ai_email_config?.sending_profile_id;
        if (!sendingProfileId) {
          return res.status(400).json({ status: 'error', message: 'Email campaigns require ai_email_config.sending_profile_id' });
        }
        const profQ = 'SELECT id FROM tenant_integrations WHERE tenant_id = $1 AND id = $2 AND is_active = TRUE LIMIT 1';
        const profR = await pgPool.query(profQ, [tenant_id, sendingProfileId]);
        if (profR.rows.length === 0) {
          return res.status(403).json({ status: 'error', message: 'Sending profile not found for tenant or inactive' });
        }
      } else if (type === 'call') {
        const callIntegrationId = metadata.ai_call_integration_id;
        if (!callIntegrationId) {
          return res.status(400).json({ status: 'error', message: 'Call campaigns require metadata.ai_call_integration_id' });
        }
        const callQ = 'SELECT id FROM tenant_integrations WHERE tenant_id = $1 AND id = $2 AND is_active = TRUE LIMIT 1';
        const callR = await pgPool.query(callQ, [tenant_id, callIntegrationId]);
        if (callR.rows.length === 0) {
          return res.status(403).json({ status: 'error', message: 'Call provider/agent integration not found for tenant or inactive' });
        }
      } else if (type === 'sequence') {
        // For sequences, we will validate per-step when executed; allow scheduling here
      }

      // Mark as scheduled and stamp lifecycle metadata
      const lifecycle = {
        ...(metadata.lifecycle || {}),
        scheduled_at: new Date().toISOString(),
        scheduled_by: req.user?.email || null,
      };

      const newMeta = { ...metadata, lifecycle };
      const updQ = `
        UPDATE ai_campaign
        SET status = 'scheduled',
            metadata = $3,
            updated_at = NOW()
        WHERE tenant_id = $1 AND id = $2
        RETURNING *
      `;
      const updR = await pgPool.query(updQ, [tenant_id, id, newMeta]);
      const updated = updR.rows[0];
      // Optional webhook emission for start
      emitTenantWebhooks(pgPool, tenant_id, 'aicampaign.start', {
        id: updated.id,
        status: updated.status,
        type,
        counts: { totalTargets: Array.isArray(updated.target_contacts) ? updated.target_contacts.length : 0 },
      }).catch(() => undefined);

      // TODO: enqueue background job here (worker/cron) if available
      res.json({ status: 'success', data: updated });
    } catch (err) {
      console.error('[AI Campaigns] Start error:', err.message);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // POST /api/aicampaigns/:id/pause - pause a running/scheduled campaign
  router.post('/:id/pause', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.body || {};
      if (!tenant_id) return res.status(400).json({ status: 'error', message: 'tenant_id is required' });

      const getR = await pgPool.query('SELECT * FROM ai_campaign WHERE tenant_id = $1 AND id = $2 LIMIT 1', [tenant_id, id]);
      if (getR.rows.length === 0) return res.status(404).json({ status: 'error', message: 'AI Campaign not found' });
      const campaign = getR.rows[0];
      const metadata = campaign.metadata || {};
      const lifecycle = { ...(metadata.lifecycle || {}), paused_at: new Date().toISOString(), paused_by: req.user?.email || null };
      const newMeta = { ...metadata, lifecycle };

      const upd = await pgPool.query(
        `UPDATE ai_campaign SET status = 'paused', metadata = $3, updated_at = NOW() WHERE tenant_id = $1 AND id = $2 RETURNING *`,
        [tenant_id, id, newMeta]
      );
      const updated = upd.rows[0];
      emitTenantWebhooks(pgPool, tenant_id, 'aicampaign.pause', { id: updated.id, status: updated.status }).catch(() => undefined);
      res.json({ status: 'success', data: updated });
    } catch (err) {
      console.error('[AI Campaigns] Pause error:', err.message);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // POST /api/aicampaigns/:id/resume - resume a paused campaign (returns to scheduled)
  router.post('/:id/resume', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.body || {};
      if (!tenant_id) return res.status(400).json({ status: 'error', message: 'tenant_id is required' });

      const getR = await pgPool.query('SELECT * FROM ai_campaign WHERE tenant_id = $1 AND id = $2 LIMIT 1', [tenant_id, id]);
      if (getR.rows.length === 0) return res.status(404).json({ status: 'error', message: 'AI Campaign not found' });
      const campaign = getR.rows[0];
      const metadata = campaign.metadata || {};
      const lifecycle = { ...(metadata.lifecycle || {}), resumed_at: new Date().toISOString(), resumed_by: req.user?.email || null };
      const newMeta = { ...metadata, lifecycle };

      const upd = await pgPool.query(
        `UPDATE ai_campaign SET status = 'scheduled', metadata = $3, updated_at = NOW() WHERE tenant_id = $1 AND id = $2 RETURNING *`,
        [tenant_id, id, newMeta]
      );
      const updated = upd.rows[0];
      emitTenantWebhooks(pgPool, tenant_id, 'aicampaign.resume', { id: updated.id, status: updated.status }).catch(() => undefined);
      res.json({ status: 'success', data: updated });
    } catch (err) {
      console.error('[AI Campaigns] Resume error:', err.message);
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  return router;
}
