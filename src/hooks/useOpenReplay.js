import { useEffect, useState, useCallback, useRef } from 'react';
import Tracker from '@openreplay/tracker';
import trackerAssist from '@openreplay/tracker-assist';
import { getRuntimeEnv, shouldDisableSecureMode } from '@/utils/runtimeEnv';

/**
 * OpenReplay Session Replay & Co-browsing Hook
 * 
 * Provides session replay and live co-browsing (Assist) functionality.
 * 
 * OpenReplay Features:
 * - Session Replay: Record user sessions with full context
 * - Assist: Live co-browsing with remote control
 * - DevTools: Network, console, performance metrics
 * - Privacy Controls: Data sanitization & masking
 * 
 * @returns {Object} OpenReplay instance and control functions
 */
export function useOpenReplay() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [sessionUrl, setSessionUrl] = useState(null);
  const [error, setError] = useState(null);
  const trackerRef = useRef(null);

  useEffect(() => {
    const projectKey = getRuntimeEnv('VITE_OPENREPLAY_PROJECT_KEY');
    const ingestPoint = getRuntimeEnv('VITE_OPENREPLAY_INGEST_POINT');
    // Skip initialization if no project key configured
    if (!projectKey) {
      console.info('[OpenReplay] No project key configured - session replay disabled');
      return;
    }

    try {
      // Initialize tracker
      const tracker = new Tracker({
        projectKey,
        ingestPoint: ingestPoint || undefined, // Use default cloud if not specified
        // Docker local uses a production build on http://localhost, so allow insecure mode there too.
        __DISABLE_SECURE_MODE: shouldDisableSecureMode(),
      });

      // Enable Assist plugin for live co-browsing (cursor visibility + remote control workflow)
      try {
        tracker.use(trackerAssist());
        console.info('[OpenReplay] Assist plugin enabled');
      } catch (assistErr) {
        console.warn('[OpenReplay] Assist plugin init failed, continuing without Assist:', assistErr);
      }

      // Start tracking session
      tracker.start({
        userID: undefined, // Will be set after auth
        metadata: {
          environment: import.meta.env.MODE,
        },
      });

      trackerRef.current = tracker;
      setIsInitialized(true);

      // Get session URL for sharing
      const url = tracker.getSessionURL();
      if (url) {
        setSessionUrl(url);
      }

      console.info('[OpenReplay] Session tracking started');
    } catch (err) {
      console.error('[OpenReplay] Initialization failed:', err);
      setError(err.message);
    }

    // Cleanup on unmount
    return () => {
      if (trackerRef.current) {
        trackerRef.current.stop();
        trackerRef.current = null;
      }
    };
  }, []);

  /**
   * Update user identity after authentication
   */
  const setUserInfo = useCallback((userId, userInfo = {}) => {
    if (!trackerRef.current) return;

    try {
      trackerRef.current.setUserID(userId);
      
      // Set metadata
      if (userInfo.email) {
        trackerRef.current.setMetadata('email', userInfo.email);
      }
      if (userInfo.name) {
        trackerRef.current.setMetadata('name', userInfo.name);
      }
      if (userInfo.role) {
        trackerRef.current.setMetadata('role', userInfo.role);
      }
      if (userInfo.tenantId) {
        trackerRef.current.setMetadata('tenantId', userInfo.tenantId);
      }
    } catch (err) {
      console.error('[OpenReplay] Failed to set user info:', err);
    }
  }, []);

  /**
   * Enable Assist mode for live co-browsing
   * This allows support agents to view and control the session in real-time
   */
  const enableAssist = useCallback(() => {
    if (!trackerRef.current) {
      console.warn('[OpenReplay] Cannot enable Assist - tracker not initialized');
      return false;
    }

    try {
      // Assist is automatically available when viewing live sessions
      // in the OpenReplay dashboard - no additional API call needed
      console.info('[OpenReplay] Assist mode available - support can join via dashboard');
      return true;
    } catch (err) {
      console.error('[OpenReplay] Failed to enable Assist:', err);
      return false;
    }
  }, []);

  /**
   * Track custom event
   */
  const trackEvent = useCallback((eventName, payload = {}) => {
    if (!trackerRef.current) return;

    try {
      trackerRef.current.event(eventName, payload);
    } catch (err) {
      console.error('[OpenReplay] Failed to track event:', err);
    }
  }, []);

  /**
   * Get current session URL for sharing with support
   */
  const getSessionUrl = useCallback(() => {
    if (!trackerRef.current) return null;

    try {
      return trackerRef.current.getSessionURL();
    } catch (err) {
      console.error('[OpenReplay] Failed to get session URL:', err);
      return null;
    }
  }, []);

  return {
    isInitialized,
    sessionUrl,
    error,
    tracker: trackerRef.current,
    setUserInfo,
    enableAssist,
    trackEvent,
    getSessionUrl,
  };
}
