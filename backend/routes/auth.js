import express from 'express';
import jwt from 'jsonwebtoken';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../lib/supabase-db.js';
import {
  getAuthUserByEmail,
  sendPasswordResetEmail,
  updateAuthUserMetadata,
} from '../lib/supabaseAuth.js';
import logger from '../lib/logger.js';

function getAnonSupabase() {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return createSupabaseClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function signAccess(payload) {
  // Use HS256 explicitly - must match verification in authenticate.js
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    logger.warn('[Auth] JWT_SECRET not set, using insecure fallback');
  }
  return jwt.sign(payload, secret || 'change-me-access', { algorithm: 'HS256', expiresIn: '15m' });
}

function signRefresh(payload) {
  // Use HS256 explicitly for refresh tokens
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    logger.warn('[Auth] JWT_SECRET not set for refresh, using insecure fallback');
  }
  return jwt.sign(payload, secret || 'change-me-refresh', { algorithm: 'HS256', expiresIn: '7d' });
}

function cookieOpts(maxAgeMs) {
  const isProd = process.env.NODE_ENV === 'production';
  const domain = process.env.COOKIE_DOMAIN;
  // IMPORTANT: If using separate subdomains (e.g., api.aishacrm.com and app.aishacrm.com),
  // set COOKIE_DOMAIN=.aishacrm.com in .env to share cookies across subdomains.
  // Without this, cookies set on app.X won't be sent to api.X, causing 401 errors.
  // Recommended: Use same domain for frontend and backend (e.g., app.X/api) to avoid this issue.
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: maxAgeMs,
    path: '/',
    ...(domain && { domain }),
  };
}

