import jwt from 'jsonwebtoken';

/**
 * Authenticate request and populate req.user from:
 * 1) Backend JWT access cookie (aisha_access)
 * 2) Supabase access token in Authorization: Bearer <token>
 *
 * Does not enforce authentication; it only attaches user info when available.
 */
export async function authenticateRequest(req, _res, next) {
  try {
    // DEBUG: Log auth context for diagnostics
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

    // 1) Try backend JWT access cookie first (primary auth method)
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
        // fall through to lookup by bearer if present
      }
    }

    // 2) If no cookie, try to extract user from bearer token claims (do NOT validate with Supabase)
    // This supports cross-origin/mobile clients that can't use cookies
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : null;

    if (bearer) {
      if (process.env.AUTH_DEBUG === 'true') {
        console.log('[Auth Debug] Processing bearer token:', { path: req.path, tokenLength: bearer.length });
      }
      try {
        // Decode token claims WITHOUT verification (Supabase tokens are for Supabase, not us)
        const decoded = jwt.decode(bearer) || {};
        if (decoded.email) {
          const email = (decoded.email || '').toLowerCase().trim();
          try {
            const { getSupabaseClient } = await import('../lib/supabase-db.js');
            const supa = getSupabaseClient();
            // Lookup user by email to get full user record with tenant_id and role
            const [{ data: uRows }, { data: eRows }] = await Promise.all([
              supa.from('users').select('id, role, tenant_id').eq('email', email),
              supa.from('employees').select('id, role, tenant_id').eq('email', email),
            ]);
            const row = (uRows && uRows[0]) || (eRows && eRows[0]) || null;
            if (row) {
              req.user = {
                id: row.id,
                email,
                role: row.role || 'employee',
                tenant_id: row.tenant_id ?? null,
              };
              if (process.env.AUTH_DEBUG === 'true') {
                console.log('[Auth Debug] Bearer: resolved user from DB:', { email, role: req.user.role, tenant_id: req.user.tenant_id });
              }
              return next();
            }
          } catch (dbErr) {
            if (process.env.AUTH_DEBUG === 'true') {
              console.log('[Auth Debug] Bearer DB lookup failed:', { email, error: dbErr?.message });
            }
          }
        }
      } catch (decodeErr) {
        if (process.env.AUTH_DEBUG === 'true') {
          console.log('[Auth Debug] Bearer decode failed:', { error: decodeErr?.message });
        }
      }
    }

    // No auth context attached; continue as anonymous
    return next();
  } catch {
    return next();
  }
}

export default { authenticateRequest };
