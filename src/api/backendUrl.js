// Centralized backend URL resolver for browser code
// Order of precedence:
// 1) import.meta.env.VITE_AISHACRM_BACKEND_URL (build-time Vite env)
// 2) default http://localhost:3001 (local dev backend port)

export function getBackendUrl() {
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
