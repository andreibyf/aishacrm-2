/**
 * Permission System for Ai-SHA CRM
 * Clean, simple role-based authorization
 */

// Role hierarchy (higher number = more permissions)
export const ROLES = {
  employee: 1,
  manager: 2,
  admin: 3,
  superadmin: 4
};

// Get role level for comparisons
export function getRoleLevel(role) {
  return ROLES[role?.toLowerCase()] || 0;
}

/**
 * Can this user assign CRM access to employees?
 * Only Admins and SuperAdmins can grant/revoke CRM access
 */
export function canAssignCRMAccess(currentUser) {
  const role = currentUser?.role?.toLowerCase();
  return role === 'admin' || role === 'superadmin';
}

/**
 * Can this user create/edit employees?
 * SuperAdmin: Can edit anyone in any tenant
 * Admin: Can edit employees in their own tenant only
 * Manager: Cannot edit employees
 * Employee: Cannot edit employees
 */
export function canEditEmployee(currentUser, targetEmployee) {
  const userRole = currentUser?.role?.toLowerCase();
  
  // SuperAdmins can edit anyone
  if (userRole === 'superadmin') return true;
  
  // Admins can edit employees in their own tenant
  if (userRole === 'admin') {
    // If admin has no tenant (global admin), can edit anyone
    if (!currentUser.tenant_id) return true;
    
    // Must be same tenant
    if (currentUser.tenant_id !== targetEmployee?.tenant_id) return false;
    
    // Cannot edit other admins or superadmins
    const targetRole = targetEmployee?.role?.toLowerCase();
    if (targetRole === 'admin' || targetRole === 'superadmin') return false;
    
    return true;
  }
  
  // Managers and Employees cannot edit
  return false;
}

/**
 * Can this user delete another user?
 * SuperAdmin: Can delete anyone except themselves
 * Admin: Can delete employees/managers in their own tenant
 * Manager: Cannot delete users
 * Employee: Cannot delete users
 */
export function canDeleteUser(currentUser, targetUser) {
  if (!currentUser || !targetUser) return false;

  const userRole = currentUser?.role?.toLowerCase();
  const targetRole = targetUser?.role?.toLowerCase();

  // Cannot delete yourself
  if (currentUser.id === targetUser.id) return false;

  // SuperAdmins can delete anyone except other superadmins
  if (userRole === 'superadmin') {
    return targetRole !== 'superadmin';
  }

  // Admins can delete employees and managers in their own tenant
  if (userRole === 'admin') {
    // Cannot delete other admins or superadmins
    if (targetRole === 'admin' || targetRole === 'superadmin') {
      return false;
    }

    // Must be same tenant
    if (currentUser.tenant_id && targetUser.tenant_id) {
      return currentUser.tenant_id === targetUser.tenant_id;
    }

    return false;
  }

  // Managers and employees cannot delete users
  return false;
}

/**
 * Can this user view all tenant data?
 * SuperAdmin: All tenants
 * Admin: Their tenant
 * Manager: Their tenant (read-only for user management)
 * Employee: Only their own records
 */
export function canViewAllTenantData(currentUser) {
  const role = currentUser?.role?.toLowerCase();
  return role === 'superadmin' || role === 'admin' || role === 'manager';
}

/**
 * Can this user manage tenants (clients)?
 * Only SuperAdmins and Admins
 */
export function canManageTenants(currentUser) {
  const role = currentUser?.role?.toLowerCase();
  return role === 'superadmin' || role === 'admin';
}

/**
 * Can this user assign this role to someone?
 * SuperAdmin: Can assign any role
 * Admin: Can assign manager or employee (not admin or superadmin)
 * Others: Cannot assign roles
 */
export function canAssignRole(currentUser, targetRole) {
  const userRole = currentUser?.role?.toLowerCase();
  const target = targetRole?.toLowerCase();
  
  if (userRole === 'superadmin') return true;
  
  if (userRole === 'admin') {
    // Admins can only assign manager or employee
    return target === 'manager' || target === 'employee';
  }
  
  return false;
}

/**
 * Get available roles this user can assign
 */
export function getAssignableRoles(currentUser) {
  const userRole = currentUser?.role?.toLowerCase();
  
  if (userRole === 'superadmin') {
    return [
      { value: 'superadmin', label: 'Superadmin - Full system access' },
      { value: 'admin', label: 'Admin - Can manage users and tenants' },
      { value: 'manager', label: 'Manager - Can view all tenant data' },
      { value: 'employee', label: 'Employee - Standard CRM user' }
    ];
  }
  
  if (userRole === 'admin') {
    return [
      { value: 'manager', label: 'Manager - Can view all tenant data' },
      { value: 'employee', label: 'Employee - Standard CRM user' }
    ];
  }
  
  return [];
}

/**
 * Validate user creation/edit based on permissions
 * Returns { valid: boolean, error: string }
 */
export function validateUserPermissions(currentUser, targetUser, action = 'edit') {
  const userRole = currentUser?.role?.toLowerCase();
  
  // SuperAdmins can do anything
  if (userRole === 'superadmin') {
    return { valid: true };
  }
  
  // Admins have restrictions
  if (userRole === 'admin') {
    // Creating new user
    if (action === 'create') {
      // Must assign to a tenant (admins cannot create global users)
      if (!targetUser.tenant_id) {
        return { 
          valid: false, 
          error: 'Admins must assign users to a specific tenant' 
        };
      }
      
      // Must assign to their own tenant (if they have one)
      if (currentUser.tenant_id && currentUser.tenant_id !== targetUser.tenant_id) {
        return { 
          valid: false, 
          error: 'You can only create users for your own tenant' 
        };
      }
      
      // Cannot assign admin or superadmin roles
      const targetRole = targetUser.role?.toLowerCase();
      if (targetRole === 'admin' || targetRole === 'superadmin') {
        return { 
          valid: false, 
          error: 'Only SuperAdmins can create Admin or SuperAdmin users' 
        };
      }
    }
    
    // Editing existing user
    if (action === 'edit') {
      if (!canEditEmployee(currentUser, targetUser)) {
        return { 
          valid: false, 
          error: 'You do not have permission to edit this user' 
        };
      }
    }
    
    return { valid: true };
  }
  
  // Managers and Employees cannot create/edit users
  return { 
    valid: false, 
    error: 'Only Admins and SuperAdmins can manage users' 
  };
}

/**
 * Permission summary for display
 */
export function getPermissionSummary(user) {
  const role = user?.role?.toLowerCase();
  
  const summary = {
    role: role,
    canAssignCRMAccess: canAssignCRMAccess(user),
    canEditEmployees: role === 'admin' || role === 'superadmin',
    canViewAllTenantData: canViewAllTenantData(user),
    canManageTenants: canManageTenants(user),
    dataVisibility: role === 'employee' ? 'Own records only' : 
                    role === 'manager' ? 'All tenant data (read-only user management)' :
                    role === 'admin' ? 'All tenant data' :
                    'All data across all tenants'
  };
  
  return summary;
}
