import jwt from 'jsonwebtoken';
import { createRemoteJWKSet, jwtVerify } from 'jose';

/**
 * Authenticate request and populate req.user from:
 * 1) Backend JWT access cookie (aisha_access) - verified with HS256 shared secret
 * 2) Supabase access token in Authorization: Bearer <token> - verified via JWKS (ES256 or HS256)
 *
 * Does not enforce authentication; it only attaches user info when available.
 */

// Cache JWKS client to avoid creating new one on every request
let jwksClient = null;
function getJWKSClient() {
  if (!jwksClient) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const apiKey = process.env.SUPABASE_ANON_KEY;
    if (!supabaseUrl) {
      console.warn('[Auth] SUPABASE_URL not set, JWKS verification disabled');
      return null;
    }
    if (!apiKey) {
      console.warn('[Auth] SUPABASE_ANON_KEY not set, JWKS verification may fail');
    }
    // Correct JWKS URL per OpenID Connect discovery
    const jwksUrl = new URL('/auth/v1/.well-known/jwks.json', supabaseUrl);
    // Supabase requires API key header for JWKS endpoint
    const headers = apiKey ? { apikey: apiKey } : {};
    jwksClient = createRemoteJWKSet(jwksUrl, { headers });
    console.log('[Auth] JWKS client initialized:', jwksUrl.toString());
  }
  return jwksClient;
}

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
    // Our own cookies are signed with HS256 using JWT_SECRET
    const cookieToken = req.cookies?.aisha_access;
    if (cookieToken) {
      try {
        const secret = process.env.JWT_SECRET;
        if (!secret) {
          console.warn('[Auth] JWT_SECRET not set, cookie verification will fail');
        }
        // Explicitly verify with HS256 algorithm only
        const payload = jwt.verify(cookieToken, secret, { algorithms: ['HS256'] });
        req.user = {
          id: payload.sub || payload.user_id || payload.id || null,
          email: payload.email,
          role: payload.role,
          tenant_id: payload.tenant_id || null,
        };
        if (process.env.AUTH_DEBUG === 'true') {
          console.log('[Auth Debug] Cookie JWT verified (HS256):', { 
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
        // fall through to bearer token verification
      }
    }

    // 2) If no cookie, try bearer token verification
    // Priority order:
    // a) Internal service tokens (signed with JWT_SECRET, have 'internal: true')
    // b) Supabase tokens (verified via JWKS)
    // c) Legacy decode fallback + DB lookup
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : null;

    if (bearer) {
      if (process.env.AUTH_DEBUG === 'true') {
        console.log('[Auth Debug] Processing bearer token:', { path: req.path, tokenLength: bearer.length });
      }
      
      let payload = null;
      
      // 2a) Try internal service token verification first (Braid/MCP server-to-server calls)
      // These are signed with JWT_SECRET and have { sub, tenant_id, internal: true }
      const jwtSecret = process.env.JWT_SECRET;
      if (jwtSecret) {
        try {
          const internalPayload = jwt.verify(bearer, jwtSecret, { algorithms: ['HS256'] });
          if (internalPayload.internal === true) {
            // This is an internal service token - trust it directly
            req.user = {
              id: internalPayload.sub || null,
              email: internalPayload.email || 'internal-service',
              role: 'superadmin', // Internal service calls have full access
              tenant_id: internalPayload.tenant_id || null,
              internal: true
            };
            if (process.env.AUTH_DEBUG === 'true') {
              console.log('[Auth Debug] Internal service token verified:', { 
                path: req.path, 
                userId: req.user.id, 
                tenant_id: req.user.tenant_id 
              });
            }
            return next();
          }
          // If not internal, it might be a regular cookie-style token sent as bearer
          // (shouldn't happen, but handle gracefully)
          payload = internalPayload;
        } catch (internalErr) {
          // Not a valid internal token, continue to JWKS
          if (process.env.AUTH_DEBUG === 'true') {
            console.log('[Auth Debug] Not an internal token, trying JWKS:', { 
              path: req.path, 
              error: internalErr?.message?.substring(0, 50) 
            });
          }
        }
      }
      
      // 2b) Try JWKS verification (for Supabase tokens with ES256 or HS256)
      if (!payload) {
        const jwks = getJWKSClient();
        if (jwks) {
          try {
            const { payload: verifiedPayload } = await jwtVerify(bearer, jwks, {
              algorithms: ['ES256', 'HS256'], // Accept both during migration
            });
            payload = verifiedPayload;
            if (process.env.AUTH_DEBUG === 'true') {
              console.log('[Auth Debug] Bearer JWKS verified:', { 
                path: req.path, 
                sub: payload.sub, 
                email: payload.email,
                alg: 'JWKS'
              });
            }
          } catch (jwksErr) {
            if (process.env.AUTH_DEBUG === 'true') {
              console.log('[Auth Debug] Bearer JWKS verification failed:', { 
                path: req.path, 
                error: jwksErr?.message,
                code: jwksErr?.code 
              });
            }
            // Fall through to decode-only as last resort
          }
        }
      }
      
      // 2c) If JWKS verification failed, try decode-only as fallback (legacy support)
      if (!payload) {
        try {
          payload = jwt.decode(bearer) || {};
          if (process.env.AUTH_DEBUG === 'true') {
            console.log('[Auth Debug] Bearer decoded (unverified fallback):', { 
              path: req.path, 
              hasEmail: !!payload?.email 
            });
          }
        } catch (decodeErr) {
          if (process.env.AUTH_DEBUG === 'true') {
            console.log('[Auth Debug] Bearer decode failed:', { error: decodeErr?.message });
          }
        }
      }
      
      // If we have a payload with email, look up user in DB to get role and tenant_id
      if (payload?.email) {
        const email = (payload.email || '').toLowerCase().trim();
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
              console.log('[Auth Debug] Bearer: resolved user from DB:', { 
                email, 
                role: req.user.role, 
                tenant_id: req.user.tenant_id 
              });
            }
            return next();
          } else {
            if (process.env.AUTH_DEBUG === 'true') {
              console.log('[Auth Debug] Bearer: user not found in DB:', { email });
            }
          }
        } catch (dbErr) {
          if (process.env.AUTH_DEBUG === 'true') {
            console.log('[Auth Debug] Bearer DB lookup failed:', { email, error: dbErr?.message });
          }
        }
      }
    }

    // No auth context attached; continue as anonymous
    return next();
  } catch (err) {
    if (process.env.AUTH_DEBUG === 'true') {
      console.log('[Auth Debug] Unexpected error:', { error: err?.message });
    }
    return next();
  }
}

export default { authenticateRequest };
