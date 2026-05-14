import { useEffect, useRef } from 'react';
import { useSessionReplay } from './useSessionReplay';
import { useUser } from '@/components/shared/useUser';

/**
 * Provider-agnostic session tracking integration.
 *
 * Provider-agnostic session tracking integration. Mounts once at app root.
 * Reads the active provider from useSessionReplay() (Clarity / none) and
 * binds user identity + emits navigation/click/mouse events through the
 * shared trackEvent interface.
 */
export function useSessionReplayTracking() {
  const { isInitialized, setUserInfo, trackEvent, error, provider } = useSessionReplay();
  const { user } = useUser();
  const lastMouseEventAtRef = useRef(0);

  useEffect(() => {
    if (!isInitialized || !user) return;

    const displayId = user.email || user.name || user.id;
    setUserInfo(displayId, {
      email: user.email,
      name: user.name || user.email,
      role: user.role,
      tenantId: user.tenant_id,
      userId: user.id,
    });
    console.info(`[SessionReplay:${provider}] User identity set:`, displayId);
  }, [isInitialized, user, setUserInfo, provider]);

  useEffect(() => {
    if (error) console.error(`[SessionReplay:${provider}] Error:`, error);
  }, [error, provider]);

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
      const text = (
        target.textContent ||
        target.ariaLabel ||
        target.getAttribute?.('aria-label') ||
        ''
      ).trim();
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
    window.history.pushState = function patched(...args) {
      const result = originalPushState.apply(this, args);
      emitNavigation();
      return result;
    };
    window.history.replaceState = function patched(...args) {
      const result = originalReplaceState.apply(this, args);
      emitNavigation();
      return result;
    };

    window.addEventListener('popstate', emitNavigation);
    window.addEventListener('hashchange', emitNavigation);
    document.addEventListener('click', handleClick, true);
    document.addEventListener('mousemove', handleMouseMove, { passive: true });
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

  return { isInitialized, error, provider };
}
