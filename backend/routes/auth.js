import express from 'express';
import jwt from 'jsonwebtoken';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../lib/supabase-db.js';
import { getAuthUserByEmail, sendPasswordResetEmail } from '../lib/supabaseAuth.js';

function getAnonSupabase() {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return createSupabaseClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function signAccess(payload) {
  const secret = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || 'change-me-access';
  return jwt.sign(payload, secret, { expiresIn: '15m' });
}

function signRefresh(payload) {
  const secret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || 'change-me-refresh';
  return jwt.sign(payload, secret, { expiresIn: '7d' });
}

function cookieOpts(maxAgeMs) {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: maxAgeMs,
    path: '/',
  };
}

export default function createAuthRoutes(_pgPool) {
  const router = express.Router();

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
      const err = new Error('Too many password reset attempts for this email. Please try again later.');
      err.retryAfter = retry;
      throw err;
    }
  }

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
          data: { valid: true, user_id: decoded.user_id, tenant_id: decoded.tenant_id }
        });
      } catch (err) {
        res.json({
          status: 'success',
          data: { valid: false, error: err.message }
        });
      }
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/auth/login - verify with Supabase Auth (if anon key available), then set cookies
  router.post('/login', async (req, res) => {
    try {
      const { email, password } = req.body || {};
      if (!email) {
        return res.status(400).json({ status: 'error', message: 'email is required' });
      }

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
        console.log('[Auth.login] Production mode: verifying credentials with Supabase Auth');
        const { data: _authData, error: authError } = await anonClient.auth.signInWithPassword({ email, password });
        if (authError) {
          console.log('[Auth.login] Supabase Auth failed:', { email, error: authError.message });
          return res.status(401).json({ status: 'error', message: 'Invalid credentials' });
        }
        console.log('[Auth.login] Supabase Auth successful for:', email);
      } else {
        // Dev/E2E: skip Supabase Auth password check, rely on DB user existence
        // This allows login even when Supabase Auth user doesn't exist or password differs
        if (!anonClient) {
          console.log('[Auth.login] Warning: No anon client available (SUPABASE_ANON_KEY not set)');
        }
        console.log('[Auth.login] Dev/E2E mode: skipping Supabase Auth password verification');
      }

      // 2) Fetch user details from CRM DB using Supabase client
      const supabase = getSupabaseClient();
      const normalizedEmail = String(email).toLowerCase().trim();

      // Prefer users table (admins/superadmins), then employees
      let user = null;
      let table = 'users';
      let { data: uRows, error: uError } = await supabase
        .from('users')
        .select('id, tenant_id, email, first_name, last_name, role, metadata')
        .eq('email', normalizedEmail)
        .limit(1);
      
      console.log('[Auth.login] Users query:', { email: normalizedEmail, rowCount: uRows?.length, error: uError?.message });
      
      if (uRows && uRows.length > 0) {
        user = uRows[0];
        console.log('[Auth.login] Found user in users table:', { id: user.id, role: user.role, tenant_id: user.tenant_id });
      } else {
        table = 'employees';
        const { data: eRows, error: eError } = await supabase
          .from('employees')
          .select('id, tenant_id, email, first_name, last_name, role, status, metadata')
          .eq('email', normalizedEmail)
          .limit(1);
        console.log('[Auth.login] Employees query:', { email: normalizedEmail, rowCount: eRows?.length, error: eError?.message });
        if (eRows && eRows.length > 0) {
          user = eRows[0];
          console.log('[Auth.login] Found user in employees table:', { id: user.id, role: user.role, tenant_id: user.tenant_id });
        }
      }

      // AUTO-SYNC: If user not found in CRM but authenticated via Supabase Auth, create CRM record
      if (!user) {
        console.log('[Auth.login] No user found in CRM database for email:', normalizedEmail);

        // Only auto-sync if Supabase Auth verification succeeded (production mode or explicitly verified)
        if (anonClient && !isDev && !isE2E) {
          console.log('[Auth.login] Attempting auto-sync from Supabase Auth...');
          try {
            // Fetch user metadata from Supabase Auth
            const { user: authUser, error: authErr } = await getAuthUserByEmail(normalizedEmail);
            if (authErr || !authUser) {
              console.log('[Auth.login] Auto-sync failed: user not found in Supabase Auth');
              return res.status(401).json({ status: 'error', message: 'Invalid credentials' });
            }

            // Create CRM record based on Supabase Auth metadata
            const meta = authUser.user_metadata || {};
            const role = (meta.role || 'employee').toLowerCase();
            const rawTenant = meta.tenant_id;
            const normalizedTenantId = (rawTenant === '' || rawTenant === 'no-client' || rawTenant === 'none' || rawTenant === 'null' || rawTenant === undefined) ? null : rawTenant;

            const first_name = meta.first_name || normalizedEmail.split('@')[0] || '';
            const last_name = meta.last_name || '';
            const display_name = meta.display_name || `${first_name} ${last_name}`.trim();
            const nowIso = new Date().toISOString();

            // Decide target table and create record
            if (role === 'superadmin' && !normalizedTenantId) {
              const { data, error } = await supabase
                .from('users')
                .insert([{
                  email: normalizedEmail,
                  first_name,
                  last_name,
                  role: 'superadmin',
                  metadata: { display_name, ...meta },
                  created_at: nowIso,
                  updated_at: nowIso,
                }])
                .select('id, tenant_id, email, first_name, last_name, role, metadata')
                .single();
              if (error) throw error;
              user = data;
              table = 'users';
              console.log('[Auth.login] Auto-synced superadmin to users table:', user.id);
            } else if (role === 'admin' && normalizedTenantId) {
              const { data, error } = await supabase
                .from('users')
                .insert([{
                  email: normalizedEmail,
                  first_name,
                  last_name,
                  role: 'admin',
                  tenant_id: normalizedTenantId,
                  metadata: { display_name, ...meta },
                  created_at: nowIso,
                  updated_at: nowIso,
                }])
                .select('id, tenant_id, email, first_name, last_name, role, metadata')
                .single();
              if (error) throw error;
              user = data;
              table = 'users';
              console.log('[Auth.login] Auto-synced admin to users table:', user.id);
            } else {
              // Default to employee
              if (!normalizedTenantId) {
                console.log('[Auth.login] Auto-sync failed: tenant_id required for non-admin users');
                return res.status(401).json({ status: 'error', message: 'Invalid credentials' });
              }
              const { data, error } = await supabase
                .from('employees')
                .insert([{
                  tenant_id: normalizedTenantId,
                  email: normalizedEmail,
                  first_name,
                  last_name,
                  role,
                  status: 'active',
                  metadata: { display_name, ...meta },
                  created_at: nowIso,
                  updated_at: nowIso,
                }])
                .select('id, tenant_id, email, first_name, last_name, role, status, metadata')
                .single();
              if (error) throw error;
              user = data;
              table = 'employees';
              console.log('[Auth.login] Auto-synced employee to employees table:', user.id);
            }
          } catch (syncErr) {
            console.error('[Auth.login] Auto-sync error:', syncErr);
            return res.status(401).json({ status: 'error', message: 'Invalid credentials' });
          }
        } else {
          // Dev/E2E mode or no Supabase Auth verification - reject login
          console.log('[Auth.login] User not found in CRM database and auto-sync not available');
          return res.status(401).json({ status: 'error', message: 'Invalid credentials' });
        }
      }

      if (!user) {
        console.log('[Auth.login] Login failed after auto-sync attempt');
        return res.status(401).json({ status: 'error', message: 'Invalid credentials' });
      }

      // Block disabled accounts
      const meta = user.metadata || {};
      const accountStatus = String(meta.account_status || user.status || '').toLowerCase();
      const isActiveFlag = meta.is_active !== false;
      if (accountStatus === 'inactive' || isActiveFlag === false || (user.status || '').toLowerCase() === 'inactive') {
        console.log('[Auth.login] Account disabled:', { email: normalizedEmail, status: accountStatus, is_active: isActiveFlag });
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
        roleLower === 'superadmin' ||
        permissionSet.size === 0 ||
        permissionSet.has('crm_access');

      if (!hasCrmAccess) {
        console.log('[Auth.login] CRM access denied:', {
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
        table,
      };
      const access = signAccess(payload);
      const refresh = signRefresh({ sub: user.id, table });

      res.cookie('aisha_access', access, cookieOpts(15 * 60 * 1000));
      res.cookie('aisha_refresh', refresh, cookieOpts(7 * 24 * 60 * 60 * 1000));

      console.log('[Auth.login] Login successful:', { email: normalizedEmail, role: user.role, table });
      return res.json({ status: 'success', message: 'Login successful' });
    } catch (err) {
      console.error('[Auth.login] error', err);
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
        console.log('[Auth.refresh] Request context:', { hasRefreshCookie, hasBearer });
      }

      // Accept either refresh cookie (for cookie-based sessions) OR Supabase Bearer token
      const token = req.cookies?.aisha_refresh;
      const bearer = hasBearer ? authHeader.substring(7).trim() : null;

      // If Supabase Bearer token provided, validate it with service role OR anon client fallback
      if (!token && bearer) {
        if (process.env.NODE_ENV !== 'production' || process.env.AUTH_DEBUG === 'true') {
          console.log('[Auth.refresh] Using Supabase Bearer token for refresh');
        }
        try {
          const url = process.env.SUPABASE_URL;
          const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
          const anonKey = process.env.SUPABASE_ANON_KEY;
          if (!url || (!serviceKey && !anonKey)) {
            return res.status(500).json({ status: 'error', message: 'Supabase not configured' });
          }
          const client = createSupabaseClient(url, serviceKey || anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
          const { data: getUserData, error: getUserErr } = await client.auth.getUser(bearer);
          const authUser = getUserData?.user;
          if (getUserErr || !authUser) {
            console.log('[Auth.refresh] Invalid Supabase token:', getUserErr?.message);
            return res.status(401).json({ status: 'error', message: 'Unauthorized' });
          }

          const email = (authUser.email || '').toLowerCase().trim();
          const supabase = getSupabaseClient();

          // Lookup CRM user record
          let user = null;
          let table = 'users';
          const { data: uRows } = await supabase.from('users').select('id, email, role, tenant_id, status, metadata').eq('email', email).limit(1);
          if (uRows && uRows.length > 0) {
            user = uRows[0];
          } else {
            table = 'employees';
            const { data: eRows } = await supabase.from('employees').select('id, email, role, tenant_id, status, metadata').eq('email', email).limit(1);
            if (eRows && eRows.length > 0) user = eRows[0];
          }

          if (!user) {
            console.log('[Auth.refresh] No CRM user found for Supabase token');
            return res.status(401).json({ status: 'error', message: 'Unauthorized' });
          }

          // Check account status
          const meta = user.metadata || {};
          const accountStatus = String(meta.account_status || user.status || '').toLowerCase();
          const isActiveFlag = meta.is_active !== false;
          if (accountStatus === 'inactive' || isActiveFlag === false || (user.status || '').toLowerCase() === 'inactive') {
            return res.status(403).json({ status: 'error', message: 'Account is disabled' });
          }

          const payload = { sub: user.id, email: user.email, role: user.role, tenant_id: user.tenant_id || null, table };
          const access = signAccess(payload);
          res.cookie('aisha_access', access, cookieOpts(15 * 60 * 1000));
          console.log('[Auth.refresh] Issued access cookie from Supabase Bearer token:', { email, mode: serviceKey ? 'service_role' : 'anon_fallback' });
          return res.json({ status: 'success', message: 'Refreshed' });
        } catch (bearerErr) {
          console.error('[Auth.refresh] Bearer token processing error:', bearerErr);
          return res.status(401).json({ status: 'error', message: 'Unauthorized' });
        }
      }

      if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });
      const secret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || 'change-me-refresh';
      let decoded;
      try {
        decoded = jwt.verify(token, secret);
      } catch (jwtErr) {
        console.log('[Auth.refresh] JWT verify failed:', { 
          error: jwtErr?.message || 'Unknown JWT error',
          tokenPreview: token ? token.substring(0, 20) + '...' : 'no-token',
          secretPreview: secret ? secret.substring(0, 8) + '...' : 'no-secret'
        });
        return res.status(401).json({ status: 'error', message: 'Unauthorized' });
      }

      // Optionally check token_version or user status in Supabase before issuing new access
      const supabase = getSupabaseClient();
      const { sub, table } = decoded || {};
      if (!sub) return res.status(401).json({ status: 'error', message: 'Unauthorized' });

      const tbl = table === 'employees' ? 'employees' : 'users';
      const { data: rows } = await supabase
        .from(tbl)
        .select('id, email, role, tenant_id, status, metadata')
        .eq('id', sub)
        .limit(1);
      const user = rows && rows[0];
      if (!user) return res.status(401).json({ status: 'error', message: 'Unauthorized' });
      const meta = user.metadata || {};
      const accountStatus = String(meta.account_status || user.status || '').toLowerCase();
      const isActiveFlag = meta.is_active !== false;
      if (accountStatus === 'inactive' || isActiveFlag === false || (user.status || '').toLowerCase() === 'inactive') {
        return res.status(403).json({ status: 'error', message: 'Account is disabled' });
      }

      const payload = { sub: user.id, email: user.email, role: user.role, tenant_id: user.tenant_id || null, table: tbl };
      const access = signAccess(payload);
      res.cookie('aisha_access', access, cookieOpts(15 * 60 * 1000));
      return res.json({ status: 'success', message: 'Refreshed' });
    } catch (e) {
      console.error('[Auth.refresh] error', e);
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
        return res.status(429)
          .set('Retry-After', String(e.retryAfter ?? 60))
          .json({
            status: 'error',
            message: e.message || 'Too many reset attempts. Try again later.',
          });
      }

      // Ensure Supabase admin client initialized at startup (sendPasswordResetEmail will throw if not)
      const { error } = await sendPasswordResetEmail(String(email).trim().toLowerCase(), redirectTo);
      if (error) {
        return res.status(400).json({ status: 'error', message: error.message || 'Failed to send reset email' });
      }
      return res.json({ status: 'success', message: 'Reset email sent' });
    } catch (e) {
      console.error('[Auth.password.reset.request] error', e);
      return res.status(500).json({ status: 'error', message: 'Internal error' });
    }
  });

  // POST /api/auth/password/reset/confirm - (optional) set new password using recovery access token
  // NOTE: Frontend can also directly call supabase.auth.updateUser({ password }) after PASSWORD_RECOVERY event.
  router.post('/password/reset/confirm', async (req, res) => {
    try {
      const { access_token, new_password } = req.body || {};
      if (!access_token || !new_password) {
        return res.status(400).json({ status: 'error', message: 'access_token and new_password required' });
      }

      const url = process.env.SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !key) {
        return res.status(500).json({ status: 'error', message: 'server auth not configured' });
      }

      const admin = createSupabaseClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data: getUserData, error: getUserErr } = await admin.auth.getUser(access_token);
      const user = getUserData?.user;
      if (getUserErr || !user) {
        return res.status(400).json({ status: 'error', message: 'Invalid token' });
      }

      const { error: updErr } = await admin.auth.admin.updateUserById(user.id, { password: new_password });
      if (updErr) {
        return res.status(400).json({ status: 'error', message: updErr.message || 'Failed to update password' });
      }
      return res.json({ status: 'success', message: 'Password updated' });
    } catch (e) {
      console.error('[Auth.password.reset.confirm] error', e);
      return res.status(500).json({ status: 'error', message: 'Internal error' });
    }
  });

  return router;
}
