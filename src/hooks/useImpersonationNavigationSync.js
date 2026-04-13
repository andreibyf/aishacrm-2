import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BACKEND_URL } from '@/api/core/httpClient';
import { useSocket } from './useSocket';

const SYNC_TTL_MS = 30 * 60 * 1000;
let fallbackSyncCounter = 0;

function generateSyncSessionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  fallbackSyncCounter += 1;
  return `sync-${Date.now()}-${fallbackSyncCounter}`;
}

/**
 * Enables bidirectional route sync between impersonated admin session and real user session.
 *
 * Behavior:
 * - Impersonated session creates and starts a sync session.
 * - Other sessions for the same user receive start event and join sync mode.
 * - Route navigation is mirrored both directions while sync session is active.
 */
export function useImpersonationNavigationSync() {
  const { socket, connected } = useSocket();
  const location = useLocation();
  const navigate = useNavigate();

  const activeSyncRef = useRef(null);
  const localOwnedSyncRef = useRef(null);
  const ignoreNextEmitRef = useRef(false);
  const lastEmittedPathRef = useRef('');
  const lastSupportMouseEmitAtRef = useRef(0);

  useEffect(() => {
    if (!socket || !connected) return;

    let cancelled = false;

    const checkImpersonationStatus = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/auth/impersonation-status`, {
          credentials: 'include',
        });
        const payload = await res.json().catch(() => null);
        const impersonating = !!payload?.data?.impersonating;

        if (cancelled || !impersonating) return;

        const syncSessionId = generateSyncSessionId();
        const now = Date.now();
        const expiresAt = now + SYNC_TTL_MS;

        localOwnedSyncRef.current = syncSessionId;
        activeSyncRef.current = { syncSessionId, expiresAt };

        socket.emit('impersonation_sync_start', {
          syncSessionId,
          startedAt: new Date(now).toISOString(),
          expiresAt: new Date(expiresAt).toISOString(),
        });
      } catch (err) {
        if (import.meta.env.DEV) {
          console.warn('[ImpersonationSync] Status check failed:', err?.message || err);
        }
      }
    };

    const onSyncStarted = (data) => {
      if (!data?.syncSessionId) return;
      const expiryMs = data.expiresAt ? new Date(data.expiresAt).getTime() : Date.now() + SYNC_TTL_MS;
      activeSyncRef.current = {
        syncSessionId: data.syncSessionId,
        expiresAt: Number.isFinite(expiryMs) ? expiryMs : Date.now() + SYNC_TTL_MS,
      };
    };

    const onSyncStopped = (data) => {
      if (!data?.syncSessionId) return;
      if (activeSyncRef.current?.syncSessionId === data.syncSessionId) {
        activeSyncRef.current = null;
      }
      if (localOwnedSyncRef.current === data.syncSessionId) {
        localOwnedSyncRef.current = null;
      }
    };

    const onNavigation = (data) => {
      const active = activeSyncRef.current;
      if (!active || !data?.syncSessionId || !data?.path) return;
      if (active.syncSessionId !== data.syncSessionId) return;
      if (active.expiresAt <= Date.now()) {
        activeSyncRef.current = null;
        return;
      }

      const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (data.path === currentPath) return;

      ignoreNextEmitRef.current = true;
      navigate(data.path);
    };

    socket.on('impersonation_sync_started', onSyncStarted);
    socket.on('impersonation_sync_stopped', onSyncStopped);
    socket.on('impersonation_nav', onNavigation);

    checkImpersonationStatus();

    return () => {
      cancelled = true;

      const owned = localOwnedSyncRef.current;
      if (owned) {
        socket.emit('impersonation_sync_stop', { syncSessionId: owned });
      }

      socket.off('impersonation_sync_started', onSyncStarted);
      socket.off('impersonation_sync_stopped', onSyncStopped);
      socket.off('impersonation_nav', onNavigation);
    };
  }, [socket, connected, navigate]);

  useEffect(() => {
    if (!socket || !connected) return;

    const active = activeSyncRef.current;
    if (!active || active.expiresAt <= Date.now()) return;

    const path = `${location.pathname}${location.search}${location.hash}`;

    if (ignoreNextEmitRef.current) {
      ignoreNextEmitRef.current = false;
      lastEmittedPathRef.current = path;
      return;
    }

    if (lastEmittedPathRef.current === path) return;
    lastEmittedPathRef.current = path;

    socket.emit('impersonation_nav', {
      syncSessionId: active.syncSessionId,
      path,
      timestamp: new Date().toISOString(),
    });
  }, [socket, connected, location.pathname, location.search, location.hash]);

  // Emit support interaction navigation events for friction detection.
  useEffect(() => {
    if (!socket || !connected) return;

    const path = `${location.pathname}${location.search}${location.hash}`;
    socket.emit('support_interaction', {
      eventType: 'navigation',
      path,
      timestamp: new Date().toISOString(),
    });
  }, [socket, connected, location.pathname, location.search, location.hash]);

  // Emit lightweight interaction telemetry (click + sampled mouse movement).
  useEffect(() => {
    if (!socket || !connected) return;

    const getPath = () => `${window.location.pathname}${window.location.search}${window.location.hash}`;

    const handleClick = (event) => {
      const target = event.target?.closest?.('button, a, [role="button"], input, select, textarea');
      if (!target) return;

      socket.emit('support_interaction', {
        eventType: 'click',
        path: getPath(),
        timestamp: new Date().toISOString(),
      });
    };

    const handleMouseMove = (event) => {
      const now = Date.now();
      if (now - lastSupportMouseEmitAtRef.current < 1000) return;
      lastSupportMouseEmitAtRef.current = now;

      socket.emit('support_interaction', {
        eventType: 'mouse_move',
        path: getPath(),
        x: Math.round(event.clientX),
        y: Math.round(event.clientY),
        timestamp: new Date().toISOString(),
      });
    };

    document.addEventListener('click', handleClick, true);
    document.addEventListener('mousemove', handleMouseMove, { passive: true });

    return () => {
      document.removeEventListener('click', handleClick, true);
      document.removeEventListener('mousemove', handleMouseMove);
    };
  }, [socket, connected]);
}

export default useImpersonationNavigationSync;
