// Centralized backend URL resolver for browser code
// Order of precedence:
// 1) window._env_.VITE_AISHACRM_BACKEND_URL (runtime - Docker production)
// 2) import.meta.env.VITE_AISHACRM_BACKEND_URL (build-time Vite env)
// 3) http://localhost:4001 (development fallback only)

export function getBackendUrl() {
  // 1) Check runtime window._env_ (set by Docker entrypoint in production)
  if (typeof window !== "undefined" && window._env_?.VITE_AISHACRM_BACKEND_URL) {
    return window._env_.VITE_AISHACRM_BACKEND_URL;
  }
  
  // 2) Build-time env (Vite dev mode)
  try {
    if (typeof import.meta !== "undefined" && import.meta.env?.VITE_AISHACRM_BACKEND_URL) {
      return import.meta.env.VITE_AISHACRM_BACKEND_URL;
    }
  } catch {
    // ignore
  }
  
  // 3) Development fallback only
  if (typeof import.meta !== "undefined" && import.meta.env?.DEV) {
    console.warn('⚠️  VITE_AISHACRM_BACKEND_URL not set, using dev default: http://localhost:4001');
    return 'http://localhost:4001';
  }
  
  // 4) Fail in production
  throw new Error('VITE_AISHACRM_BACKEND_URL not configured - check .env and frontend-entrypoint.sh');
}
