/**
 * Cash Flow Routes
 * CRUD operations for cash flow records
 */

import express from 'express';
import { validateTenantScopedId } from '../lib/validation.js';

export default function createCashFlowRoutes(pgPool) {
  const router = express.Router();

  // GET /api/cashflow - List cash flow records
  router.get('/', async (req, res) => {
    try {
      const { tenant_id, limit = 50, offset = 0, transaction_type } = req.query;
      if (!pgPool) return res.status(503).json({ status: 'error', message: 'Database not configured' });

      let query = 'SELECT * FROM cash_flow WHERE 1=1';
      const params = [];
      let pc = 1;
      if (tenant_id) { query += ` AND tenant_id = $${pc}`; params.push(tenant_id); pc++; }
      if (transaction_type) { query += ` AND transaction_type = $${pc}`; params.push(transaction_type); pc++; }
      query += ` ORDER BY transaction_date DESC LIMIT $${pc} OFFSET $${pc + 1}`;
      params.push(parseInt(limit), parseInt(offset));

      const result = await pgPool.query(query, params);
      let countQuery = 'SELECT COUNT(*) FROM cash_flow WHERE 1=1';
      const countParams = [];
      let cpc = 1;
      if (tenant_id) { countQuery += ` AND tenant_id = $${cpc}`; countParams.push(tenant_id); cpc++; }
      if (transaction_type) { countQuery += ` AND transaction_type = $${cpc}`; countParams.push(transaction_type); }
      const countResult = await pgPool.query(countQuery, countParams);

      res.json({ status: 'success', data: { cashflow: result.rows, total: parseInt(countResult.rows[0].count) } });
    } catch (error) {
      console.error('Error fetching cash flow:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/cashflow/:id - Get single record (tenant scoped)
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query || {};
      if (!validateTenantScopedId(id, tenant_id, res)) return;
      if (!pgPool) return res.status(503).json({ status: 'error', message: 'Database not configured' });
      const result = await pgPool.query('SELECT * FROM cash_flow WHERE tenant_id = $1 AND id = $2 LIMIT 1', [tenant_id, id]);
      if (result.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Not found' });
      // Safety check
      if (result.rows[0].tenant_id !== tenant_id) return res.status(404).json({ status: 'error', message: 'Not found' });
      res.json({ status: 'success', data: { cashflow: result.rows[0] } });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/cashflow - Create record
  router.post('/', async (req, res) => {
    try {
      const c = req.body;
      if (!c.tenant_id || !c.amount || !c.transaction_type || !c.transaction_date) {
        return res.status(400).json({ status: 'error', message: 'tenant_id, amount, transaction_type, and transaction_date required' });
      }
      if (!pgPool) return res.status(503).json({ status: 'error', message: 'Database not configured' });

      const query = `INSERT INTO cash_flow (tenant_id, transaction_date, amount, transaction_type, category, description, account_id, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`;
      const vals = [c.tenant_id, c.transaction_date, c.amount, c.transaction_type, c.category || null, c.description || null, c.account_id || null, JSON.stringify(c.metadata || {})];
      const result = await pgPool.query(query, vals);
      res.status(201).json({ status: 'success', message: 'Created', data: { cashflow: result.rows[0] } });
    } catch (error) {
      console.error('Error creating cash flow:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // PUT /api/cashflow/:id - Update record (tenant scoped)
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query || {};
      const u = req.body;

      if (!validateTenantScopedId(id, tenant_id, res)) return;
      if (!pgPool) return res.status(503).json({ status: 'error', message: 'Database not configured' });

      const allowed = ['transaction_date', 'amount', 'transaction_type', 'category', 'description', 'account_id', 'metadata'];
      const sets = [], vals = [tenant_id];
      let pc = 2;
      Object.entries(u).forEach(([k, v]) => {
        if (allowed.includes(k)) {
          sets.push(`${k} = $${pc}`);
          vals.push(k === 'metadata' ? JSON.stringify(v) : v);
          pc++;
        }
      });
      if (sets.length === 0) return res.status(400).json({ status: 'error', message: 'No valid fields' });
      vals.push(id);
      const result = await pgPool.query(`UPDATE cash_flow SET ${sets.join(', ')} WHERE tenant_id = $1 AND id = $${pc} RETURNING *`, vals);
      if (result.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Not found' });
      res.json({ status: 'success', message: 'Updated', data: { cashflow: result.rows[0] } });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // DELETE /api/cashflow/:id - Delete record (tenant scoped)
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query || {};

      if (!validateTenantScopedId(id, tenant_id, res)) return;
      if (!pgPool) return res.status(503).json({ status: 'error', message: 'Database not configured' });

      const result = await pgPool.query(
        'DELETE FROM cash_flow WHERE tenant_id = $1 AND id = $2 RETURNING id',
        [tenant_id, id]
      );
      if (result.rows.length === 0) return res.status(404).json({ status: 'error', message: 'Not found' });
      res.json({ status: 'success', message: 'Deleted', data: { id: result.rows[0].id } });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/cashflow/summary - Get cash flow summary
  router.get('/summary', async (req, res) => {
    try {
      const { tenant_id, start_date, end_date } = req.query;
      res.json({ status: 'success', data: { tenant_id, period: { start_date, end_date }, income: 0, expenses: 0, net: 0 } });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
