/**
 * C.A.R.E. Playbook Routes
 *
 * CRUD routes for care_playbook and read-only access to care_playbook_execution.
 *
 * Authorization:
 *   - All write operations (POST, PUT, DELETE) require admin/superadmin via requireAdminRole
 *   - Read operations (GET) also require admin/superadmin (playbook config is admin-only)
 *   - Execution history GET is available to all authenticated users (managers see their team's results)
 *
 * Endpoints:
 *   GET    /api/care-playbooks              — List all playbooks for tenant
 *   GET    /api/care-playbooks/:id          — Get single playbook
 *   POST   /api/care-playbooks              — Create playbook
 *   PUT    /api/care-playbooks/:id          — Update playbook
 *   PUT    /api/care-playbooks/:id/toggle   — Toggle is_enabled
 *   DELETE /api/care-playbooks/:id          — Delete playbook
 *   GET    /api/care-playbooks/executions   — List executions (with filters)
 *   GET    /api/care-playbooks/executions/:id — Get single execution detail
 *
 * @module routes/carePlaybooks
 */

import express from 'express';
import { requireAdminRole } from '../middleware/validateTenant.js';
import { getSupabaseClient } from '../lib/supabase-db.js';
import { cacheList, invalidateCache } from '../lib/cacheMiddleware.js';
import { invalidatePlaybookCache } from '../lib/care/carePlaybookRouter.js';
import logger from '../lib/logger.js';

