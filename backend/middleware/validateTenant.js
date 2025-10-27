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
export function validateTenantAccess(req, res, next) {
  // This middleware assumes req.user is populated by authentication middleware
  const { user } = req;
  
  if (!user) {
    return res.status(401).json({ 
      status: 'error', 
      message: 'Authentication required' 
    });
  }

  // Superadmins bypass all tenant restrictions
  if (user.role === 'superadmin') {
    return next();
  }

  // Get tenant_id from various request sources
  const requestedTenantId = 
    req.body.tenant_id || 
    req.query.tenant_id || 
    req.params.tenant_id ||
    req.params.tenantId; // Support both snake_case and camelCase

  // Admin/Manager/Employee must have a tenant_id assigned
  if (!user.tenant_id) {
    return res.status(403).json({ 
      status: 'error', 
      message: 'User not assigned to any tenant. Contact administrator.' 
    });
  }

  // If a specific tenant is requested, validate it matches the user's tenant
  if (requestedTenantId && requestedTenantId !== user.tenant_id) {
    return res.status(403).json({ 
      status: 'error', 
      message: 'Access denied: You do not have permission to access this tenant\'s data.',
      details: {
        your_tenant: user.tenant_id,
        requested_tenant: requestedTenantId
      }
    });
  }

  // If no tenant specified in request, inject user's tenant_id
  // This prevents users from accidentally querying across tenants
  if (!requestedTenantId) {
    // Inject tenant_id into request for downstream handlers
    if (req.method === 'GET' || req.method === 'DELETE') {
      req.query.tenant_id = user.tenant_id;
    } else if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
      req.body.tenant_id = user.tenant_id;
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

export default {
  validateTenantAccess,
  requireAdminRole,
  enforceEmployeeDataScope
};
