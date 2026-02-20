/**
 * Employee Routes
 * Employee management with full CRUD operations
 */

import express from 'express';
import { cacheList } from '../lib/cacheMiddleware.js';
import logger from '../lib/logger.js';
import { inviteUserByEmail, getAuthUserByEmail } from '../lib/supabaseAuth.js';

export default function createEmployeeRoutes(_pgPool) {
  const router = express.Router();

  const isUniqueEmailError = (error) => {
    if (!error) return false;
    if (error.code === '23505') return true;
    const message = (error.message || '').toLowerCase();
    return message.includes('duplicate key') || message.includes('already exists');
  };

  const normalizeEmail = (value) => (typeof value === 'string' ? value.toLowerCase().trim() : '');

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
    logger.debug('[EmployeeRoutes] tenant email check', {
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
  router.get('/', cacheList('employees', 180), async (req, res) => {
    try {
      const { tenant_id, email, limit = 50, offset = 0 } = req.query;

      // Allow lookup by email without tenant_id (for auth user lookup)
      if (email) {
        const { getSupabaseClient } = await import('../lib/supabase-db.js');
        const supabase = getSupabaseClient();

        const { data, error } = await supabase
          .from('employees')
          .select('*')
          .eq('email', String(email).toLowerCase().trim())
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
          total: typeof count === 'number' ? count : data ? data.length : 0,
          limit: lim,
          offset: off,
        },
      });
    } catch (error) {
      logger.error('Error listing employees:', error);
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

      if (error && error.code !== 'PGRST116') {
        // PGRST116 is No rows
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
      logger.error('Error getting employee:', error);
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
      logger.debug('[EmployeeRoutes] POST body', req.body);
      const {
        tenant_id,
        first_name,
        last_name,
        email,
        role,
        status,
        phone,
        department,
        metadata,
        ...additionalFields
      } = req.body;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      if (!first_name || !last_name) {
        return res
          .status(400)
          .json({ status: 'error', message: 'first_name and last_name are required' });
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
        email: email ? String(email).toLowerCase().trim() : null,
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

      // If CRM access requested and email provided, send Supabase Auth invite + create users record
      let invitation_sent = false;
      let invitation_error = null;
      const hasCrmAccess =
        combinedMetadata.has_crm_access === true || req.body.has_crm_access === true;
      const crmRole = combinedMetadata.crm_user_employee_role || role || 'employee';

      if (hasCrmAccess && email) {
        try {
          // Check if auth user already exists
          const { user: existingAuth } = await getAuthUserByEmail(email);
          if (existingAuth) {
            logger.debug(`[EmployeeRoutes] Auth user already exists for ${email}, skipping invite`);
            invitation_sent = true; // Already has auth access
          } else {
            const { user: authUser, error: authError } = await inviteUserByEmail(email, {
              first_name,
              last_name,
              role: crmRole,
              tenant_id,
              display_name: `${first_name} ${last_name || ''}`.trim(),
              employee_id: data.id,
            });
            if (authError) {
              logger.error('[EmployeeRoutes] Auth invite failed:', authError);
              invitation_error = authError.message;
            } else {
              logger.info(`[EmployeeRoutes] Auth invite sent to ${email}`);
              invitation_sent = true;
            }
          }
        } catch (authErr) {
          logger.error('[EmployeeRoutes] Auth invite exception:', authErr);
          invitation_error = authErr.message;
        }

        // Also ensure a users table record exists so employee appears in User Management
        try {
          // Resolve tenant_uuid from tenant table for RLS compatibility
          let resolvedTenantUuid = null;
          try {
            const { data: tenantRow } = await supabase
              .from('tenant')
              .select('id')
              .eq('tenant_id', tenant_id)
              .limit(1)
              .maybeSingle();
            resolvedTenantUuid = tenantRow?.id || tenant_id; // fallback: tenant_id IS the UUID
          } catch {
            resolvedTenantUuid = tenant_id;
          }

          const { data: existingUser } = await supabase
            .from('users')
            .select('id')
            .eq('email', email.toLowerCase())
            .limit(1)
            .maybeSingle();

          if (!existingUser) {
            const { error: userInsertErr } = await supabase.from('users').insert({
              email: email.toLowerCase(),
              first_name,
              last_name,
              role: crmRole,
              tenant_id,
              tenant_uuid: resolvedTenantUuid,
              status: 'active',
              metadata: {
                crm_access: true,
                is_active: true,
                display_name: `${first_name} ${last_name || ''}`.trim(),
                employee_role: crmRole,
                employee_id: data.id,
                requested_access: 'read_write',
                created_via: 'employee_form',
              },
            });
            if (userInsertErr) {
              logger.error('[EmployeeRoutes] Failed to create users record:', userInsertErr);
            } else {
              logger.info(`[EmployeeRoutes] Users record created for ${email}`);
            }
          } else {
            // Reactivate existing user record and sync names/tenant_uuid
            const { error: userUpdateErr } = await supabase
              .from('users')
              .update({
                status: 'active',
                first_name,
                last_name,
                tenant_uuid: resolvedTenantUuid,
                updated_at: new Date().toISOString(),
              })
              .eq('id', existingUser.id);
            if (userUpdateErr) {
              logger.warn('[EmployeeRoutes] Failed to reactivate users record:', userUpdateErr);
            } else {
              logger.info(`[EmployeeRoutes] Reactivated existing users record for ${email}`);
            }
          }
        } catch (userSyncErr) {
          // Non-fatal: employee was created, user sync is best-effort
          logger.error('[EmployeeRoutes] Users table sync error:', userSyncErr);
        }
      }

      res.status(201).json({
        status: invitation_error ? 'partial' : 'success',
        message: invitation_error
          ? `Employee created but CRM invitation failed: ${invitation_error}. Use Resend Invite to retry.`
          : hasCrmAccess && email
            ? `Employee created and invitation sent to ${email}`
            : 'Employee created',
        data: {
          employee,
          invitation_sent,
          ...(invitation_error && { invitation_error }),
        },
      });
    } catch (error) {
      logger.error('Error creating employee:', error);
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
      const {
        tenant_id,
        first_name,
        last_name,
        email,
        role,
        phone,
        department,
        metadata,
        ...otherFields
      } = req.body;

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
        ...(email !== undefined && { email: String(email).toLowerCase().trim() }),
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

      // Check if CRM access was just enabled (toggled from off → on) or disabled (on → off)
      const prevCrmAccess = currentMetadata.has_crm_access === true;
      const newCrmAccess = updatedMetadata.has_crm_access === true;
      const employeeEmail = data.email || email;
      const crmRole = updatedMetadata.crm_user_employee_role || data.role || 'employee';
      let invitation_sent = false;
      let invitation_error = null;

      if (newCrmAccess && !prevCrmAccess && employeeEmail) {
        // CRM access toggled ON
        try {
          const { user: existingAuth } = await getAuthUserByEmail(employeeEmail);
          if (existingAuth) {
            logger.debug(
              `[EmployeeRoutes] Auth user already exists for ${employeeEmail}, skipping invite`,
            );
            invitation_sent = true;
          } else {
            const { user: authUser, error: authError } = await inviteUserByEmail(employeeEmail, {
              first_name: data.first_name,
              last_name: data.last_name,
              role: crmRole,
              tenant_id,
              display_name: `${data.first_name} ${data.last_name || ''}`.trim(),
              employee_id: data.id,
            });
            if (authError) {
              logger.error('[EmployeeRoutes] Auth invite on CRM access toggle failed:', authError);
              invitation_error = authError.message;
            } else {
              logger.info(`[EmployeeRoutes] CRM access enabled, invite sent to ${employeeEmail}`);
              invitation_sent = true;
            }
          }
        } catch (authErr) {
          logger.error('[EmployeeRoutes] Auth invite exception on update:', authErr);
          invitation_error = authErr.message;
        }

        // Ensure users table record exists (for User Management visibility)
        try {
          // Resolve tenant_uuid from tenant table for RLS compatibility
          let resolvedTenantUuid = null;
          try {
            const { data: tenantRow } = await supabase
              .from('tenant')
              .select('id')
              .eq('tenant_id', tenant_id)
              .limit(1)
              .maybeSingle();
            resolvedTenantUuid = tenantRow?.id || tenant_id;
          } catch {
            resolvedTenantUuid = tenant_id;
          }

          const { data: existingUser } = await supabase
            .from('users')
            .select('id')
            .eq('email', employeeEmail.toLowerCase())
            .limit(1)
            .maybeSingle();

          if (!existingUser) {
            const { error: userInsertErr } = await supabase.from('users').insert({
              email: employeeEmail.toLowerCase(),
              first_name: data.first_name,
              last_name: data.last_name,
              role: crmRole,
              tenant_id,
              tenant_uuid: resolvedTenantUuid,
              status: 'active',
              metadata: {
                crm_access: true,
                is_active: true,
                display_name: `${data.first_name} ${data.last_name || ''}`.trim(),
                employee_role: crmRole,
                employee_id: data.id,
                requested_access: 'read_write',
                created_via: 'employee_crm_toggle',
              },
            });
            if (userInsertErr) {
              logger.error(
                '[EmployeeRoutes] Failed to create users record on toggle:',
                userInsertErr,
              );
            } else {
              logger.info(`[EmployeeRoutes] Users record created for ${employeeEmail}`);
            }
          } else {
            // Reactivate existing user record and sync names/tenant_uuid
            await supabase
              .from('users')
              .update({
                status: 'active',
                first_name: data.first_name,
                last_name: data.last_name,
                tenant_uuid: resolvedTenantUuid,
                updated_at: new Date().toISOString(),
              })
              .eq('id', existingUser.id);
            logger.info(`[EmployeeRoutes] Reactivated users record for ${employeeEmail}`);
          }
        } catch (userSyncErr) {
          logger.error('[EmployeeRoutes] Users table sync error on toggle-on:', userSyncErr);
        }
      } else if (!newCrmAccess && prevCrmAccess && employeeEmail) {
        // CRM access toggled OFF — deactivate the users table record
        try {
          const { data: existingUser } = await supabase
            .from('users')
            .select('id')
            .eq('email', employeeEmail.toLowerCase())
            .limit(1)
            .maybeSingle();

          if (existingUser) {
            await supabase
              .from('users')
              .update({ status: 'inactive', updated_at: new Date().toISOString() })
              .eq('id', existingUser.id);
            logger.info(
              `[EmployeeRoutes] CRM access removed, deactivated users record for ${employeeEmail}`,
            );
          }
        } catch (userSyncErr) {
          logger.error('[EmployeeRoutes] Users table sync error on toggle-off:', userSyncErr);
        }
      }

      res.json({
        status: invitation_error ? 'partial' : 'success',
        message: invitation_error
          ? `Employee updated but CRM invitation failed: ${invitation_error}. Use Resend Invite to retry.`
          : invitation_sent
            ? `Employee updated and invitation sent to ${employeeEmail}`
            : 'Employee updated',
        data: {
          employee,
          ...(invitation_sent && { invitation_sent }),
          ...(invitation_error && { invitation_error }),
        },
      });
    } catch (error) {
      logger.error('Error updating employee:', error);
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
      logger.error('Error deleting employee:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
