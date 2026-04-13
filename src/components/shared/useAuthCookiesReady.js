import { useEffect, useState } from 'react';

// Simple hook that polls for auth cookies (aisha_access) to appear.
// Prevents premature API calls immediately after login before browser processes Set-Cookie.
export function useAuthCookiesReady(options = {}) {
  const { pollIntervalMs = 50, maxWaitMs = 800 } = options;
  const [ready, setReady] = useState(false);
  const [checkedAtLeastOnce, setCheckedAtLeastOnce] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const start = Date.now();

    const hasAuthSignal = () => {
      if (typeof document !== 'undefined' && /aisha_access=/.test(document.cookie)) {
        return true;
      }

      // Some environments use non-cookie auth persistence; treat these as ready.
      try {
        if (typeof localStorage !== 'undefined') {
          const token = localStorage.getItem('token');
          const supabaseAccess = localStorage.getItem('supabase_access_token');
          const supabaseAuth = localStorage.getItem('supabase.auth.token');
          if (token || supabaseAccess || supabaseAuth) {
            return true;
          }
        }
      } catch {
        // Ignore storage access errors and continue polling.
      }

      return false;
    };

    const check = () => {
      if (cancelled) return;
      setCheckedAtLeastOnce(true);
      if (hasAuthSignal()) {
        setReady(true);
        return; // stop polling
      }
      if (Date.now() - start >= maxWaitMs) {
        // Timeout: assume ready to prevent blocking indefinitely (graceful fallback)
        if (import.meta.env.DEV) {
          console.warn('[useAuthCookiesReady] Timeout waiting for auth cookie - proceeding anyway');
        }
        setReady(true);
        return;
      }
      setTimeout(check, pollIntervalMs);
    };

    check();
    return () => { cancelled = true; };
  }, [pollIntervalMs, maxWaitMs]);

  return { authCookiesReady: ready, checkedAuthCookies: checkedAtLeastOnce };
}
