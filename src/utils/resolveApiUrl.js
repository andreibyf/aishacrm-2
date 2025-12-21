import { getBackendUrl } from '@/api/backendUrl';

/**
 * Builds an absolute API URL when a backend base is configured.
 * Falls back to the relative path (for Vite dev proxy or tests) when
 * no backend URL is available at runtime.
 */
export function resolveApiUrl(path) {
  if (!path) return path;
  try {
    const base = (getBackendUrl() || '').replace(/\/$/, '');
    if (!base) return path;
    if (/^https?:\/\//i.test(path)) {
      return path;
    }
    return `${base}${path.startsWith('/') ? path : `/${path}`}`;
  } catch {
    return path;
  }
}
