import jwt from 'jsonwebtoken';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

let supabaseAdmin = null;

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
          id: payload.user_id || payload.id || null,
          email: payload.email,
          role: payload.role,
          tenant_id: payload.tenant_id || null,
        };
        return next();
      } catch {
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
        const admin = getSupabaseAdmin();
        if (admin) {
          const { data: getUserData, error: getUserErr } = await admin.auth.getUser(bearer);
          const authUser = getUserData?.user;
          if (!getUserErr && authUser) {
            const email = (authUser.email || '').toLowerCase().trim();
            const meta = authUser.user_metadata || {};
            const roleMeta = (meta.role || '').toLowerCase() || null;
            const tenantMeta = meta.tenant_id ?? null;

            // Attempt to resolve CRM user record by email to attach id/role/tenant_id
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
                // Fallback to metadata when CRM record not yet created
                req.user = {
                  id: null,
                  email,
                  role: roleMeta || 'employee',
                  tenant_id: tenantMeta || null,
                };
              }
              return next();
            } catch {
              // If Supabase DB lookup fails, still attach minimal user from metadata
              req.user = {
                id: null,
                email,
                role: roleMeta || 'employee',
                tenant_id: tenantMeta || null,
              };
              return next();
            }
          }
        }
      } catch {
        // Ignore token errors; proceed without user
      }
    }

    // No auth context attached; continue
    return next();
  } catch {
    return next();
  }
}

export default { authenticateRequest };