export default function createAuthRoutes(_pgPool) {
  const router = express.Router();

  /**
   * @openapi
   * /api/auth/login:
   *   post:
   *     summary: User login with email/password
   *     tags: [users]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [email, password]
   *             properties:
   *               email: { type: string, format: email }
   *               password: { type: string, format: password }
   *     responses:
   *       200:
   *         description: Login successful, returns JWT tokens
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status: { type: string, example: success }
   *                 data:
   *                   type: object
   *                   properties:
   *                     access_token: { type: string }
   *                     refresh_token: { type: string }
   *                     user:
   *                       type: object
   *                       properties:
   *                         id: { type: string, format: uuid }
   *                         email: { type: string }
   *                         tenant_id: { type: string, format: uuid }
   *       401:
   *         description: Invalid credentials
   * /api/auth/logout:
   *   post:
   *     summary: Logout user and clear tokens
   *     tags: [users]
   *     responses:
   *       200:
   *         description: Logout successful
   * /api/auth/refresh:
   *   post:
   *     summary: Refresh access token using refresh token
   *     tags: [users]
   *     responses:
   *       200:
   *         description: New access token issued
   *       401:
   *         description: Invalid refresh token
   * /api/auth/me:
   *   get:
   *     summary: Get current authenticated user
   *     tags: [users]
   *     responses:
   *       200:
   *         description: Current user profile
   *       401:
   *         description: Not authenticated
   * /api/auth/verify-token:
   *   post:
   *     summary: Verify JWT token validity
   *     tags: [users]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               token: { type: string }
   *     responses:
   *       200:
   *         description: Token is valid
   *       401:
   *         description: Token is invalid or expired
   * /api/auth/password/reset/request:
   *   post:
   *     summary: Request password reset email
   *     tags: [users]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [email]
   *             properties:
   *               email: { type: string, format: email }
   *     responses:
   *       200:
   *         description: Reset email sent if account exists
   * /api/auth/password/reset/confirm:
   *   post:
   *     summary: Confirm password reset with token
   *     tags: [users]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [token, password]
   *             properties:
   *               token: { type: string }
   *               password: { type: string, format: password }
   *     responses:
   *       200:
   *         description: Password reset successful
   *       400:
   *         description: Invalid or expired token
   */

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

  /**
   * @openapi
   * /api/auth/verify-token:
   *   post:
   *     summary: Verify JWT token validity
   *     tags: [users]
   *     security: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [token]
   *             properties:
   *               token:
   *                 type: string
   *                 description: JWT token to verify
   *     responses:
   *       200:
   *         description: Token verification result
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                   example: success
   *                 data:
   *                   type: object
   *                   properties:
   *                     valid:
   *                       type: boolean
   *                     user_id:
   *                       type: string
   *                       format: uuid
   *                     tenant_id:
   *                       type: string
   *                       format: uuid
   */
  // POST /api/auth/verify-token - Verify JWT token validity
  router.post('/verify-token', async (req, res) => {
    try {
      const { token } = req.body;
      if (!token) {
        return res.status(400).json({ status: 'error', message: 'token required' });
      }

      const secret = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || 'change-me-access';
      try {
        const decoded = jwt.verify(token, secret);
        res.json({
          status: 'success',
          data: { valid: true, user_id: decoded.user_id, tenant_id: decoded.tenant_id },
        });
      } catch (err) {
        res.json({
          status: 'success',
          data: { valid: false, error: err.message },
        });
      }
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/auth/login - verify with Supabase Auth (if anon key available), then set cookies
  router.post('/login', async (req, res) => {
    try {
      const { email: rawEmail, password } = req.body || {};
      if (!rawEmail) {
        return res.status(400).json({ status: 'error', message: 'email is required' });
      }
      const email = String(rawEmail).toLowerCase().trim();

      // Validate password is provided
      if (!password) {
        return res.status(400).json({ status: 'error', message: 'password is required' });
      }

      // 1) Verify credentials via Supabase Auth when possible
      const anonClient = getAnonSupabase();
      const isDev = process.env.NODE_ENV !== 'production';
      const isE2E = process.env.E2E_TEST_MODE === 'true';

      if (anonClient && !isDev && !isE2E) {
        // Production: require Supabase Auth password verification
        logger.debug('[Auth.login] Production mode: verifying credentials with Supabase Auth');
        const { data: _authData, error: authError } = await anonClient.auth.signInWithPassword({
          email,
          password,
        });
        if (authError) {
          logger.debug('[Auth.login] Supabase Auth failed:', { email, error: authError.message });
          return res.status(401).json({ status: 'error', message: 'Invalid credentials' });
        }
        logger.debug('[Auth.login] Supabase Auth successful for:', email);
      } else {
        // Dev/E2E: skip Supabase Auth password check, rely on DB user existence
        // This allows login even when Supabase Auth user doesn't exist or password differs
        if (!anonClient) {
          logger.debug(
            '[Auth.login] Warning: No anon client available (SUPABASE_ANON_KEY not set)',
          );
        }
        logger.debug('[Auth.login] Dev/E2E mode: skipping Supabase Auth password verification');
      }

      // 2) Fetch user details from CRM DB using Supabase client
      const supabase = getSupabaseClient();
      // email is already normalized at the top of this handler
      const normalizedEmail = email;

      // Prefer users table (admins/superadmins), then employees
      let user = null;
      let table = 'users';
      let { data: uRows, error: uError } = await supabase
        .from('users')
        .select('id, tenant_id, tenant_uuid, email, first_name, last_name, role, metadata')
        .eq('email', normalizedEmail)
        .limit(1);

      logger.debug('[Auth.login] Users query:', {
        email: normalizedEmail,
        rowCount: uRows?.length,
        error: uError?.message,
      });

      if (uRows && uRows.length > 0) {
        user = uRows[0];
        logger.debug('[Auth.login] Found user in users table:', {
          id: user.id,
          role: user.role,
          tenant_id: user.tenant_id,
          tenant_uuid: user.tenant_uuid,
        });
      } else {
        table = 'employees';
        const { data: eRows, error: eError } = await supabase
          .from('employees')
          .select('id, tenant_id, email, first_name, last_name, role, status, metadata')
          .eq('email', normalizedEmail)
          .limit(1);
        logger.debug('[Auth.login] Employees query:', {
          email: normalizedEmail,
          rowCount: eRows?.length,
          error: eError?.message,
        });
        if (eRows && eRows.length > 0) {
          user = eRows[0];
          logger.debug('[Auth.login] Found user in employees table:', {
            id: user.id,
            role: user.role,
            tenant_id: user.tenant_id,
          });
        }
      }

      // AUTO-SYNC: If user not found in CRM but authenticated via Supabase Auth, create CRM record
      if (!user) {
        logger.debug('[Auth.login] No user found in CRM database for email:', normalizedEmail);

        // Only auto-sync if Supabase Auth verification succeeded (production mode or explicitly verified)
        if (anonClient && !isDev && !isE2E) {
          logger.debug('[Auth.login] Attempting auto-sync from Supabase Auth...');
          try {
            // Fetch user metadata from Supabase Auth
            const { user: authUser, error: authErr } = await getAuthUserByEmail(normalizedEmail);
            if (authErr || !authUser) {
              logger.debug('[Auth.login] Auto-sync failed: user not found in Supabase Auth');
              return res.status(401).json({ status: 'error', message: 'Invalid credentials' });
            }

            // Create CRM record based on Supabase Auth metadata
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

            const first_name = meta.first_name || normalizedEmail.split('@')[0] || '';
            const last_name = meta.last_name || '';
            const display_name = meta.display_name || `${first_name} ${last_name}`.trim();
            const nowIso = new Date().toISOString();

            // Decide target table and create record
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
                    created_at: nowIso,
                    updated_at: nowIso,
                  },
                ])
                .select('id, tenant_id, email, first_name, last_name, role, metadata')
                .single();
              if (error) throw error;
              user = data;
              table = 'users';
              logger.debug('[Auth.login] Auto-synced superadmin to users table:', user.id);
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
                    created_at: nowIso,
                    updated_at: nowIso,
                  },
                ])
                .select('id, tenant_id, email, first_name, last_name, role, metadata')
                .single();
              if (error) throw error;
              user = data;
              table = 'users';
              logger.debug('[Auth.login] Auto-synced admin to users table:', user.id);
            } else {
              // Default to employee
              if (!normalizedTenantId) {
                logger.debug(
                  '[Auth.login] Auto-sync failed: tenant_id required for non-admin users',
                );
                return res.status(401).json({ status: 'error', message: 'Invalid credentials' });
              }
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
                .select('id, tenant_id, email, first_name, last_name, role, status, metadata')
                .single();
              if (error) throw error;
              user = data;
              table = 'employees';
              logger.debug('[Auth.login] Auto-synced employee to employees table:', user.id);
            }
          } catch (syncErr) {
            logger.error('[Auth.login] Auto-sync error:', syncErr);
            return res.status(401).json({ status: 'error', message: 'Invalid credentials' });
          }
        } else {
          // Dev/E2E mode or no Supabase Auth verification - reject login
          logger.debug('[Auth.login] User not found in CRM database and auto-sync not available');
          return res.status(401).json({ status: 'error', message: 'Invalid credentials' });
        }
      }

      if (!user) {
        logger.debug('[Auth.login] Login failed after auto-sync attempt');
        return res.status(401).json({ status: 'error', message: 'Invalid credentials' });
      }

      // Block disabled accounts
      const meta = user.metadata || {};
      const accountStatus = String(meta.account_status || user.status || '').toLowerCase();
      const isActiveFlag = meta.is_active !== false;
      if (
        accountStatus === 'inactive' ||
        isActiveFlag === false ||
        (user.status || '').toLowerCase() === 'inactive'
      ) {
        logger.debug('[Auth.login] Account disabled:', {
          email: normalizedEmail,
          status: accountStatus,
          is_active: isActiveFlag,
        });
        return res.status(403).json({ status: 'error', message: 'Account is disabled' });
      }

      // Check for CRM access permission
      const rawPermissions = meta.permissions;
      const permissionSet = new Set();

      const collectPermissions = (value, keyHint) => {
        if (value === null || value === undefined) return;

        if (typeof value === 'boolean') {
          if (value && keyHint) permissionSet.add(String(keyHint));
          return;
        }

        if (typeof value === 'string') {
          const normalized = value.trim();
          if (normalized.length === 0) return;
          if (normalized.toLowerCase() === 'true' && keyHint) {
            permissionSet.add(String(keyHint));
            return;
          }
          permissionSet.add(normalized);
          return;
        }

        if (typeof value === 'number') {
          if (value === 1 && keyHint) {
            permissionSet.add(String(keyHint));
            return;
          }
          permissionSet.add(String(value));
          return;
        }

        if (Array.isArray(value)) {
          for (const nested of value) collectPermissions(nested, keyHint);
          return;
        }

        if (typeof value === 'object') {
          for (const [nestedKey, nestedVal] of Object.entries(value)) {
            if (!nestedVal) continue;
            collectPermissions(nestedVal, nestedKey);
          }
          return;
        }

        permissionSet.add(String(value));
      };

      collectPermissions(rawPermissions, null);

      const roleLower = String(user.role || '').toLowerCase();
      const hasCrmAccess =
        roleLower === 'superadmin' || permissionSet.size === 0 || permissionSet.has('crm_access');

      if (!hasCrmAccess) {
        logger.debug('[Auth.login] CRM access denied:', {
          email: normalizedEmail,
          role: roleLower,
          permissions: Array.from(permissionSet).sort(),
        });
        return res.status(403).json({ status: 'error', message: 'CRM access not authorized' });
      }

      const payload = {
        sub: user.id,
        email: user.email,
        role: user.role,
        tenant_id: user.tenant_id || null,
        tenant_uuid: user.tenant_uuid || null,
        table,
      };
      const access = signAccess(payload);
      const refresh = signRefresh({ sub: user.id, table });

      res.cookie('aisha_access', access, cookieOpts(15 * 60 * 1000));
      res.cookie('aisha_refresh', refresh, cookieOpts(7 * 24 * 60 * 60 * 1000));

      logger.debug('[Auth.login] Login successful:', {
        email: normalizedEmail,
        role: user.role,
        table,
      });
      return res.json({
        status: 'success',
        message: 'Login successful',
        data: {
          user: {
            id: user.id,
            email: user.email,
            first_name: user.first_name,
            last_name: user.last_name,
            role: user.role,
            tenant_id: user.tenant_id || null,
          },
        },
      });
    } catch (err) {
      logger.error('[Auth.login] error', err);
      return res.status(500).json({ status: 'error', message: 'Internal error' });
    }
  });

  // POST /api/auth/refresh - rotate short-lived access cookie using refresh cookie OR accept Supabase Bearer
  router.post('/refresh', async (req, res) => {
    try {
      // DEBUG logging
      const hasRefreshCookie = !!req.cookies?.aisha_refresh;
      const authHeader = req.headers?.authorization || '';
      const hasBearer = authHeader.startsWith('Bearer ');
      if (process.env.NODE_ENV !== 'production' || process.env.AUTH_DEBUG === 'true') {
        logger.debug('[Auth.refresh] Request context:', { hasRefreshCookie, hasBearer });
      }

      // Accept either refresh cookie (for cookie-based sessions) OR Supabase Bearer token
      const token = req.cookies?.aisha_refresh;
      const bearer = hasBearer ? authHeader.substring(7).trim() : null;

      // If Supabase Bearer token provided, validate it with service role OR anon client fallback
      if (!token && bearer) {
        if (process.env.NODE_ENV !== 'production' || process.env.AUTH_DEBUG === 'true') {
          logger.debug('[Auth.refresh] Using Supabase Bearer token for refresh');
        }
        try {
          const url = process.env.SUPABASE_URL;
          const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
          const anonKey = process.env.SUPABASE_ANON_KEY;
          if (!url || (!serviceKey && !anonKey)) {
            return res.status(500).json({ status: 'error', message: 'Supabase not configured' });
          }
          const client = createSupabaseClient(url, serviceKey || anonKey, {
            auth: { persistSession: false, autoRefreshToken: false },
          });
          const { data: getUserData, error: getUserErr } = await client.auth.getUser(bearer);
          const authUser = getUserData?.user;
          if (getUserErr || !authUser) {
            logger.debug('[Auth.refresh] Invalid Supabase token:', getUserErr?.message);
            return res.status(401).json({ status: 'error', message: 'Unauthorized' });
          }

          const email = (authUser.email || '').toLowerCase().trim();
          const supabase = getSupabaseClient();

          // Lookup CRM user record
          let user = null;
          let table = 'users';
          const { data: uRows } = await supabase
            .from('users')
            .select('id, email, role, tenant_id, status, metadata')
            .eq('email', email)
            .limit(1);
          if (uRows && uRows.length > 0) {
            user = uRows[0];
          } else {
            table = 'employees';
            const { data: eRows } = await supabase
              .from('employees')
              .select('id, email, role, tenant_id, status, metadata')
              .eq('email', email)
              .limit(1);
            if (eRows && eRows.length > 0) user = eRows[0];
          }

          if (!user) {
            logger.debug('[Auth.refresh] No CRM user found for Supabase token');
            return res.status(401).json({ status: 'error', message: 'Unauthorized' });
          }

          // Check account status
          const meta = user.metadata || {};
          const accountStatus = String(meta.account_status || user.status || '').toLowerCase();
          const isActiveFlag = meta.is_active !== false;
          if (
            accountStatus === 'inactive' ||
            isActiveFlag === false ||
            (user.status || '').toLowerCase() === 'inactive'
          ) {
            return res.status(403).json({ status: 'error', message: 'Account is disabled' });
          }

          const payload = {
            sub: user.id,
            email: user.email,
            role: user.role,
            tenant_id: user.tenant_id || null,
            tenant_uuid: user.tenant_uuid || null,
            table,
          };
          const access = signAccess(payload);
          res.cookie('aisha_access', access, cookieOpts(15 * 60 * 1000));
          logger.debug('[Auth.refresh] Issued access cookie from Supabase Bearer token:', {
            email,
            mode: serviceKey ? 'service_role' : 'anon_fallback',
          });
          return res.json({ status: 'success', message: 'Refreshed' });
        } catch (bearerErr) {
          logger.error('[Auth.refresh] Bearer token processing error:', bearerErr);
          return res.status(401).json({ status: 'error', message: 'Unauthorized' });
        }
      }

      if (!token) {
        logger.debug('[Auth.refresh] No refresh token found in cookies');
        return res.status(401).json({ status: 'error', message: 'Unauthorized' });
      }
      const secret =
        process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || 'change-me-refresh';
      let decoded;
      try {
        decoded = jwt.verify(token, secret);
        logger.debug('[Auth.refresh] JWT decoded successfully:', {
          sub: decoded?.sub,
          table: decoded?.table,
          exp: decoded?.exp,
          iat: decoded?.iat,
        });
      } catch (jwtErr) {
        logger.debug('[Auth.refresh] JWT verify failed:', {
          error: jwtErr?.message || 'Unknown JWT error',
        });
        return res.status(401).json({ status: 'error', message: 'Unauthorized' });
      }

      // Optionally check token_version or user status in Supabase before issuing new access
      const supabase = getSupabaseClient();
      const { sub, table } = decoded || {};
      if (!sub) {
        logger.debug('[Auth.refresh] No sub in decoded token');
        return res.status(401).json({ status: 'error', message: 'Unauthorized' });
      }

      const tbl = table === 'employees' ? 'employees' : 'users';
      logger.debug('[Auth.refresh] Looking up user:', { sub, table: tbl });
      const selectFields =
        tbl === 'users'
          ? 'id, email, role, tenant_id, tenant_uuid, status, metadata'
          : 'id, email, role, tenant_id, status, metadata';

      const { data: rows, error: lookupErr } = await supabase
        .from(tbl)
        .select(selectFields)
        .eq('id', sub)
        .limit(1);
      if (lookupErr) {
        logger.debug('[Auth.refresh] User lookup error:', lookupErr.message);
      }
      const user = rows && rows[0];
      if (!user) {
        logger.debug('[Auth.refresh] User not found:', { sub, table: tbl, rowCount: rows?.length });
        return res.status(401).json({ status: 'error', message: 'Unauthorized' });
      }
      const meta = user.metadata || {};
      const accountStatus = String(meta.account_status || user.status || '').toLowerCase();
      const isActiveFlag = meta.is_active !== false;
      if (
        accountStatus === 'inactive' ||
        isActiveFlag === false ||
        (user.status || '').toLowerCase() === 'inactive'
      ) {
        return res.status(403).json({ status: 'error', message: 'Account is disabled' });
      }

      const payload = {
        sub: user.id,
        email: user.email,
        role: user.role,
        tenant_id: user.tenant_id || null,
        tenant_uuid: user.tenant_uuid || null,
        table: tbl,
      };
      const access = signAccess(payload);
      res.cookie('aisha_access', access, cookieOpts(15 * 60 * 1000));
      return res.json({ status: 'success', message: 'Refreshed' });
    } catch (e) {
      logger.error('[Auth.refresh] error', e);
      return res.status(500).json({ status: 'error', message: 'Internal error' });
    }
  });

  // POST /api/auth/logout - clear cookies
  router.post('/logout', (req, res) => {
    try {
      res.clearCookie('aisha_access', { path: '/' });
      res.clearCookie('aisha_refresh', { path: '/' });
      return res.json({ status: 'success', message: 'Logged out' });
    } catch {
      return res.status(200).json({ status: 'success' });
    }
  });

  // GET /api/auth/me - simple whoami via cookie (for UI probing)
  router.get('/me', (req, res) => {
    try {
      const token = req.cookies?.aisha_access;
      if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });
      const secret = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || 'change-me-access';
      const payload = jwt.verify(token, secret);
      return res.json({ status: 'success', data: { user: payload } });
    } catch {
      return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }
  });

  // POST /api/auth/password/reset/request - initiate Supabase password reset email
  router.post('/password/reset/request', async (req, res) => {
    try {
      const { email, redirectTo } = req.body || {};
      if (!email) {
        return res.status(400).json({ status: 'error', message: 'email required' });
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

      // Ensure Supabase admin client initialized at startup (sendPasswordResetEmail will throw if not)
      const { error } = await sendPasswordResetEmail(
        String(email).trim().toLowerCase(),
        redirectTo,
      );
      if (error) {
        return res
          .status(400)
          .json({ status: 'error', message: error.message || 'Failed to send reset email' });
      }
      return res.json({ status: 'success', message: 'Reset email sent' });
    } catch (e) {
      logger.error('[Auth.password.reset.request] error', e);
      return res.status(500).json({ status: 'error', message: 'Internal error' });
    }
  });

  // POST /api/auth/password/reset/confirm - (optional) set new password using recovery access token
  // NOTE: Frontend can also directly call supabase.auth.updateUser({ password }) after PASSWORD_RECOVERY event.
  router.post('/password/reset/confirm', async (req, res) => {
    try {
      const { access_token, new_password } = req.body || {};
      if (!access_token || !new_password) {
        return res
          .status(400)
          .json({ status: 'error', message: 'access_token and new_password required' });
      }

      const url = process.env.SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !key) {
        return res.status(500).json({ status: 'error', message: 'server auth not configured' });
      }

      const admin = createSupabaseClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: getUserData, error: getUserErr } = await admin.auth.getUser(access_token);
      const user = getUserData?.user;
      if (getUserErr || !user) {
        return res.status(400).json({ status: 'error', message: 'Invalid token' });
      }

      const { error: updErr } = await admin.auth.admin.updateUserById(user.id, {
        password: new_password,
      });
      if (updErr) {
        return res
          .status(400)
          .json({ status: 'error', message: updErr.message || 'Failed to update password' });
      }
      return res.json({ status: 'success', message: 'Password updated' });
    } catch (e) {
      logger.error('[Auth.password.reset.confirm] error', e);
      return res.status(500).json({ status: 'error', message: 'Internal error' });
    }
  });

  // POST /api/auth/invite-accepted - Sync auth.users → public.users + employees after invite acceptance
  // Called by AcceptInvite.jsx after user successfully sets their password.
  // This keeps public.users and employees in sync with Supabase auth.users.
  router.post('/invite-accepted', async (req, res) => {
    try {
      const { access_token } = req.body || {};
      if (!access_token) {
        return res.status(400).json({ status: 'error', message: 'access_token required' });
      }

      // 1) Verify the user via Supabase Admin
      const url = process.env.SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !key) {
        return res.status(500).json({ status: 'error', message: 'server auth not configured' });
      }

      const admin = createSupabaseClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: getUserData, error: getUserErr } = await admin.auth.getUser(access_token);
      const authUser = getUserData?.user;
      if (getUserErr || !authUser) {
        return res.status(400).json({ status: 'error', message: 'Invalid or expired token' });
      }

      const email = String(authUser.email || '')
        .toLowerCase()
        .trim();
      const meta = authUser.user_metadata || {};
      const firstName = meta.first_name || '';
      const lastName = meta.last_name || '';
      const nowIso = new Date().toISOString();

      logger.info(
        { email, authUserId: authUser.id },
        '[Auth.invite-accepted] Processing invite acceptance',
      );

      const supabase = getSupabaseClient();

      // 2) Update public.users: status → active, sync names, clear password_change_required
      const userUpdates = {
        status: 'active',
        updated_at: nowIso,
      };
      if (firstName) userUpdates.first_name = firstName;
      if (lastName) userUpdates.last_name = lastName;

      // Also update metadata to clear password_change_required
      const { data: existingUser } = await supabase
        .from('users')
        .select('id, metadata')
        .eq('email', email)
        .limit(1)
        .single();

      if (existingUser) {
        const updatedMeta = { ...(existingUser.metadata || {}), password_change_required: false };
        userUpdates.metadata = updatedMeta;

        const { error: userUpdateErr } = await supabase
          .from('users')
          .update(userUpdates)
          .eq('id', existingUser.id);

        if (userUpdateErr) {
          logger.error(
            { err: userUpdateErr, email },
            '[Auth.invite-accepted] Failed to update public.users',
          );
        } else {
          logger.info(
            { email, userId: existingUser.id },
            '[Auth.invite-accepted] Updated public.users → active',
          );
        }
      } else {
        logger.debug(
          { email },
          '[Auth.invite-accepted] No public.users record found (may be employee-only)',
        );
      }

      // 3) Update employees table: crm_invite_status → accepted
      const { data: employee } = await supabase
        .from('employees')
        .select('id, metadata')
        .eq('email', email)
        .limit(1)
        .single();

      if (employee) {
        const empMeta = { ...(employee.metadata || {}), crm_invite_status: 'accepted' };
        const empUpdates = { metadata: empMeta, updated_at: nowIso };
        if (firstName) empUpdates.first_name = firstName;
        if (lastName) empUpdates.last_name = lastName;

        const { error: empUpdateErr } = await supabase
          .from('employees')
          .update(empUpdates)
          .eq('id', employee.id);

        if (empUpdateErr) {
          logger.error(
            { err: empUpdateErr, email },
            '[Auth.invite-accepted] Failed to update employees',
          );
        } else {
          logger.info(
            { email, employeeId: employee.id },
            '[Auth.invite-accepted] Updated employee crm_invite_status → accepted',
          );
        }
      }

      // 4) Clear password_change_required in auth.users user_metadata
      const updatedAuthMeta = { ...meta, password_change_required: false };
      delete updatedAuthMeta.password_expires_at;
      const { error: metaErr } = await updateAuthUserMetadata(authUser.id, updatedAuthMeta);
      if (metaErr) {
        logger.error(
          { err: metaErr, email },
          '[Auth.invite-accepted] Failed to clear password_change_required in auth.users',
        );
      } else {
        logger.info(
          { email },
          '[Auth.invite-accepted] Cleared password_change_required in auth.users',
        );
      }

      return res.json({ status: 'success', message: 'Invite acceptance synced' });
    } catch (e) {
      logger.error('[Auth.invite-accepted] error', e);
      return res.status(500).json({ status: 'error', message: 'Internal error' });
    }
  });

  return router;
}
