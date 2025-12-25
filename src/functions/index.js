/**
 * Local Functions - Minimal Export Surface
 */

// Helper to get base URL for API calls (with runtime env support)
export function getBaseUrl() {
    // Priority: runtime env (Docker) > build-time env (Vite) > dev default
    if (typeof window !== "undefined" && window._env_?.VITE_AISHACRM_BACKEND_URL) {
        return window._env_.VITE_AISHACRM_BACKEND_URL;
    }
    if (typeof import.meta !== "undefined" && import.meta.env?.VITE_AISHACRM_BACKEND_URL) {
        return import.meta.env.VITE_AISHACRM_BACKEND_URL;
    }
    return 'http://localhost:4001';
}

// Stub functions (not implemented in frontend, delegated to backend)
export const analyzeDataQuality = () => { throw new Error('Not implemented - use backend API'); };
export const getDashboardStats = () => { throw new Error('Not implemented - use backend API'); };
export const getOrCreateUserApiKey = () => { throw new Error('Not implemented - use backend API'); };
export const checkBackendStatus = () => { throw new Error('Not implemented - use backend API'); };
export const runFullSystemDiagnostics = () => { throw new Error('Not implemented - use backend API'); };
export const getDashboardBundle = () => { throw new Error('Not implemented - use backend API'); };
export const findDuplicates = () => { throw new Error('Not implemented - use backend API'); };
