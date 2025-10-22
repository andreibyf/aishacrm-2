import { User } from "@/api/entities";

/**
 * Safely load users respecting RLS permissions
 * Only admins can list users - others get empty array
 * Handles network errors gracefully
 */
export async function loadUsersSafely(user, selectedTenantId, cachedRequest) {
  if (!user) return [];
  
  // CRITICAL FIX: Only admins can list users. Don't even try for others.
  if (user.role !== 'superadmin' && user.role !== 'admin') {
    console.log('[userLoader] Non-admin user - skipping user list');
    return [];
  }
  
  try {
    return await cachedRequest('User', 'list', {}, () => User.list());
  } catch (error) {
    // Handle all errors gracefully - network errors, 403, 429, etc.
    const errorMessage = error?.message?.toLowerCase() || '';
    const errorStatus = error?.response?.status || error?.status;
    
    // Log the error but don't throw
    if (errorMessage.includes('network error')) {
      console.warn('[userLoader] Network error loading users - returning empty array');
    } else if (errorStatus === 403) {
      console.warn('[userLoader] Permission denied loading users - returning empty array');
    } else if (errorStatus === 429) {
      console.warn('[userLoader] Rate limited loading users - returning empty array');
    } else {
      console.warn('[userLoader] Error loading users:', error.message || 'Unknown error');
    }
    
    // Always return empty array instead of throwing
    return [];
  }
}