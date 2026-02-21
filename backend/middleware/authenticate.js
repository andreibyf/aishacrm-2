import jwt from 'jsonwebtoken';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import logger from '../lib/logger.js';

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
      logger.warn('[Auth] SUPABASE_URL not set, JWKS verification disabled');
      return null;
    }
    if (!apiKey) {
      logger.warn('[Auth] SUPABASE_ANON_KEY not set, JWKS verification may fail');
    }
    // Correct JWKS URL per OpenID Connect discovery
    const jwksUrl = new URL('/auth/v1/.well-known/jwks.json', supabaseUrl);
    // Supabase requires API key header for JWKS endpoint
    const headers = apiKey ? { apikey: apiKey } : {};
    jwksClient = createRemoteJWKSet(jwksUrl, { headers });
    logger.debug('[Auth] JWKS client initialized:', jwksUrl.toString());
  }
  return jwksClient;
}

export async function authenticateRequest(req, _res, next) {
  try {
    // DEBUG: Log EVERY request to see if middleware runs
    logger.warn(`[AUTH] Processing ${req.method} ${req.path}`);

    // DEBUG: Log auth context for diagnostics (only when AUTH_DEBUG=true)
    const authHeader = req.headers?.authorization || '';
    const hasCookie = !!req.cookies?.aisha_access;
    const hasBearer = authHeader.startsWith('Bearer ');
    const hasApiKey = !!req.headers?.apikey;
    if (process.env.AUTH_DEBUG === 'true') {
      logger.debug(
        '[Auth Debug] path=' +
          req.path +
          ' hasCookie=' +
          hasCookie +
          ' hasBearer=' +
          hasBearer +
          ' hasApiKey=' +
          hasApiKey,
      );
    }

    // 0) Check for Supabase service role key (for tests and admin operations)
    // Service role keys bypass RLS and have full admin access
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const providedApiKey =
      req.headers?.apikey || (hasBearer ? authHeader.substring(7).trim() : null);

    // DEBUG: Temporary logging for leads POST
    if (req.path.includes('/api/leads')) {
      logger.warn('[AUTH DEBUG] Service Role Check for /api/leads:', {
        method: req.method,
        hasServiceKey: !!serviceRoleKey,
        hasProvidedKey: !!providedApiKey,
        hasApiKeyHeader: !!req.headers?.apikey,
        hasBearerToken: hasBearer,
      });
    }

    if (serviceRoleKey && providedApiKey === serviceRoleKey) {
      // Service role key match - grant superadmin access
      req.user = {
        id: 'service-role',
        email: 'service-role@system',
        name: 'Service Role',
        role: 'superadmin',
        tenant_id: null, // Service role has access to all tenants
        tenant_uuid: null,
        service_role: true,
      };
      if (process.env.AUTH_DEBUG === 'true') {
        logger.debug('[Auth Debug] Service role key authenticated:', { path: req.path });
      }
      return next();
    }

    // 1) Try backend JWT access cookie first (primary auth method)
    // Our own cookies are signed with HS256 using JWT_SECRET
    const cookieToken = req.cookies?.aisha_access;
    if (cookieToken) {
      try {
        // Match signing logic in auth.js: use JWT_SECRET or fallback
        const secret = process.env.JWT_SECRET || 'change-me-access';

        // Explicitly verify with HS256 algorithm only
        const payload = jwt.verify(cookieToken, secret, { algorithms: ['HS256'] });
        const email = (payload.email || '').toLowerCase().trim();

        // Look up user in DB to get full profile including name
        let displayName = email;
        let firstName = null;
        let lastName = null;

        if (email) {
          try {
            const { getSupabaseClient } = await import('../lib/supabase-db.js');
            const supa = getSupabaseClient();
            // Note: users table stores display_name in metadata JSONB
            const [{ data: uRows, error: uErr }, { data: eRows, error: eErr }] = await Promise.all([
              supa
                .from('users')
                .select('first_name, last_name, metadata')
                .eq('email', email)
                .maybeSingle(),
              supa
                .from('employees')
                .select('first_name, last_name')
                .eq('email', email)
                .maybeSingle(),
            ]);
            if (process.env.AUTH_DEBUG === 'true') {
              logger.debug(
                '[Auth Debug] Cookie: name lookup for email=' +
                  email +
                  ' uErr=' +
                  (uErr?.message || 'none') +
                  ' eErr=' +
                  (eErr?.message || 'none'),
              );
            }
            const row = uRows || eRows;
            if (row) {
              const metadataDisplayName = row.metadata?.display_name;
              displayName =
                metadataDisplayName ||
                [row.first_name, row.last_name].filter(Boolean).join(' ') ||
                email;
              firstName = row.first_name || null;
              lastName = row.last_name || null;
            }
          } catch (dbErr) {
            // Continue with email as fallback if DB lookup fails
            if (process.env.AUTH_DEBUG === 'true') {
              logger.debug(
                '[Auth Debug] Cookie: name lookup failed for email=' +
                  email +
                  ' error=' +
                  dbErr?.message,
              );
            }
          }
        }

        req.user = {
          id: payload.sub || payload.user_id || payload.id || null,
          email: payload.email,
          name: displayName,
          first_name: firstName,
          last_name: lastName,
          role: payload.role,
          tenant_id: payload.tenant_id || null,
          tenant_uuid: payload.tenant_uuid || null,
        };
        if (process.env.AUTH_DEBUG === 'true') {
          logger.debug('[Auth Debug] Cookie JWT verified (HS256):', {
            path: req.path,
            userId: req.user.id,
            email: req.user.email,
            name: req.user.name,
            hasId: !!req.user.id,
          });
        }
        return next();
      } catch (cookieErr) {
        // Log warning in production if verification fails, to help diagnose 401s
        if (process.env.NODE_ENV === 'production' || process.env.AUTH_DEBUG === 'true') {
          logger.warn('[Auth] Cookie JWT verification failed:', {
            path: req.path,
            error: cookieErr?.message,
            hasSecret: !!process.env.JWT_SECRET,
          });
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
        logger.debug('[Auth Debug] Processing bearer token:', {
          path: req.path,
          tokenLength: bearer.length,
        });
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
              tenant_uuid: internalPayload.tenant_uuid || null,
              internal: true,
            };
            if (process.env.AUTH_DEBUG === 'true') {
              logger.debug('[Auth Debug] Internal service token verified:', {
                path: req.path,
                userId: req.user.id,
                tenant_id: req.user.tenant_id,
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
            logger.debug('[Auth Debug] Not an internal token, trying JWKS:', {
              path: req.path,
              error: internalErr?.message?.substring(0, 50),
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
              logger.debug('[Auth Debug] Bearer JWKS verified:', {
                path: req.path,
                sub: payload.sub,
                email: payload.email,
                alg: 'JWKS',
              });
            }
          } catch (jwksErr) {
            if (process.env.AUTH_DEBUG === 'true') {
              logger.debug('[Auth Debug] Bearer JWKS verification failed:', {
                path: req.path,
                error: jwksErr?.message,
                code: jwksErr?.code,
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
            logger.debug('[Auth Debug] Bearer decoded (unverified fallback):', {
              path: req.path,
              hasEmail: !!payload?.email,
            });
          }
        } catch (decodeErr) {
          if (process.env.AUTH_DEBUG === 'true') {
            logger.debug('[Auth Debug] Bearer decode failed:', { error: decodeErr?.message });
          }
        }
      }

      // If we have a payload with email, look up user in DB to get role and tenant_id
      if (payload?.email) {
        const email = (payload.email || '').toLowerCase().trim();
        try {
          const { getSupabaseClient } = await import('../lib/supabase-db.js');
          const supa = getSupabaseClient();
          // Lookup user by email to get full user record with tenant_id, tenant_uuid, role, and name
          // Note: users table stores display_name in metadata JSONB
          const [usersResult, employeesResult] = await Promise.all([
            supa
              .from('users')
              .select('id, role, tenant_id, tenant_uuid, first_name, last_name, metadata')
              .eq('email', email),
            supa
              .from('employees')
              .select('id, role, tenant_id, tenant_uuid, first_name, last_name')
              .eq('email', email),
          ]);
          const { data: uRows, error: uErr } = usersResult;
          const { data: eRows, error: eErr } = employeesResult;

          if (process.env.AUTH_DEBUG === 'true') {
            logger.debug(
              '[Auth Debug] DB lookup for email=' +
                email +
                ' usersCount=' +
                (uRows?.length || 0) +
                ' employeesCount=' +
                (eRows?.length || 0) +
                ' uErr=' +
                (uErr?.message || 'none') +
                ' eErr=' +
                (eErr?.message || 'none'),
            );
          }

          const row = (uRows && uRows[0]) || (eRows && eRows[0]) || null;
          if (row) {
            // Build display name from available fields
            // Note: users table stores display_name in metadata JSONB
            const metadataDisplayName = row.metadata?.display_name;
            const displayName =
              metadataDisplayName ||
              [row.first_name, row.last_name].filter(Boolean).join(' ') ||
              email;
            req.user = {
              id: row.id,
              email,
              name: displayName,
              first_name: row.first_name || null,
              last_name: row.last_name || null,
              role: row.role || 'employee',
              tenant_id: row.tenant_id ?? null,
              tenant_uuid: row.tenant_uuid ?? null,
            };
            if (process.env.AUTH_DEBUG === 'true') {
              logger.debug(
                '[Auth Debug] Bearer: resolved user from DB email=' +
                  email +
                  ' name=' +
                  displayName +
                  ' role=' +
                  req.user.role,
              );
            }
            return next();
          } else {
            if (process.env.AUTH_DEBUG === 'true') {
              logger.debug('[Auth Debug] Bearer: user not found in DB for email=' + email);
            }
          }
        } catch (dbErr) {
          if (process.env.AUTH_DEBUG === 'true') {
            logger.debug('[Auth Debug] Bearer DB lookup failed:', { email, error: dbErr?.message });
          }
        }
      }
    }

    // No auth context attached; continue as anonymous
    return next();
  } catch (err) {
    if (process.env.AUTH_DEBUG === 'true') {
      logger.debug('[Auth Debug] Unexpected error:', { error: err?.message });
    }
    return next();
  }
}

/**
 * Middleware that requires authentication.
 * Must be used AFTER authenticateRequest in the middleware chain.
 * Returns 401 if req.user is not populated.
 */
export function requireAuth(req, res, next) {
  if (!req.user?.email) {
    return res.status(401).json({
      status: 'error',
      message: 'Authentication required',
    });
  }
  return next();
}

export default { authenticateRequest, requireAuth };
