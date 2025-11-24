/**
 * Supabase Client Configuration
 * Handles authentication and database access
 */

import { createClient } from '@supabase/supabase-js';

// Get Supabase credentials from runtime config (injected by entrypoint) or build-time env
const getRuntimeEnv = (key) => {
  if (typeof window !== 'undefined' && window._env_) {
    return window._env_[key];
  }
  return import.meta.env[key];
};

const supabaseUrl = getRuntimeEnv('VITE_SUPABASE_URL');

// Support both legacy "anon" naming and the newer "publishable/public" naming
// Only use PUBLIC/PUBLISHABLE key on the frontend. NEVER use secret/service keys in the client bundle.
const supabasePublicKey =
  getRuntimeEnv('VITE_SUPABASE_PUBLISHABLE_KEY') ||
  getRuntimeEnv('VITE_SUPABASE_PUBLIC_KEY') ||
  getRuntimeEnv('VITE_SUPABASE_PUBLIC_ANON_KEY') ||
  getRuntimeEnv('VITE_SUPABASE_PK') ||
  getRuntimeEnv('VITE_SUPABASE_ANON_KEY'); // legacy name still supported

// Provide fallback placeholder values to prevent initialization errors
// These will be replaced with real credentials when configured
const url = supabaseUrl || 'https://placeholder.supabase.co';
const key = supabasePublicKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NDUxOTI4MDAsImV4cCI6MTk2MDc2ODgwMH0.placeholder';

if (!supabaseUrl || !supabasePublicKey) {
  console.warn(
    '[Supabase] Missing credentials. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (public key) in your frontend env. Using placeholders to prevent build errors.'
  );
}

// Normalize Supabase URL to HTTPS if app is served over HTTPS to prevent mixed content
const normalizedUrl = (() => {
  try {
    if (typeof window !== 'undefined' && window.location?.protocol === 'https:' && typeof url === 'string' && url.startsWith('http://')) {
      const upgraded = 'https://' + url.substring('http://'.length);
      console.warn('[Supabase] Upgrading SUPABASE URL to HTTPS to avoid mixed content:', upgraded);
      return upgraded;
    }
  } catch {
    // noop
  }
  return url;
})();

const isBrowser = typeof window !== 'undefined';

const nativeFetch = (typeof fetch === 'function' ? fetch : globalThis.fetch) || (() => Promise.reject(new Error('fetch not available')));
const baseFetch = nativeFetch.bind(globalThis);

const buildProxyUrl = () => {
  if (!isBrowser) return null;
  return new URL('/api/supabase-proxy/auth/user', window.location.origin).toString();
};

const fetchWithAuthProxy = (input, init = {}) => {
  const requestUrl = typeof input === 'string' ? input : input?.url;
  const isAuthUserRequest = requestUrl?.includes('/auth/v1/user');

  if (isBrowser && isAuthUserRequest) {
    const proxyUrl = buildProxyUrl();
    if (proxyUrl) {
      const headers = new Headers(init.headers || (typeof input !== 'string' ? input.headers : undefined));
      if (!headers.has('Authorization') && input instanceof Request) {
        const auth = input.headers.get('Authorization');
        if (auth) headers.set('Authorization', auth);
      }
      const proxyInit = {
        ...init,
        method: 'GET',
        credentials: 'include',
        headers,
      };
      return baseFetch(proxyUrl, proxyInit);
    }
  }

  return baseFetch(input, init);
};

// Create Supabase client
export const supabase = createClient(normalizedUrl, key, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: isBrowser ? window.localStorage : undefined, // Use localStorage for session persistence
  },
  global: {
    fetch: fetchWithAuthProxy,
  },
});

// Helper to check if Supabase is configured
export const isSupabaseConfigured = () => {
  return !!(supabaseUrl && supabasePublicKey);
};

// Export auth methods for easy access
export const auth = supabase.auth;

export default supabase;
