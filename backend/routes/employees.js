/**
 * Employee Routes
 * Employee management
 */

import express from 'express';

export default function createEmployeeRoutes(pgPool) {
  const router = express.Router();

  // GET /api/employees - List employees
  router.get('/', async (req, res) => {
    try {
      const { tenant_id } = req.query;

      res.json({
        status: 'success',
        data: { employees: [], tenant_id },
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/employees - Create employee
  router.post('/', async (req, res) => {
    try {
      const { tenant_id, first_name, last_name, email, role } = req.body;

      res.json({
        status: 'success',
        message: 'Employee created',
        data: { tenant_id, first_name, last_name, email, role },
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
