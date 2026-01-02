import { resolveCanonicalTenant } from '../lib/tenantCanonicalResolver.js';

/**
 * Tenant Validation Middleware
 * 
 * Enforces tenant-scoping for all non-superadmin users:
 * - Superadmin: Full access to all tenants
 * - Admin: Access only to their assigned tenant_id
 * - Manager/Employee: Access only to their assigned tenant_id
 * 
 * Usage:
 *   router.use(validateTenantAccess);
 *   router.get('/api/contacts', validateTenantAccess, ...);
 */

/**
 * Validates that the user has access to the requested tenant
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
export async function validateTenantAccess(req, res, next) {
  // This middleware assumes req.user is populated by authentication middleware
  const { user } = req;
  
  // In local dev mode without auth, create a mock superadmin user
  if (!user && process.env.NODE_ENV === 'development') {
    req.user = {
      id: 'local-dev-superadmin',
      email: 'dev@localhost',
      role: 'superadmin',
      tenant_id: null
    };
    return next();
  }
  
  if (!user) {
    return res.status(401).json({ 
      status: 'error', 
      message: 'Authentication required' 
    });
  }

  // Get tenant_id from various request sources
  const requestedTenantId = 
    req.body.tenant_id || 
    req.query.tenant_id || 
    req.params.tenant_id ||
    req.params.tenantId; // Support both snake_case and camelCase

  // Resolve canonical tenant if an identifier was provided
  if (requestedTenantId) {
    try {
      const resolved = await resolveCanonicalTenant(requestedTenantId);
      if (resolved.found) {
        req.tenant = {
          id: resolved.uuid,
          tenant_id: resolved.slug,
          name: resolved.name
        };
      }
    } catch (err) {
      console.warn('[TenantValidation] Failed to resolve canonical tenant:', err.message);
    }
  }

  // Superadmins have special privileges:
  // - READ operations: can access ANY tenant's data (cross-tenant read access)
  // - WRITE operations: must specify a valid tenant_id (no global writes)
  if (user.role === 'superadmin') {
    const isReadOperation = req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS';
    
    if (isReadOperation) {
      // Allow read access to any tenant or no tenant (global view)
      return next();
    }
    
    // For write operations (POST, PUT, PATCH, DELETE), require a tenant_id
    if (!requestedTenantId) {
      return res.status(400).json({
        status: 'error',
        message: 'Superadmin write operations require a tenant_id to be specified',
        hint: 'Select a tenant from the dropdown before creating or modifying data'
      });
    }
    
    // Allow the write operation with the specified tenant
    return next();
  }

  // Admin/Manager/Employee must have a tenant_id assigned
  if (!user.tenant_id && !user.tenant_uuid) {
    return res.status(403).json({ 
      status: 'error', 
      message: 'User not assigned to any tenant. Contact administrator.' 
    });
  }

  // If a specific tenant is requested, validate it matches the user's tenant
  if (requestedTenantId) {
    const isMatch = 
      requestedTenantId === user.tenant_id || 
      requestedTenantId === user.tenant_uuid ||
      (req.tenant && (req.tenant.id === user.tenant_uuid || req.tenant.tenant_id === user.tenant_id));

    if (!isMatch) {
      return res.status(403).json({ 
        status: 'error', 
        message: 'Access denied: You do not have permission to access this tenant\'s data.',
        details: {
          your_tenant: user.tenant_id,
          your_tenant_uuid: user.tenant_uuid,
          requested_tenant: requestedTenantId
        }
      });
    }
  }

  // If no tenant specified in request, inject user's tenant_id
  // This prevents users from accidentally querying across tenants
  if (!requestedTenantId) {
    // Inject tenant_id into request for downstream handlers
    // Prefer UUID if available for database consistency
    const bestTenantId = user.tenant_uuid || user.tenant_id;
    if (req.method === 'GET' || req.method === 'DELETE') {
      req.query.tenant_id = bestTenantId;
    } else if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
      req.body.tenant_id = bestTenantId;
    }
  }

  next();
}

/**
 * Middleware to block Manager and Employee from accessing settings routes
 * ONLY Superadmin and Admin can access settings
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
export function requireAdminRole(req, res, next) {
  const { user } = req;
  
  // In local dev mode without auth, create a mock superadmin user
  if (!user && process.env.NODE_ENV === 'development') {
    req.user = {
      id: 'local-dev-superadmin',
      email: 'dev@localhost',
      role: 'superadmin',
      tenant_id: null
    };
    return next();
  }
  
  if (!user) {
    return res.status(401).json({ 
      status: 'error', 
      message: 'Authentication required' 
    });
  }

  // Only superadmin and admin can access settings
  if (user.role !== 'superadmin' && user.role !== 'admin') {
    return res.status(403).json({ 
      status: 'error', 
      message: 'Settings access denied. Only administrators can modify settings.' 
    });
  }

  next();
}

/**
 * Middleware to enforce Employee "own data only" restriction
 * Employees can only access records where they are the owner/creator
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
export function enforceEmployeeDataScope(req, res, next) {
  const { user } = req;
  
  if (!user) {
    return res.status(401).json({ 
      status: 'error', 
      message: 'Authentication required' 
    });
  }

  // Superadmin, Admin, Manager: no restrictions
  if (user.role === 'superadmin' || user.role === 'admin' || user.role === 'manager') {
    return next();
  }

  // Employee: restrict to own data only
  if (user.role === 'employee') {
    // For GET requests, add filter for created_by or owner_id
    if (req.method === 'GET') {
      req.query.created_by = user.id;
      req.query.owner_id = user.id;
    }
    
    // For POST requests, automatically set created_by
    if (req.method === 'POST') {
      req.body.created_by = user.id;
      req.body.owner_id = user.id;
    }
    
    // For PUT/PATCH/DELETE, we need to verify ownership in the route handler
    // This middleware just marks that verification is needed
    req.requireOwnershipCheck = true;
  }

  next();
}

/**
 * Middleware to require superadmin role (more restrictive than requireAdminRole)
 * Only superadmins can access protected endpoints (e.g., entity labels, global settings)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
export function requireSuperAdminRole(req, res, next) {
  const { user } = req;
  
  // In local dev mode without auth, create a mock superadmin user
  if (!user && process.env.NODE_ENV === 'development') {
    req.user = {
      id: 'local-dev-superadmin',
      email: 'dev@localhost',
      role: 'superadmin',
      tenant_id: null
    };
    return next();
  }
  
  if (!user) {
    return res.status(401).json({ 
      status: 'error', 
      message: 'Authentication required' 
    });
  }

  // Only superadmin can access these endpoints
  if (user.role !== 'superadmin') {
    return res.status(403).json({ 
      status: 'error', 
      message: 'Access denied. Only superadmins can perform this action.' 
    });
  }

  next();
}

export default {
  validateTenantAccess,
  requireAdminRole,
  requireSuperAdminRole,
  enforceEmployeeDataScope
};
