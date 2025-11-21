import { useEffect, useState } from 'react';

// Simple hook that polls for auth cookies (aisha_access) to appear.
// Prevents premature API calls immediately after login before browser processes Set-Cookie.
export function useAuthCookiesReady(options = {}) {
  const { pollIntervalMs = 100, maxWaitMs = 4000 } = options;
  const [ready, setReady] = useState(false);
  const [checkedAtLeastOnce, setCheckedAtLeastOnce] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const start = Date.now();

    const check = () => {
      if (cancelled) return;
      const hasCookie = typeof document !== 'undefined' && /aisha_access=/.test(document.cookie);
      setCheckedAtLeastOnce(true);
      if (hasCookie) {
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
