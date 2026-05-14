import { useMemo } from 'react';
import { getRuntimeEnv } from '@/utils/runtimeEnv';
import { useClarity } from './useClarity';

/**
 * Provider-agnostic session replay hook.
 *
 * Selects the active provider via VITE_SESSION_REPLAY_PROVIDER:
 *   - "clarity"  → Microsoft Clarity (lightweight, SaaS, no take-over)
 *   - "" / "none" → no-op (returns disabled-shape object)
 *
 * Backward-compat: if the new var is unset but VITE_CLARITY_ENABLED=true,
 * we fall back to "clarity" so existing deployments keep working.
 */
export function useSessionReplay() {
  const provider = useMemo(() => {
    const explicit = (getRuntimeEnv('VITE_SESSION_REPLAY_PROVIDER') || '').toLowerCase();
    if (explicit === 'clarity' || explicit === 'none') return explicit;
    if ((getRuntimeEnv('VITE_CLARITY_ENABLED') || '').toLowerCase() === 'true') return 'clarity';
    return 'none';
  }, []);

  const clarity = useClarity();

  if (provider === 'clarity') return { ...clarity, provider };

  return {
    isInitialized: false,
    sessionUrl: null,
    error: null,
    tracker: null,
    setUserInfo: () => {},
    enableAssist: () => false,
    trackEvent: () => {},
    getSessionUrl: () => null,
    provider: 'none',
  };
}
