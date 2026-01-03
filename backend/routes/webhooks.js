/**
 * Webhook Routes
 * CRUD operations for webhooks
 */

import express from 'express';
import { validateTenantScopedId } from '../lib/validation.js';
import { cacheList } from '../lib/cacheMiddleware.js';
import logger from '../lib/logger.js';

export default function createWebhookRoutes(_pgPool) {
  const router = express.Router();

  // GET /api/webhooks - List webhooks
  router.get('/', cacheList('webhooks', 180), async (req, res) => {
    try {
      const { limit = 50, offset = 0, is_active } = req.query;

      // Enforce tenant isolation
      const tenant_id = req.tenant?.id || req.query.tenant_id;
      if (!tenant_id) {
        return res.status(400).json({
          status: 'error',
          message: 'tenant_id is required'
        });
      }

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      let query = supabase.from('webhook').select('*', { count: 'exact' }).eq('tenant_id', tenant_id);
      if (is_active !== undefined) query = query.eq('is_active', is_active === 'true');

      query = query.order('created_at', { ascending: false }).range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

      const { data, error, count } = await query;
      if (error) throw new Error(error.message);

      res.json({
        status: 'success',
        data: {
          webhooks: data || [],
          total: count || 0,
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      });
    } catch (error) {
      logger.error('Error fetching webhooks:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/webhooks/:id - Get single webhook (tenant scoped)
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query;

      if (!validateTenantScopedId(id, tenant_id, res)) return;

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('webhook')
        .select('*')
        .eq('tenant_id', tenant_id)
        .eq('id', id)
        .single();
      
      if (error?.code === 'PGRST116') {
          if (error) throw new Error(error.message);
        return res.status(404).json({ status: 'error', message: 'Webhook not found' });
      }

      res.json({ status: 'success', data: { webhook: data } });
    } catch (error) {
      logger.error('Error fetching webhook:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/webhooks - Create webhook
  router.post('/', async (req, res) => {
    try {
      const webhook = req.body;

      if (!webhook.tenant_id || !webhook.url) {
        return res.status(400).json({ status: 'error', message: 'tenant_id and url are required' });
      }

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('webhook')
        .insert([{
          tenant_id: webhook.tenant_id,
          url: webhook.url,
          event_types: webhook.event_types || [],
          is_active: webhook.is_active !== undefined ? webhook.is_active : true,
          secret: webhook.secret || null,
          metadata: webhook.metadata || {}
        }])
        .select('*')
        .single();
      if (error) throw new Error(error.message);

      res.status(201).json({
        status: 'success',
        message: 'Webhook created successfully',
        data: { webhook: data }
      });
    } catch (error) {
      logger.error('Error creating webhook:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // PUT /api/webhooks/:id - Update webhook (tenant scoped)
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query;
      const updates = req.body;

      if (!validateTenantScopedId(id, tenant_id, res)) return;

      const allowedFields = ['url', 'event_types', 'is_active', 'secret', 'metadata'];
      const payload = {};
      Object.entries(updates).forEach(([key, value]) => {
        if (allowedFields.includes(key)) {
          payload[key] = value;
        }
      });

      if (Object.keys(payload).length === 0) {
        return res.status(400).json({ status: 'error', message: 'No valid fields to update' });
      }

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('webhook')
        .update(payload)
        .eq('tenant_id', tenant_id)
        .eq('id', id)
        .select('*')
        .maybeSingle();
      
      if (error && error.code !== 'PGRST116') throw new Error(error.message);
      if (!data) {
        return res.status(404).json({ status: 'error', message: 'Webhook not found' });
      }

      res.json({
        status: 'success',
        message: 'Webhook updated successfully',
        data: { webhook: data }
      });
    } catch (error) {
      logger.error('Error updating webhook:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // DELETE /api/webhooks/:id - Delete webhook (tenant scoped)
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query;

      if (!validateTenantScopedId(id, tenant_id, res)) return;

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('webhook')
        .delete()
        .eq('tenant_id', tenant_id)
        .eq('id', id)
        .select('id')
        .maybeSingle();
      
      if (error && error.code !== 'PGRST116') throw new Error(error.message);
      if (!data) {
        return res.status(404).json({ status: 'error', message: 'Webhook not found' });
      }

      res.json({
        status: 'success',
        message: 'Webhook deleted successfully',
        data: { id: data.id }
      });
    } catch (error) {
      logger.error('Error deleting webhook:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
