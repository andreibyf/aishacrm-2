// Re-export the main Supabase client to avoid multiple GoTrueClient instances
// This prevents the "Multiple GoTrueClient instances detected" warning
import { supabase } from '@/lib/supabase';

export { supabase };

// Legacy base44 stub for backward compatibility - all calls should migrate to backend routes
export const base44 = {
  functions: new Proxy({}, {
    get: () => {
      console.warn('[base44] Base44 SDK removed. Use backend API routes instead.');
      return () => Promise.reject(new Error('Base44 SDK removed. Use backend API routes.'));
    }
  }),
  integrations: {
    Core: null
  },
  auth: {
    me: () => {
      console.warn('[base44] Use Supabase auth instead: supabase.auth.getUser()');
      return supabase?.auth.getUser().then(({ data }) => data.user) || Promise.resolve(null);
    },
  }
};
