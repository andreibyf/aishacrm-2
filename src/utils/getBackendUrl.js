/**
 * Get the backend URL, preferring runtime environment over build-time.
 * 
 * In production, window._env_ is populated from env-config.js which is generated
 * at container startup from environment variables. This allows the same Docker
 * image to work in different environments.
 * 
 * Falls back to import.meta.env for local development where Vite injects
 * the variables at build time.
 * 
 * @returns {string} The backend URL (empty string for same-origin)
 */
export function getBackendUrl() {
  return window._env_?.VITE_AISHACRM_BACKEND_URL || import.meta.env.VITE_AISHACRM_BACKEND_URL || '';
}

/**
 * Get any runtime environment variable with fallback to build-time.
 * 
 * @param {string} key - The environment variable name (e.g., 'VITE_SUPABASE_URL')
 * @returns {string} The value or empty string if not found
 */
export function getRuntimeEnv(key) {
  return window._env_?.[key] || import.meta.env[key] || '';
}
