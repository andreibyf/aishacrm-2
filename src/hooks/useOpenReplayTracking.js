import { useEffect, useRef } from 'react';
import { useOpenReplay } from './useOpenReplay';
import { useUser } from '@/components/shared/useUser';

/**
 * OpenReplay Session Tracking Integration
 * 
 * Automatically initializes OpenReplay tracker and sets user identity.
 * Should be mounted once at app root level.
 */
export function useOpenReplayTracking() {
  const { isInitialized, setUserInfo, trackEvent, error } = useOpenReplay();
  const { user } = useUser();
  const lastMouseEventAtRef = useRef(0);

  // Update user info when authenticated
  useEffect(() => {
    if (!isInitialized || !user) return;

    setUserInfo(user.id, {
      email: user.email,
      name: user.name || user.email,
      role: user.role,
      tenantId: user.tenant_id,
    });

    console.info('[OpenReplay] User identity set:', user.email);
  }, [isInitialized, user, setUserInfo]);

  // Log errors
  useEffect(() => {
    if (error) {
      console.error('[OpenReplay] Error:', error);
    }
  }, [error]);

  // Track key user interactions so support can reliably inspect actions in session timeline.
  useEffect(() => {
    if (!isInitialized || !user) return;

    const emitNavigation = () => {
      trackEvent('navigation', {
        path: window.location.pathname,
        search: window.location.search,
        hash: window.location.hash,
        title: document.title,
      });
    };

    const handleClick = (event) => {
      const target = event.target?.closest?.('button, a, [role="button"], input, select, textarea');
      if (!target) return;

      const text = (target.textContent || target.ariaLabel || target.getAttribute?.('aria-label') || '').trim();
      const boundedText = text.length > 80 ? `${text.slice(0, 77)}...` : text;

      trackEvent('ui_click', {
        tag: target.tagName,
        id: target.id || null,
        className: target.className || null,
        text: boundedText || null,
        path: window.location.pathname,
      });
    };

    const handleMouseMove = (event) => {
      const now = Date.now();
      // Low-frequency sampling to avoid high volume.
      if (now - lastMouseEventAtRef.current < 1000) return;
      lastMouseEventAtRef.current = now;

      trackEvent('mouse_move', {
        x: Math.round(event.clientX),
        y: Math.round(event.clientY),
        path: window.location.pathname,
      });
    };

    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;
    window.history.pushState = function patchedPushState(...args) {
      const result = originalPushState.apply(this, args);
      emitNavigation();
      return result;
    };
    window.history.replaceState = function patchedReplaceState(...args) {
      const result = originalReplaceState.apply(this, args);
      emitNavigation();
      return result;
    };

    window.addEventListener('popstate', emitNavigation);
    window.addEventListener('hashchange', emitNavigation);
    document.addEventListener('click', handleClick, true);
    document.addEventListener('mousemove', handleMouseMove, { passive: true });

    // Emit initial page context for new sessions.
    emitNavigation();

    return () => {
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
      window.removeEventListener('popstate', emitNavigation);
      window.removeEventListener('hashchange', emitNavigation);
      document.removeEventListener('click', handleClick, true);
      document.removeEventListener('mousemove', handleMouseMove);
    };
  }, [isInitialized, user, trackEvent]);

  return { isInitialized, error };
}
