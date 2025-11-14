/**
 * API Keys Routes
 * Manage API keys for tenants
 */

import express from 'express';
import { validateTenantScopedId } from '../lib/validation.js';

export default function createApikeyRoutes(_pgPool) {
  const router = express.Router();

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
      console.error('apikeys:list error', error);
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
      console.error('apikeys:create error', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/apikeys/:id - Get a single API key (tenant scoped)
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query;

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
      console.error('apikeys:get error', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // DELETE /api/apikeys/:id - Delete an API key (tenant scoped)
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query;

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
      console.error('apikeys:delete error', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
