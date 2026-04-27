import { useMemo } from 'react';
import { getRuntimeEnv } from '@/utils/runtimeEnv';
import { useOpenReplay } from './useOpenReplay';
import { useClarity } from './useClarity';

/**
 * Provider-agnostic session replay hook.
 *
 * Selects the active provider via VITE_SESSION_REPLAY_PROVIDER:
 *   - "clarity"     → Microsoft Clarity (lightweight, SaaS, no take-over)
 *   - "openreplay"  → OpenReplay (heavy, supports Assist take-over)
 *   - "" / "none"   → no-op (returns disabled-shape object)
 *
 * Backward-compat: if the new var is unset but VITE_OPENREPLAY_ENABLED=true,
 * we fall back to "openreplay" so existing deployments keep working.
 *
 * IMPORTANT: both hooks are called unconditionally to satisfy React's rules
 * of hooks; the unselected one short-circuits internally based on its own
 * enabled flag and returns a disabled-shape object.
 */
export function useSessionReplay() {
  const provider = useMemo(() => {
    const explicit = (getRuntimeEnv('VITE_SESSION_REPLAY_PROVIDER') || '').toLowerCase();
    if (explicit === 'clarity' || explicit === 'openreplay' || explicit === 'none') {
      return explicit;
    }
    // Back-compat path
    if ((getRuntimeEnv('VITE_OPENREPLAY_ENABLED') || '').toLowerCase() === 'true') {
      return 'openreplay';
    }
    if ((getRuntimeEnv('VITE_CLARITY_ENABLED') || '').toLowerCase() === 'true') {
      return 'clarity';
    }
    return 'none';
  }, []);

  const openReplay = useOpenReplay();
  const clarity = useClarity();

  if (provider === 'clarity') return { ...clarity, provider };
  if (provider === 'openreplay') return { ...openReplay, provider };

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
