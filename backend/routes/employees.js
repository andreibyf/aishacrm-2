/**
 * Employee Routes
 * Employee management with full CRUD operations
 */

import express from 'express';
import { cacheList, invalidateCache } from '../lib/cacheMiddleware.js';
import logger from '../lib/logger.js';
import { requireAuth } from '../middleware/authenticate.js';
import { inviteUserByEmail, getAuthUserByEmail } from '../lib/supabaseAuth.js';
import {
  getEmployeeMap,
  resolveEmployeeNames,
  invalidateEmployeeCache,
} from '../lib/employeeCache.js';

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
  router.get('/', cacheList('employees', 30), async (req, res) => {
    try {
      const { tenant_id, email, linked_user_id, limit = 50, offset = 0 } = req.query;

      // Allow lookup by linked_user_id (find employee linked to a specific user)
      if (linked_user_id && tenant_id) {
        const { getSupabaseClient } = await import('../lib/supabase-db.js');
        const supabase = getSupabaseClient();

        const { data, error } = await supabase
          .from('employees')
          .select('*')
          .eq('tenant_id', tenant_id)
          .eq('metadata->>linked_user_id', linked_user_id)
          .limit(1);

        if (error) throw new Error(error.message);

        const employees = (data || []).map(expandMetadata);

        return res.json(employees);
      }

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

      const lim = parseInt(limit, 10) || 50;
      const off = parseInt(offset, 10) || 0;
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

  /**
   * @openapi
   * /api/employees/lookup:
   *   get:
   *     summary: Get employee ID to name mapping (cached)
   *     description: Returns a map of employee UUIDs to display names. Uses Redis cache for fast lookups.
   *     tags: [employees]
   *     parameters:
   *       - in: query
   *         name: tenant_id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *       - in: query
   *         name: ids
   *         schema:
   *           type: string
   *         description: Comma-separated list of employee IDs to resolve (optional - returns all if omitted)
   *     responses:
   *       200:
   *         description: Employee lookup map
   */
  router.get('/lookup', requireAuth, async (req, res) => {
    try {
      const { tenant_id, ids } = req.query;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      // Non-superadmin users may only query their own tenant
      if (req.user.role !== 'superadmin' && req.user.tenant_id !== tenant_id) {
        return res.status(403).json({ status: 'error', message: 'Access denied: tenant mismatch' });
      }

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();

      let employeeMap;

      if (ids) {
        // Resolve specific IDs
        const idArray = ids
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean);
        employeeMap = await resolveEmployeeNames(supabase, tenant_id, idArray);
      } else {
        // Return full tenant map
        employeeMap = await getEmployeeMap(supabase, tenant_id);
      }

      res.json({
        status: 'success',
        data: employeeMap,
        cached: true, // Response may be from cache
      });
    } catch (error) {
      logger.error('[Employees GET /lookup] Error:', error.message);
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
  router.post('/', invalidateCache('employees'), async (req, res) => {
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
      const linkedUserId = req.body.linked_user_id || combinedMetadata.linked_user_id || null;
      const crmRole = combinedMetadata.crm_user_employee_role || role || 'employee';

      // LINK-EXISTING: If linking to an existing CRM user, just update employee metadata
      // and skip auth invite + user creation entirely.
      if (linkedUserId && email) {
        try {
          const { data: linkedUser } = await supabase
            .from('users')
            .select('id, email, role')
            .eq('id', linkedUserId)
            .maybeSingle();

          if (linkedUser) {
            const linkMeta = {
              ...combinedMetadata,
              user_email: linkedUser.email,
              user_id: linkedUser.id,
              has_crm_access: true,
              linked_at: new Date().toISOString(),
            };
            await supabase
              .from('employees')
              .update({ metadata: linkMeta })
              .eq('id', data.id)
              .eq('tenant_id', tenant_id);
            logger.info(
              `[EmployeeRoutes] Linked employee ${data.id} to existing user ${linkedUser.id} (${linkedUser.email})`,
            );
            invitation_sent = true; // Already has auth access via linked user
          } else {
            logger.warn(
              `[EmployeeRoutes] linked_user_id ${linkedUserId} not found, falling through`,
            );
          }
        } catch (linkErr) {
          logger.error('[EmployeeRoutes] Link-existing-user error:', linkErr);
          invitation_error = linkErr.message;
        }
      } else if (hasCrmAccess && email) {
        try {
          // Check if auth user already exists
          const { user: existingAuth } = await getAuthUserByEmail(email);
          if (existingAuth) {
            logger.debug(`[EmployeeRoutes] Auth user already exists for ${email}, skipping invite`);
            invitation_sent = true; // Already has auth access
          } else {
            const { user: _authUser, error: authError } = await inviteUserByEmail(email, {
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
          const { data: existingUser } = await supabase
            .from('users')
            .select('id')
            .eq('email', email.toLowerCase())
            .limit(1)
            .maybeSingle();

          if (!existingUser) {
            // Build default navigation_permissions for manager or employee role
            const defaultNavPerms =
              crmRole === 'manager'
                ? {
                    dashboard: true,
                    leads: true,
                    contacts: true,
                    accounts: true,
                    opportunities: true,
                    activities: true,
                    employees: true,
                    reports: true,
                    settings: true,
                    bizdev_sources: true,
                  }
                : {
                    dashboard: true,
                    leads: true,
                    contacts: true,
                    accounts: true,
                    opportunities: true,
                    activities: true,
                    employees: false,
                    reports: false,
                    settings: false,
                    bizdev_sources: true,
                  };
            const { error: userInsertErr } = await supabase.from('users').insert({
              email: email.toLowerCase(),
              first_name,
              last_name,
              role: crmRole,
              tenant_id,
              status: 'active',
              metadata: {
                crm_access: true,
                is_active: true,
                display_name: `${first_name} ${last_name || ''}`.trim(),
                employee_role: crmRole,
                employee_id: data.id,
                requested_access: 'read_write',
                created_via: 'employee_form',
                navigation_permissions: defaultNavPerms,
                permissions: { intended_role: 'user' },
              },
            });
            if (userInsertErr) {
              logger.error('[EmployeeRoutes] Failed to create users record:', userInsertErr);
            } else {
              logger.info(`[EmployeeRoutes] Users record created for ${email}`);
            }
          } else {
            // Reactivate existing user record and sync names
            const { error: userUpdateErr } = await supabase
              .from('users')
              .update({
                status: 'active',
                first_name,
                last_name,
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

      // Invalidate employee lookup cache
      await invalidateEmployeeCache(tenant_id);

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
  router.put('/:id', invalidateCache('employees'), async (req, res) => {
    try {
      const { id } = req.params;
      const {
        tenant_id: body_tenant_id,
        first_name,
        last_name,
        email,
        role,
        phone,
        department,
        metadata,
        ...otherFields
      } = req.body;
      // Resolve tenant_id consistently: body → query → middleware-resolved tenant
      const tenant_id = body_tenant_id || req.query.tenant_id || req.tenant?.id;

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
            const { user: _authUser, error: authError } = await inviteUserByEmail(employeeEmail, {
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
          const { data: existingUser } = await supabase
            .from('users')
            .select('id')
            .eq('email', employeeEmail.toLowerCase())
            .limit(1)
            .maybeSingle();

          if (!existingUser) {
            // Build default navigation_permissions for manager or employee role
            const defaultNavPermsToggle =
              crmRole === 'manager'
                ? {
                    dashboard: true,
                    leads: true,
                    contacts: true,
                    accounts: true,
                    opportunities: true,
                    activities: true,
                    employees: true,
                    reports: true,
                    settings: true,
                    bizdev_sources: true,
                  }
                : {
                    dashboard: true,
                    leads: true,
                    contacts: true,
                    accounts: true,
                    opportunities: true,
                    activities: true,
                    employees: false,
                    reports: false,
                    settings: false,
                    bizdev_sources: true,
                  };
            const { error: userInsertErr } = await supabase.from('users').insert({
              email: employeeEmail.toLowerCase(),
              first_name: data.first_name,
              last_name: data.last_name,
              role: crmRole,
              tenant_id,
              status: 'active',
              metadata: {
                crm_access: true,
                is_active: true,
                display_name: `${data.first_name} ${data.last_name || ''}`.trim(),
                employee_role: crmRole,
                employee_id: data.id,
                requested_access: 'read_write',
                created_via: 'employee_crm_toggle',
                navigation_permissions: defaultNavPermsToggle,
                permissions: { intended_role: 'user' },
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
            // Reactivate existing user record and sync names
            await supabase
              .from('users')
              .update({
                status: 'active',
                first_name: data.first_name,
                last_name: data.last_name,
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

      // SYNC: Whenever CRM access is active, keep users table role + metadata in sync
      // with the employee record. This prevents the "revert" issue between the two forms.
      if (newCrmAccess && employeeEmail) {
        try {
          const { data: linkedUser } = await supabase
            .from('users')
            .select('id, metadata, role')
            .eq('email', employeeEmail.toLowerCase())
            .limit(1)
            .maybeSingle();

          if (linkedUser) {
            const currentUserMeta = linkedUser.metadata || {};
            const syncedMeta = {
              ...currentUserMeta,
              employee_role: crmRole,
              employee_id: data.id,
              crm_user_email: employeeEmail.toLowerCase(),
            };
            // Also sync dashboard_scope if it changed in the employee record
            if (updatedMetadata.dashboard_scope !== undefined) {
              syncedMeta.permissions = {
                ...(currentUserMeta.permissions || {}),
                dashboard_scope: updatedMetadata.dashboard_scope,
              };
            }
            await supabase
              .from('users')
              .update({
                role: crmRole === 'manager' ? 'manager' : linkedUser.role,
                metadata: syncedMeta,
                updated_at: new Date().toISOString(),
              })
              .eq('id', linkedUser.id);
            logger.debug(
              `[EmployeeRoutes] Synced role/metadata to users record for ${employeeEmail}: ${crmRole}`,
            );
          }
        } catch (syncErr) {
          logger.error('[EmployeeRoutes] Role sync to users table failed:', syncErr.message);
          // Non-fatal
        }
      }

      // Invalidate employee lookup cache
      await invalidateEmployeeCache(tenant_id);

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
  // POST /api/employees/:id/link-user - Link employee to CRM user by email match
  router.post('/:id/link-user', invalidateCache('employees'), async (req, res) => {
    try {
      const { id } = req.params;
      const { employee_email } = req.body;
      const tenant_id = req.body.tenant_id || req.query.tenant_id;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }
      if (!employee_email) {
        return res.status(400).json({ status: 'error', message: 'employee_email is required' });
      }

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();

      // Verify employee exists
      const { data: employee, error: empErr } = await supabase
        .from('employees')
        .select('id, email, metadata, tenant_id')
        .eq('id', id)
        .eq('tenant_id', tenant_id)
        .single();

      if (empErr || !employee) {
        return res.status(404).json({ status: 'error', message: 'Employee not found' });
      }

      // Find matching CRM user by email
      const { data: user, error: userErr } = await supabase
        .from('users')
        .select('id, email, role')
        .ilike('email', employee_email.trim())
        .eq('tenant_id', tenant_id)
        .maybeSingle();

      if (userErr) {
        logger.error('[Employees POST /:id/link-user] User lookup error:', userErr.message);
        return res.status(500).json({ status: 'error', message: 'Failed to look up user' });
      }

      if (!user) {
        return res.status(404).json({
          status: 'error',
          success: false,
          error: `No CRM user found with email: ${employee_email}`,
        });
      }

      // Update employee metadata with user link
      const existingMeta =
        employee.metadata && typeof employee.metadata === 'object' ? employee.metadata : {};
      const updatedMeta = {
        ...existingMeta,
        user_email: user.email,
        user_id: user.id,
        has_crm_access: true,
        linked_at: new Date().toISOString(),
      };

      const { error: updateErr } = await supabase
        .from('employees')
        .update({ metadata: updatedMeta })
        .eq('id', id)
        .eq('tenant_id', tenant_id);

      if (updateErr) {
        logger.error('[Employees POST /:id/link-user] Update error:', updateErr.message);
        return res.status(500).json({ status: 'error', message: 'Failed to link employee' });
      }

      logger.info(
        `[Employees POST /:id/link-user] Linked employee ${id} to user ${user.id} (${user.email})`,
      );
      return res.json({
        status: 'success',
        success: true,
        message: `Successfully linked to CRM user: ${user.email}`,
        data: { user_email: user.email, user_id: user.id },
      });
    } catch (err) {
      logger.error('[Employees POST /:id/link-user] Error:', err.message);
      return res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // POST /api/employees/:id/sync-permissions - Sync employee role/permissions to linked CRM user
  router.post('/:id/sync-permissions', invalidateCache('employees'), async (req, res) => {
    try {
      const { id } = req.params;
      const tenant_id = req.body.tenant_id || req.query.tenant_id;

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();

      // Get employee with metadata
      const { data: employee, error: empErr } = await supabase
        .from('employees')
        .select('id, email, role, metadata, tenant_id')
        .eq('id', id)
        .eq('tenant_id', tenant_id)
        .single();

      if (empErr || !employee) {
        return res.status(404).json({ status: 'error', message: 'Employee not found' });
      }

      const meta =
        employee.metadata && typeof employee.metadata === 'object' ? employee.metadata : {};

      if (!meta.user_email) {
        return res.status(400).json({
          status: 'error',
          success: false,
          error: 'Employee is not linked to a CRM user. Link them first.',
        });
      }

      // Find the linked CRM user
      const { data: user, error: userErr } = await supabase
        .from('users')
        .select('id, email, role, metadata')
        .ilike('email', meta.user_email.trim())
        .eq('tenant_id', tenant_id)
        .maybeSingle();

      if (userErr || !user) {
        return res.status(404).json({
          status: 'error',
          success: false,
          error: `Linked CRM user not found: ${meta.user_email}`,
        });
      }

      // Sync: copy employee role to user record, and update employee metadata
      const userMeta = user.metadata && typeof user.metadata === 'object' ? user.metadata : {};
      const updatedUserMeta = {
        ...userMeta,
        employee_id: employee.id,
        employee_role: employee.role,
        synced_at: new Date().toISOString(),
      };

      // Update user with employee role info
      const userRole = employee.role || user.role;
      const { error: updateUserErr } = await supabase
        .from('users')
        .update({ role: userRole, metadata: updatedUserMeta })
        .eq('id', user.id)
        .eq('tenant_id', tenant_id);

      if (updateUserErr) {
        logger.error(
          '[Employees POST /:id/sync-permissions] User update error:',
          updateUserErr.message,
        );
        return res.status(500).json({ status: 'error', message: 'Failed to sync user record' });
      }

      // Update employee metadata with sync timestamp
      const updatedEmpMeta = {
        ...meta,
        permissions_synced_at: new Date().toISOString(),
        user_role: userRole,
      };

      await supabase
        .from('employees')
        .update({ metadata: updatedEmpMeta })
        .eq('id', id)
        .eq('tenant_id', tenant_id);

      logger.info(
        `[Employees POST /:id/sync-permissions] Synced employee ${id} -> user ${user.id}`,
      );
      return res.json({
        status: 'success',
        success: true,
        message: 'Permissions synced successfully',
        data: { user_id: user.id, role: userRole },
      });
    } catch (err) {
      logger.error('[Employees POST /:id/sync-permissions] Error:', err.message);
      return res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // POST /api/employees/:id/validate-user-link - Validate and establish user link
  router.post('/:id/validate-user-link', async (req, res) => {
    try {
      const { id } = req.params;
      const { user_id } = req.body;

      if (!user_id) {
        return res.status(400).json({ valid: false, errors: ['User ID is required'] });
      }

      // Authorization: require admin/manager and enforce tenant match
      const requesterRole = req.user?.role;
      if (!requesterRole || !['admin', 'manager', 'superadmin'].includes(requesterRole)) {
        return res.status(403).json({
          valid: false,
          errors: ['Forbidden: only admin or manager can validate employee-user links'],
        });
      }

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();

      // 1. Fetch the employee
      const { data: employee, error: empError } = await supabase
        .from('employees')
        .select('id, email, tenant_id, metadata, status')
        .eq('id', id)
        .single();

      if (empError || !employee) {
        return res.status(404).json({ valid: false, errors: ['Employee not found'] });
      }

      // Note: tenant authorization is implicitly handled by validateTenantAccess middleware
      // The employee-user tenant match check happens below in validation step 3

      // 2. Fetch the user
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id, email, tenant_id, status, metadata')
        .eq('id', user_id)
        .single();

      if (userError || !user) {
        return res.status(400).json({ valid: false, errors: ['User not found with that ID'] });
      }

      // 3. Validation checks
      const errors = [];

      // Check emails match (case-insensitive)
      if (employee.email?.toLowerCase() !== user.email?.toLowerCase()) {
        errors.push(`Email mismatch: Employee has "${employee.email}", User has "${user.email}"`);
      }

      // Check tenant match
      if (employee.tenant_id !== user.tenant_id) {
        errors.push('Tenant mismatch: Employee and User belong to different tenants');
      }

      // Check user is active
      if (user.status !== 'active') {
        errors.push(`User is not active (status: ${user.status})`);
      }

      // Check employee is active
      if (employee.status !== 'active') {
        errors.push(`Employee is not active (status: ${employee.status})`);
      }

      if (errors.length > 0) {
        return res.json({ valid: false, errors });
      }

      // 4. All checks passed - update both records
      const now = new Date().toISOString();

      // Update employee metadata with linked_user_id
      const employeeMetadata = {
        ...(employee.metadata || {}),
        linked_user_id: user_id,
        link_validated_at: now,
        link_needs_revalidation: false,
      };

      const { error: empUpdateError } = await supabase
        .from('employees')
        .update({ metadata: employeeMetadata, updated_at: now })
        .eq('id', id);

      if (empUpdateError) {
        logger.error('Failed to update employee metadata:', empUpdateError);
        return res.status(500).json({ valid: false, errors: ['Failed to update employee record'] });
      }

      // Update user metadata with employee_id
      const userMetadata = {
        ...(user.metadata || {}),
        employee_id: id,
      };

      const { error: userUpdateError } = await supabase
        .from('users')
        .update({ metadata: userMetadata, updated_at: now })
        .eq('id', user_id);

      if (userUpdateError) {
        logger.error('Failed to update user metadata:', userUpdateError);
        return res.status(500).json({ valid: false, errors: ['Failed to update user record'] });
      }

      // 5. Also update team_members to have user_id where employee_id matches
      const { error: teamUpdateError } = await supabase
        .from('team_members')
        .update({ user_id: user_id })
        .eq('employee_id', id)
        .is('user_id', null);

      if (teamUpdateError) {
        logger.error('Failed to update team_members with user_id for employee link:', {
          employee_id: id,
          user_id,
          error: teamUpdateError,
        });
      }

      // Invalidate employee caches so consumers see the updated link state
      invalidateCache('employees');
      invalidateEmployeeCache(employee.tenant_id);

      logger.info(`[Employees] User link validated: employee=${id}, user=${user_id}`);

      res.json({
        valid: true,
        message: 'User link validated and established',
        employee_id: id,
        user_id: user_id,
      });
    } catch (error) {
      logger.error('Error validating user link:', error);
      res.status(500).json({ valid: false, errors: [error.message] });
    }
  });

  // DELETE /api/employees/:id - Delete employee
  router.delete('/:id', invalidateCache('employees'), async (req, res) => {
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

      // Invalidate employee lookup cache
      await invalidateEmployeeCache(tenant_id);

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
