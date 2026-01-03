/**
 * Cash Flow Routes
 * CRUD operations for cash flow records
 */

import express from 'express';
import { validateTenantScopedId } from '../lib/validation.js';
import { validateTenantAccess, enforceEmployeeDataScope } from '../middleware/validateTenant.js';
import { getSupabaseClient } from '../lib/supabase-db.js';
import { cacheList } from '../lib/cacheMiddleware.js';
import logger from '../lib/logger.js';

/**
 * @module routes/cashflow
 * @description Cash flow management routes
 */

export default function createCashFlowRoutes(_pgPool) {
  const router = express.Router();
  const supabase = getSupabaseClient();

  // Enforce tenant scoping and employee data scope consistently with other routes
  router.use(validateTenantAccess);
  router.use(enforceEmployeeDataScope);

  // GET /api/cashflow - List cash flow records
  router.get('/', cacheList('cashflow', 180), async (req, res) => {
    try {
      const { limit = 50, offset = 0, type } = req.query;

      // Enforce tenant isolation
      const tenant_id = req.tenant?.id || req.query.tenant_id;
      if (!tenant_id) {
        return res.status(400).json({
          status: 'error',
          message: 'tenant_id is required'
        });
      }

      let query = supabase
        .from('cash_flow')
        .select('*', { count: 'exact' })
        .eq('tenant_id', tenant_id)  // Always enforce tenant scoping
        .order('transaction_date', { ascending: false });

      if (type) {
        query = query.eq('type', type);
      }

      const { data, error, count } = await query
        .range(Number(offset), Number(offset) + Number(limit) - 1);

      if (error) throw error;

      res.json({ status: 'success', data: { cashflow: data || [], total: count || 0 } });
    } catch (error) {
      logger.error('Error fetching cash flow:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/cashflow/:id - Get single record (tenant scoped)
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      let { tenant_id } = req.query || {};
      // Accept UUID or slug; normalize
      if (!validateTenantScopedId(id, tenant_id, res)) return;

      const { data, error } = await supabase
        .from('cash_flow')
        .select('*')
        .eq('id', id)
        .eq('tenant_id', tenant_id)
        .maybeSingle();

      if (error) throw error;
      if (!data) return res.status(404).json({ status: 'error', message: 'Not found' });
      // Safety check
      if (data.tenant_id !== tenant_id) return res.status(404).json({ status: 'error', message: 'Not found' });
      res.json({ status: 'success', data: { cashflow: data } });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/cashflow - Create record
  router.post('/', async (req, res) => {
    try {
      const c = req.body;
      if (!c.tenant_id || !c.amount || !c.type || !c.transaction_date) {
        return res.status(400).json({ status: 'error', message: 'tenant_id, amount, type, and transaction_date required' });
      }

      // Normalize tenant_id if UUID provided
      const resolvedTenantId = c.tenant_id;

      const { data, error } = await supabase
        .from('cash_flow')
        .insert({
          tenant_id: resolvedTenantId,
          transaction_date: c.transaction_date,
          amount: c.amount,
          type: c.type,
          category: c.category || null,
          description: c.description || null,
          account_id: c.account_id || null,
          metadata: c.metadata || {}
        })
        .select()
        .single();

      if (error) throw error;

      res.status(201).json({ status: 'success', message: 'Created', data: { cashflow: data } });
    } catch (error) {
      logger.error('Error creating cash flow:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // PUT /api/cashflow/:id - Update record (tenant scoped)
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      let { tenant_id } = req.query || {};
      const u = req.body;
      if (!validateTenantScopedId(id, tenant_id, res)) return;

      const allowed = ['transaction_date', 'amount', 'type', 'category', 'description', 'account_id', 'metadata'];
      const updatePayload = {};
      Object.entries(u).forEach(([k, v]) => {
        if (allowed.includes(k)) {
          updatePayload[k] = v;
        }
      });

      if (Object.keys(updatePayload).length === 0) {
        return res.status(400).json({ status: 'error', message: 'No valid fields' });
      }

      const { data, error } = await supabase
        .from('cash_flow')
        .update(updatePayload)
        .eq('id', id)
        .eq('tenant_id', tenant_id)
        .select()
        .maybeSingle();

      if (error) throw error;
      if (!data) return res.status(404).json({ status: 'error', message: 'Not found' });

      res.json({ status: 'success', message: 'Updated', data: { cashflow: data } });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // DELETE /api/cashflow/:id - Delete record (tenant scoped)
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      let { tenant_id } = req.query || {};
      if (!validateTenantScopedId(id, tenant_id, res)) return;

      const { data, error } = await supabase
        .from('cash_flow')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tenant_id)
        .select('id')
        .maybeSingle();

      if (error) throw error;
      if (!data) return res.status(404).json({ status: 'error', message: 'Not found' });

      res.json({ status: 'success', message: 'Deleted', data: { id: data.id } });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/cashflow/summary - Get cash flow summary
  router.get('/summary', async (req, res) => {
    try {
      let { tenant_id, start_date, end_date } = req.query;
      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }
      // Normalize tenant id

      let query = supabase
        .from('cash_flow')
        .select('type, amount')
        .eq('tenant_id', tenant_id);

      if (start_date) {
        query = query.gte('transaction_date', start_date);
      }
      if (end_date) {
        query = query.lte('transaction_date', end_date);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Client-side aggregation
      const income = (data || []).filter(r => r.type === 'income').reduce((sum, r) => sum + Number(r.amount), 0);
      const expenses = (data || []).filter(r => r.type === 'expense').reduce((sum, r) => sum + Number(r.amount), 0);
      const net = income - expenses;

      res.json({ status: 'success', data: { tenant_id, period: { start_date: start_date || null, end_date: end_date || null }, income, expenses, net } });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
