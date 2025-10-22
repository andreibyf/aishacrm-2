/**
 * _middleware
 * Centralized middleware utilities for Base44 backend functions
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

/**
 * CORS middleware - handles OPTIONS requests and adds CORS headers
 */
export function corsMiddleware(allowedOrigins = ['*']) {
  return {
    handlePreflight: (req) => {
      if (req.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': allowedOrigins[0],
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
            'Access-Control-Max-Age': '86400',
          },
        });
      }
      return null;
    },
    addHeaders: (response, origin) => {
      const headers = new Headers(response.headers);
      headers.set('Access-Control-Allow-Origin', allowedOrigins[0]);
      headers.set('Access-Control-Allow-Credentials', 'true');
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    },
  };
}

/**
 * Authentication middleware - validates user is logged in
 * @returns {object} { user, base44, error }
 */
export async function authenticateUser(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return {
        user: null,
        base44: null,
        error: Response.json(
          { status: 'error', message: 'Unauthorized - No user authenticated' },
          { status: 401 }
        ),
      };
    }

    return { user, base44, error: null };
  } catch (error) {
    console.error('Authentication error:', error);
    return {
      user: null,
      base44: null,
      error: Response.json(
        { status: 'error', message: 'Authentication failed', details: error.message },
        { status: 401 }
      ),
    };
  }
}

/**
 * Role-based authorization middleware
 * @param {object} user - User object from authenticateUser
 * @param {string[]} allowedRoles - Array of allowed roles (e.g., ['admin', 'superadmin'])
 * @returns {Response|null} Error response if unauthorized, null if authorized
 */
export function requireRole(user, allowedRoles) {
  if (!user) {
    return Response.json(
      { status: 'error', message: 'User not authenticated' },
      { status: 401 }
    );
  }

  if (!allowedRoles.includes(user.role)) {
    return Response.json(
      { status: 'error', message: `Unauthorized - Requires role: ${allowedRoles.join(' or ')}` },
      { status: 403 }
    );
  }

  return null;
}

/**
 * API Key validation middleware (for webhooks and external integrations)
 * @param {Request} req - Incoming request
 * @param {string} envVarName - Name of environment variable containing the expected API key
 * @returns {Response|null} Error response if invalid, null if valid
 */
export function validateApiKey(req, envVarName = 'N8N_API_KEY') {
  const apiKey = req.headers.get('x-api-key') || req.headers.get('Authorization')?.replace('Bearer ', '');
  const expectedApiKey = Deno.env.get(envVarName);

  if (!expectedApiKey) {
    console.warn(`Warning: ${envVarName} not set in environment variables`);
    return Response.json(
      { status: 'error', message: 'API key validation not configured' },
      { status: 500 }
    );
  }

  if (!apiKey || apiKey !== expectedApiKey) {
    return Response.json(
      { status: 'error', message: 'Invalid or missing API key' },
      { status: 401 }
    );
  }

  return null;
}

/**
 * Tenant validation middleware - ensures user has access to specified tenant
 * @param {object} user - User object from authenticateUser
 * @param {string} tenantId - Tenant ID to validate access to
 * @returns {Response|null} Error response if unauthorized, null if authorized
 */
export function validateTenantAccess(user, tenantId) {
  if (!user) {
    return Response.json(
      { status: 'error', message: 'User not authenticated' },
      { status: 401 }
    );
  }

  // Superadmins and admins can access any tenant
  if (user.role === 'superadmin' || user.role === 'admin') {
    return null;
  }

  // Regular users can only access their own tenant
  if (user.tenant_id !== tenantId) {
    return Response.json(
      { status: 'error', message: 'Unauthorized - Cannot access this tenant' },
      { status: 403 }
    );
  }

  return null;
}

/**
 * Employee role validation - ensures user has manager or employee privileges
 * @param {object} user - User object from authenticateUser
 * @param {string[]} allowedEmployeeRoles - Array of allowed employee roles (e.g., ['manager', 'employee'])
 * @returns {Response|null} Error response if unauthorized, null if authorized
 */
export function requireEmployeeRole(user, allowedEmployeeRoles) {
  if (!user) {
    return Response.json(
      { status: 'error', message: 'User not authenticated' },
      { status: 401 }
    );
  }

  // Admins bypass employee role checks
  if (user.role === 'admin' || user.role === 'superadmin') {
    return null;
  }

  if (!user.employee_role || !allowedEmployeeRoles.includes(user.employee_role)) {
    return Response.json(
      { status: 'error', message: `Unauthorized - Requires employee role: ${allowedEmployeeRoles.join(' or ')}` },
      { status: 403 }
    );
  }

  return null;
}

/**
 * JSON body parser with error handling
 * @param {Request} req - Incoming request
 * @returns {object} { data, error }
 */
export async function parseJsonBody(req) {
  try {
    const data = await req.json();
    return { data, error: null };
  } catch (error) {
    return {
      data: null,
      error: Response.json(
        { status: 'error', message: 'Invalid JSON in request body', details: error.message },
        { status: 400 }
      ),
    };
  }
}

/**
 * Rate limiting middleware (simple in-memory implementation)
 * For production, consider using Redis or a distributed cache
 */
const rateLimitStore = new Map();

export function rateLimit(identifier, maxRequests = 100, windowMs = 60000) {
  const now = Date.now();
  const key = `${identifier}:${Math.floor(now / windowMs)}`;

  const current = rateLimitStore.get(key) || 0;

  if (current >= maxRequests) {
    return Response.json(
      { status: 'error', message: 'Rate limit exceeded. Please try again later.' },
      { status: 429 }
    );
  }

  rateLimitStore.set(key, current + 1);

  // Cleanup old entries (basic memory management)
  if (rateLimitStore.size > 10000) {
    const cutoff = now - windowMs * 2;
    for (const [k] of rateLimitStore) {
      const timestamp = parseInt(k.split(':')[1]) * windowMs;
      if (timestamp < cutoff) {
        rateLimitStore.delete(k);
      }
    }
  }

  return null;
}

/**
 * Complete middleware chain helper
 * Combines multiple middleware functions and returns first error or proceeds
 */
export async function applyMiddleware(req, middlewares) {
  for (const middleware of middlewares) {
    const result = await middleware(req);
    if (result) {
      return result; // Return error response
    }
  }
  return null; // All middleware passed
}

/**
 * Error response helper
 */
export function errorResponse(message, status = 500, details = null) {
  const body = { status: 'error', message };
  if (details) {
    body.details = details;
  }
  return Response.json(body, { status });
}

/**
 * Success response helper
 */
export function successResponse(data, status = 200) {
  return Response.json({ status: 'success', ...data }, { status });
}

// Export default for compatibility
export default {
  corsMiddleware,
  authenticateUser,
  requireRole,
  validateApiKey,
  validateTenantAccess,
  requireEmployeeRole,
  parseJsonBody,
  rateLimit,
  applyMiddleware,
  errorResponse,
  successResponse,
};
