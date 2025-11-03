/**
 * Employee Routes
 * Employee management with full CRUD operations
 */

import express from 'express';

export default function createEmployeeRoutes(_pgPool) {
  const router = express.Router();

  // GET /api/employees - List employees
  router.get('/', async (req, res) => {
    try {
      const { tenant_id, email, limit = 50, offset = 0 } = req.query;

      // Allow lookup by email without tenant_id (for auth user lookup)
      if (email) {
        const { getSupabaseClient } = await import('../lib/supabase-db.js');
        const supabase = getSupabaseClient();

        const { data, error } = await supabase
          .from('employees')
          .select('*')
          .eq('email', email)
          .order('created_at', { ascending: false })
          .limit(1);

        if (error) throw new Error(error.message);

        return res.json({
          status: 'success',
          data: data || [],
        });
      }

      // Normal listing requires tenant_id
      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id or email is required' });
      }
      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();

      const lim = parseInt(limit);
      const off = parseInt(offset);
      const from = off;
      const to = off + lim - 1;

      const { data, count, error } = await supabase
        .from('employees')
        .select('*', { count: 'exact', head: false })
        .eq('tenant_id', tenant_id)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw new Error(error.message);

      res.json({
        status: 'success',
        data: {
          employees: data || [],
          total: typeof count === 'number' ? count : (data ? data.length : 0),
          limit: lim,
          offset: off,
        },
      });
    } catch (error) {
      console.error('Error listing employees:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/employees/:id - Get single employee
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }
      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();

      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .eq('id', id)
        .eq('tenant_id', tenant_id)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 is No rows
        throw new Error(error.message);
      }

      if (!data) {
        return res.status(404).json({ status: 'error', message: 'Employee not found' });
      }

      res.json({
        status: 'success',
        data: { employee: data },
      });
    } catch (error) {
      console.error('Error getting employee:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/employees - Create employee
  router.post('/', async (req, res) => {
    try {
      const { tenant_id, first_name, last_name, email, role, phone, department, metadata } = req.body;

      if (!tenant_id || !email) {
        return res.status(400).json({ status: 'error', message: 'tenant_id and email are required' });
      }
      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();

      const insertData = {
        tenant_id,
        first_name,
        last_name,
        email,
        role,
        phone,
        department,
        metadata: metadata || {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('employees')
        .insert([insertData])
        .select()
        .single();

      if (error) throw new Error(error.message);

      res.json({
        status: 'success',
        message: 'Employee created',
        data: { employee: data },
      });
    } catch (error) {
      console.error('Error creating employee:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // PUT /api/employees/:id - Update employee
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id, first_name, last_name, email, role, phone, department, metadata } = req.body;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }
      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();

      const updateData = {
        ...(first_name !== undefined && { first_name }),
        ...(last_name !== undefined && { last_name }),
        ...(email !== undefined && { email }),
        ...(role !== undefined && { role }),
        ...(phone !== undefined && { phone }),
        ...(department !== undefined && { department }),
        ...(metadata !== undefined && { metadata }),
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('employees')
        .update(updateData)
        .eq('id', id)
        .eq('tenant_id', tenant_id)
        .select()
        .single();

      if (error && error.code !== 'PGRST116') {
        throw new Error(error.message);
      }

      if (!data) {
        return res.status(404).json({ status: 'error', message: 'Employee not found' });
      }

      res.json({
        status: 'success',
        message: 'Employee updated',
        data: { employee: data },
      });
    } catch (error) {
      console.error('Error updating employee:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // DELETE /api/employees/:id - Delete employee
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }
      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();

      const { data, error } = await supabase
        .from('employees')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tenant_id)
        .select()
        .single();

      if (error && error.code !== 'PGRST116') {
        throw new Error(error.message);
      }

      if (!data) {
        return res.status(404).json({ status: 'error', message: 'Employee not found' });
      }

      res.json({
        status: 'success',
        message: 'Employee deleted',
        data: { employee: data },
      });
    } catch (error) {
      console.error('Error deleting employee:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
