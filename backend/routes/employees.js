/**
 * Employee Routes
 * Employee management with full CRUD operations
 */

import express from 'express';

export default function createEmployeeRoutes(pgPool) {
  const router = express.Router();

  // GET /api/employees - List employees
  router.get('/', async (req, res) => {
    try {
      const { tenant_id, limit = 50, offset = 0 } = req.query;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const result = await pgPool.query(
        'SELECT * FROM employees WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
        [tenant_id, parseInt(limit), parseInt(offset)]
      );

      const countResult = await pgPool.query(
        'SELECT COUNT(*) FROM employees WHERE tenant_id = $1',
        [tenant_id]
      );

      res.json({
        status: 'success',
        data: {
          employees: result.rows,
          total: parseInt(countResult.rows[0].count),
          limit: parseInt(limit),
          offset: parseInt(offset),
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

      const result = await pgPool.query(
        'SELECT * FROM employees WHERE id = $1 AND tenant_id = $2',
        [id, tenant_id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Employee not found' });
      }

      res.json({
        status: 'success',
        data: { employee: result.rows[0] },
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

      const result = await pgPool.query(
        `INSERT INTO employees (tenant_id, first_name, last_name, email, role, phone, department, metadata, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
         RETURNING *`,
        [tenant_id, first_name, last_name, email, role, phone, department, metadata || {}]
      );

      res.json({
        status: 'success',
        message: 'Employee created',
        data: { employee: result.rows[0] },
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

      const result = await pgPool.query(
        `UPDATE employees 
         SET first_name = COALESCE($1, first_name),
             last_name = COALESCE($2, last_name),
             email = COALESCE($3, email),
             role = COALESCE($4, role),
             phone = COALESCE($5, phone),
             department = COALESCE($6, department),
             metadata = COALESCE($7, metadata),
             updated_at = NOW()
         WHERE id = $8 AND tenant_id = $9
         RETURNING *`,
        [first_name, last_name, email, role, phone, department, metadata, id, tenant_id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Employee not found' });
      }

      res.json({
        status: 'success',
        message: 'Employee updated',
        data: { employee: result.rows[0] },
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

      const result = await pgPool.query(
        'DELETE FROM employees WHERE id = $1 AND tenant_id = $2 RETURNING *',
        [id, tenant_id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Employee not found' });
      }

      res.json({
        status: 'success',
        message: 'Employee deleted',
        data: { employee: result.rows[0] },
      });
    } catch (error) {
      console.error('Error deleting employee:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
