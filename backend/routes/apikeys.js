/**
 * API Keys Routes
 * Manage API keys for tenants
 */

import express from 'express';
import { validateTenantScopedId } from '../lib/validation.js';
import logger from '../lib/logger.js';

export default function createApikeyRoutes(_pgPool) {
  const router = express.Router();

  /**
   * @openapi
   * /api/apikeys:
   *   get:
   *     summary: List API keys for tenant
   *     tags: [system]
   *     parameters:
   *       - in: query
   *         name: tenant_id
   *         required: true
   *         schema: { type: string, format: uuid }
   *       - in: query
   *         name: limit
   *         schema: { type: integer, default: 100 }
   *     responses:
   *       200:
   *         description: List of API keys
   *   post:
   *     summary: Create new API key
   *     tags: [system]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [tenant_id, key_name, key_value]
   *             properties:
   *               tenant_id: { type: string, format: uuid }
   *               key_name: { type: string }
   *               key_value: { type: string }
   *               description: { type: string }
   *               created_by: { type: string }
   *     responses:
   *       201:
   *         description: API key created
   * /api/apikeys/{id}:
   *   get:
   *     summary: Get API key by ID
   *     tags: [system]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *       - in: query
   *         name: tenant_id
   *         required: true
   *         schema: { type: string, format: uuid }
   *     responses:
   *       200:
   *         description: API key details
   */

  // GET /api/apikeys - List API keys for a tenant
  router.get('/', async (req, res) => {
    try {
      const { tenant_id } = req.query;
      const limit = parseInt(req.query.limit || '100', 10);

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('apikey')
        .select('id, tenant_id, key_name, key_value, is_active, description, created_at, created_date, created_by, usage_count, last_used')
        .eq('tenant_id', tenant_id)
        .order('created_date', { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return res.json({ status: 'success', data: { apikeys: data || [] } });
    } catch (error) {
      logger.error('apikeys:list error', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/apikeys - Create a new API key
  router.post('/', async (req, res) => {
    try {
      const { tenant_id, key_name, key_value, description, created_by } = req.body;

      if (!tenant_id || !key_name || !key_value) {
        return res.status(400).json({ status: 'error', message: 'tenant_id, key_name and key_value are required' });
      }

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from('apikey')
        .insert([{ tenant_id, key_name, key_value, description: description || null, is_active: true, created_at: nowIso, created_date: nowIso, created_by: created_by || null }])
        .select('id, tenant_id, key_name, key_value, description, is_active, created_at, created_date, created_by')
        .single();
      if (error) throw new Error(error.message);
      return res.json({ status: 'success', message: 'API key created', data });
    } catch (error) {
      logger.error('apikeys:create error', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/apikeys/:id - Get a single API key (tenant scoped)
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const tenant_id = req.tenant?.id || req.query.tenant_id;

      if (!validateTenantScopedId(id, tenant_id, res)) return;

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('apikey')
        .select('id, tenant_id, key_name, key_value, description, is_active, created_at, created_date, created_by')
        .eq('tenant_id', tenant_id)
        .eq('id', id)
        .single();
      if (error?.code === 'PGRST116') return res.status(404).json({ status: 'error', message: 'Not found' });
      if (error) throw new Error(error.message);
      return res.json({ status: 'success', data });
    } catch (error) {
      logger.error('apikeys:get error', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // DELETE /api/apikeys/:id - Delete an API key (tenant scoped)
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const tenant_id = req.tenant?.id || req.query.tenant_id;

      if (!validateTenantScopedId(id, tenant_id, res)) return;

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('apikey')
        .delete()
        .eq('tenant_id', tenant_id)
        .eq('id', id)
        .select('id')
        .maybeSingle();
      if (error && error.code !== 'PGRST116') throw new Error(error.message);
      if (!data) return res.status(404).json({ status: 'error', message: 'Not found' });
      return res.json({ status: 'success', message: 'Deleted', data: { id: data.id } });
    } catch (error) {
      logger.error('apikeys:delete error', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
