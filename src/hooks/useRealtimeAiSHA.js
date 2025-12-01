import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { trackRealtimeEvent, trackConnectionStateChange } from '@/utils/realtimeTelemetry.js';

const REALTIME_CALL_URL = 'https://api.openai.com/v1/realtime/calls';

const ERROR_LIBRARY = {
  mic_denied: {
    message: 'Microphone access was blocked.',
    hint: 'Allow microphone access near the browser address bar, then try again.',
    suggestions: [
      'Click the lock icon in the address bar and set Microphone to "Allow".',
      'Reload the tab after granting permission.',
    ],
  },
  mic_not_found: {
    message: 'No microphone was detected.',
    hint: 'Connect or enable a microphone before starting a realtime session.',
    suggestions: ['Verify your input device is connected and not muted within the OS.'],
  },
  token_request_failed: {
    message: 'AiSHA could not reach the realtime service.',
    hint: 'Check your internet or VPN connection, then try again.',
    suggestions: ['Ensure WebRTC traffic is allowed on your network.'],
  },
  token_missing: {
    message: 'Realtime token missing from server response.',
    hint: 'Retry shortly. If it persists, contact an administrator.',
  },
  connection_failed: {
    message: 'Realtime connection dropped unexpectedly.',
    hint: 'AiSHA will attempt a clean reset. Toggle Realtime Voice back on if needed.',
    suggestions: ['Confirm your connection is stable, especially on VPNs or Wi-Fi.'],
  },
  datachannel_error: {
    message: 'Realtime data channel reported an error.',
    hint: 'Toggle Realtime Voice off and on to refresh the session.',
  },
  channel_not_ready: {
    message: 'Realtime connection is not ready yet.',
    hint: 'Wait for the LIVE indicator before sending another message.',
  },
  general: {
    message: 'Realtime session error. Please try again.',
    hint: 'Toggle Realtime Voice off and on. If it persists, check your network.',
  },
};

const getBrowserSupport = () => {
  if (typeof window === 'undefined') {
    return false;
  }
  const hasRTCPeerConnection = typeof window.RTCPeerConnection !== 'undefined';
  const hasMediaDevices = typeof navigator !== 'undefined' && Boolean(navigator?.mediaDevices?.getUserMedia);
  return hasRTCPeerConnection && hasMediaDevices;
};

const safeJsonParse = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const createErrorDetails = (code = 'general', overrides = {}) => {
  const base = ERROR_LIBRARY[code] || ERROR_LIBRARY.general;
  return {
    code,
    message: overrides.message || base.message,
    hint: overrides.hint ?? base.hint,
    suggestions: overrides.suggestions ?? base.suggestions ?? [],
  };
};

const getNow = () => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
};

const resolveActiveTenantId = () => {
  if (typeof window === 'undefined') {
    return null;
  }
  const sanitize = (value) => {
    if (!value) return null;
    if (value === 'undefined' || value === 'null') return null;
    return value;
  };
  try {
    const selected = sanitize(window.localStorage?.getItem('selected_tenant_id'));
    if (selected) {
      return selected;
    }
  } catch {
    // ignore storage errors
  }
  try {
    const fallback = sanitize(window.localStorage?.getItem('tenant_id'));
    if (fallback) {
      return fallback;
    }
  } catch {
    // ignore storage errors
  }
  return null;
};

const shouldConsoleLogTelemetry = () => {
  try {
    if (typeof window !== 'undefined' && window?.localStorage?.getItem('ENABLE_REALTIME_TELEMETRY_LOGS') === 'true') {
      return true;
    }
  } catch {
    // ignore access issues (e.g., disabled storage)
  }

  try {
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      if (import.meta.env.VITE_AI_DEBUG_TELEMETRY === 'true') {
        return true;
      }
      return Boolean(import.meta.env.DEV);
    }
  } catch {
    // ignore env resolution errors
  }
  return false;
};

const markHandledError = (error, details) => {
  if (error && typeof error === 'object') {
    try {
      error.__realtimeDetails = details;
    } catch {
      // ignore assignment issues
    }
  }
};

const mapErrorToDetails = (error, stage = 'general') => {
  if (!error) return createErrorDetails('general');
  if (typeof error === 'string') {
    return createErrorDetails('general', { message: error });
  }
  if (error?.__realtimeDetails) {
    return error.__realtimeDetails;
  }

  const { name, message } = error;

  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return createErrorDetails('mic_denied');
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return createErrorDetails('mic_not_found');
  }

  if (stage === 'token') {
    return createErrorDetails('token_request_failed', { message });
  }
  if (stage === 'token_missing') {
    return createErrorDetails('token_missing');
  }
  if (stage === 'datachannel') {
    return createErrorDetails('datachannel_error', { message });
  }
  if (stage === 'connection_failed') {
    return createErrorDetails('connection_failed', { message });
  }
  if (stage === 'channel_not_ready') {
    return createErrorDetails('channel_not_ready');
  }

  return createErrorDetails('general', { message });
};

