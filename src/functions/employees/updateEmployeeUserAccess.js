/**
 * updateEmployeeUserAccess
 * Updates employee permissions: access_level, crm_access, navigation_permissions
 * Simplified permission model: role, access_level, crm_access, navigation_permissions
 */

import { callBackendAPI } from '../../api/entities.js';

export async function updateEmployeeUserAccess({ user_id, access_level, crm_access, navigation_permissions }) {
  // Validate required fields
  if (!user_id || !access_level) {
    throw new Error('Missing required fields: user_id and access_level are required');
  }

  // Validate access_level
  if (!['read', 'read_write'].includes(access_level)) {
    throw new Error('Invalid access_level. Must be "read" or "read_write"');
  }

  console.log('[updateEmployeeUserAccess] Updating user permissions:', {
    user_id,
    access_level,
    crm_access,
    has_navigation_permissions: !!navigation_permissions
  });

  // Build update payload for employee metadata
  const metadata = {
    access_level,
    crm_access: crm_access !== false, // Default to true if not specified
  };

  if (navigation_permissions) {
    metadata.navigation_permissions = navigation_permissions;
  }

  try {
    // Update employee record via backend API
    const result = await callBackendAPI('user', 'PUT', null, {
      id: user_id,
      metadata: metadata,
      crm_access: crm_access !== false
    });

    console.log('[updateEmployeeUserAccess] Successfully updated user permissions');
    return result;

  } catch (error) {
    console.error('[updateEmployeeUserAccess] Error updating permissions:', error);
    throw new Error(`Failed to update user access: ${error.message}`);
  }
}

export default updateEmployeeUserAccess;
