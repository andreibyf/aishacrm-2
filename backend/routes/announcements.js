/**
 * Announcements Routes
 * CRUD operations for system announcements
 */

import express from 'express';
import { validateTenantScopedId } from '../lib/validation.js';

export default function createAnnouncementRoutes(_pgPool) {
  const router = express.Router();

  // GET /api/announcements - List announcements
  router.get('/', async (req, res) => {
    try {
      const { tenant_id, is_active, limit = 50, offset = 0 } = req.query;

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();

      let query = supabase.from('announcement').select('*', { count: 'exact' });

      if (tenant_id) query = query.eq('tenant_id', tenant_id);
      if (is_active !== undefined) query = query.eq('is_active', is_active === 'true');

      query = query.order('created_at', { ascending: false }).range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

      const { data, error, count } = await query;
      if (error) throw new Error(error.message);

      res.json({
        status: 'success',
        data: { announcements: data || [], total: count || 0 },
      });
    } catch (error) {
      console.error('Error fetching announcements:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/announcements/:id - Get single announcement (tenant aware)
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query || {};
      if (!validateTenantScopedId(id, tenant_id, res)) return;
      
      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('announcement')
        .select('*')
        .or(`tenant_id.eq.${tenant_id},tenant_id.is.null`)
        .eq('id', id)
        .single();
      if (error?.code === 'PGRST116') return res.status(404).json({ status: 'error', message: 'Not found' });
      if (error) throw new Error(error.message);
      res.json({ status: 'success', data: { announcement: data } });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/announcements - Create announcement
  router.post('/', async (req, res) => {
    try {
      const a = req.body;
      if (!a.title || !a.content) return res.status(400).json({ status: 'error', message: 'title and content required' });

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('announcement')
        .insert([{
          tenant_id: a.tenant_id || null,
          title: a.title,
          content: a.content,
          type: a.type || 'info',
          is_active: a.is_active !== false,
          start_date: a.start_date || null,
          end_date: a.end_date || null,
          target_roles: a.target_roles || [],
          metadata: a.metadata || {}
        }])
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      res.status(201).json({ status: 'success', message: 'Created', data: { announcement: data } });
    } catch (error) {
      console.error('Error creating announcement:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // PUT /api/announcements/:id - Update announcement (tenant scoped)
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query || {};
      const u = req.body;

      if (!validateTenantScopedId(id, tenant_id, res)) return;

      const allowed = ['title', 'content', 'type', 'is_active', 'start_date', 'end_date', 'target_roles', 'metadata'];
      const payload = {};
      Object.entries(u).forEach(([k, v]) => {
        if (allowed.includes(k)) {
          payload[k] = v;
        }
      });
      if (Object.keys(payload).length === 0) return res.status(400).json({ status: 'error', message: 'No valid fields' });

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('announcement')
        .update(payload)
        .or(`tenant_id.eq.${tenant_id},tenant_id.is.null`)
        .eq('id', id)
        .select('*')
        .maybeSingle();
      if (error && error.code !== 'PGRST116') throw new Error(error.message);
      if (!data) return res.status(404).json({ status: 'error', message: 'Not found' });
      res.json({ status: 'success', message: 'Updated', data: { announcement: data } });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // DELETE /api/announcements/:id - Delete announcement (tenant scoped)
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query || {};

      if (!validateTenantScopedId(id, tenant_id, res)) return;

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('announcement')
        .delete()
        .or(`tenant_id.eq.${tenant_id},tenant_id.is.null`)
        .eq('id', id)
        .select('id')
        .maybeSingle();
      if (error && error.code !== 'PGRST116') throw new Error(error.message);
      if (!data) return res.status(404).json({ status: 'error', message: 'Not found' });
      res.json({ status: 'success', message: 'Deleted', data: { id: data.id } });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
