/**
 * SystemBranding Routes
 * CRUD operations for global system branding
 */

import express from 'express';

export default function createSystemBrandingRoutes(_pgPool) {
  const router = express.Router();

  // GET /api/systembrandings - List systembranding records
  router.get('/', async (req, res) => {
    try {
      const { limit = 50, offset = 0 } = req.query;

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const { data, error, count } = await supabase
        .from('systembranding')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);
      if (error) throw new Error(error.message);

      res.json({
        status: 'success',
        data: { 
          systembrandings: data || [], 
          total: count || 0, 
          limit: parseInt(limit), 
          offset: parseInt(offset) 
        },
      });
    } catch (error) {
      console.error('Error listing systembranding:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/systembrandings/:id - Get single systembranding by ID
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('systembranding')
        .select('*')
        .eq('id', id)
        .single();
      
      if (error?.code === 'PGRST116') {
        return res.status(404).json({
          status: 'error',
          message: 'SystemBranding record not found',
        });
      }
      if (error) throw new Error(error.message);

      res.json({
        status: 'success',
        data,
      });
    } catch (error) {
      console.error('Error getting systembranding:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/systembrandings - Create new systembranding
  router.post('/', async (req, res) => {
    try {
      const { footer_logo_url, footer_legal_html, is_active = true } = req.body;

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from('systembranding')
        .insert([{
          footer_logo_url: footer_logo_url || null,
          footer_legal_html: footer_legal_html || null,
          is_active,
          created_at: nowIso,
          created_date: nowIso
        }])
        .select('*')
        .single();
      if (error) throw new Error(error.message);

      res.status(201).json({
        status: 'success',
        data,
      });
    } catch (error) {
      console.error('Error creating systembranding:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // PUT /api/systembrandings/:id - Update systembranding
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { footer_logo_url, footer_legal_html, is_active } = req.body;

      const payload = {};
      if (footer_logo_url !== undefined) {
        payload.footer_logo_url = footer_logo_url;
      }

      if (footer_legal_html !== undefined) {
        payload.footer_legal_html = footer_legal_html;
      }

      if (is_active !== undefined) {
        payload.is_active = is_active;
      }

      if (Object.keys(payload).length === 0) {
        return res.status(400).json({
          status: 'error',
          message: 'No fields to update',
        });
      }

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('systembranding')
        .update(payload)
        .eq('id', id)
        .select('*')
        .maybeSingle();
      
      if (error && error.code !== 'PGRST116') throw new Error(error.message);
      if (!data) {
        return res.status(404).json({
          status: 'error',
          message: 'SystemBranding record not found',
        });
      }

      res.json({
        status: 'success',
        data,
      });
    } catch (error) {
      console.error('Error updating systembranding:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // DELETE /api/systembrandings/:id - Delete systembranding
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('systembranding')
        .delete()
        .eq('id', id)
        .select('*')
        .maybeSingle();
      
      if (error && error.code !== 'PGRST116') throw new Error(error.message);
      if (!data) {
        return res.status(404).json({
          status: 'error',
          message: 'SystemBranding record not found',
        });
      }

      res.json({
        status: 'success',
        message: 'SystemBranding deleted successfully',
        data,
      });
    } catch (error) {
      console.error('Error deleting systembranding:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
