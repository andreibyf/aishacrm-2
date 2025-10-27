/**
 * Audit Logging Utility
 * 
 * Provides functions to log user management actions for compliance and security tracking.
 * Logs are stored in the system_logs table via the backend API.
 */

import { callBackendAPI } from '@/api/entities.js';

/**
 * Log when CRM access is granted to a user
 * @param {Object} actor - The user performing the action
 * @param {Object} targetUser - The user receiving CRM access
 * @param {Object} details - Additional details about the grant
 */
export async function logCRMAccessGrant(actor, targetUser, details = {}) {
  try {
    await callBackendAPI('system-logs', 'POST', null, {
      tenant_id: targetUser?.tenant_id || actor?.tenant_id || 'global',
      level: 'INFO',
      message: `CRM access granted to ${targetUser?.email} by ${actor?.email}`,
      source: 'user_management',
      user_email: actor?.email,
      metadata: {
        action: 'crm_access_grant',
        actor_id: actor?.id || actor?.email,
        actor_email: actor?.email,
        target_user_id: targetUser?.id,
        target_user_email: targetUser?.email,
        role: targetUser?.role,
        tenant_id: targetUser?.tenant_id,
        crm_access: true,
        timestamp: new Date().toISOString(),
        ...details
      }
    });
    
    if (import.meta.env.DEV) {
      console.log(`[Audit] CRM access granted to ${targetUser?.email} by ${actor?.email}`);
    }
  } catch (error) {
    console.error('Failed to log CRM access grant:', error);
    // Don't throw - audit logging failure shouldn't break the main flow
  }
}

/**
 * Log when CRM access is revoked from a user
 * @param {Object} actor - The user performing the action
 * @param {Object} targetUser - The user losing CRM access
 * @param {Object} details - Additional details about the revocation
 */
export async function logCRMAccessRevoke(actor, targetUser, details = {}) {
  try {
    await callBackendAPI('system-logs', 'POST', null, {
      tenant_id: targetUser?.tenant_id || actor?.tenant_id || 'global',
      level: 'WARN',
      message: `CRM access revoked from ${targetUser?.email} by ${actor?.email}`,
      source: 'user_management',
      user_email: actor?.email,
      metadata: {
        action: 'crm_access_revoke',
        actor_id: actor?.id || actor?.email,
        actor_email: actor?.email,
        target_user_id: targetUser?.id,
        target_user_email: targetUser?.email,
        role: targetUser?.role,
        tenant_id: targetUser?.tenant_id,
        crm_access: false,
        timestamp: new Date().toISOString(),
        ...details
      }
    });
    
    if (import.meta.env.DEV) {
      console.log(`[Audit] CRM access revoked from ${targetUser?.email} by ${actor?.email}`);
    }
  } catch (error) {
    console.error('Failed to log CRM access revocation:', error);
  }
}

/**
 * Log when a new user is created
 * @param {Object} actor - The user creating the new user
 * @param {Object} newUser - The newly created user
 * @param {Object} details - Additional details about the creation
 */
export async function logUserCreated(actor, newUser, details = {}) {
  try {
    await callBackendAPI('system-logs', 'POST', null, {
      tenant_id: newUser?.tenant_id || actor?.tenant_id || 'global',
      level: 'INFO',
      message: `User created: ${newUser?.email} (${newUser?.role}) by ${actor?.email}`,
      source: 'user_management',
      user_email: actor?.email,
      metadata: {
        action: 'user_created',
        actor_id: actor?.id || actor?.email,
        actor_email: actor?.email,
        target_user_id: newUser?.id,
        target_user_email: newUser?.email,
        email: newUser?.email,
        full_name: newUser?.full_name,
        role: newUser?.role,
        crm_access: newUser?.crm_access,
        tenant_id: newUser?.tenant_id,
        access_level: newUser?.access_level,
        timestamp: new Date().toISOString(),
        ...details
      }
    });
    
    if (import.meta.env.DEV) {
      console.log(`[Audit] User created: ${newUser?.email} (role: ${newUser?.role}, CRM access: ${newUser?.crm_access}) by ${actor?.email}`);
    }
  } catch (error) {
    console.error('Failed to log user creation:', error);
  }
}

/**
 * Log when a user is updated
 * @param {Object} actor - The user performing the update
 * @param {Object} targetUser - The user being updated
 * @param {Object} changes - What was changed
 * @param {Object} details - Additional details
 */
