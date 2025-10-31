/**
 * Supabase Client Configuration
 * Handles authentication and database access
 */

import { createClient } from '@supabase/supabase-js';

// Get Supabase credentials from environment
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Provide fallback placeholder values to prevent initialization errors
// These will be replaced with real credentials when configured
const url = supabaseUrl || 'https://placeholder.supabase.co';
const key = supabaseAnonKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NDUxOTI4MDAsImV4cCI6MTk2MDc2ODgwMH0.placeholder';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[Supabase] Missing credentials. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env file. Using placeholder values to prevent errors.'
  );
}

// Create Supabase client
export const supabase = createClient(url, key, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: window.localStorage, // Use localStorage for session persistence
  },
});

// Helper to check if Supabase is configured
export const isSupabaseConfigured = () => {
  return !!(supabaseUrl && supabaseAnonKey);
};

// Export auth methods for easy access
export const auth = supabase.auth;

export default supabase;
