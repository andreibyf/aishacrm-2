import jwt from 'jsonwebtoken';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

let supabaseAdmin = null;
let supabaseAnon = null;

function getSupabaseAdmin() {
  try {
    if (supabaseAdmin) return supabaseAdmin;
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    supabaseAdmin = createSupabaseClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return supabaseAdmin;
  } catch {
    return null;
  }
}

function getSupabaseAnon() {
  try {
    if (supabaseAnon) return supabaseAnon;
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY; // publishable key with RLS
    if (!url || !key) return null;
    supabaseAnon = createSupabaseClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return supabaseAnon;
  } catch {
    return null;
  }
}

/**
 * Authenticate request and populate req.user from:
 * 1) Backend JWT access cookie (aisha_access)
 * 2) Supabase access token in Authorization: Bearer <token>
 *
 * Does not enforce authentication; it only attaches user info when available.
 */
export async function authenticateRequest(req, _res, next) {
  try {
    // DEBUG: Log auth context for 401 diagnostics
    const authHeader = req.headers?.authorization || '';
    const hasCookie = !!req.cookies?.aisha_access;
    const hasBearer = authHeader.startsWith('Bearer ');
    if (process.env.NODE_ENV !== 'production' || process.env.AUTH_DEBUG === 'true') {
      console.log('[Auth Debug]', {
        path: req.path,
        method: req.method,
        hasCookie,
        hasBearer,
        bearerPreview: hasBearer ? authHeader.substring(7, 27) + '...' : null,
      });
    }

    // 1) Try backend JWT access cookie first
    const cookieToken = req.cookies?.aisha_access;
    if (cookieToken) {
      try {
        const secret = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || 'change-me-access';
        const payload = jwt.verify(cookieToken, secret);
        req.user = {
          id: payload.sub || payload.user_id || payload.id || null,
          email: payload.email,
          role: payload.role,
          tenant_id: payload.tenant_id || null,
        };
        if (process.env.AUTH_DEBUG === 'true') {
          console.log('[Auth Debug] Cookie JWT verified:', { 
            path: req.path, 
            userId: req.user.id, 
            email: req.user.email,
            hasId: !!req.user.id 
          });
        }
        return next();
      } catch (cookieErr) {
        if (process.env.AUTH_DEBUG === 'true') {
          console.log('[Auth Debug] Cookie JWT failed:', { path: req.path, error: cookieErr?.message });
        }
        // fall through to Authorization header
      }
    }

    // 2) Try Supabase access token from Authorization header
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : null;

    if (bearer) {
      if (process.env.NODE_ENV !== 'production' || process.env.AUTH_DEBUG === 'true') {
        console.log('[Auth Debug] Processing bearer token:', { path: req.path, tokenLength: bearer.length });
      }
      try {
        // Prefer service role; fallback to anon; final fallback decode only
        const admin = getSupabaseAdmin();
        const anon = admin ? null : getSupabaseAnon();
        let authUser = null;
        if (admin) {
          const { data: getUserData, error: getUserErr } = await admin.auth.getUser(bearer);
          if (getUserErr) {
            console.log('[Auth Debug] Supabase getUser error:', { path: req.path, error: getUserErr?.message || 'Unknown error' });
          }
          if (!getUserErr) authUser = getUserData?.user || null;
        } else if (anon) {
          const { data: getUserData, error: getUserErr } = await anon.auth.getUser(bearer);
          if (getUserErr) {
            console.log('[Auth Debug] Supabase anon getUser error:', { path: req.path, error: getUserErr?.message || 'Unknown error' });
          }
          if (!getUserErr) authUser = getUserData?.user || null;
        } else {
          console.log('[Auth Debug] No Supabase client available, falling back to JWT decode');
          // Last resort: decode token claims (unverified) for email hint
          try {
            const decoded = jwt.decode(bearer) || {};
            if (decoded.email) authUser = { email: decoded.email, user_metadata: {} };
          } catch { /* ignore */ }
        }

        if (authUser) {
          const email = (authUser.email || '').toLowerCase().trim();
          const meta = authUser.user_metadata || {};
            const roleMeta = (meta.role || '').toLowerCase() || null;
            const tenantMeta = meta.tenant_id ?? null;
          try {
            const { getSupabaseClient } = await import('../lib/supabase-db.js');
            const supa = getSupabaseClient();
            const [{ data: uRows }, { data: eRows }] = await Promise.all([
              supa.from('users').select('id, role, tenant_id').eq('email', email),
              supa.from('employees').select('id, role, tenant_id').eq('email', email),
            ]);
            const row = (uRows && uRows[0]) || (eRows && eRows[0]) || null;
            if (row) {
              req.user = {
                id: row.id,
                email,
                role: row.role || roleMeta || 'employee',
                tenant_id: row.tenant_id ?? tenantMeta ?? null,
              };
              if (process.env.NODE_ENV !== 'production' || process.env.AUTH_DEBUG === 'true') {
                console.log('[Auth Debug] Attached user from DB:', { email, role: req.user.role, tenant_id: req.user.tenant_id });
              }
            } else {
              req.user = {
                id: null,
                email,
                role: roleMeta || 'employee',
                tenant_id: tenantMeta || null,
              };
              if (process.env.AUTH_DEBUG === 'true') {
                console.warn('[Auth Debug] Email not found in users/employees; using metadata fallback', { email, roleMeta, tenantMeta });
              }
            }
            return next();
          } catch {
            req.user = {
              id: null,
              email,
              role: roleMeta || 'employee',
              tenant_id: tenantMeta || null,
            };
            if (process.env.AUTH_DEBUG === 'true') {
              console.warn('[Auth Debug] DB lookup failed; continuing with metadata fallback', { email, roleMeta, tenantMeta });
            }
            return next();
          }
        }
      } catch {
        // Ignore bearer processing errors
      }
    }

    // No auth context attached; continue
    return next();
  } catch {
    return next();
  }
}

export default { authenticateRequest };