export async function logUserUpdated(actor, targetUser, changes = {}, details = {}) {
  try {
    await callBackendAPI('system-logs', 'POST', null, {
      tenant_id: targetUser?.tenant_id || actor?.tenant_id || 'global',
      level: 'INFO',
      message: `User updated: ${targetUser?.email} by ${actor?.email}`,
      source: 'user_management',
      user_email: actor?.email,
      metadata: {
        action: 'user_updated',
        actor_id: actor?.id || actor?.email,
        actor_email: actor?.email,
        target_user_id: targetUser?.id,
        target_user_email: targetUser?.email,
        changes,
        role: targetUser?.role,
        tenant_id: targetUser?.tenant_id,
        timestamp: new Date().toISOString(),
        ...details
      }
    });
    
    if (import.meta.env.DEV) {
      console.log(`[Audit] User updated: ${targetUser?.email} by ${actor?.email}`, changes);
    }
  } catch (error) {
    console.error('Failed to log user update:', error);
  }
}

/**
 * Log when a user's role is changed
 * @param {Object} actor - The user performing the change
 * @param {Object} targetUser - The user whose role is changing
 * @param {string} oldRole - Previous role
 * @param {string} newRole - New role
 */
export async function logRoleChange(actor, targetUser, oldRole, newRole) {
  try {
    await callBackendAPI('system-logs', 'POST', null, {
      tenant_id: targetUser?.tenant_id || actor?.tenant_id || 'global',
      level: 'WARN',
      message: `Role changed: ${targetUser?.email} from ${oldRole} to ${newRole} by ${actor?.email}`,
      source: 'user_management',
      user_email: actor?.email,
      metadata: {
        action: 'role_changed',
        actor_id: actor?.id || actor?.email,
        actor_email: actor?.email,
        target_user_id: targetUser?.id,
        target_user_email: targetUser?.email,
        old_role: oldRole,
        new_role: newRole,
        tenant_id: targetUser?.tenant_id,
        timestamp: new Date().toISOString()
      }
    });
    
    if (import.meta.env.DEV) {
      console.log(`[Audit] Role changed: ${targetUser?.email} from ${oldRole} to ${newRole} by ${actor?.email}`);
    }
  } catch (error) {
    console.error('Failed to log role change:', error);
  }
}

/**
 * Log when a user is deleted
 * @param {Object} actor - The user performing the deletion
 * @param {Object} deletedUser - The user being deleted
 * @param {Object} details - Additional details
 */
export async function logUserDeleted(actor, deletedUser, details = {}) {
  try {
    await callBackendAPI('system-logs', 'POST', null, {
      tenant_id: deletedUser?.tenant_id || actor?.tenant_id || 'global',
      level: 'WARN',
      message: `User deleted: ${deletedUser?.email || deletedUser?.id} by ${actor?.email}`,
      source: 'user_management',
      user_email: actor?.email,
      metadata: {
        action: 'user_deleted',
        actor_id: actor?.id || actor?.email,
        actor_email: actor?.email,
        target_user_id: deletedUser?.id,
        target_user_email: deletedUser?.email,
        tenant_id: deletedUser?.tenant_id,
        timestamp: new Date().toISOString(),
        ...details
      }
    });
    
    if (import.meta.env.DEV) {
      console.log(`[Audit] User deleted: ${deletedUser?.email || deletedUser?.id} by ${actor?.email}`);
    }
  } catch (error) {
    console.error('Failed to log user deletion:', error);
  }
}

/**
 * Log unauthorized access attempts
 * @param {Object} actor - The user attempting unauthorized action
 * @param {string} action - What they tried to do
 * @param {Object} details - Additional context
 */
export async function logUnauthorizedAttempt(actor, action, details = {}) {
  try {
    await callBackendAPI('system-logs', 'POST', null, {
      tenant_id: actor?.tenant_id || 'global',
      level: 'ERROR',
      message: `Unauthorized attempt: ${actor?.email} tried to ${action}`,
      source: 'security',
      user_email: actor?.email,
      metadata: {
        action: 'unauthorized_attempt',
        actor_id: actor?.id || actor?.email,
        actor_email: actor?.email,
        attempted_action: action,
        actor_role: actor?.role,
        actor_tenant_id: actor?.tenant_id,
        timestamp: new Date().toISOString(),
        ...details
      }
    });
    
    if (import.meta.env.DEV) {
      console.warn(`[Audit] Unauthorized attempt: ${actor?.email} tried to ${action}`);
    }
  } catch (error) {
    console.error('Failed to log unauthorized attempt:', error);
  }
}