const isAssistantResponsePayload = (payload) => {
  if (!payload || typeof payload !== 'object') return false;
  if (payload.type === 'response.completed' || payload.type === 'response.output_text.done') {
    return true;
  }
  if (payload.type === 'conversation.item.created' && payload.item?.role === 'assistant') {
    return true;
  }
  if (payload.role === 'assistant') {
    return true;
  }
  return false;
};

export function useRealtimeAiSHA({ onEvent, telemetryContext } = {}) {
  const [state, setState] = useState({
    isSupported: getBrowserSupport(),
    isInitializing: false,
    isConnected: false,
    isListening: false,
    error: null,
    errorDetails: null,
  });

  const pcRef = useRef(null);
  const dcRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const eventHandlerRef = useRef(onEvent || null);
  const telemetryContextRef = useRef(telemetryContext || {});
  const connectionStateRef = useRef('idle');
  const connectStartRef = useRef(null);
  const sessionStartRef = useRef(null);
  const pendingResponseLatencyRef = useRef(null);
  const consoleTelemetryEnabledRef = useRef(shouldConsoleLogTelemetry());

  useEffect(() => {
    eventHandlerRef.current = onEvent || null;
  }, [onEvent]);

  useEffect(() => {
    telemetryContextRef.current = telemetryContext || {};
  }, [telemetryContext]);

  const logEvent = useCallback((event, payload = undefined, severity = 'info') => {
    trackRealtimeEvent({
      event,
      payload,
      severity,
      context: telemetryContextRef.current,
    });
  }, []);

  const logTelemetryMetric = useCallback((metric, payload = {}) => {
    const eventName = `realtime.telemetry.${metric}`;
    logEvent(eventName, payload);
    if (consoleTelemetryEnabledRef.current && typeof console !== 'undefined' && typeof console.info === 'function') {
      console.info('[Realtime Telemetry]', metric, payload);
    }
  }, [logEvent]);

  const logConnectionChange = useCallback((from, to, reason) => {
    trackConnectionStateChange({
      from,
      to,
      reason,
      context: telemetryContextRef.current,
    });
  }, []);

  const updateConnectionState = useCallback((nextState, reason) => {
    const previous = connectionStateRef.current || 'unknown';
    connectionStateRef.current = nextState;
    logConnectionChange(previous, nextState, reason);
  }, [logConnectionChange]);

  const emitEvent = useCallback((payload) => {
    if (eventHandlerRef.current) {
      eventHandlerRef.current(payload);
    }
  }, []);

  const applyErrorState = useCallback((details, severity = 'error') => {
    setState((prev) => ({
      ...prev,
      isInitializing: false,
      isListening: false,
      error: details.message,
      errorDetails: details,
    }));
    logEvent('realtime.error.state', { code: details.code, message: details.message }, severity);
  }, [logEvent]);

  const clearErrorState = useCallback(() => {
    setState((prev) => ({ ...prev, error: null, errorDetails: null }));
  }, []);

  const cleanup = useCallback((reason = 'cleanup') => {
    const nowTs = getNow();
    if (sessionStartRef.current) {
      const durationMs = Math.max(0, Math.round(nowTs - sessionStartRef.current));
      logTelemetryMetric('session_duration', { durationMs, reason });
    }
    sessionStartRef.current = null;
    pendingResponseLatencyRef.current = null;
    connectStartRef.current = null;
    const hadPeer = Boolean(pcRef.current);
    const hadDataChannel = Boolean(dcRef.current);
    const hadMediaTracks = Boolean(mediaStreamRef.current);
    if (hadPeer || hadDataChannel) {
      updateConnectionState('disconnected', reason);
    }
    if (dcRef.current) {
      try {
        dcRef.current.onclose = null;
        dcRef.current.onmessage = null;
        dcRef.current.close();
      } catch {
        // ignore close failures
      }
      dcRef.current = null;
    }
    if (pcRef.current) {
      try {
        pcRef.current.ontrack = null;
        pcRef.current.onconnectionstatechange = null;
        pcRef.current.oniceconnectionstatechange = null;
        pcRef.current.close();
      } catch {
        // ignore close failures
      }
      pcRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore stop failures
        }
      });
      mediaStreamRef.current = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
    if (hadPeer || hadDataChannel || hadMediaTracks) {
      logEvent('realtime.session.cleaned', {
        hadPeer,
        hadDataChannel,
        hadMediaTracks,
        reason,
      });
      logTelemetryMetric('disconnect', { reason, hadPeer, hadDataChannel, hadMediaTracks });
    }
    setState((prev) => ({
      ...prev,
      isConnected: false,
      isListening: false,
      isInitializing: false,
    }));
  }, [logEvent, logTelemetryMetric, updateConnectionState]);

  const ensureAudioElement = useCallback(() => {
    if (typeof window === 'undefined') return null;
    if (!remoteAudioRef.current) {
      const audioEl = new Audio();
      audioEl.autoplay = true;
      audioEl.playsInline = true;
      audioEl.muted = false;
      remoteAudioRef.current = audioEl;
    }
    return remoteAudioRef.current;
  }, []);

  const connectRealtime = useCallback(async () => {
    if (!state.isSupported) {
      const details = createErrorDetails('general', { message: 'Realtime voice is not supported in this browser.' });
      applyErrorState(details, 'warn');
      return false;
    }

    setState((prev) => ({
      ...prev,
      isInitializing: true,
      error: null,
      errorDetails: null,
    }));
    connectStartRef.current = getNow();
    logEvent('realtime.connect.requested', {
      hasExistingPeer: Boolean(pcRef.current),
    });
    logTelemetryMetric('connect_start', {
      hasExistingPeer: Boolean(pcRef.current),
    });
    updateConnectionState('initializing', 'user_request');
    clearErrorState();

    try {
      const tenantId = resolveActiveTenantId();
      const tokenQuery = tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : '';
      const tokenResponse = await fetch(`/api/ai/realtime-token${tokenQuery}`, {
        method: 'GET',
        headers: { 'Cache-Control': 'no-store' },
      });
      if (!tokenResponse.ok) {
        throw Object.assign(new Error('Failed to request realtime token.'), { stage: 'token' });
      }

      const tokenPayload = await tokenResponse.json();
      const ephemeralKey = tokenPayload?.value || tokenPayload?.data?.value;
      if (!ephemeralKey) {
        const details = createErrorDetails('token_missing');
        applyErrorState(details);
        const tokenError = Object.assign(new Error(details.message), { stage: 'token_missing' });
        markHandledError(tokenError, details);
        throw tokenError;
      }

      logEvent('realtime.token.received', { masked: Boolean(ephemeralKey) });

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          const nowTs = getNow();
          if (connectStartRef.current) {
            const latencyMs = Math.max(0, Math.round(nowTs - connectStartRef.current));
            logTelemetryMetric('handshake', { latencyMs });
            connectStartRef.current = null;
          }
          sessionStartRef.current = nowTs;
          updateConnectionState('connected', 'peer_state');
          setState((prev) => ({ ...prev, isConnected: true, isInitializing: false }));
          logEvent('realtime.peer.connected');
          return;
        }
        if (pc.connectionState === 'failed') {
          const details = createErrorDetails('connection_failed', { message: 'Peer connection failed.' });
          applyErrorState(details);
          logEvent('realtime.peer.error', { state: pc.connectionState }, 'error');
          cleanup('connection_failed');
        } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'closed') {
          logEvent('realtime.peer.disconnected', { state: pc.connectionState }, 'warn');
          cleanup(pc.connectionState);
        }
      };

      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'failed') {
          logEvent('realtime.ice.failed', { state: pc.iceConnectionState }, 'error');
          cleanup('ice_failed');
        }
      };

      let localStream;
      try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (mediaError) {
        const details = mapErrorToDetails(mediaError, 'mic');
        applyErrorState(details);
        markHandledError(mediaError, details);
        logEvent('realtime.media.error', { code: details.code, message: details.message }, 'error');
        throw mediaError;
      }

      mediaStreamRef.current = localStream;
      localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
      logEvent('realtime.media.acquired', { trackCount: localStream.getTracks().length });

      pc.ontrack = (event) => {
        const audioEl = ensureAudioElement();
        if (audioEl && event.streams?.[0]) {
          audioEl.srcObject = event.streams[0];
          audioEl.play?.().catch(() => {
            // Autoplay might be blocked; user interaction will trigger playback later.
          });
        }
      };

      const bindDataChannelHandlers = (channel) => {
        if (!channel) return;
        channel.onopen = () => {
          setState((prev) => ({ ...prev, isListening: true }));
          logEvent('realtime.datachannel.open');
          logTelemetryMetric('channel_open');
        };
        channel.onerror = (err) => {
          const details = mapErrorToDetails(err, 'datachannel');
          applyErrorState(details);
          markHandledError(err, details);
          logEvent('realtime.datachannel.error', { message: err?.message }, 'error');
          logTelemetryMetric('channel_error', { message: err?.message || 'unknown' });
        };
        channel.onclose = () => {
          setState((prev) => ({ ...prev, isListening: false }));
          logEvent('realtime.datachannel.closed');
          logTelemetryMetric('channel_closed');
        };
        channel.onmessage = (event) => {
          const payload = typeof event.data === 'string' ? safeJsonParse(event.data) : event.data;
          logEvent('realtime.datachannel.message', {
            messageType: typeof payload === 'object' ? payload?.type || 'object' : typeof payload,
            hasText: Boolean(payload?.delta || payload?.content),
          });
          if (pendingResponseLatencyRef.current && isAssistantResponsePayload(payload)) {
            const latencyMs = Math.max(0, Math.round(getNow() - pendingResponseLatencyRef.current));
            pendingResponseLatencyRef.current = null;
            logTelemetryMetric('model_latency', { latencyMs, trigger: payload?.type || payload?.role || 'unknown' });
          }
          emitEvent(payload);
        };
      };

      const dataChannel = pc.createDataChannel('oai-events');
      dcRef.current = dataChannel;
      bindDataChannelHandlers(dataChannel);

      pc.ondatachannel = (event) => {
        if (dcRef.current) return;
        dcRef.current = event.channel;
        bindDataChannelHandlers(dcRef.current);
        logEvent('realtime.datachannel.received');
        logTelemetryMetric('channel_received');
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const answerResponse = await fetch(REALTIME_CALL_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ephemeralKey}`,
          'Content-Type': 'application/sdp',
        },
        body: offer.sdp,
      });

      if (!answerResponse.ok) {
        throw Object.assign(new Error('Failed to start realtime session.'), { stage: 'connection_failed' });
      }

      const answerSdp = await answerResponse.text();
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

      setState((prev) => ({
        ...prev,
        isInitializing: false,
        isConnected: true,
        error: null,
        errorDetails: null,
      }));
      updateConnectionState('connected', 'answer_received');
      logEvent('realtime.session.connected');
      return true;
    } catch (error) {
      console.error('[Realtime Voice] connect error', error);
      cleanup('connect_error');
      const details = mapErrorToDetails(error, error?.stage || 'connection_failed');
      applyErrorState(details);
      markHandledError(error, details);
      logEvent('realtime.connect.failed', { code: details.code, message: details.message }, 'error');
      updateConnectionState('error', details.code);
      throw error;
    }
  }, [applyErrorState, cleanup, clearErrorState, emitEvent, ensureAudioElement, logEvent, logTelemetryMetric, state.isSupported, updateConnectionState]);

  const sendUserMessage = useCallback(async (text) => {
    const trimmed = (text || '').trim();
    if (!trimmed) return;
    if (!dcRef.current || dcRef.current.readyState !== 'open') {
      const details = mapErrorToDetails(new Error('Channel not ready'), 'channel_not_ready');
      applyErrorState(details, 'warn');
      logEvent('realtime.send.rejected', { reason: details.code }, 'warn');
      throw Object.assign(new Error(details.message), { __realtimeDetails: details });
    }
    const payload = {
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: trimmed,
          },
        ],
      },
    };
    dcRef.current.send(JSON.stringify(payload));
    logEvent('realtime.send.user_message', { textLength: trimmed.length });
    pendingResponseLatencyRef.current = getNow();
    logTelemetryMetric('user_message_sent', { textLength: trimmed.length });
  }, [applyErrorState, logEvent, logTelemetryMetric]);

  const disconnectRealtime = useCallback(() => {
    logEvent('realtime.disconnect.requested', {
      hasPeer: Boolean(pcRef.current),
    });
    logTelemetryMetric('disconnect_requested', { hasPeer: Boolean(pcRef.current) });
    updateConnectionState('disconnected', 'user_request');
    cleanup('user_request');
    clearErrorState();
  }, [cleanup, clearErrorState, logEvent, logTelemetryMetric, updateConnectionState]);

  const status = useMemo(
    () => ({
      isSupported: state.isSupported,
      isInitializing: state.isInitializing,
      isConnected: state.isConnected,
      isListening: state.isListening,
      error: state.error,
      errorDetails: state.errorDetails,
    }),
    [state],
  );

  return {
    ...status,
    connectRealtime,
    sendUserMessage,
    disconnectRealtime,
  };
}
