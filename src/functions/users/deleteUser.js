/**
 * deleteUser - Delete a user from the system
 * Only admins and superadmins can delete users
 */

import { callBackendAPI } from '../../api/entities.js';
import { getBackendUrl } from '../../api/backendUrl.js';
import { logUserDeleted } from '../../utils/auditLog.js';

export async function deleteUser(userId, tenantId, currentUser) {
  try {
    console.log('[deleteUser] Deleting user:', { userId, tenantId });

    if (!userId) {
      throw new Error('User ID is required');
    }

    // tenantId is optional for superadmins (they can delete users without tenants)
    // For regular admins, tenantId is required

  // Delete user from backend
  // callBackendAPI signature: (entityName, method, data, id)
  // For DELETE, we need to pass the id as the 4th parameter
  // and tenant_id needs to be in query params, but callBackendAPI handles this differently
  // We'll use a direct fetch call for more control
  // IMPORTANT: Use centralized resolver to avoid hardcoded port defaults
  const BACKEND_URL = getBackendUrl();
    const url = tenantId 
      ? `${BACKEND_URL}/api/users/${userId}?tenant_id=${tenantId}`
      : `${BACKEND_URL}/api/users/${userId}`;
    
    const fetchResponse = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    if (!fetchResponse.ok) {
      const errorText = await fetchResponse.text();
      throw new Error(`Failed to delete user: ${errorText}`);
    }

    const response = await fetchResponse.json();

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
