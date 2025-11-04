// Centralized backend URL resolver for browser code
// Order of precedence:
// 1) window.__ENV.VITE_AISHACRM_BACKEND_URL (runtime env.js, e.g., Docker)
// 2) import.meta.env.VITE_AISHACRM_BACKEND_URL (build-time Vite env)
// 3) default http://localhost:3001 (local dev backend port)

export function getBackendUrl() {
  try {
    if (typeof window !== "undefined" && window.__ENV && window.__ENV.VITE_AISHACRM_BACKEND_URL) {
      return window.__ENV.VITE_AISHACRM_BACKEND_URL;
    }
  } catch {
    // ignore
  }
  try {
    // import.meta is available in Vite/ESM builds
    if (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_AISHACRM_BACKEND_URL) {
      return import.meta.env.VITE_AISHACRM_BACKEND_URL;
    }
  } catch {
    // ignore
  }
  return "http://localhost:3001";
}
