/**
 * Local Functions - Minimal Export Surface
 */

// Helper to get base URL for API calls
export function getBaseUrl() {
    return import.meta.env.VITE_BACKEND_URL || 'http://localhost:4001';
}

// Stub functions (not implemented in frontend, delegated to backend)
export const analyzeDataQuality = () => { throw new Error('Not implemented - use backend API'); };
export const getDashboardStats = () => { throw new Error('Not implemented - use backend API'); };
export const getOrCreateUserApiKey = () => { throw new Error('Not implemented - use backend API'); };
export const checkBackendStatus = () => { throw new Error('Not implemented - use backend API'); };
export const runFullSystemDiagnostics = () => { throw new Error('Not implemented - use backend API'); };
export const getDashboardBundle = () => { throw new Error('Not implemented - use backend API'); };
export const findDuplicates = () => { throw new Error('Not implemented - use backend API'); };
