/**
 * Test Authentication Helper
 * 
 * Provides authentication headers for API tests.
 * Uses Supabase service role key for admin-level access in tests.
 * 
 * @module tests/helpers/auth
 */

/**
 * Get authentication headers for test requests
 * 
 * @returns {Object} Headers object with auth credentials
 */
export function getAuthHeaders() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  
  // Prefer service role key for tests (admin access)
  // Falls back to anon key if service role not available
  const authKey = serviceRoleKey || anonKey;
  
  if (!authKey) {
    console.warn('[Test Auth] No Supabase keys found - requests may fail with 401');
    return {};
  }
  
  return {
    'Authorization': `Bearer ${authKey}`,
    'apikey': authKey,
    'Content-Type': 'application/json'
  };
}

/**
 * Create authenticated fetch options
 * 
 * @param {Object} options - Additional fetch options
 * @returns {Object} Fetch options with auth headers
 */
export function getAuthFetchOptions(options = {}) {
  return {
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...(options.headers || {})
    }
  };
}

/**
 * Make authenticated GET request
 * 
 * @param {string} url - Request URL
 * @param {Object} options - Additional fetch options
 * @returns {Promise<Response>} Fetch response
 */
export async function authGet(url, options = {}) {
  return fetch(url, getAuthFetchOptions({ ...options, method: 'GET' }));
}

/**
 * Make authenticated POST request
 * 
 * @param {string} url - Request URL
 * @param {Object} body - Request body (will be JSON.stringify'd)
 * @param {Object} options - Additional fetch options
 * @returns {Promise<Response>} Fetch response
 */
export async function authPost(url, body = {}, options = {}) {
  return fetch(url, getAuthFetchOptions({
    ...options,
    method: 'POST',
    body: JSON.stringify(body)
  }));
}

/**
 * Make authenticated PUT request
 * 
 * @param {string} url - Request URL
 * @param {Object} body - Request body (will be JSON.stringify'd)
 * @param {Object} options - Additional fetch options
 * @returns {Promise<Response>} Fetch response
 */
export async function authPut(url, body = {}, options = {}) {
  return fetch(url, getAuthFetchOptions({
    ...options,
    method: 'PUT',
    body: JSON.stringify(body)
  }));
}

/**
 * Make authenticated DELETE request
 * 
 * @param {string} url - Request URL
 * @param {Object} options - Additional fetch options
 * @returns {Promise<Response>} Fetch response
 */
export async function authDelete(url, options = {}) {
  return fetch(url, getAuthFetchOptions({ ...options, method: 'DELETE' }));
}
