import express from 'express';
import jwt from 'jsonwebtoken';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../lib/supabase-db.js';

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

      // 1) Verify credentials via Supabase Auth when possible
      const anonClient = getAnonSupabase();
      const isDev = process.env.NODE_ENV !== 'production';
      const isE2E = process.env.E2E_TEST_MODE === 'true';
      
      if (anonClient && !isDev && !isE2E) {
        // Production: require Supabase Auth password verification
        const { error } = await anonClient.auth.signInWithPassword({ email, password });
        if (error) {
          return res.status(401).json({ status: 'error', message: 'Invalid credentials' });
        }
      } else {
        // Dev/E2E: skip Supabase Auth password check, rely on DB user existence
        // This allows login even when Supabase Auth user doesn't exist or password differs
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
        .select('id, tenant_id, email, first_name, last_name, role, status, metadata')
        .eq('email', normalizedEmail)
        .limit(1);
      
      console.log('[Auth.login] Users query:', { email: normalizedEmail, rowCount: uRows?.length, error: uError?.message });
      
      if (uRows && uRows.length > 0) {
        user = uRows[0];
      } else {
        table = 'employees';
        const { data: eRows, error: eError } = await supabase
          .from('employees')
          .select('id, tenant_id, email, first_name, last_name, role, status, metadata')
          .eq('email', normalizedEmail)
          .limit(1);
        console.log('[Auth.login] Employees query:', { email: normalizedEmail, rowCount: eRows?.length, error: eError?.message });
        if (eRows && eRows.length > 0) user = eRows[0];
      }

      if (!user) {
        console.log('[Auth.login] No user found for email:', normalizedEmail);
        return res.status(401).json({ status: 'error', message: 'Invalid credentials' });
      }

      // Block disabled accounts
      const meta = user.metadata || {};
      const accountStatus = String(meta.account_status || user.status || '').toLowerCase();
      const isActiveFlag = meta.is_active !== false;
      if (accountStatus === 'inactive' || isActiveFlag === false || (user.status || '').toLowerCase() === 'inactive') {
        return res.status(403).json({ status: 'error', message: 'Account is disabled' });
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

      return res.json({ status: 'success', message: 'Login successful' });
    } catch (err) {
      console.error('[Auth.login] error', err);
      return res.status(500).json({ status: 'error', message: 'Internal error' });
    }
  });

  // POST /api/auth/refresh - rotate short-lived access cookie using refresh cookie
  router.post('/refresh', async (req, res) => {
    try {
      const token = req.cookies?.aisha_refresh;
      if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });
      const secret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || 'change-me-refresh';
      let decoded;
      try {
        decoded = jwt.verify(token, secret);
      } catch {
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

  return router;
}
