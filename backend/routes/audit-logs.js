import express from 'express';
import { validateTenantScopedId } from '../lib/validation.js';

export default function createAuditLogRoutes(_pgPool) {
  const router = express.Router();

  // POST /api/audit-logs - Create audit log entry
  router.post('/', async (req, res) => {
    try {
      const log = req.body;
      
      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('audit_log')
        .insert([{
          tenant_id: log.tenant_id,
          user_email: log.user_email,
          action: log.action,
          entity_type: log.entity_type,
          entity_id: log.entity_id,
          changes: log.changes || {},
          ip_address: log.ip_address,
          user_agent: log.user_agent,
          created_at: new Date().toISOString()
        }])
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      
      res.status(201).json({
        status: 'success',
        data
      });
    } catch (error) {
      console.error('Error creating audit log:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  // GET /api/audit-logs - List audit logs
  router.get('/', async (req, res) => {
    try {
      const { 
        tenant_id, 
        user_email, 
        action, 
        entity_type, 
        entity_id,
        limit = 100, 
        offset = 0 
      } = req.query;

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      let query = supabase.from('audit_log').select('*', { count: 'exact' });

      if (tenant_id) query = query.eq('tenant_id', tenant_id);
      if (user_email) query = query.eq('user_email', user_email);
      if (action) query = query.eq('action', action);
      if (entity_type) query = query.eq('entity_type', entity_type);
      if (entity_id) query = query.eq('entity_id', entity_id);

      query = query.order('created_at', { ascending: false }).range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);
      
      const { data, error, count } = await query;
      if (error) throw new Error(error.message);
      
      res.json({
        status: 'success',
        data: {
          'audit-logs': data || [],
          total: count || 0,
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      });
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  // GET /api/audit-logs/:id - Get specific audit log (tenant scoped)
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query;

      if (!validateTenantScopedId(id, tenant_id, res)) return;

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('audit_log')
        .select('*')
        .eq('tenant_id', tenant_id)
        .eq('id', id)
        .single();
      
      if (error?.code === 'PGRST116') {
        return res.status(404).json({
          status: 'error',
          message: 'Audit log not found'
        });
      }
      if (error) throw new Error(error.message);

      res.json({
        status: 'success',
        data
      });
    } catch (error) {
      console.error('Error fetching audit log:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  // DELETE /api/audit-logs/:id - Delete a specific audit log (tenant scoped)
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query;

      if (!validateTenantScopedId(id, tenant_id, res)) return;
      
      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('audit_log')
        .delete()
        .eq('tenant_id', tenant_id)
        .eq('id', id)
        .select('*')
        .maybeSingle();
      
      if (error && error.code !== 'PGRST116') throw new Error(error.message);
      if (!data) {
        return res.status(404).json({
          status: 'error',
          message: 'Audit log not found'
        });
      }
      
      res.json({
        status: 'success',
        message: 'Audit log deleted',
        data
      });
    } catch (error) {
      console.error('Error deleting audit log:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  // DELETE /api/audit-logs - Clear audit logs (with filters)
  router.delete('/', async (req, res) => {
    try {
      const { tenant_id, user_email, entity_type, older_than_days } = req.query;

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      let query = supabase.from('audit_log').delete();

      if (tenant_id) query = query.eq('tenant_id', tenant_id);
      if (user_email) query = query.eq('user_email', user_email);
      if (entity_type) query = query.eq('entity_type', entity_type);
      if (older_than_days) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - parseInt(older_than_days));
        query = query.lt('created_at', cutoffDate.toISOString());
      }

      query = query.select('*');
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      
      res.json({
        status: 'success',
        message: `Deleted ${(data || []).length} audit log(s)`,
        data: {
          deleted_count: (data || []).length
        }
      });
    } catch (error) {
      console.error('Error clearing audit logs:', error);
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  });

  return router;
}
