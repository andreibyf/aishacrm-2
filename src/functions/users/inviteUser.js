/**
 * inviteUser - Create a new user directly (bypasses email invitation)
 * For local development without email service
 */

import { callBackendAPI } from '../../api/entities.js';

// Lazy load audit logging to avoid circular dependencies
let logUserCreated, logCRMAccessGrant;
async function getAuditLoggers() {
  if (!logUserCreated) {
    try {
      const auditLog = await import('../../utils/auditLog.js');
      logUserCreated = auditLog.logUserCreated;
      logCRMAccessGrant = auditLog.logCRMAccessGrant;
    } catch (error) {
      console.warn('[inviteUser] Could not load audit loggers:', error);
      // Provide no-op fallbacks
      logUserCreated = async () => {};
      logCRMAccessGrant = async () => {};
    }
  }
  return { logUserCreated, logCRMAccessGrant };
}

export async function inviteUser(userData, currentUser) {
  try {
    console.log('[inviteUser] Creating user:', userData);

    // Get audit loggers (lazy loaded to avoid circular dependencies)
    const { logUserCreated, logCRMAccessGrant } = await getAuditLoggers();

    // Determine if this should go into users table (superadmin/admin) or employees table (manager/employee)
    const isSystemUser = userData.role === 'superadmin' || userData.role === 'admin';
    
    if (isSystemUser) {
      // Create in users table (superadmin or admin)
      const response = await callBackendAPI('users', 'POST', {
        email: userData.email,
        first_name: userData.full_name?.split(' ')[0] || '',
        last_name: userData.full_name?.split(' ').slice(1).join(' ') || '',
        display_name: userData.full_name || '', // Explicitly set display_name
        role: userData.role,
        tenant_id: userData.tenant_id || null, // NULL for superadmin, specific value for admin
        metadata: {
          access_level: userData.requested_access || 'read_write',
          crm_access: userData.crm_access !== undefined ? userData.crm_access : true,
          navigation_permissions: userData.permissions?.navigation_permissions || {}
        }
      });

      // Log user creation
      if (currentUser && response) {
        await logUserCreated(currentUser, {
          id: response.id,
          email: userData.email,
          full_name: userData.full_name,
          role: userData.role,
          crm_access: userData.crm_access !== undefined ? userData.crm_access : true,
          tenant_id: null,
          access_level: userData.requested_access || 'read_write'
        });

        // Log CRM access grant if enabled
        if (userData.crm_access !== false) {
          await logCRMAccessGrant(currentUser, {
            id: response.id,
            email: userData.email,
            role: userData.role,
            tenant_id: null
          }, { context: 'user_creation' });
        }
      }

      return {
        status: 200,
        data: {
          success: true,
          message: `${userData.role === 'superadmin' ? 'Super Admin' : 'Admin'} user created successfully`,
          user: response
        }
      };
    } else {
      // Create manager/employee (tenant-assigned user) in employees table
      if (!userData.tenant_id) {
        throw new Error('Tenant ID is required for non-admin users');
      }

      const response = await callBackendAPI('users', 'POST', {
        email: userData.email,
        first_name: userData.full_name?.split(' ')[0] || '',
        last_name: userData.full_name?.split(' ').slice(1).join(' ') || '',
        display_name: userData.full_name || '', // Explicitly set display_name
        tenant_id: userData.tenant_id,
        role: userData.role || 'employee',
        status: 'active',
        metadata: {
          access_level: userData.requested_access || 'read_write',
          crm_access: userData.crm_access !== undefined ? userData.crm_access : true,
          navigation_permissions: userData.permissions?.navigation_permissions || {},
          phone: userData.phone || null
        }
      });

      // Log user creation
      if (currentUser && response) {
        await logUserCreated(currentUser, {
          id: response.id,
          email: userData.email,
          full_name: userData.full_name,
          role: userData.role || 'employee',
          crm_access: userData.crm_access !== undefined ? userData.crm_access : true,
          tenant_id: userData.tenant_id,
          access_level: userData.requested_access || 'read_write'
        });

        // Log CRM access grant if enabled
        if (userData.crm_access !== false) {
          await logCRMAccessGrant(currentUser, {
            id: response.id,
            email: userData.email,
            role: userData.role || 'employee',
            tenant_id: userData.tenant_id
          }, { context: 'user_creation' });
        }
      }

      return {
        status: 200,
        data: {
          success: true,
          message: `User created and assigned to tenant successfully`,
          user: response
        }
      };
    }
  } catch (error) {
    console.error('[inviteUser] Error:', error);
    return {
      status: 500,
      data: {
        success: false,
        error: error.message || 'Failed to create user'
      }
    };
  }
}

export default inviteUser;
