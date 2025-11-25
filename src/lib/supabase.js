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

// Use explicit Supabase project URL (no proxy). Must be like https://xxxxx.supabase.co
const supabaseUrl = getRuntimeEnv('VITE_SUPABASE_URL');

// Support both legacy "anon" naming and the newer "publishable/public" naming
// Only use PUBLIC/PUBLISHABLE key on the frontend. NEVER use secret/service keys in the client bundle.
const supabasePublicKey =
  // Prefer explicit anon key variable, fall back to any legacy/public variants
  getRuntimeEnv('VITE_SUPABASE_ANON_KEY') ||
  getRuntimeEnv('VITE_SUPABASE_PUBLISHABLE_KEY') ||
  getRuntimeEnv('VITE_SUPABASE_PUBLIC_KEY') ||
  getRuntimeEnv('VITE_SUPABASE_PUBLIC_ANON_KEY') ||
  getRuntimeEnv('VITE_SUPABASE_PK');

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

// Use native fetch directly; avoid any local proxying for auth endpoints.

// Create Supabase client
export const supabase = createClient(normalizedUrl, key, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    // We manually parse recovery hash/query tokens, so disable built-in detection
    detectSessionInUrl: false,
    storage: isBrowser ? window.localStorage : undefined,
  },
  global: {
    fetch: (input, init) => {
      try {
        const baseInit = init || {};
        // Merge headers from init and Request (if provided)
        const mergedHeaders = new Headers(
          (baseInit.headers || (input instanceof Request ? input.headers : undefined)) || {}
        );
        mergedHeaders.delete('cookie');
        mergedHeaders.delete('Cookie');

        return fetch(input, {
          ...baseInit,
            // Explicitly omit credentials so no cookies sent to Supabase domain
          credentials: 'omit',
          headers: mergedHeaders,
        });
      } catch (e) {
        // Fallback to native fetch if anything unexpected occurs
        return fetch(input, init);
      }
    },
  },
});

// Helper to check if Supabase is configured
export const isSupabaseConfigured = () => {
  return !!(supabaseUrl && supabasePublicKey);
};

// Export auth methods for easy access
export const auth = supabase.auth;

export default supabase;