export default function createCarePlaybookRoutes(_pool) {
  const router = express.Router();
  const supabase = getSupabaseClient();

  // ============================================================
  // Execution history routes (before requireAdminRole)
  // These are read-only and available to all authenticated users
  // ============================================================

  /**
   * @openapi
   * /api/care-playbooks/executions:
   *   get:
   *     summary: List playbook executions
   *     description: Returns playbook execution history with optional filters. Available to all authenticated users.
   *     tags: [care-playbooks]
   */
  router.get('/executions', async (req, res) => {
    try {
      const tenant_id = req.tenant?.id;
      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const {
        trigger_type,
        entity_type,
        entity_id,
        status,
        playbook_id,
        limit = 50,
        offset = 0,
      } = req.query;

      let query = supabase
        .from('care_playbook_execution')
        .select('*, care_playbook!inner(name, trigger_type, execution_mode)', { count: 'exact' })
        .eq('tenant_id', tenant_id)
        .order('started_at', { ascending: false })
        .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

      if (trigger_type) query = query.eq('trigger_type', trigger_type);
      if (entity_type) query = query.eq('entity_type', entity_type);
      if (entity_id) query = query.eq('entity_id', entity_id);
      if (status) query = query.eq('status', status);
      if (playbook_id) query = query.eq('playbook_id', playbook_id);

      const { data, error, count } = await query;

      if (error) throw error;

      res.json({
        status: 'success',
        data: { executions: data || [], total: count },
      });
    } catch (error) {
      logger.error('Error fetching playbook executions:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  /**
   * @openapi
   * /api/care-playbooks/executions/{id}:
   *   get:
   *     summary: Get execution detail
   *     description: Returns a single playbook execution with step results. Available to all authenticated users.
   *     tags: [care-playbooks]
   */
  router.get('/executions/:id', async (req, res) => {
    try {
      const tenant_id = req.tenant?.id;
      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const { data, error } = await supabase
        .from('care_playbook_execution')
        .select('*, care_playbook!inner(name, trigger_type, execution_mode, steps)')
        .eq('id', req.params.id)
        .eq('tenant_id', tenant_id)
        .single();

      if (error || !data) {
        return res.status(404).json({ status: 'error', message: 'Execution not found' });
      }

      res.json({ status: 'success', data });
    } catch (error) {
      logger.error('Error fetching playbook execution:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // ============================================================
  // Playbook CRUD routes — admin/superadmin only
  // ============================================================
  router.use(requireAdminRole);

  /**
   * @openapi
   * /api/care-playbooks:
   *   get:
   *     summary: List all playbooks for tenant
   *     description: Returns all care playbooks. Admin access required.
   *     tags: [care-playbooks]
   */
  router.get('/', cacheList('care_playbooks', 120), async (req, res) => {
    try {
      const tenant_id = req.tenant?.id;
      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const { data, error } = await supabase
        .from('care_playbook')
        .select('*')
        .eq('tenant_id', tenant_id)
        .order('trigger_type', { ascending: true });

      if (error) throw error;

      res.json({ status: 'success', data: { playbooks: data || [] } });
    } catch (error) {
      logger.error('Error fetching playbooks:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  /**
   * @openapi
   * /api/care-playbooks/{id}:
   *   get:
   *     summary: Get single playbook
   *     description: Returns a care playbook by ID. Admin access required.
   *     tags: [care-playbooks]
   */
  router.get('/:id', async (req, res) => {
    try {
      const tenant_id = req.tenant?.id;
      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const { data, error } = await supabase
        .from('care_playbook')
        .select('*')
        .eq('id', req.params.id)
        .eq('tenant_id', tenant_id)
        .single();

      if (error || !data) {
        return res.status(404).json({ status: 'error', message: 'Playbook not found' });
      }

      res.json({ status: 'success', data });
    } catch (error) {
      logger.error('Error fetching playbook:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  /**
   * @openapi
   * /api/care-playbooks:
   *   post:
   *     summary: Create playbook
   *     description: Creates a new care playbook. Admin access required. One playbook per trigger type per tenant.
   *     tags: [care-playbooks]
   */
  router.post('/', async (req, res) => {
    try {
      const tenant_id = req.tenant?.id;
      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const {
        trigger_type,
        name,
        description,
        is_enabled = true,
        shadow_mode = true,
        priority = 100,
        execution_mode = 'native',
        webhook_url,
        webhook_secret,
        steps = [],
        trigger_config = {},
        cooldown_minutes = 1440,
        max_executions_per_day = 50,
      } = req.body;

      // Validate required fields
      if (!trigger_type || !name) {
        return res.status(400).json({
          status: 'error',
          message: 'trigger_type and name are required',
        });
      }

      // Validate trigger_type
      const validTriggerTypes = [
        'lead_stagnant',
        'deal_decay',
        'deal_regression',
        'account_risk',
        'activity_overdue',
        'contact_inactive',
        'opportunity_hot',
        'followup_needed',
      ];
      if (!validTriggerTypes.includes(trigger_type)) {
        return res.status(400).json({
          status: 'error',
          message: `Invalid trigger_type. Must be one of: ${validTriggerTypes.join(', ')}`,
        });
      }

      // Validate execution_mode
      if (!['native', 'webhook', 'both'].includes(execution_mode)) {
        return res.status(400).json({
          status: 'error',
          message: 'execution_mode must be native, webhook, or both',
        });
      }

      // Webhook mode requires URL
      if ((execution_mode === 'webhook' || execution_mode === 'both') && !webhook_url) {
        return res.status(400).json({
          status: 'error',
          message: 'webhook_url is required when execution_mode includes webhook',
        });
      }

      const { data, error } = await supabase
        .from('care_playbook')
        .insert({
          tenant_id,
          trigger_type,
          name,
          description,
          is_enabled,
          shadow_mode,
          priority,
          execution_mode,
          webhook_url,
          webhook_secret,
          steps,
          trigger_config,
          cooldown_minutes,
          max_executions_per_day,
          created_by: req.user?.id || null,
        })
        .select()
        .single();

      if (error) {
        // Unique constraint violation (one playbook per trigger per tenant)
        if (error.code === '23505') {
          return res.status(409).json({
            status: 'error',
            message: `A playbook already exists for trigger_type "${trigger_type}" in this tenant`,
          });
        }
        throw error;
      }

      // Invalidate caches
      await invalidateCache(tenant_id, 'care_playbooks');
      invalidatePlaybookCache(tenant_id, trigger_type);

      logger.info(
        {
          playbook_id: data.id,
          trigger_type,
          tenant_id,
        },
        '[CarePlaybooks] Playbook created',
      );

      res.status(201).json({ status: 'success', data });
    } catch (error) {
      logger.error('Error creating playbook:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  /**
   * @openapi
   * /api/care-playbooks/{id}:
   *   put:
   *     summary: Update playbook
   *     description: Updates a care playbook. Admin access required.
   *     tags: [care-playbooks]
   */
  router.put('/:id', async (req, res) => {
    try {
      const tenant_id = req.tenant?.id;
      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const {
        name,
        description,
        is_enabled,
        shadow_mode,
        priority,
        execution_mode,
        webhook_url,
        webhook_secret,
        steps,
        trigger_config,
        cooldown_minutes,
        max_executions_per_day,
      } = req.body;

      // Build update object (only include provided fields)
      const updates = { updated_at: new Date().toISOString() };
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (is_enabled !== undefined) updates.is_enabled = is_enabled;
      if (shadow_mode !== undefined) updates.shadow_mode = shadow_mode;
      if (priority !== undefined) updates.priority = priority;
      if (execution_mode !== undefined) updates.execution_mode = execution_mode;
      if (webhook_url !== undefined) updates.webhook_url = webhook_url;
      if (webhook_secret !== undefined) updates.webhook_secret = webhook_secret;
      if (steps !== undefined) updates.steps = steps;
      if (trigger_config !== undefined) updates.trigger_config = trigger_config;
      if (cooldown_minutes !== undefined) updates.cooldown_minutes = cooldown_minutes;
      if (max_executions_per_day !== undefined)
        updates.max_executions_per_day = max_executions_per_day;

      // Validate execution_mode if provided
      if (execution_mode && !['native', 'webhook', 'both'].includes(execution_mode)) {
        return res.status(400).json({
          status: 'error',
          message: 'execution_mode must be native, webhook, or both',
        });
      }

      const { data, error } = await supabase
        .from('care_playbook')
        .update(updates)
        .eq('id', req.params.id)
        .eq('tenant_id', tenant_id)
        .select()
        .single();

      if (error || !data) {
        return res.status(404).json({ status: 'error', message: 'Playbook not found' });
      }

      // Invalidate caches
      await invalidateCache(tenant_id, 'care_playbooks');
      invalidatePlaybookCache(tenant_id, data.trigger_type);

      logger.info(
        {
          playbook_id: data.id,
          trigger_type: data.trigger_type,
          tenant_id,
          changes: Object.keys(updates).filter((k) => k !== 'updated_at'),
        },
        '[CarePlaybooks] Playbook updated',
      );

      res.json({ status: 'success', data });
    } catch (error) {
      logger.error('Error updating playbook:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  /**
   * @openapi
   * /api/care-playbooks/{id}/toggle:
   *   put:
   *     summary: Toggle playbook enabled/disabled
   *     description: Convenience endpoint to flip is_enabled. Admin access required.
   *     tags: [care-playbooks]
   */
  router.put('/:id/toggle', async (req, res) => {
    try {
      const tenant_id = req.tenant?.id;
      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      // First read current state
      const { data: current, error: readErr } = await supabase
        .from('care_playbook')
        .select('id, is_enabled, trigger_type')
        .eq('id', req.params.id)
        .eq('tenant_id', tenant_id)
        .single();

      if (readErr || !current) {
        return res.status(404).json({ status: 'error', message: 'Playbook not found' });
      }

      const newState = !current.is_enabled;

      const { data, error } = await supabase
        .from('care_playbook')
        .update({ is_enabled: newState, updated_at: new Date().toISOString() })
        .eq('id', req.params.id)
        .eq('tenant_id', tenant_id)
        .select()
        .single();

      if (error) throw error;

      // Invalidate caches
      await invalidateCache(tenant_id, 'care_playbooks');
      invalidatePlaybookCache(tenant_id, current.trigger_type);

      logger.info(
        {
          playbook_id: data.id,
          trigger_type: data.trigger_type,
          is_enabled: newState,
          tenant_id,
        },
        '[CarePlaybooks] Playbook toggled',
      );

      res.json({ status: 'success', data });
    } catch (error) {
      logger.error('Error toggling playbook:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  /**
   * @openapi
   * /api/care-playbooks/{id}:
   *   delete:
   *     summary: Delete playbook
   *     description: Deletes a care playbook. Admin access required. Active executions will be cancelled.
   *     tags: [care-playbooks]
   */
  router.delete('/:id', async (req, res) => {
    try {
      const tenant_id = req.tenant?.id;
      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      // Read before delete to get trigger_type for cache invalidation
      const { data: existing, error: readErr } = await supabase
        .from('care_playbook')
        .select('id, trigger_type, name')
        .eq('id', req.params.id)
        .eq('tenant_id', tenant_id)
        .single();

      if (readErr || !existing) {
        return res.status(404).json({ status: 'error', message: 'Playbook not found' });
      }

      // Cancel any active executions for this playbook
      await supabase
        .from('care_playbook_execution')
        .update({
          status: 'cancelled',
          stopped_reason: 'playbook_deleted',
          completed_at: new Date().toISOString(),
        })
        .eq('playbook_id', req.params.id)
        .in('status', ['pending', 'in_progress']);

      // Delete the playbook (execution records cascade via FK)
      const { error: deleteErr } = await supabase
        .from('care_playbook')
        .delete()
        .eq('id', req.params.id)
        .eq('tenant_id', tenant_id);

      if (deleteErr) throw deleteErr;

      // Invalidate caches
      await invalidateCache(tenant_id, 'care_playbooks');
      invalidatePlaybookCache(tenant_id, existing.trigger_type);

      logger.info(
        {
          playbook_id: existing.id,
          trigger_type: existing.trigger_type,
          name: existing.name,
          tenant_id,
        },
        '[CarePlaybooks] Playbook deleted',
      );

      res.json({ status: 'success', data: { id: existing.id, deleted: true } });
    } catch (error) {
      logger.error('Error deleting playbook:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
