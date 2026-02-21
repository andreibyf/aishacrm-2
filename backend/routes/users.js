/**
 * User Routes
 * User authentication and management with full CRUD
 */

import express from 'express';
import jwt from 'jsonwebtoken';
import { cacheList, invalidateCache } from '../lib/cacheMiddleware.js';
import {
  confirmUserEmail,
  deleteAuthUser,
  getAuthUserByEmail,
  inviteUserByEmail,
  sendPasswordResetEmail,
  updateAuthUserMetadata,
  updateAuthUserPassword,
  generateRecoveryLink,
} from '../lib/supabaseAuth.js';
import { createAuditLog, getUserEmailFromRequest, getClientIP } from '../lib/auditLogger.js';
import logger from '../lib/logger.js';

export default function createUserRoutes(_pgPool, _supabaseAuth) {
  const router = express.Router();
  /**
   * @openapi
   * /api/users:
   *   get:
   *     summary: List users and employees
   *     description: |
   *       Returns global users and tenant employees. Supports filtering by tenant and email.
   *     tags: [users]
   *     parameters:
   *       - in: query
   *         name: tenant_id
   *         schema: { type: string, nullable: true }
   *         description: Filter by tenant UUID (optional)
   *       - in: query
   *         name: email
   *         schema: { type: string }
   *         description: Exact email match (case-insensitive)
   *       - in: query
   *         name: limit
   *         schema: { type: integer, default: 50, minimum: 1, maximum: 200 }
   *       - in: query
   *         name: offset
   *         schema: { type: integer, default: 0, minimum: 0 }
   *     responses:
   *       200:
   *         description: List of users
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   *       400:
   *         description: Bad request
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */

  // Lightweight, per-route in-memory rate limiter (dependency-free)
  // Use stricter limits for sensitive auth endpoints to satisfy CodeQL
  const routeBuckets = new Map(); // key: routeId|ip -> { count, ts }
  const DEFAULT_WINDOW_MS = parseInt(process.env.ROUTE_RATE_WINDOW_MS || '60000', 10);
  function createRouteLimiter({ windowMs = DEFAULT_WINDOW_MS, max = 10, id = 'default' } = {}) {
    return function routeLimiter(req, res, next) {
      try {
        // Allow OPTIONS preflight freely
        if (req.method === 'OPTIONS') return next();
        const now = Date.now();
        const key = `${id}|${req.ip}`;
        const entry = routeBuckets.get(key);
        if (!entry || now - entry.ts >= windowMs) {
          routeBuckets.set(key, { count: 1, ts: now });
          return next();
        }
        if (entry.count < max) {
          entry.count++;
          return next();
        }
        res.setHeader('Retry-After', Math.ceil((entry.ts + windowMs - now) / 1000));
        return res.status(429).json({
          status: 'error',
          message: 'Too Many Requests',
          code: 'RATE_LIMITED',
        });
      } catch {
        // Fail open on limiter errors
        return next();
      }
    };
  }

  // Email-based throttling for password resets (recommended by Supabase)
  // Prevents hitting Supabase's 1 email/60s rate limit
  const attemptsByEmail = new Map(); // email -> { count, resetAt }
  const MAX_EMAIL_CACHE_SIZE = 10000;
  function throttleEmail(email, max = 3, windowMs = 15 * 60000) {
    const key = email.trim().toLowerCase();
    const now = Date.now();

    // Cleanup old entries if cache grows too large
    if (attemptsByEmail.size > MAX_EMAIL_CACHE_SIZE) {
      const cutoff = now - windowMs;
      for (const [k, v] of attemptsByEmail.entries()) {
        if (v.resetAt < cutoff) attemptsByEmail.delete(k);
      }
    }

    const rec = attemptsByEmail.get(key) ?? { count: 0, resetAt: now + windowMs };
    if (now > rec.resetAt) {
      rec.count = 0;
      rec.resetAt = now + windowMs;
    }
    rec.count++;
    attemptsByEmail.set(key, rec);

    if (rec.count > max) {
      const retry = Math.ceil((rec.resetAt - now) / 1000);
      const err = new Error(
        'Too many password reset attempts for this email. Please try again later.',
      );
      err.retryAfter = retry;
      throw err;
    }
  }

  // Tuned limiters for specific endpoints
  const authLimiter = createRouteLimiter({
    id: 'auth',
    windowMs: DEFAULT_WINDOW_MS,
    max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '5', 10),
  });
  const passwordLimiter = createRouteLimiter({
    id: 'password',
    windowMs: DEFAULT_WINDOW_MS,
    max: parseInt(process.env.PASSWORD_RATE_LIMIT_MAX || '5', 10),
  });
  const mutateLimiter = createRouteLimiter({
    id: 'user-mutate',
    windowMs: DEFAULT_WINDOW_MS,
    max: parseInt(process.env.USER_MUTATE_RATE_LIMIT_MAX || '30', 10),
  });

  // Helper: selectively expand metadata to reduce duplication.
  // Previously we spread ALL metadata keys to top-level which caused large duplication
  // (e.g. navigation_permissions, permissions repeated). We now only expose a curated
  // whitelist of frequently accessed convenience fields while retaining the full
  // original metadata object. Components needing other custom metadata must read
  // from user.metadata.<key> instead of top-level.
  const expandUserMetadata = (user) => {
    if (!user) return user;
    const { metadata = {}, ...rest } = user;

    // Whitelist of metadata keys promoted to top-level for convenience.
    const promoteKeys = [
      'display_name',
      'live_status',
      'last_seen',
      'is_active',
      'account_status',
      'employee_role',
      'tags',
      'permissions',
      'navigation_permissions',
      'password_change_required',
      'password_expires_at',
    ];
    const promoted = {};
    for (const k of promoteKeys) {
      if (k in metadata) promoted[k] = metadata[k];
    }

    // Remove promoted keys from nested metadata to avoid duplication.
    const nestedMetadata = { ...metadata };
    for (const k of promoteKeys) {
      if (k in nestedMetadata) delete nestedMetadata[k];
    }

    return {
      ...rest,
      ...promoted,
      metadata: nestedMetadata, // slim metadata without promoted duplicates
    };
  };

  // GET /api/users - List users (combines global users + tenant employees)
  // Supports lookup by email without tenant filter
  router.get('/', cacheList('users', 180), async (req, res) => {
    try {
      // Normalize email param case-insensitively and support alternate casing
      const rawEmailKey = Object.keys(req.query).find((k) => k.toLowerCase() === 'email');
      const email = rawEmailKey ? (req.query[rawEmailKey] || '').trim() : '';
      const { tenant_id, limit = 50, offset = 0, strict_email, debug } = req.query;

      let allUsers = [];

      // Fast path: lookup by email across users and employees (exact match only)
      if (email) {
        const t0 = Date.now();
        const { getSupabaseClient } = await import('../lib/supabase-db.js');
        const supabase = getSupabaseClient();

        // Case-insensitive exact match using ilike without wildcards
        const normalizedEmail = (email || '').trim();
        const { data: usersByEmail, error: ue } = await supabase
          .from('users')
          .select(
            'id, tenant_id, email, first_name, last_name, role, metadata, created_at, updated_at',
          )
          .ilike('email', normalizedEmail);
        if (ue) logger.warn('[Users.get] usersByEmail error:', ue);

        const { data: employeesByEmail, error: ee } = await supabase
          .from('employees')
          .select(
            'id, tenant_id, email, first_name, last_name, role, status, metadata, created_at, updated_at',
          )
          .ilike('email', normalizedEmail);
        if (ee) logger.warn('[Users.get] employeesByEmail error:', ee);

        // Annotate user_type and expand metadata
        const u1 = (usersByEmail || []).map((u) =>
          expandUserMetadata({ ...u, status: 'active', user_type: 'global' }),
        );
        const u2 = (employeesByEmail || []).map((u) =>
          expandUserMetadata({ ...u, user_type: 'employee' }),
        );
        allUsers = [...u1, ...u2];

        // Post-filter safeguard: ensure only exact matches remain (defensive)
        const beforeFilterCount = allUsers.length;
        allUsers = allUsers.filter((u) => (u.email || '').toLowerCase() === email.toLowerCase());
        const afterFilterCount = allUsers.length;

        // HARD suppression of test-pattern emails when not in E2E mode and strict_email requested
        const testEmailPatterns = [
          /audit\.test\./i,
          /e2e\.temp\./i,
          /@playwright\.test$/i,
          /@example\.com$/i,
        ];
        const suppressedTestUsers = [];
        // Server-side E2E detection via header or env only (no window/localStorage on server)
        const isE2EMode =
          req.headers['x-e2e-test-mode'] === 'true' || process.env.E2E_TEST_MODE === 'true';
        if (!isE2EMode) {
          allUsers = allUsers.filter((u) => {
            const isTest = testEmailPatterns.some((re) => re.test(u.email || ''));
            if (isTest) suppressedTestUsers.push(u);
            return !isTest;
          });
        }

        if (strict_email && parseInt(strict_email) === 1) {
          // If any pre-filter rows existed that didn't match, log warning; enforce strictness
          if (beforeFilterCount !== afterFilterCount) {
            logger.warn('[Users.get] strict_email mismatch: non-matching rows suppressed', {
              email,
              beforeFilterCount,
              afterFilterCount,
            });
          }
        }

        // Sort newest first (after suppression)
        allUsers.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        const durationMs = Date.now() - t0;
        if (debug === '1') {
          logger.debug('[Users.get] DEBUG email lookup', {
            email,
            durationMs,
            returned: allUsers.length,
            suppressedTestUsers: suppressedTestUsers.length,
          });
        }

        return res.json({
          status: 'success',
          data: {
            users: allUsers,
            total: allUsers.length,
            limit: parseInt(limit),
            offset: parseInt(offset),
            debug:
              debug === '1'
                ? {
                    email,
                    strict: !!strict_email,
                    beforeFilterCount,
                    afterFilterCount,
                    suppressedTestUsersCount: suppressedTestUsers.length,
                    suppressedTestUsers:
                      debug === '1'
                        ? suppressedTestUsers.map((u) => ({ id: u.id, email: u.email }))
                        : undefined,
                    durationMs,
                  }
                : undefined,
          },
        });
      }

      if (tenant_id) {
        // Filter by specific tenant - only return employees for that tenant
        // NOTE: Previous implementation returned ONLY employees, which hid tenant-scoped admins
        // We now include admins from users table that have tenant_id = $1
        const { getSupabaseClient } = await import('../lib/supabase-db.js');
        const supabase = getSupabaseClient();

        const [adminsRes, employeesRes] = await Promise.all([
          supabase
            .from('users')
            .select(
              'id, tenant_id, email, first_name, last_name, role, metadata, created_at, updated_at',
              { count: 'exact' },
            )
            .eq('tenant_id', tenant_id)
            .order('created_at', { ascending: false })
            .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1),
          supabase
            .from('employees')
            .select(
              'id, tenant_id, email, first_name, last_name, role, status, metadata, created_at, updated_at',
              { count: 'exact' },
            )
            .eq('tenant_id', tenant_id)
            .order('created_at', { ascending: false })
            .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1),
        ]);

        const admins = (adminsRes.data || []).map((r) =>
          expandUserMetadata({ ...r, status: 'active', user_type: 'admin' }),
        );
        const employees = (employeesRes.data || []).map((r) =>
          expandUserMetadata({ ...r, user_type: 'employee' }),
        );
        allUsers = [...admins, ...employees].sort(
          (a, b) => new Date(b.created_at) - new Date(a.created_at),
        );

        res.json({
          status: 'success',
          data: {
            users: allUsers,
            total: (adminsRes.count || 0) + (employeesRes.count || 0),
            limit: parseInt(limit),
            offset: parseInt(offset),
          },
        });
      } else {
        // No tenant filter - return global users (superadmins/admins) + all employees
        // Get global users from users table (superadmins, admins with no tenant assignment)
        // Preserve actual tenant_id for tenant-scoped admins while marking user_type appropriately
        const { getSupabaseClient } = await import('../lib/supabase-db.js');
        const supabase = getSupabaseClient();

        const { data: globalUsers, error: guErr } = await supabase
          .from('users')
          .select(
            'id, tenant_id, email, first_name, last_name, role, metadata, created_at, updated_at',
          )
          .in('role', ['superadmin', 'admin'])
          .order('created_at', { ascending: false });
        if (guErr) logger.warn('[Users.get] global users error:', guErr);

        const { data: employeesRows, error: empErr } = await supabase
          .from('employees')
          .select(
            'id, tenant_id, email, first_name, last_name, role, status, metadata, created_at, updated_at',
          )
          .order('created_at', { ascending: false })
          .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);
        if (empErr) logger.warn('[Users.get] employees list error:', empErr);

        const adminsWithType = (globalUsers || []).map((r) =>
          expandUserMetadata({
            ...r,
            status: 'active',
            user_type: r.tenant_id ? 'admin' : 'global',
          }),
        );
        const employeesWithType = (employeesRows || []).map((r) =>
          expandUserMetadata({ ...r, user_type: 'employee' }),
        );
        allUsers = [...adminsWithType, ...employeesWithType];

        // Sort by created_at desc
        allUsers.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        res.json({
          status: 'success',
          data: {
            users: allUsers,
            total: (globalUsers?.length || 0) + (employeesRows?.length || 0),
            limit: parseInt(limit),
            offset: parseInt(offset),
          },
        });
      }
    } catch (error) {
      logger.error('Error listing users:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/users/profiles - List users with their linked employee records (using user_profile_view)
  // This provides a clean separation: users = login accounts, employees = org chart records
  /**
   * @openapi
   * /api/users/profiles:
   *   get:
   *     summary: List user profiles with employee linkage
   *     description: |
   *       Returns users from the users table with their linked employee records (if any).
   *       Uses user_profile_view for unified data. Suitable for User Management UI.
   *     tags: [users]
   *     parameters:
   *       - in: query
   *         name: tenant_id
   *         schema: { type: string, nullable: true }
   *         description: Filter by tenant UUID (optional)
   *       - in: query
   *         name: limit
   *         schema: { type: integer, default: 100, minimum: 1, maximum: 500 }
   *       - in: query
   *         name: offset
   *         schema: { type: integer, default: 0, minimum: 0 }
   *     responses:
   *       200:
   *         description: List of user profiles
   */
  router.get('/profiles', async (req, res) => {
    try {
      const { tenant_id, limit = 100, offset = 0 } = req.query;
      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();

      let query = supabase
        .from('user_profile_view')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

      // Filter by tenant if specified
      if (tenant_id) {
        query = query.eq('tenant_id', tenant_id);
      }

      const { data: profiles, count, error } = await query;

      if (error) {
        logger.error('[Users.profiles] query error:', error);
        return res.status(500).json({ status: 'error', message: error.message });
      }

      // Transform to include computed fields
      const transformedProfiles = (profiles || []).map((p) => ({
        // User (login account) fields
        id: p.user_id,
        user_id: p.user_id,
        email: p.email,
        first_name: p.first_name,
        last_name: p.last_name,
        full_name: [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email,
        display_name:
          p.user_metadata?.display_name ||
          [p.first_name, p.last_name].filter(Boolean).join(' ') ||
          p.email,
        role: p.auth_role,
        tenant_id: p.tenant_id,
        status: p.status || 'active',
        created_at: p.created_at,
        updated_at: p.updated_at,
        // User metadata
        is_active: p.user_metadata?.is_active !== false,
        account_status: p.user_metadata?.account_status || 'active',
        live_status: p.user_metadata?.live_status || 'offline',
        last_seen: p.user_metadata?.last_seen,
        last_login: p.user_metadata?.last_login,
        tags: p.user_metadata?.tags || [],
        permissions: p.user_metadata?.permissions || {},
        navigation_permissions: p.user_metadata?.navigation_permissions || {},
        // Employee linkage (if exists)
        employee_id: p.employee_id,
        employee_role: p.employee_role || p.crm_user_employee_role,
        employee_status: p.employee_status,
        has_crm_access: p.has_crm_access,
        manager_employee_id: p.manager_employee_id,
        // Computed
        has_employee_record: !!p.employee_id,
        user_type:
          p.auth_role === 'superadmin' ? 'global' : p.auth_role === 'admin' ? 'admin' : 'user',
      }));

      res.json({
        status: 'success',
        data: {
          users: transformedProfiles,
          total: count || transformedProfiles.length,
          limit: parseInt(limit),
          offset: parseInt(offset),
        },
      });
    } catch (error) {
      logger.error('[Users.profiles] Error:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/users/sync-from-auth - Ensure CRM user exists based on Supabase Auth
  // Body: { email?: string } or Query: ?email=
  /**
   * @openapi
   * /api/users/sync-from-auth:
   *   post:
   *     summary: Create CRM user from Supabase Auth
   *     description: Ensures a CRM user/employee record exists for the provided email.
   *     tags: [users]
   *     requestBody:
   *       required: false
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               email:
   *                 type: string
   *     responses:
   *       200:
   *         description: User already existed or was created
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   *       400:
   *         description: Missing or invalid email
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  router.post('/sync-from-auth', async (req, res) => {
    try {
      const email = (req.body?.email || req.query?.email || '').trim();
      if (!email) {
        return res.status(400).json({
          status: 'error',
          message: 'email is required',
        });
      }

      // Check if already exists in either table using Supabase
      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const normalizedEmail = email.toLowerCase().trim();
      const [{ data: uRows }, { data: eRows }] = await Promise.all([
        supabase.from('users').select('id, email').eq('email', normalizedEmail),
        supabase.from('employees').select('id, email, tenant_id').eq('email', normalizedEmail),
      ]);

      if ((uRows && uRows.length > 0) || (eRows && eRows.length > 0)) {
        return res.json({
          status: 'success',
          message: 'User already exists in CRM',
          data: {
            users: uRows || [],
            employees: eRows || [],
          },
        });
      }

      // Fetch from Supabase Auth
      const { user: authUser, error: authErr } = await getAuthUserByEmail(normalizedEmail);
      if (authErr) {
        return res.status(500).json({
          status: 'error',
          message: `Auth lookup failed: ${authErr.message}`,
        });
      }
      if (!authUser) {
        return res.status(404).json({
          status: 'error',
          message: 'Auth user not found',
        });
      }

      const meta = authUser.user_metadata || {};
      const role = (meta.role || 'employee').toLowerCase();
      // Normalize tenant_id coming from metadata
      const rawTenant = meta.tenant_id;
      const normalizedTenantId =
        rawTenant === '' ||
        rawTenant === 'no-client' ||
        rawTenant === 'none' ||
        rawTenant === 'null' ||
        rawTenant === undefined
          ? null
          : rawTenant;

      const first_name = meta.first_name || authUser.email?.split('@')[0] || '';
      const last_name = meta.last_name || '';
      const display_name = meta.display_name || `${first_name} ${last_name}`.trim();

      // Decide target table
      let createdRow = null;
      if (role === 'superadmin' && !normalizedTenantId) {
        const nowIso = new Date().toISOString();
        const { data, error } = await supabase
          .from('users')
          .insert([
            {
              email: normalizedEmail,
              first_name,
              last_name,
              role: 'superadmin',
              metadata: { display_name, ...meta },
              created_at: nowIso,
              updated_at: nowIso,
            },
          ])
          .select('id, email, first_name, last_name, role, metadata, created_at, updated_at')
          .single();
        if (error) throw new Error(error.message);
        createdRow = { table: 'users', record: data };
      } else if (role === 'admin' && normalizedTenantId) {
        const nowIso = new Date().toISOString();
        const { data, error } = await supabase
          .from('users')
          .insert([
            {
              email: normalizedEmail,
              first_name,
              last_name,
              role: 'admin',
              tenant_id: normalizedTenantId,
              metadata: { display_name, ...meta },
              created_at: nowIso,
              updated_at: nowIso,
            },
          ])
          .select(
            'id, email, first_name, last_name, role, tenant_id, metadata, created_at, updated_at',
          )
          .single();
        if (error) throw new Error(error.message);
        createdRow = { table: 'users', record: data };
      } else {
        // Default to employee in a tenant
        if (!normalizedTenantId) {
          return res.status(400).json({
            status: 'error',
            message: 'tenant_id metadata is required for non-admin users',
          });
        }
        const nowIso = new Date().toISOString();
        const { data, error } = await supabase
          .from('employees')
          .insert([
            {
              tenant_id: normalizedTenantId,
              email: normalizedEmail,
              first_name,
              last_name,
              role,
              status: 'active',
              metadata: { display_name, ...meta },
              created_at: nowIso,
              updated_at: nowIso,
            },
          ])
          .select(
            'id, tenant_id, email, first_name, last_name, role, status, metadata, created_at, updated_at',
          )
          .single();
        if (error) throw new Error(error.message);
        createdRow = { table: 'employees', record: data };
      }

      return res.json({
        status: 'success',
        message: 'CRM user record created from auth metadata',
        data: createdRow,
      });
    } catch (error) {
      logger.error('Error syncing from auth:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/users/:id - Get single user (actually queries employees table)
  /**
   * @openapi
   * /api/users/{id}:
   *   get:
   *     summary: Get user by ID
   *     tags: [users]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema: { type: string }
   *       - in: query
   *         name: tenant_id
   *         required: false
   *         schema: { type: string, nullable: true }
   *     responses:
   *       200:
   *         description: User record
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   *       404:
   *         description: User not found
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query;

      // tenant_id is optional - allow querying users without tenant (tenant_id='none' or NULL)
      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      let empQuery = supabase
        .from('employees')
        .select(
          'id, tenant_id, email, first_name, last_name, role, status, metadata, created_at, updated_at',
        )
        .eq('id', id)
        .limit(1);
      if (tenant_id !== undefined && tenant_id !== 'null') {
        empQuery = empQuery.eq('tenant_id', tenant_id);
      }
      const { data: empRows, error: empErr } = await empQuery;
      if (empErr) throw new Error(empErr.message);
      const resultRows = empRows || [];

      if (resultRows.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'User not found',
        });
      }

      // Expand metadata to top-level properties
      const user = expandUserMetadata(resultRows[0]);

      res.json({
        status: 'success',
        data: { user },
      });
    } catch (error) {
      logger.error('Error getting user:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/users/login - User login (basic implementation)
  router.post('/login', authLimiter, async (req, res) => {
    try {
      const { email, password: _password } = req.body;

      if (!email) {
        return res.status(400).json({
          status: 'error',
          message: 'email is required',
        });
      }

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      let tableName = 'users';
      const normalizedEmail = email.trim();
      let { data: uRows, error: uErr } = await supabase
        .from('users')
        .select('id, tenant_id, email, first_name, last_name, role, metadata')
        .ilike('email', normalizedEmail)
        .limit(1);
      if (uErr) logger.warn('[Login] users lookup error:', uErr);
      let foundArr = uRows || [];
      if (foundArr.length === 0) {
        tableName = 'employees';
        const { data: eRows, error: eErr } = await supabase
          .from('employees')
          .select('id, tenant_id, email, first_name, last_name, role, status, metadata')
          .ilike('email', normalizedEmail)
          .limit(1);
        if (eErr) logger.warn('[Login] employees lookup error:', eErr);
        foundArr = eRows || [];
      }

      if (foundArr.length === 0) {
        return res.status(401).json({
          status: 'error',
          message: 'Invalid credentials',
        });
      }

      const found = foundArr[0];

      // Enforce disabled accounts: block login if marked inactive
      try {
        const meta = found.metadata || {};
        const flatIsActive = typeof meta.is_active === 'boolean' ? meta.is_active : undefined;
        const accountStatus = (meta.account_status || '').toLowerCase();
        const rowStatus = (found.status || '').toLowerCase();

        const isDisabled =
          accountStatus === 'inactive' || flatIsActive === false || rowStatus === 'inactive';

        if (isDisabled) {
          return res.status(403).json({
            status: 'error',
            message: 'Account is disabled. Contact an administrator.',
            code: 'ACCOUNT_DISABLED',
          });
        }
      } catch (e) {
        logger.warn('[Login] Failed to evaluate disabled state:', e.message);
      }

      // On successful lookup, mark account active + online and record last_login
      try {
        const nowIso = new Date().toISOString();
        const baseMeta = found?.metadata || {};
        const merged = {
          ...baseMeta,
          is_active: true,
          account_status: 'active',
          live_status: 'online',
          last_login: nowIso,
        };
        const payload =
          tableName === 'users'
            ? { metadata: merged, updated_at: nowIso }
            : { status: 'active', metadata: merged, updated_at: nowIso };
        const { error: updErr } = await supabase.from(tableName).update(payload).eq('id', found.id);
        if (updErr) throw updErr;
      } catch (e) {
        logger.warn('[Login] Failed to update live/account status:', e.message);
        // Continue login even if status update fails
      }

      // Re-fetch the user to include updated metadata
      const { data: refreshedRows } = await supabase
        .from(tableName)
        .select(
          tableName === 'users'
            ? 'id, tenant_id, email, first_name, last_name, role, metadata'
            : 'id, tenant_id, email, first_name, last_name, role, status, metadata',
        )
        .eq('id', found.id)
        .limit(1);
      const user = expandUserMetadata((refreshedRows && refreshedRows[0]) || found);

      // Generate JWT token
      const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
      const token = jwt.sign(
        {
          user_id: user.id,
          email: user.email,
          role: user.role,
          tenant_id: user.tenant_id,
        },
        JWT_SECRET,
        { expiresIn: '7d' }, // Token expires in 7 days
      );

      res.json({
        status: 'success',
        message: 'Login successful',
        data: {
          user,
          token,
        },
      });
    } catch (error) {
      logger.error('Error logging in:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/users/heartbeat - Update last_seen and live_status
  /**
   * @openapi
   * /api/users/heartbeat:
   *   post:
   *     summary: Update user heartbeat
   *     description: Updates last_seen and live_status for the current user by JWT or email.
   *     tags: [users]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: false
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               email:
   *                 type: string
   *     responses:
   *       200:
   *         description: Heartbeat updated
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Success'
   *       400:
   *         description: Missing email or token
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  router.post('/heartbeat', async (req, res) => {
    try {
      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const authHeader = req.headers?.authorization || '';
      const bearer = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;

      let userId = null;
      let email = (req.body?.email || req.query?.email || '').trim();

      // Prefer JWT if provided
      if (bearer) {
        try {
          const decoded = jwt.verify(
            bearer,
            process.env.JWT_SECRET || 'your-secret-key-change-in-production',
          );
          userId = decoded?.user_id || null;
        } catch {
          // Ignore token errors; fall back to email
        }
      }

      if (!userId && !email) {
        return res.status(400).json({
          status: 'error',
          message: 'Provide Authorization bearer token or email',
        });
      }

      // Resolve target user
      let target = null;
      if (userId) {
        // Try users by id
        const userById = await supabase.from('users').select('id').eq('id', userId).single();
        if (userById.data?.id) {
          target = { table: 'users', id: userId };
        } else {
          const empById = await supabase.from('employees').select('id').eq('id', userId).single();
          if (empById.data?.id) target = { table: 'employees', id: userId };
        }
      }

      if (!target && email) {
        // Exact match email lookup (emails are stored in lowercase)
        const normalizedEmail = email.toLowerCase().trim();
        const userByEmail = await supabase
          .from('users')
          .select('id')
          .eq('email', normalizedEmail)
          .limit(1)
          .maybeSingle();
        if (userByEmail.data?.id) {
          target = { table: 'users', id: userByEmail.data.id };
        } else {
          const empByEmail = await supabase
            .from('employees')
            .select('id, tenant_id')
            .eq('email', normalizedEmail)
            .limit(1)
            .maybeSingle();
          if (empByEmail.data?.id) target = { table: 'employees', id: empByEmail.data.id };
        }
      }

      if (!target) {
        // Attempt to sync from Supabase Auth as a fallback (if email provided)
        if (email) {
          try {
            const { user: authUser } = await getAuthUserByEmail(email);
            if (authUser) {
              const meta = authUser.user_metadata || {};
              const role = (meta.role || 'employee').toLowerCase();
              const rawTenant = meta.tenant_id;
              const normalizedTenantId =
                rawTenant === '' ||
                rawTenant === 'no-client' ||
                rawTenant === 'none' ||
                rawTenant === 'null' ||
                rawTenant === undefined
                  ? null
                  : rawTenant;
              const first_name = meta.first_name || authUser.email?.split('@')[0] || '';
              const last_name = meta.last_name || '';
              const display_name = meta.display_name || `${first_name} ${last_name}`.trim();

              if (role === 'superadmin' && !normalizedTenantId) {
                const { data, error } = await supabase
                  .from('users')
                  .insert([
                    {
                      email: normalizedEmail,
                      first_name,
                      last_name,
                      role: 'superadmin',
                      metadata: { display_name, ...meta },
                      created_at: new Date().toISOString(),
                      updated_at: new Date().toISOString(),
                    },
                  ])
                  .select('id')
                  .single();
                if (!error && data?.id) target = { table: 'users', id: data.id };
              } else if (role === 'admin' && normalizedTenantId) {
                const { data, error } = await supabase
                  .from('users')
                  .insert([
                    {
                      email: normalizedEmail,
                      first_name,
                      last_name,
                      role: 'admin',
                      tenant_id: normalizedTenantId,
                      metadata: { display_name, ...meta },
                      created_at: new Date().toISOString(),
                      updated_at: new Date().toISOString(),
                    },
                  ])
                  .select('id')
                  .single();
                if (!error && data?.id) target = { table: 'users', id: data.id };
              } else if (normalizedTenantId) {
                const { data, error } = await supabase
                  .from('employees')
                  .insert([
                    {
                      tenant_id: normalizedTenantId,
                      email: normalizedEmail,
                      first_name,
                      last_name,
                      role,
                      status: 'active',
                      metadata: { display_name, ...meta },
                      created_at: new Date().toISOString(),
                      updated_at: new Date().toISOString(),
                    },
                  ])
                  .select('id')
                  .single();
                if (!error && data?.id) target = { table: 'employees', id: data.id };
              }
            }
          } catch {
            // ignore sync errors
          }
        }

        if (!target) {
          return res.status(404).json({ status: 'error', message: 'User not found' });
        }
      }

      // Merge and update metadata using Supabase API
      const { data: existing, error: fetchErr } = await supabase
        .from(target.table)
        .select('metadata')
        .eq('id', target.id)
        .single();

      if (fetchErr && fetchErr.code !== 'PGRST116') throw new Error(fetchErr.message);

      const nowIso = new Date().toISOString();
      const mergedMeta = {
        ...(existing?.metadata || {}),
        live_status: 'online',
        last_seen: nowIso,
      };

      const { error: updErr } = await supabase
        .from(target.table)
        .update({ metadata: mergedMeta, updated_at: nowIso })
        .eq('id', target.id);

      if (updErr) throw new Error(updErr.message);

      return res.json({
        status: 'success',
        data: {
          id: target.id,
          table: target.table,
          last_seen: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Error in heartbeat:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // Lightweight GET heartbeat (read-only) for clients/tests hitting GET instead of POST
  // Does not mutate or create user records; purely returns a timestamp.
  router.get('/heartbeat', (req, res) => {
    return res.json({
      status: 'success',
      data: {
        online: true,
        ts: new Date().toISOString(),
      },
    });
  });

  // POST /api/users/invite - Create new user AND send invitation in one step
  // This is a convenience endpoint that combines user creation with invitation
  router.post('/invite', mutateLimiter, invalidateCache('users'), async (req, res) => {
    try {
      const {
        email,
        full_name,
        role,
        tenant_id,
        crm_access,
        requested_access,
        can_use_softphone,
        phone,
        permissions,
        redirect_url,
      } = req.body;

      // Parse full_name into first/last
      const nameParts = (full_name || '').trim().split(/\s+/);
      const first_name = nameParts[0] || '';
      const last_name = nameParts.slice(1).join(' ') || '';

      // Normalize email
      const normalizedEmail = email ? email.toLowerCase().trim() : email;

      logger.debug('[POST /api/users/invite] Creating and inviting user:', {
        email: normalizedEmail,
        full_name,
        role,
        tenant_id,
      });

      if (!normalizedEmail || !first_name) {
        return res.status(400).json({
          status: 'error',
          message: 'email and full_name are required',
          success: false,
        });
      }

      // Check for duplicates using Supabase
      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();

      const { data: existingUsers } = await supabase
        .from('users')
        .select('id, email')
        .eq('email', normalizedEmail);

      const { data: existingEmployees } = await supabase
        .from('employees')
        .select('id, email')
        .eq('email', normalizedEmail);

      if (
        (existingUsers && existingUsers.length > 0) ||
        (existingEmployees && existingEmployees.length > 0)
      ) {
        return res.status(409).json({
          status: 'error',
          message: 'An account with this email already exists',
          success: false,
        });
      }

      // Normalize tenant_id
      const normalizedTenantId =
        tenant_id === '' ||
        tenant_id === 'no-client' ||
        tenant_id === undefined ||
        tenant_id === null
          ? null
          : tenant_id;

      // Validate admin must have tenant
      if (role === 'admin' && !normalizedTenantId) {
        return res.status(400).json({
          status: 'error',
          message: 'Admin users must be assigned to a tenant',
          success: false,
        });
      }

      // Build metadata
      const metadata = {
        crm_access: crm_access !== false,
        requested_access: requested_access || 'read_write',
        can_use_softphone: can_use_softphone || false,
        phone: phone || null,
        permissions: permissions || {},
      };

      const isGlobalUser = role === 'superadmin' && !normalizedTenantId;
      let createdUser = null;

      if (isGlobalUser || (role === 'admin' && normalizedTenantId)) {
        // Insert into users table using Supabase
        const { data: insertedUser, error: insertError } = await supabase
          .from('users')
          .insert({
            email: normalizedEmail,
            first_name,
            last_name,
            role,
            tenant_id: normalizedTenantId,
            metadata,
          })
          .select('id, email, first_name, last_name, role, tenant_id, metadata')
          .single();

        if (insertError) {
          logger.error('[POST /api/users/invite] Users insert error:', insertError);
          return res.status(500).json({
            status: 'error',
            success: false,
            message: insertError.message || 'Failed to create user record',
          });
        }
        createdUser = insertedUser;
      } else {
        // Insert into employees table for non-admin roles using Supabase
        const { data: insertedEmployee, error: insertError } = await supabase
          .from('employees')
          .insert({
            email: normalizedEmail,
            first_name,
            last_name,
            role: role || 'employee',
            tenant_id: normalizedTenantId,
            metadata,
            status: 'active',
          })
          .select('id, email, first_name, last_name, role, tenant_id, metadata')
          .single();

        if (insertError) {
          logger.error('[POST /api/users/invite] Employees insert error:', insertError);
          return res.status(500).json({
            status: 'error',
            success: false,
            message: insertError.message || 'Failed to create employee record',
          });
        }
        createdUser = insertedEmployee;
      }

      logger.debug('[POST /api/users/invite] User created:', {
        id: createdUser.id,
        email: createdUser.email,
      });

      // Now send the invitation via Supabase Auth
      const { data: authData, error: authError } = await inviteUserByEmail(
        normalizedEmail,
        {
          first_name,
          last_name,
          role: role || 'employee',
          tenant_id: normalizedTenantId,
          display_name: full_name || first_name,
        },
        redirect_url,
      );

      if (authError) {
        logger.error('[POST /api/users/invite] Supabase Auth invitation error:', authError);
        // User was created but invitation failed - report as partial failure
        return res.status(207).json({
          status: 'partial',
          success: true,
          message: `User record created but invitation email failed: ${authError.message}. Use 'Resend Invite' to retry.`,
          data: {
            user: createdUser,
            invitation_sent: false,
            invitation_error: authError.message,
          },
        });
      }

      logger.info(
        '[POST /api/users/invite] User created and invited successfully:',
        normalizedEmail,
      );

      return res.status(201).json({
        status: 'success',
        success: true,
        message: `User created and invitation sent to ${normalizedEmail}`,
        data: {
          user: createdUser,
          invitation_sent: true,
          auth_user: authData,
        },
      });
    } catch (error) {
      logger.error('[POST /api/users/invite] Error:', error);
      return res.status(500).json({
        status: 'error',
        success: false,
        message: error.message || 'Failed to create user',
      });
    }
  });

  // POST /api/users - Create new user (global admin or tenant employee)
  router.post('/', mutateLimiter, invalidateCache('users'), async (req, res) => {
    try {
      const {
        email,
        password: _password, // Renamed to indicate intentionally unused (for future use with invitation endpoint)
        first_name,
        last_name,
        role,
        tenant_id,
        status,
        metadata,
        ...otherFields
      } = req.body;

      // 🔒 CRITICAL: Block E2E test user creation that pollutes production login
      // These test patterns MUST NOT be created in the production database
      const testEmailPatterns = [
        /^audit\.test\./i,
        /^e2e\.temp\./i,
        /@playwright\.test$/i,
        /@example\.com$/i, // Block all example.com emails (test domain)
      ];

      if (testEmailPatterns.some((pattern) => pattern.test(email))) {
        logger.warn(`[POST /api/users] BLOCKED test email pattern: ${email}`);
        return res.status(403).json({
          status: 'error',
          message: 'Test email patterns are not allowed in production database',
          code: 'TEST_EMAIL_BLOCKED',
          hint: 'E2E tests should use mock users exclusively without creating real database records',
        });
      }

      // 🔒 CRITICAL: Normalize email to lowercase for consistent storage and lookups
      const normalizedEmail = email ? email.toLowerCase().trim() : email;

      logger.debug('[POST /api/users] Creating user:', {
        email: normalizedEmail,
        first_name,
        last_name,
        role,
        tenant_id,
      });

      if (!normalizedEmail || !first_name) {
        return res.status(400).json({
          status: 'error',
          message: 'email and first_name are required',
        });
      }

      // 🔒 CRITICAL: Enforce global email uniqueness across users AND employees tables
      // BYPASS ADAPTER: Use direct Supabase client to avoid wildcard issues with .eq()
      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();

      logger.debug(
        '[POST /api/users] Running direct Supabase duplicate check for:',
        normalizedEmail,
      );

      const { data: existingUsers, error: usersError } = await supabase
        .from('users')
        .select('id, email, role')
        .eq('email', normalizedEmail);

      const { data: existingEmployees, error: employeesError } = await supabase
        .from('employees')
        .select('id, email, tenant_id')
        .eq('email', normalizedEmail);

      if (usersError) logger.error('[POST /api/users] Users query error:', usersError);
      if (employeesError) logger.error('[POST /api/users] Employees query error:', employeesError);

      const existingInUsers = { rows: existingUsers || [], rowCount: existingUsers?.length || 0 };
      const existingInEmployees = {
        rows: existingEmployees || [],
        rowCount: existingEmployees?.length || 0,
      };

      logger.debug(`[POST /api/users] Duplicate check for ${normalizedEmail}:`, {
        usersCount: existingInUsers.rows.length,
        employeesCount: existingInEmployees.rows.length,
        usersRows: existingInUsers.rows,
        employeesRows: existingInEmployees.rows,
      });

      logger.debug(
        `[POST /api/users] Checking if condition: usersLength=${existingInUsers.rows.length}, employeesLength=${existingInEmployees.rows.length}`,
      );

      if (existingInUsers.rows.length > 0 || existingInEmployees.rows.length > 0) {
        logger.error(`[POST /api/users] ⚠️ ENTERING DUPLICATE BLOCK - THIS SHOULD NOT HAPPEN!`);
        const existingRecord = existingInUsers.rows[0] || existingInEmployees.rows[0];
        logger.warn(`[POST /api/users] Duplicate email rejected: ${normalizedEmail}`);
        return res.status(409).json({
          status: 'error',
          message: 'An account with this email already exists',
          code: 'DUPLICATE_EMAIL',
          hint: 'Email addresses must be unique across all users and employees',
          existing: {
            id: existingRecord.id,
            email: existingRecord.email,
            table: existingInUsers.rows.length > 0 ? 'users' : 'employees',
          },
        });
      }

      logger.debug(
        `[POST /api/users] No duplicates found, continuing... Role: ${role}, Tenant: ${tenant_id}`,
      );

      // ⚠️ CRITICAL: Admin role MUST be assigned to a tenant (not global)
      if (role === 'admin' && !tenant_id) {
        return res.status(400).json({
          status: 'error',
          message:
            'Admin users must be assigned to a tenant. Only superadmins can be global users.',
        });
      }

      // Merge metadata with unknown fields
      const combinedMetadata = {
        ...(metadata || {}),
        ...otherFields,
      };

      // Normalize tenant_id: convert empty string, 'no-client', or undefined to null
      const normalizedTenantId =
        tenant_id === '' || tenant_id === 'no-client' || tenant_id === undefined ? null : tenant_id;

      // Only superadmin can be global (no tenant_id)
      const isGlobalUser = role === 'superadmin' && !normalizedTenantId;
      let authUserId = null;

      logger.debug(
        `[POST /api/users] Role branching - isGlobalUser: ${isGlobalUser}, role: ${role}, normalizedTenantId: ${normalizedTenantId}`,
      );

      if (isGlobalUser) {
        // Create global superadmin in users table (no tenant_id)
        // NOTE: Global email uniqueness already checked above
        // BYPASS ADAPTER: Use direct Supabase to avoid wildcard bug
        const { getSupabaseClient } = await import('../lib/supabase-db.js');
        const supabase = getSupabaseClient();
        const { data: existingUser } = await supabase
          .from('users')
          .select('id')
          .eq('email', normalizedEmail);

        if (existingUser && existingUser.length > 0) {
          return res.status(409).json({
            status: 'error',
            message: 'User already exists',
          });
        }

        // Skip Supabase Auth creation - invitation will be sent separately via /api/users/:id/invite
        // This allows user record to be created first, then invitation sent as a separate action

        const result = await pgPool.query(
          `INSERT INTO users (email, first_name, last_name, role, metadata, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
           RETURNING id, email, first_name, last_name, role, metadata, created_at, updated_at`,
          [normalizedEmail, first_name, last_name, role, combinedMetadata],
        );

        const user = expandUserMetadata(result.rows[0]);

        // Create audit log for superadmin creation
        try {
          const { getSupabaseClient } = await import('../lib/supabase-db.js');
          const supabase = getSupabaseClient();
          await createAuditLog(supabase, {
            tenant_id: 'system',
            user_email: getUserEmailFromRequest(req),
            action: 'create',
            entity_type: 'user',
            entity_id: user.id,
            changes: {
              email: user.email,
              role: user.role,
              first_name: user.first_name,
              last_name: user.last_name,
            },
            ip_address: getClientIP(req),
            user_agent: req.headers['user-agent'],
          });
        } catch (auditError) {
          logger.warn('[AUDIT] Failed to log user creation:', auditError.message);
        }

        res.json({
          status: 'success',
          message:
            "User created successfully. Use the 'Send Invitation' button to send login credentials.",
          data: {
            user,
            auth: {
              created: false,
              note: 'Invitation not sent yet. Use /api/users/:id/invite to send invitation email.',
            },
          },
        });
      } else if (role === 'admin' && normalizedTenantId) {
        // Create tenant-scoped admin in users table WITH tenant_id
        // NOTE: Global email uniqueness already checked above
        // BYPASS ADAPTER: Use direct Supabase to avoid wildcard bug
        logger.debug(`[POST /api/users] Admin path - checking users table for ${normalizedEmail}`);
        const { getSupabaseClient } = await import('../lib/supabase-db.js');
        const supabase = getSupabaseClient();
        const { data: existingUser } = await supabase
          .from('users')
          .select('id')
          .eq('email', normalizedEmail);

        logger.debug(`[POST /api/users] Admin duplicate check result:`, existingUser);
        if (existingUser && existingUser.length > 0) {
          logger.warn(`[POST /api/users] DUPLICATE FOUND in users table for ${normalizedEmail}`);
          return res.status(409).json({
            status: 'error',
            message: 'User already exists',
          });
        }
        logger.debug(`[POST /api/users] No duplicate found, proceeding to create auth user`);

        // Create Supabase Auth user - send invitation email
        const authMetadata = {
          first_name,
          last_name,
          role: 'admin',
          tenant_id: normalizedTenantId,
          display_name: `${first_name} ${last_name || ''}`.trim(),
        };

        const { user: authUser, error: authError } = await inviteUserByEmail(
          normalizedEmail,
          authMetadata,
        );

        if (authError) {
          logger.error('[User Creation] Supabase Auth error:', authError);
          return res.status(500).json({
            status: 'error',
            message: `Failed to invite user: ${authError.message}`,
          });
        }

        authUserId = authUser?.id;

        const result = await pgPool.query(
          `INSERT INTO users (email, first_name, last_name, role, tenant_id, tenant_uuid, metadata, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, (SELECT id FROM tenant WHERE tenant_id = $5 LIMIT 1), $6, NOW(), NOW())
           RETURNING id, email, first_name, last_name, role, tenant_id, tenant_uuid, metadata, created_at, updated_at`,
          [normalizedEmail, first_name, last_name, 'admin', normalizedTenantId, combinedMetadata],
        );

        const user = expandUserMetadata(result.rows[0]);

        // Create audit log for admin creation
        try {
          const { getSupabaseClient } = await import('../lib/supabase-db.js');
          const supabase = getSupabaseClient();
          await createAuditLog(supabase, {
            tenant_id: normalizedTenantId || 'system',
            user_email: getUserEmailFromRequest(req),
            action: 'create',
            entity_type: 'user',
            entity_id: user.id,
            changes: {
              email: user.email,
              role: user.role,
              first_name: user.first_name,
              last_name: user.last_name,
              tenant_id: normalizedTenantId,
            },
            ip_address: getClientIP(req),
            user_agent: req.headers['user-agent'],
          });
        } catch (auditError) {
          logger.warn('[AUDIT] Failed to log admin creation:', auditError.message);
        }

        res.json({
          status: 'success',
          message: 'Tenant admin created. Invitation email queued.',
          data: {
            user,
            auth: {
              created: !!authUserId,
              invitation_queued: true,
              email_address: normalizedEmail,
              note: 'Check Supabase Dashboard → Auth → Logs to verify email delivery',
            },
          },
        });
      } else {
        // Create manager/employee in employees table (tenant-assigned user)
        if (!normalizedTenantId) {
          return res.status(400).json({
            status: 'error',
            message: 'tenant_id is required for non-admin users',
          });
        }

        // NOTE: Global email uniqueness already checked above
        // Also check for same email in same tenant (defensive redundancy)
        // BYPASS ADAPTER: Use direct Supabase to avoid wildcard bug
        const { getSupabaseClient } = await import('../lib/supabase-db.js');
        const supabase = getSupabaseClient();
        const { data: existingEmployee } = await supabase
          .from('employees')
          .select('id')
          .eq('email', normalizedEmail)
          .eq('tenant_id', normalizedTenantId);

        if (existingEmployee && existingEmployee.length > 0) {
          return res.status(409).json({
            status: 'error',
            message: 'Employee already exists for this tenant',
          });
        }

        // Create Supabase Auth user - send invitation email
        const authMetadata = {
          first_name,
          last_name,
          role: role || 'employee',
          tenant_id: normalizedTenantId,
          display_name: `${first_name} ${last_name || ''}`.trim(),
        };

        const { user: authUser, error: authError } = await inviteUserByEmail(
          normalizedEmail,
          authMetadata,
        );

        if (authError) {
          logger.error('[User Creation] Supabase Auth error:', authError);
          return res.status(500).json({
            status: 'error',
            message: `Failed to invite user: ${authError.message}`,
          });
        }

        authUserId = authUser?.id;

        const result = await pgPool.query(
          `INSERT INTO employees (tenant_id, email, first_name, last_name, role, status, metadata, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
           RETURNING id, tenant_id, email, first_name, last_name, role, status, metadata, created_at, updated_at`,
          [
            normalizedTenantId,
            normalizedEmail,
            first_name,
            last_name,
            role || 'employee',
            status || 'active',
            combinedMetadata,
          ],
        );

        const user = expandUserMetadata(result.rows[0]);

        // Create audit log for employee creation
        try {
          const { getSupabaseClient } = await import('../lib/supabase-db.js');
          const supabase = getSupabaseClient();
          await createAuditLog(supabase, {
            tenant_id: normalizedTenantId || 'system',
            user_email: getUserEmailFromRequest(req),
            action: 'create',
            entity_type: 'user',
            entity_id: user.id,
            changes: {
              email: user.email,
              role: user.role,
              first_name: user.first_name,
              last_name: user.last_name,
              tenant_id: normalizedTenantId,
              status: user.status,
            },
            ip_address: getClientIP(req),
            user_agent: req.headers['user-agent'],
          });
        } catch (auditError) {
          logger.warn('[AUDIT] Failed to log employee creation:', auditError.message);
        }

        res.json({
          status: 'success',
          message: 'Employee created. Invitation email queued.',
          data: {
            user,
            auth: {
              created: !!authUserId,
              invitation_queued: true,
              email_address: email,
              note: 'Check Supabase Dashboard → Auth → Logs to verify email delivery',
            },
          },
        });
      }
    } catch (error) {
      logger.error('[POST /api/users] EXCEPTION caught:', error);
      logger.error('[POST /api/users] Error stack:', error.stack);
      logger.error('[POST /api/users] Error details:', {
        name: error.name,
        message: error.message,
        code: error.code,
        status: error.status,
      });
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/users/register - User registration (legacy endpoint)
  router.post('/register', authLimiter, async (req, res) => {
    try {
      const {
        tenant_id,
        email,
        password: _password,
        first_name,
        last_name,
        role = 'user',
      } = req.body;

      if (!tenant_id || !email) {
        return res.status(400).json({
          status: 'error',
          message: 'tenant_id and email are required',
        });
      }

      // Check if user already exists
      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const normalizedEmail = String(email).toLowerCase().trim();
      const { data: existingUser, error: euErr } = await supabase
        .from('users')
        .select('id')
        .eq('email', normalizedEmail);
      if (euErr) logger.warn('[register] existing user check error:', euErr);

      if (existingUser && existingUser.length > 0) {
        return res.status(409).json({
          status: 'error',
          message: 'User already exists',
        });
      }

      // Note: In production, hash password with bcrypt before storing
      const nowIso = new Date().toISOString();
      const { data: regRow, error: regErr } = await supabase
        .from('users')
        .insert([
          {
            tenant_id,
            email: normalizedEmail,
            first_name,
            last_name,
            role,
            status: 'active',
            created_at: nowIso,
            updated_at: nowIso,
          },
        ])
        .select('id, tenant_id, email, first_name, last_name, role, status')
        .single();
      if (regErr) throw new Error(regErr.message);

      res.json({
        status: 'success',
        message: 'Registration successful',
        data: { user: regRow },
      });
    } catch (error) {
      logger.error('Error registering user:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/users/profile - Get user profile (requires auth in production)
  router.get('/profile', async (req, res) => {
    try {
      const { email, tenant_id } = req.query;

      if (!email || !tenant_id) {
        return res.status(400).json({
          status: 'error',
          message: 'email and tenant_id are required',
        });
      }

      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const normalizedEmail = String(email).toLowerCase().trim();
      const { data: profRows, error: profErr } = await supabase
        .from('users')
        .select('id, tenant_id, email, first_name, last_name, role, status, metadata, created_at')
        .eq('email', normalizedEmail)
        .eq('tenant_id', tenant_id)
        .limit(1);
      if (profErr) throw new Error(profErr.message);

      if (!profRows || profRows.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'User not found',
        });
      }

      res.json({
        status: 'success',
        data: { user: profRows[0] },
      });
    } catch (error) {
      logger.error('Error getting profile:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // PUT /api/users/:id - Update user (supports users and employees tables)
  router.put('/:id', mutateLimiter, invalidateCache('users'), async (req, res) => {
    try {
      const { id } = req.params;
      const {
        tenant_id,
        first_name,
        last_name,
        role,
        status,
        metadata,
        display_name,
        is_active,
        tags,
        employee_role,
        permissions,
        navigation_permissions,
        new_password, // Password reset field
        ...otherFields // Capture any unknown fields
      } = req.body;

      // 🔒 CRITICAL: Define immutable superadmin accounts that cannot be modified via API
      // These accounts can ONLY be changed directly in Supabase Auth dashboard
      const IMMUTABLE_SUPERADMINS = [
        // 'abyfield@4vdataconsulting.com', // Primary system owner
        // 'andrei.byfield@gmail.com', // Secondary admin account
      ];

      // First, try to find user in users table (superadmin/admin), then employees table
      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();

      let currentUser = await supabase
        .from('users')
        .select('metadata, tenant_id, email, role')
        .eq('id', id)
        .single();

      let tableName = 'users';

      if (currentUser.error) {
        // Try employees table
        currentUser = await supabase
          .from('employees')
          .select('metadata, tenant_id, email, role')
          .eq('id', id)
          .single();

        tableName = 'employees';
      }

      if (currentUser.error || !currentUser.data) {
        return res.status(404).json({
          status: 'error',
          message: 'User not found',
        });
      }

      const userData = currentUser.data;

      // 🔒 IMMUTABLE PROTECTION: Block ANY changes to protected superadmin accounts
      if (
        IMMUTABLE_SUPERADMINS.some(
          (email) => email.toLowerCase() === (userData.email || '').toLowerCase(),
        )
      ) {
        logger.warn(
          `[PUT /api/users/:id] BLOCKED attempt to modify immutable superadmin: ${userData.email}`,
        );
        return res.status(403).json({
          status: 'error',
          message: 'This superadmin account is immutable and cannot be modified via API',
          code: 'IMMUTABLE_ACCOUNT',
          hint: 'Protected superadmin accounts can only be modified directly in Supabase Auth dashboard',
          protected_email: userData.email,
        });
      }

      // Handle password update if provided
      if (new_password && new_password.trim() !== '') {
        const userEmail = userData.email;

        // Get auth user by email
        const { user: authUser } = await getAuthUserByEmail(userEmail);

        if (authUser) {
          // Update password in Supabase Auth
          const { error: passwordError } = await updateAuthUserPassword(authUser.id, new_password);

          if (passwordError) {
            // Redact sensitive error details from logs
            logger.error('[User Update] Password update error:', {
              code: passwordError.code,
              message: '[REDACTED]',
            });
            return res.status(500).json({
              status: 'error',
              message: 'Failed to update password. Please contact support.',
            });
          }

          // Confirm email after password change
          const { error: confirmError } = await confirmUserEmail(authUser.id);
          if (confirmError) {
            logger.warn('[User Update] Could not confirm email:', confirmError);
          }

          logger.debug(`✓ Password updated for user: ${userEmail}`);
        }
      }

      // Merge metadata - preserve existing metadata and add/update new fields
      const currentMetadata = userData.metadata || {};

      // AUTO-SYNC: Derive display_name from first/last name if not explicitly provided
      let derivedDisplayName = display_name;
      if (display_name === undefined && (first_name !== undefined || last_name !== undefined)) {
        // If first/last are being updated but display_name isn't, auto-compute it
        const newFirst = first_name !== undefined ? first_name : currentMetadata.first_name || '';
        const newLast = last_name !== undefined ? last_name : currentMetadata.last_name || '';
        derivedDisplayName = `${newFirst} ${newLast}`.trim() || undefined;
      }

      const updatedMetadata = {
        ...currentMetadata,
        ...(metadata || {}),
        ...(derivedDisplayName !== undefined && { display_name: derivedDisplayName }),
        ...(is_active !== undefined && { is_active }),
        ...(tags !== undefined && { tags }),
        ...(employee_role !== undefined && { employee_role }),
        ...(permissions !== undefined && { permissions }),
        ...(navigation_permissions !== undefined && { navigation_permissions }),
        ...otherFields, // Include any unknown fields in metadata
      };

      // SECURITY: Remove password from metadata if it exists (should never be stored)
      delete updatedMetadata.password;
      if (new_password && new_password.trim() !== '') {
        // Password was just changed - clear any legacy password storage
        delete updatedMetadata.password;
      }

      // Normalize tenant_id inputs (treat various sentinels as null)
      const normalizeTenant = (val) => {
        if (
          val === '' ||
          val === 'no-client' ||
          val === 'none' ||
          val === 'null' ||
          val === undefined
        )
          return null;
        return val;
      };
      const finalTenantId =
        tenant_id !== undefined ? normalizeTenant(tenant_id) : userData.tenant_id;

      // Use Supabase client directly to avoid SQL parser limitations
      const updateData = {
        ...(first_name !== undefined && { first_name }),
        ...(last_name !== undefined && { last_name }),
        ...(role !== undefined && { role }),
        ...(tableName === 'employees' && status !== undefined && { status }),
        tenant_id: finalTenantId,
        metadata: updatedMetadata,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from(tableName)
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error(`[User Update] Supabase error:`, error);
        return res.status(500).json({
          status: 'error',
          message: 'Failed to update user',
          error: error.message,
        });
      }

      if (!data) {
        return res.status(404).json({
          status: 'error',
          message: 'User not found',
        });
      }

      // Expand metadata to top-level properties
      const updatedUser = expandUserMetadata(data);

      // Create audit log for user update
      try {
        await createAuditLog(supabase, {
          tenant_id: updatedUser.tenant_id || 'system',
          user_email: getUserEmailFromRequest(req),
          action: 'update',
          entity_type: 'user',
          entity_id: id,
          changes: {
            ...updateData,
            table: tableName,
          },
          ip_address: getClientIP(req),
          user_agent: req.headers['user-agent'],
        });
      } catch (auditError) {
        logger.warn('[AUDIT] Failed to log user update:', auditError.message);
      }

      // Keep Supabase Auth metadata in sync for name fields to avoid UI mismatches
      try {
        const userEmail = userData?.email;
        if (
          userEmail &&
          (first_name !== undefined || last_name !== undefined || display_name !== undefined)
        ) {
          const { user: authUser } = await getAuthUserByEmail(userEmail);
          if (authUser?.id) {
            const currentAuthMeta = authUser.user_metadata || {};
            const nextFirst =
              first_name !== undefined ? first_name : currentAuthMeta.first_name || undefined;
            const nextLast =
              last_name !== undefined ? last_name : currentAuthMeta.last_name || undefined;
            const nextDisplay =
              display_name !== undefined
                ? display_name
                : currentAuthMeta.display_name ||
                  (typeof nextFirst === 'string' || typeof nextLast === 'string'
                    ? `${nextFirst || ''} ${nextLast || ''}`.trim()
                    : undefined);

            const authUpdate = {
              ...currentAuthMeta,
              ...(nextFirst !== undefined && { first_name: nextFirst }),
              ...(nextLast !== undefined && { last_name: nextLast }),
              ...(nextDisplay !== undefined && { display_name: nextDisplay }),
              // Maintain full_name for legacy consumers
              ...(nextFirst !== undefined || nextLast !== undefined || nextDisplay !== undefined
                ? { full_name: nextDisplay || `${nextFirst || ''} ${nextLast || ''}`.trim() }
                : {}),
            };

            const { error: metaErr } = await updateAuthUserMetadata(authUser.id, authUpdate);
            if (metaErr) {
              logger.warn('[User Update] Could not sync auth metadata:', metaErr);
            } else {
              if (process.env.NODE_ENV !== 'test') {
                logger.debug(`✓ Synced auth metadata for ${userEmail}`);
              }
            }
          }
        }
      } catch (e) {
        logger.warn('[User Update] Auth metadata sync skipped:', e?.message || e);
      }

      res.json({
        status: 'success',
        message: 'User updated',
        data: { user: updatedUser },
      });
    } catch (error) {
      logger.error('Error updating user:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // DELETE /api/users/:id - Delete user (checks both users and employees tables)
  router.delete('/:id', mutateLimiter, invalidateCache('users'), async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id } = req.query;
      logger.debug(`[DELETE /api/users/:id] Requested id=`, id, ` tenant_id(query)=`, tenant_id);

      // Initialize Supabase client for audit logging
      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();

      // Try to find user in users table first (for SuperAdmins/Admins)
      logger.debug(`[DELETE /api/users/:id] About to query users table with id=`, id);

      // DIAGNOSTIC: Use Supabase client instead of pgPool to verify data
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('id, email, role, tenant_id')
        .eq('id', id);

      if (usersError) {
        logger.error(`[DELETE /api/users/:id] Supabase query error:`, usersError);
      }
      logger.debug(
        `[DELETE /api/users/:id] Supabase returned`,
        usersData?.length || 0,
        `rows:`,
        usersData,
      );

      let userResult = { rows: usersData || [], rowCount: usersData?.length || 0 };
      logger.debug(
        `[DELETE /api/users/:id] users query returned`,
        userResult.rows.length,
        `rows:`,
        userResult.rows,
      );
      let tableName = 'users';

      // If not found in users table, check employees table
      if (userResult.rows.length === 0) {
        // For employees, prefer locating by id only to avoid false negatives when
        // the caller supplies a tenant_id that doesn't match (e.g. null/unknown test users)
        const { data: empData, error: empError } = await supabase
          .from('employees')
          .select('id, email, tenant_id')
          .eq('id', id);

        if (empError) {
          logger.error(`[DELETE /api/users/:id] Employees query error:`, empError);
        }
        logger.debug(
          `[DELETE /api/users/:id] Employees Supabase returned`,
          empData?.length || 0,
          `rows`,
        );

        userResult = { rows: empData || [], rowCount: empData?.length || 0 };
        tableName = 'employees';
      }
      logger.debug(
        `[DELETE /api/users/:id] Located table=`,
        tableName,
        ` rows=`,
        userResult.rows.length,
        ` email=`,
        userResult.rows[0]?.email,
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'User not found in users or employees table',
        });
      }

      const userEmail = userResult.rows[0].email;
      logger.debug(`[DELETE /api/users/:id] Row to delete:`, {
        id: userResult.rows[0].id,
        email: userEmail,
        tenant_id: userResult.rows[0].tenant_id,
        tableName,
      });

      // 🔒 CRITICAL: Define immutable superadmin accounts that cannot be deleted via API
      const IMMUTABLE_SUPERADMINS = [
        // 'abyfield@4vdataconsulting.com', // Primary system owner
        // 'andrei.byfield@gmail.com', // Secondary admin account
      ];

      // 🔒 IMMUTABLE PROTECTION: Block deletion of protected superadmin accounts
      if (
        IMMUTABLE_SUPERADMINS.some(
          (email) => email.toLowerCase() === (userEmail || '').toLowerCase(),
        )
      ) {
        logger.warn(
          `[DELETE /api/users/:id] BLOCKED attempt to delete immutable superadmin: ${userEmail}`,
        );
        return res.status(403).json({
          status: 'error',
          message: 'This superadmin account is immutable and cannot be deleted',
          code: 'IMMUTABLE_ACCOUNT',
          hint: 'Protected superadmin accounts can only be removed directly in Supabase Auth dashboard',
          protected_email: userEmail,
        });
      }

      // Stopper: prevent deleting the last remaining superadmin
      if (tableName === 'users' && (userResult.rows[0].role || '').toLowerCase() === 'superadmin') {
        const { count: remaining } = await supabase
          .from('users')
          .select('id', { count: 'exact', head: true })
          .eq('role', 'superadmin')
          .neq('id', id);
        if (remaining <= 0) {
          return res.status(403).json({
            status: 'error',
            code: 'LAST_SUPERADMIN',
            message: 'Cannot delete the last remaining superadmin.',
          });
        }
      }

      // Delete from Supabase Auth
      try {
        logger.debug(`[DELETE /api/users/:id] Attempting auth delete for`, userEmail);
        const { user: authUser } = await getAuthUserByEmail(userEmail);
        if (authUser?.id) {
          await deleteAuthUser(authUser.id);
          logger.debug(`✓ Deleted auth user: ${userEmail}`);
        } else {
          logger.debug(`[DELETE /api/users/:id] No auth user found for`, userEmail);
        }
      } catch (authError) {
        logger.warn(`⚠ Could not delete auth user ${userEmail}:`, authError.message);
        // Continue with database deletion even if auth deletion fails
      }

      // Delete from the correct table. Use the located row's tenant_id to scope the delete
      // instead of blindly trusting req.query. This avoids non-deletes when the UI context
      // tenant doesn't match test rows (e.g., null/"unknown").
      let deletedRow = null;
      if (tableName === 'users') {
        const { data, error } = await supabase
          .from('users')
          .delete()
          .eq('id', id)
          .select('id, email')
          .single();
        if (error && error.code !== 'PGRST116') throw new Error(error.message);
        deletedRow = data || null;
      } else {
        const rowTenant = userResult.rows[0]?.tenant_id || null;
        let delQuery = supabase.from('employees').delete().eq('id', id);
        if (rowTenant) delQuery = delQuery.eq('tenant_id', rowTenant);
        const { data, error } = await delQuery.select('id, email').maybeSingle();
        if (error && error.code !== 'PGRST116') throw new Error(error.message);
        deletedRow = data || null;
      }

      // Ensure we actually deleted a row; otherwise report 404 to the client
      if (!deletedRow) {
        return res.status(404).json({
          status: 'error',
          message: 'User not found or already deleted',
          code: 'DELETE_NOT_FOUND',
        });
      }

      logger.debug(`✓ Deleted user from ${tableName} table: ${userEmail}`);

      // Create audit log for user deletion
      try {
        await createAuditLog(supabase, {
          tenant_id: userResult.rows[0].tenant_id || 'system',
          user_email: getUserEmailFromRequest(req),
          action: 'delete',
          entity_type: 'user',
          entity_id: id,
          changes: {
            deleted_email: userEmail,
            deleted_from_table: tableName,
            role: userResult.rows[0].role,
          },
          ip_address: getClientIP(req),
          user_agent: req.headers['user-agent'],
        });
      } catch (auditError) {
        logger.warn('[AUDIT] Failed to log user deletion:', auditError.message);
      }

      res.json({
        status: 'success',
        message: 'User deleted',
        data: { user: deletedRow },
      });
    } catch (error) {
      logger.error('Error deleting user:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/users/reset-password - Send password reset email
  router.post('/reset-password', passwordLimiter, async (req, res) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({
          status: 'error',
          message: 'email is required',
        });
      }

      // Apply email-based throttling (3 attempts per 15 minutes)
      // This prevents hitting Supabase's built-in 1 email/60s rate limit
      try {
        throttleEmail(email);
      } catch (e) {
        return res
          .status(429)
          .set('Retry-After', String(e.retryAfter ?? 60))
          .json({
            status: 'error',
            message: e.message || 'Too many reset attempts. Try again later.',
          });
      }

      const { data, error } = await sendPasswordResetEmail(email);

      if (error) {
        logger.error('[Password Reset] Error:', error);
        return res.status(500).json({
          status: 'error',
          message: error.message || 'Failed to send reset email',
        });
      }

      res.json({
        status: 'success',
        message: 'Password reset email sent',
        data,
      });
    } catch (error) {
      logger.error('Error sending password reset:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/users/generate-recovery-link - Dev diagnostic: generate recovery link without email delivery
  router.post('/generate-recovery-link', passwordLimiter, async (req, res) => {
    try {
      if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({ status: 'error', message: 'Not available in production' });
      }
      const { email, redirectTo } = req.body || {};
      if (!email) {
        return res.status(400).json({ status: 'error', message: 'email is required' });
      }
      const { link, error } = await generateRecoveryLink(email, redirectTo);
      if (error) {
        return res.status(500).json({
          status: 'error',
          message: error.message || 'Failed to generate recovery link',
        });
      }
      return res.json({ status: 'success', link });
    } catch (e) {
      logger.error('[RecoveryLink] Error generating recovery link:', e);
      return res.status(500).json({
        status: 'error',
        message: e.message || 'Internal error',
      });
    }
  });

  // POST /api/users/admin-password-reset - Direct password reset (for dev/admin use)
  router.post('/admin-password-reset', passwordLimiter, async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          status: 'error',
          message: 'email and password are required',
        });
      }

      // Get auth user by email
      const { user: authUser, error: getUserError } = await getAuthUserByEmail(email);

      if (getUserError || !authUser) {
        return res.status(404).json({
          status: 'error',
          message: `User not found: ${getUserError?.message || 'No auth user with this email'}`,
        });
      }

      // Update password AND confirm email
      const { error: updateError } = await updateAuthUserPassword(authUser.id, password);

      if (updateError) {
        logger.error('[Admin Password Reset] Error:', {
          code: updateError.code,
          message: '[REDACTED]',
        });
        return res.status(500).json({
          status: 'error',
          message: 'Failed to update password. Please contact support.',
        });
      }

      // Confirm email (bypass verification)
      const { error: confirmError } = await confirmUserEmail(authUser.id);

      if (confirmError) {
        logger.warn('[Admin Password Reset] Could not confirm email:', confirmError);
        // Don't fail - password was updated successfully
      }

      // Clear password expiration metadata
      const currentMetadata = authUser.user_metadata || {};
      const updatedMetadata = {
        ...currentMetadata,
        password_change_required: false,
        password_expires_at: null,
      };

      const { error: metadataError } = await updateAuthUserMetadata(authUser.id, updatedMetadata);

      if (metadataError) {
        logger.warn('[Admin Password Reset] Could not clear expiration metadata:', metadataError);
        // Don't fail the request - password was updated successfully
      }

      logger.debug(`✓ Password reset for: ${email} (email confirmed, expiration cleared)`);

      res.json({
        status: 'success',
        message: 'Password updated, email confirmed, and expiration cleared',
        data: { email, userId: authUser.id },
      });
    } catch (error) {
      logger.error('Error in admin password reset:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // Shared invite/resend handler - used by both /:id/invite and /:id/resend-invite
  async function handleSendInvite(req, res) {
    try {
      const { id } = req.params;
      const { redirect_url } = req.body;

      logger.debug(`[User Invite] Sending invitation for user ID: ${id}`);

      // Fetch user from database using Supabase
      const { getSupabaseClient } = await import('../lib/supabase-db.js');
      const supabase = getSupabaseClient();
      const { data: userRows, error: userErr } = await supabase
        .from('users')
        .select('id, email, first_name, last_name, role, tenant_id, metadata')
        .eq('id', id)
        .limit(1);
      if (userErr) logger.warn('[User Invite] users select error:', userErr);

      const userFound = userRows && userRows.length > 0;
      logger.debug(`[User Invite] Query result:`, {
        found: userFound,
        email: userFound ? userRows[0]?.email : undefined,
        name: userFound ? `${userRows[0]?.first_name} ${userRows[0]?.last_name}` : undefined,
      });

      if (!userFound) {
        // Try employees table
        const { data: employeeRows, error: empErr } = await supabase
          .from('employees')
          .select('id, email, first_name, last_name, role, tenant_id, metadata')
          .eq('id', id)
          .limit(1);
        if (empErr) logger.warn('[User Invite] employees select error:', empErr);

        if (!employeeRows || employeeRows.length === 0) {
          return res.status(404).json({
            status: 'error',
            message: 'User not found',
          });
        }

        const employee = employeeRows[0];

        // Check if user already exists in Supabase Auth
        const authResult = await getAuthUserByEmail(employee.email);
        const existingAuthUser = authResult?.user;

        if (existingAuthUser) {
          // User already exists in Auth - send password reset instead
          logger.debug(
            `[User Invite] User ${employee.email} already registered, sending password reset`,
          );

          const { error: resetError } = await sendPasswordResetEmail(employee.email);

          if (resetError) {
            logger.error('[User Invite] Password reset error:', {
              code: resetError.code,
              message: '[REDACTED]',
            });
            return res.status(500).json({
              status: 'error',
              message: 'Failed to send password reset email. Please contact support.',
            });
          }

          return res.json({
            status: 'success',
            message: `Password reset email sent to ${employee.email}`,
            data: { email: employee.email, type: 'password_reset' },
          });
        }

        // User doesn't exist in Auth - send invitation
        const { data, error } = await inviteUserByEmail(
          employee.email,
          {
            first_name: employee.first_name,
            last_name: employee.last_name,
            role: employee.role || 'employee',
            tenant_id: employee.tenant_id,
            display_name: `${employee.first_name} ${employee.last_name || ''}`.trim(),
          },
          redirect_url,
        );

        if (error) {
          logger.error('[User Invite] Supabase Auth error:', error);
          return res.status(500).json({
            status: 'error',
            message: `Failed to send invitation: ${error.message}`,
          });
        }

        return res.json({
          status: 'success',
          message: `Invitation sent to ${employee.email}`,
          data: { email: employee.email, auth_user: data },
        });
      }

      const user = userRows[0];

      // Check if user already exists in Supabase Auth
      logger.debug(`[User Invite] Checking if ${user.email} exists in Supabase Auth...`);
      const authResult = await getAuthUserByEmail(user.email);
      logger.debug(`[User Invite] Auth check result:`, {
        user: authResult?.user ? 'found' : 'not found',
        email: authResult?.user?.email,
        error: authResult?.error,
      });
      const existingAuthUser = authResult?.user;

      if (existingAuthUser) {
        // User already exists in Auth - send password reset instead
        logger.debug(`[User Invite] User ${user.email} already registered, sending password reset`);

        const { error: resetError } = await sendPasswordResetEmail(user.email);

        if (resetError) {
          logger.error('[User Invite] Password reset error:', {
            code: resetError.code,
            message: '[REDACTED]',
          });
          return res.status(500).json({
            status: 'error',
            message: 'Failed to send password reset email. Please contact support.',
          });
        }

        return res.json({
          status: 'success',
          message: `Password reset email sent to ${user.email}`,
          data: { email: user.email, type: 'password_reset' },
        });
      }

      // User doesn't exist in Auth - send invitation
      const { data, error } = await inviteUserByEmail(
        user.email,
        {
          first_name: user.first_name,
          last_name: user.last_name,
          role: user.role,
          tenant_id: user.tenant_id,
          display_name: `${user.first_name} ${user.last_name || ''}`.trim(),
        },
        redirect_url,
      );

      if (error) {
        logger.error('[User Invite] Supabase Auth error:', error);
        return res.status(500).json({
          status: 'error',
          message: `Failed to send invitation: ${error.message}`,
        });
      }

      res.json({
        status: 'success',
        message: `Invitation sent to ${user.email}`,
        data: { email: user.email, auth_user: data },
      });
    } catch (error) {
      logger.error('[User Invite] Error:', error);
      res.status(500).json({
        status: 'error',
        message: error.message,
      });
    }
  }

  // POST /api/users/:id/invite - Send Supabase Auth invitation to existing user
  router.post('/:id/invite', mutateLimiter, handleSendInvite);

  // POST /api/users/:id/resend-invite - Alias for backward compatibility
  router.post('/:id/resend-invite', mutateLimiter, handleSendInvite);

  return router;
}
