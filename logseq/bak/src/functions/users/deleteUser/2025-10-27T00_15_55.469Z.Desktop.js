/**
 * deleteUser - Delete a user from the system
 * Only admins and superadmins can delete users
 */

import { callBackendAPI } from '../../api/entities.js';
import { logUserDeleted } from '../../utils/auditLog.js';

export async function deleteUser(userId, tenantId, currentUser) {
  try {
    console.log('[deleteUser] Deleting user:', { userId, tenantId });

    if (!userId) {
      throw new Error('User ID is required');
    }

    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }

    // Delete user from backend
    const response = await callBackendAPI('users', 'DELETE', userId, null, {
      tenant_id: tenantId
    });

    // Log the deletion for audit trail
    if (currentUser && response) {
      await logUserDeleted(currentUser, {
        id: userId,
        tenant_id: tenantId
      });
    }

    return {
      status: 200,
      data: {
        success: true,
        message: 'User deleted successfully',
        user: response
      }
    };
  } catch (error) {
    console.error('[deleteUser] Error:', error);
    return {
      status: 500,
      data: {
        success: false,
        error: error.message || 'Failed to delete user'
      }
    };
  }
}

export default deleteUser;
