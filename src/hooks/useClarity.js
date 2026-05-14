import { useEffect, useState, useCallback, useRef } from 'react';
import { getRuntimeEnv } from '@/utils/runtimeEnv';

/**
 * Microsoft Clarity Session Replay Hook
 *
 * Microsoft Clarity session replay hook. Same return shape as useSessionReplay.
 *
 * - SaaS only (no self-hosting). Free tier is generous.
 * - Live View has slight delay; no remote take-over (use companion
 *   Jitsi/Whereby button via <RequestHelp /> for take-over).
 * - Heatmaps + dead-click detection out of the box.
 *
 * Env vars:
 *   VITE_CLARITY_ENABLED         "true" | "false" (default: false)
 *   VITE_CLARITY_PROJECT_ID      Clarity project ID from clarity.microsoft.com
 *   VITE_CLARITY_DASHBOARD_URL   Optional, defaults to clarity.microsoft.com
 *
 * @returns {Object} isInitialized, sessionUrl, error, setUserInfo,
 *   enableAssist (no-op), trackEvent, getSessionUrl
 */
export function useClarity() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [sessionUrl, setSessionUrl] = useState(null);
  const [error, setError] = useState(null);
  const scriptRef = useRef(null);

  useEffect(() => {
    const enabled = getRuntimeEnv('VITE_CLARITY_ENABLED');
    if (enabled !== 'true' && enabled !== '1') {
      console.info('[Clarity] Disabled via VITE_CLARITY_ENABLED');
      return;
    }

    const projectId = getRuntimeEnv('VITE_CLARITY_PROJECT_ID');
    if (!projectId) {
      console.info('[Clarity] No project ID configured - session replay disabled');
      return;
    }

    if (window.clarity && window.__clarityProjectId === projectId) {
      // Already initialized in this tab (e.g. HMR remount)
      setIsInitialized(true);
      return;
    }

    try {
      // Replicate Microsoft's official snippet, but driven by env var.
      window.clarity =
        window.clarity ||
        function clarityQueue() {
          (window.clarity.q = window.clarity.q || []).push(arguments);
        };
      window.__clarityProjectId = projectId;

      const script = document.createElement('script');
      script.async = true;
      script.src = `https://www.clarity.ms/tag/${projectId}`;
      script.onload = () => {
        setIsInitialized(true);
        const dashboard =
          getRuntimeEnv('VITE_CLARITY_DASHBOARD_URL') || 'https://clarity.microsoft.com';
        // Clarity does not expose a per-session URL client-side; surface the
        // dashboard root with the project filter so support can find sessions
        // by user tag (set in setUserInfo).
        setSessionUrl(`${dashboard}/projects/view/${projectId}/dashboard`);
        console.info('[Clarity] Session tracking started');
      };
      script.onerror = (err) => {
        const msg = 'Clarity script failed to load';
        console.error(`[Clarity] ${msg}:`, err);
        setError(msg);
      };

      document.head.appendChild(script);
      scriptRef.current = script;
    } catch (err) {
      console.error('[Clarity] Initialization failed:', err);
      setError(err.message);
    }

    return () => {
      // We do NOT remove the script on unmount; Clarity should persist for
      // the entire tab session. The hook is mounted once at app root.
    };
  }, []);

  /**
   * Identify the user and attach metadata as Clarity custom tags.
   * Sessions are filterable in the dashboard by these tag values.
   */
  const setUserInfo = useCallback((userId, userInfo = {}) => {
    if (typeof window.clarity !== 'function') return;
    try {
      // Clarity identify signature: ('identify', userId, sessionId?, pageId?, friendlyName?)
      const friendlyName = userInfo.name || userInfo.email || userId;
      window.clarity('identify', String(userId), undefined, undefined, friendlyName);

      const tags = {
        email: userInfo.email,
        name: userInfo.name,
        role: userInfo.role,
        tenantId: userInfo.tenantId,
        userId: userInfo.userId,
      };
      Object.entries(tags).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') {
          window.clarity('set', k, String(v));
        }
      });
    } catch (err) {
      console.error('[Clarity] Failed to set user info:', err);
    }
  }, []);

  /**
   * No-op: Clarity does not support live remote take-over.
   * Use <RequestHelp /> button (Jitsi-based) for actual take-over.
   * Returns false so callers can detect lack of support.
   */
  const enableAssist = useCallback(() => {
    console.info('[Clarity] Assist not supported. Use RequestHelp / Jitsi for take-over.');
    return false;
  }, []);

  /**
   * Track a custom event in Clarity. Payload values are stringified into tags.
   */
  const trackEvent = useCallback((eventName, payload = {}) => {
    if (typeof window.clarity !== 'function') return;
    try {
      window.clarity('event', String(eventName));
      // Clarity's event API doesn't take a payload, so promote payload values
      // to set() tags scoped to the current session.
      Object.entries(payload).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') {
          window.clarity('set', `${eventName}.${k}`, String(v));
        }
      });
    } catch (err) {
      console.error('[Clarity] Failed to track event:', err);
    }
  }, []);

  /**
   * Returns the dashboard URL filtered to this project (no per-session URL
   * is exposed by Clarity client-side).
   */
  const getSessionUrl = useCallback(() => sessionUrl, [sessionUrl]);

  return {
    isInitialized,
    sessionUrl,
    error,
    tracker: null,
    setUserInfo,
    enableAssist,
    trackEvent,
    getSessionUrl,
  };
}
