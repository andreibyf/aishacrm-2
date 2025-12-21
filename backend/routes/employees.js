/**
 * Employee Routes
 * Employee management with full CRUD operations
 */

import express from 'express';

export default function createEmployeeRoutes(_pgPool) {
  const router = express.Router();

  const isUniqueEmailError = (error) => {
    if (!error) return false;
    if (error.code === '23505') return true;
    const message = (error.message || '').toLowerCase();
    return message.includes('duplicate key') || message.includes('already exists');
  };

  const normalizeEmail = (value) => (typeof value === 'string' ? value.trim() : '');

  const respondWithDuplicateEmail = (res) =>
    res.status(409).json({
      status: 'error',
      code: 'EMPLOYEE_EMAIL_CONFLICT',
      message: 'An employee with this email already exists for this tenant.',
    });

  const hasTenantEmailConflict = async (supabase, tenantId, email, excludeId) => {
    const normalized = normalizeEmail(email);
    if (!normalized) return false;
    const query = supabase
      .from('employees')
      .select('id')
      .eq('tenant_id', tenantId)
      .ilike('email', normalized)
      .limit(1);
    if (excludeId) {
      query.neq('id', excludeId);
    }
    const { data, error } = await query;
    if (error) {
      throw error;
    }
    console.log('[EmployeeRoutes] tenant email check', {
      tenantId,
      email: normalized,
      matchCount: Array.isArray(data) ? data.length : 0,
      excludeId,
    });
    return Array.isArray(data) && data.length > 0;
  };

  // Helper function to expand metadata fields to top-level properties
  const expandMetadata = (record) => {
    if (!record) return record;
    const { metadata = {}, ...rest } = record;
    return {
      ...rest,
      ...metadata,
      metadata,
    };
  };

  /**
   * @openapi
   * /api/employees:
   *   get:
   *     summary: List employees
   *     description: Returns employees by tenant or looks up by email.
   *     tags: [employees]
   *     parameters:
   *       - in: query
   *         name: tenant_id
   *         schema:
   *           type: string
   *           format: uuid
   *         description: Tenant UUID scope (required unless email provided)
   *       - in: query
   *         name: email
   *         schema:
   *           type: string
   *           format: email
   *         description: Direct lookup by email (ignores tenant_id)
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *         description: Page size (default 50)
   *       - in: query
   *         name: offset
   *         schema:
   *           type: integer
   *         description: Pagination offset (default 0)
   *     responses:
   *       200:
   *         description: Employees list or single email match
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   *       400:
   *         description: Missing tenant_id without email
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
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

        const employees = (data || []).map(expandMetadata);

        return res.json({
          status: 'success',
          data: employees,
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

      const employees = (data || []).map(expandMetadata);

      res.json({
        status: 'success',
        data: {
          employees,
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

  /**
   * @openapi
   * /api/employees/{id}:
   *   get:
   *     summary: Get an employee
   *     description: Returns a single employee by ID within tenant scope.
   *     tags: [employees]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *       - in: query
   *         name: tenant_id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       200:
   *         description: Employee details
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   *       400:
   *         description: Missing tenant_id
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       404:
   *         description: Not found
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
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
        .eq('tenant_id', tenant_id)
        .eq('id', id)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 is No rows
        throw new Error(error.message);
      }

      if (!data) {
        return res.status(404).json({ status: 'error', message: 'Employee not found' });
      }

      const employee = expandMetadata(data);

      res.json({
        status: 'success',
        data: { employee },
      });
    } catch (error) {
      console.error('Error getting employee:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  /**
   * @openapi
   * /api/employees:
   *   post:
   *     summary: Create employee
   *     description: Creates an employee; test-pattern emails are blocked.
   *     tags: [employees]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [tenant_id, first_name, last_name]
   *             properties:
   *               tenant_id:
   *                 type: string
   *                 format: uuid
   *               first_name:
   *                 type: string
   *               last_name:
   *                 type: string
   *               email:
   *                 type: string
   *                 format: email
   *               role:
   *                 type: string
   *               status:
   *                 type: string
   *               metadata:
   *                 type: object
   *     responses:
   *       200:
   *         description: Employee created
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   *       400:
   *         description: Validation error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       403:
   *         description: Test email blocked
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  // POST /api/employees - Create employee
  router.post('/', async (req, res) => {
    try {
      console.log('[EmployeeRoutes] POST body', req.body);
      const { tenant_id, first_name, last_name, email, role, status, phone, department, metadata, ...additionalFields } = req.body;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }
      
      if (!first_name || !last_name) {
        return res.status(400).json({ status: 'error', message: 'first_name and last_name are required' });
      }

      // HARD BLOCK: prevent creation of test-pattern emails to avoid E2E pollution
      if (email) {
        const testEmailPatterns = [
          /audit\.test\./i,
          /e2e\.temp\./i,
          /@playwright\.test$/i,
          /@example\.com$/i,
        ];
        if (testEmailPatterns.some((re) => re.test(String(email)))) {
          return res.status(403).json({
            status: 'error',
            code: 'TEST_EMAIL_BLOCKED',
            message: 'Employee creation blocked for test email patterns',
          });
        }
      }
      
      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();

      if (await hasTenantEmailConflict(supabase, tenant_id, email)) {
        return respondWithDuplicateEmail(res);
      }

      // Store phone, department, and any additional fields in metadata since they may not be direct columns
      const combinedMetadata = {
        ...(metadata || {}),
        ...(additionalFields || {}),
        ...(phone !== undefined && phone !== null ? { phone } : {}),
        ...(department !== undefined && department !== null ? { department } : {}),
      };

      const insertData = {
        tenant_id,
        first_name,
        last_name,
        email: email || null,
        role: role || null,
        status: status || 'active',
        metadata: combinedMetadata,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('employees')
        .insert([insertData])
        .select()
        .single();

      if (error) {
        if (isUniqueEmailError(error)) {
          return respondWithDuplicateEmail(res);
        }
        throw error;
      }

      const employee = expandMetadata(data);

      res.status(201).json({
        status: 'success',
        message: 'Employee created',
        data: { employee },
      });
    } catch (error) {
      console.error('Error creating employee:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  /**
   * @openapi
   * /api/employees/{id}:
   *   put:
   *     summary: Update employee
   *     description: Updates employee fields within tenant scope.
   *     tags: [employees]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               tenant_id:
   *                 type: string
   *                 format: uuid
   *               first_name:
   *                 type: string
   *               last_name:
   *                 type: string
   *               email:
   *                 type: string
   *                 format: email
   *               role:
   *                 type: string
   *               phone:
   *                 type: string
   *               department:
   *                 type: string
   *               metadata:
   *                 type: object
   *     responses:
   *       200:
   *         description: Employee updated
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   *       400:
   *         description: Missing tenant_id
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       404:
   *         description: Not found
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  // PUT /api/employees/:id - Update employee
  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id, first_name, last_name, email, role, phone, department, metadata, ...otherFields } = req.body;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }
      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();

      // Fetch current metadata first to merge
      const { data: current, error: fetchErr } = await supabase
        .from('employees')
        .select('metadata')
        .eq('id', id)
        .eq('tenant_id', tenant_id)
        .single();

      if (fetchErr && fetchErr.code !== 'PGRST116') {
        throw new Error(fetchErr.message);
      }

      if (!current) {
        return res.status(404).json({ status: 'error', message: 'Employee not found' });
      }

      if (email !== undefined && (await hasTenantEmailConflict(supabase, tenant_id, email, id))) {
        return respondWithDuplicateEmail(res);
      }

      // Merge phone, department, and other fields into metadata
      const currentMetadata = current?.metadata || {};
      const updatedMetadata = {
        ...currentMetadata,
        ...(metadata || {}),
        ...(otherFields || {}),
        ...(phone !== undefined ? { phone } : {}),
        ...(department !== undefined ? { department } : {}),
      };

      const updateData = {
        ...(first_name !== undefined && { first_name }),
        ...(last_name !== undefined && { last_name }),
        ...(email !== undefined && { email }),
        ...(role !== undefined && { role }),
        metadata: updatedMetadata,
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
        if (isUniqueEmailError(error)) {
          return respondWithDuplicateEmail(res);
        }
        throw error;
      }

      if (!data) {
        return res.status(404).json({ status: 'error', message: 'Employee not found' });
      }

      const employee = expandMetadata(data);

      res.json({
        status: 'success',
        message: 'Employee updated',
        data: { employee },
      });
    } catch (error) {
      console.error('Error updating employee:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  /**
   * @openapi
   * /api/employees/{id}:
   *   delete:
   *     summary: Delete employee
   *     description: Deletes an employee within tenant scope.
   *     tags: [employees]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *       - in: query
   *         name: tenant_id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       200:
   *         description: Employee deleted
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   *       404:
   *         description: Not found
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
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

      const employee = expandMetadata(data);

      res.json({
        status: 'success',
        message: 'Employee deleted',
        data: { employee },
      });
    } catch (error) {
      console.error('Error deleting employee:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
