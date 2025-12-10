import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { trackRealtimeEvent, trackConnectionStateChange } from '@/utils/realtimeTelemetry.js';
import { resolveApiUrl } from '@/utils/resolveApiUrl.js';
import { supabase } from '@/lib/supabase.js';

const REALTIME_CALL_URL = 'https://api.openai.com/v1/realtime/calls';
const MAX_MESSAGE_LOG = 25;
// Limit tool iterations per response cycle to prevent infinite loops
const MAX_TOOL_ITERATIONS = 5;

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

// Get auth token for API requests
const getAuthToken = async () => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      return session.access_token;
    }
  } catch {
    // ignore session errors
  }
  // Fallback to localStorage
  try {
    const stored = window.localStorage?.getItem('sb-access-token');
    if (stored) return stored;
  } catch {
    // ignore storage errors
  }
  return null;
};

// Execute a CRM tool via the backend API
const executeRealtimeTool = async (toolName, toolArgs, callId) => {
  const tenantId = resolveActiveTenantId();
  const authToken = await getAuthToken();

  const apiUrl = resolveApiUrl('/api/ai/realtime-tools/execute');

  const headers = {
    'Content-Type': 'application/json',
  };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  console.log(`[Realtime] Executing tool: ${toolName}`, { callId, args: toolArgs });

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify({
      tool_name: toolName,
      tool_args: toolArgs,
      tenant_id: tenantId,
      call_id: callId,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    console.error(`[Realtime] Tool execution failed: ${response.status}`, errorText);
    throw new Error(`Tool execution failed: ${response.status}`);
  }

  const result = await response.json();
  console.log(`[Realtime] Tool result for ${toolName}:`, result);
  return result;
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

const createMessageId = () => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // ignore crypto issues and fall back
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

const flattenRealtimeContent = (input) => {
  if (!input) return '';
  if (typeof input === 'string') return input;
  if (Array.isArray(input)) {
    return input.map((chunk) => flattenRealtimeContent(chunk)).filter(Boolean).join('');
  }
  if (typeof input === 'object') {
    if (typeof input.text === 'string') return input.text;
    if (input.text) return flattenRealtimeContent(input.text);
    if (typeof input.value === 'string') return input.value;
    if (input.value) return flattenRealtimeContent(input.value);
    if (input.content) return flattenRealtimeContent(input.content);
    if (input.delta) return flattenRealtimeContent(input.delta);
    if (typeof input.transcript === 'string') return input.transcript;
    if (Array.isArray(input.data)) return flattenRealtimeContent(input.data);
  }
  return '';
};

const extractAssistantMessage = (payload) => {
  if (!isAssistantResponsePayload(payload)) return null;
  const candidates = [
    payload?.item?.content,
    payload?.delta,
    payload?.content,
    payload?.text,
    payload?.response?.output,
    payload?.message,
  ];
  const text = candidates
    .map((candidate) => flattenRealtimeContent(candidate))
    .find((chunk) => Boolean(chunk && chunk.trim().length > 0)) || '';
  const normalized = text.trim();
  if (!normalized) return null;
  return {
    id: createMessageId(),
    role: 'assistant',
    content: normalized,
    timestamp: Date.now(),
  };
};

export function useRealtimeAiSHA({ onEvent, telemetryContext } = {}) {
  const [state, setState] = useState({
    isSupported: getBrowserSupport(),
    isInitializing: false,
    isConnected: false,
    isListening: false,
    isSpeaking: false, // Track when AI is speaking to mute mic
    error: null,
    errorDetails: null,
  });
  const [messageLog, setMessageLog] = useState([]);

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
  const speakingTimeoutRef = useRef(null);
  // PTT mode flag - when true, mic stays muted except when user holds PTT button
  const pttModeRef = useRef(false);
  // Deduplication: track executed tool call IDs to prevent duplicates
  const executedToolCallsRef = useRef(new Set());
  // Track tool iterations per response cycle to prevent infinite loops
  const toolIterationCountRef = useRef(0);

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

  const appendMessageFromPayload = useCallback((payload) => {
    const normalized = extractAssistantMessage(payload);
    if (!normalized) return;
    setMessageLog((prev) => {
      const next = [...prev, normalized];
      if (next.length > MAX_MESSAGE_LOG) {
        return next.slice(next.length - MAX_MESSAGE_LOG);
      }
      return next;
    });
  }, []);

  // Mute/unmute mic to prevent feedback when AI is speaking
  const setMicMuted = useCallback((muted) => {
    const stream = mediaStreamRef.current;
    if (!stream) return;
    stream.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
    if (consoleTelemetryEnabledRef.current) {
      console.info('[Realtime] Mic', muted ? 'muted' : 'unmuted');
    }
  }, []);

  // Handle AI speaking state - mute mic while AI speaks
  // In PTT mode, mic stays muted even after AI stops - user must hold button
  // In continuous mode, mic auto-unmutes after AI stops speaking
  const setAISpeaking = useCallback((speaking) => {
    // Clear any pending timeout
    if (speakingTimeoutRef.current) {
      clearTimeout(speakingTimeoutRef.current);
      speakingTimeoutRef.current = null;
    }

    if (speaking) {
      // AI started speaking - mute mic immediately (both modes)
      setMicMuted(true);
      setState((prev) => ({ ...prev, isSpeaking: true }));
    } else {
      // AI stopped speaking
      setState((prev) => ({ ...prev, isSpeaking: false }));

      // Only auto-unmute in continuous mode, NOT in PTT mode
      if (pttModeRef.current) {
        // PTT mode: keep mic muted, user must hold button to speak
        console.info('[Realtime] PTT mode: keeping mic muted after AI stopped');
      } else {
        // Continuous mode: delay unmute slightly to avoid catching tail end
        speakingTimeoutRef.current = setTimeout(() => {
          setMicMuted(false);
          speakingTimeoutRef.current = null;
        }, 300); // 300ms delay before unmuting
      }
    }
  }, [setMicMuted]);

  const emitEvent = useCallback((payload) => {
    // Detect AI audio events to mute/unmute mic
    if (payload && typeof payload === 'object') {
      const eventType = payload.type;
      
      // Log all events in dev mode for debugging
      if (consoleTelemetryEnabledRef.current && eventType) {
        console.info('[Realtime Event]', eventType);
      }
      
      // AI started speaking - detect audio output events
      // OpenAI Realtime API uses these event types:
      // - response.audio.delta: audio chunk being sent
      // - output_audio_buffer.speech_started: audio playback starting
      // - response.output_item.added with audio type
      if (eventType === 'response.audio.delta' || 
          eventType === 'response.audio_transcript.delta' ||
          eventType === 'output_audio_buffer.speech_started' ||
          (eventType === 'response.output_item.added' && payload.item?.type === 'audio')) {
        setAISpeaking(true);
      }
      
      // AI finished speaking - detect completion events
      // - response.audio.done: audio finished
      // - output_audio_buffer.speech_stopped: audio playback stopped
      // - response.done: entire response finished
      // - input_audio_buffer.speech_started: user started talking (implies AI stopped)
      if (eventType === 'response.audio.done' || 
          eventType === 'response.done' || 
          eventType === 'response.audio_transcript.done' ||
          eventType === 'output_audio_buffer.speech_stopped' ||
          eventType === 'input_audio_buffer.speech_started') {
        setAISpeaking(false);
      }
      
      // Reset tool iteration counter on new user turn
      if (eventType === 'input_audio_buffer.speech_started' ||
          eventType === 'conversation.item.input_audio_transcription.completed') {
        toolIterationCountRef.current = 0;
        console.log('[Realtime] Reset tool iteration counter (new user turn)');
      }
    }

    if (eventHandlerRef.current) {
      eventHandlerRef.current(payload);
    }
    appendMessageFromPayload(payload);
  }, [appendMessageFromPayload, setAISpeaking]);

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
    // Clear speaking timeout
    if (speakingTimeoutRef.current) {
      clearTimeout(speakingTimeoutRef.current);
      speakingTimeoutRef.current = null;
    }
    // Reset PTT mode flag
    pttModeRef.current = false;
    setState((prev) => ({
      ...prev,
      isConnected: false,
      isListening: false,
      isInitializing: false,
      isSpeaking: false,
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

  const connectRealtime = useCallback(async (options = {}) => {
    const { startMuted = false } = options;

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
      startMuted,
    });
    logTelemetryMetric('connect_start', {
      hasExistingPeer: Boolean(pcRef.current),
    });
    updateConnectionState('initializing', 'user_request');
    clearErrorState();

    try {
      const tenantId = resolveActiveTenantId();
      const tokenQuery = tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : '';
      
      // Get auth token for the request
      const authToken = await getAuthToken();
      const tokenUrl = resolveApiUrl(`/api/ai/realtime-token${tokenQuery}`);
      
      // Debug logging
      console.log('[useRealtimeAiSHA] Fetching token from:', tokenUrl);
      console.log('[useRealtimeAiSHA] Auth token present:', !!authToken);
      console.log('[useRealtimeAiSHA] Tenant ID:', tenantId);
      
      const headers = { 
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json',
      };
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      
      const tokenResponse = await fetch(tokenUrl, {
        method: 'GET',
        headers,
        credentials: 'include',
      });
      
      console.log('[useRealtimeAiSHA] Response status:', tokenResponse.status, tokenResponse.statusText);
      
      if (!tokenResponse.ok) {
        const errorBody = await tokenResponse.text().catch(() => 'no body');
        console.error('[useRealtimeAiSHA] Token request failed:', errorBody);
        throw Object.assign(new Error('Failed to request realtime token.'), { stage: 'token' });
      }

      const tokenPayload = await tokenResponse.json();
      console.log('[useRealtimeAiSHA] Token payload:', JSON.stringify(tokenPayload));
      const ephemeralKey = tokenPayload?.value || tokenPayload?.data?.value;
      console.log('[useRealtimeAiSHA] Full ephemeral key:', ephemeralKey);
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
        console.log('[Realtime] Binding data channel handlers, channel state:', channel.readyState);
        channel.onopen = () => {
          console.log('[Realtime] ✓ Data channel OPEN');
          setState((prev) => ({ ...prev, isListening: true }));
          logEvent('realtime.datachannel.open');
          logTelemetryMetric('channel_open');
        };
        channel.onerror = (err) => {
          console.error('[Realtime] ✗ Data channel ERROR:', err);
          const details = mapErrorToDetails(err, 'datachannel');
          applyErrorState(details);
          markHandledError(err, details);
          logEvent('realtime.datachannel.error', { message: err?.message }, 'error');
          logTelemetryMetric('channel_error', { message: err?.message || 'unknown' });
        };
        channel.onclose = () => {
          console.log('[Realtime] Data channel CLOSED');
          setState((prev) => ({ ...prev, isListening: false }));
          logEvent('realtime.datachannel.closed');
          logTelemetryMetric('channel_closed');
        };
        channel.onmessage = async (event) => {
          const payload = typeof event.data === 'string' ? safeJsonParse(event.data) : event.data;
          // Always log the event type for debugging
          console.log('[Realtime] ← Message:', payload?.type || 'unknown', payload);
          logEvent('realtime.datachannel.message', {
            messageType: typeof payload === 'object' ? payload?.type || 'object' : typeof payload,
            hasText: Boolean(payload?.delta || payload?.content),
          });
          if (pendingResponseLatencyRef.current && isAssistantResponsePayload(payload)) {
            const latencyMs = Math.max(0, Math.round(getNow() - pendingResponseLatencyRef.current));
            pendingResponseLatencyRef.current = null;
            logTelemetryMetric('model_latency', { latencyMs, trigger: payload?.type || payload?.role || 'unknown' });
          }

          // Handle tool/function calls from the Realtime API
          // OpenAI Realtime sends: response.function_call_arguments.done when a tool call is complete
          if (payload?.type === 'response.function_call_arguments.done' ||
            payload?.type === 'response.output_item.done' && payload?.item?.type === 'function_call') {
            const functionCall = payload?.item || payload;
            const callId = functionCall?.call_id || functionCall?.id || createMessageId();
            const toolName = functionCall?.name || functionCall?.function?.name;
            let toolArgs = {};

            // Parse arguments - may come as string or object
            try {
              const argsRaw = functionCall?.arguments || functionCall?.function?.arguments || '{}';
              toolArgs = typeof argsRaw === 'string' ? JSON.parse(argsRaw) : argsRaw;
            } catch (parseErr) {
              console.error('[Realtime] Failed to parse tool arguments:', parseErr);
            }

            if (toolName) {
              // Deduplication: Skip if this call_id was already executed
              if (executedToolCallsRef.current.has(callId)) {
                console.log(`[Realtime] Skipping duplicate tool call: ${toolName} (callId: ${callId})`);
                logEvent('realtime.tool.duplicate_skipped', { toolName, callId });
                return;
              }
              // Mark as executed before making the call
              executedToolCallsRef.current.add(callId);
              // Cleanup old call IDs after 60 seconds to prevent memory leak
              setTimeout(() => executedToolCallsRef.current.delete(callId), 60000);

              console.log(`[Realtime] Tool call detected: ${toolName}`, { callId, toolArgs });
              logEvent('realtime.tool.call_detected', { toolName, callId });

              // Increment tool iteration counter
              toolIterationCountRef.current += 1;
              const currentIteration = toolIterationCountRef.current;

              // Check if we've exceeded the tool iteration limit
              if (currentIteration > MAX_TOOL_ITERATIONS) {
                console.warn(`[Realtime] Tool iteration limit exceeded (${currentIteration}/${MAX_TOOL_ITERATIONS}), skipping tool: ${toolName}`);
                logEvent('realtime.tool.iteration_limit_exceeded', { toolName, callId, iteration: currentIteration });

                // Send a "limit reached" response back to the model instead of executing the tool
                const limitPayload = {
                  type: 'conversation.item.create',
                  item: {
                    type: 'function_call_output',
                    call_id: callId,
                    output: JSON.stringify({ 
                      error: 'Tool call limit reached for this request. Please summarize the information you have gathered so far.',
                      limit: MAX_TOOL_ITERATIONS,
                      iteration: currentIteration
                    }),
                  },
                };

                if (channel.readyState === 'open') {
                  channel.send(JSON.stringify(limitPayload));
                  channel.send(JSON.stringify({ type: 'response.create' }));
                }
                return;
              }

              try {
                // Execute the tool via backend API
                const result = await executeRealtimeTool(toolName, toolArgs, callId);

                // Send the result back to the Realtime session
                // Format: conversation.item.create with type=function_call_output
                const outputPayload = {
                  type: 'conversation.item.create',
                  item: {
                    type: 'function_call_output',
                    call_id: callId,
                    output: JSON.stringify(result?.data || result || { status: 'success' }),
                  },
                };

                if (channel.readyState === 'open') {
                  channel.send(JSON.stringify(outputPayload));
                  console.log(`[Realtime] Sent tool result for ${toolName} (iteration ${currentIteration}/${MAX_TOOL_ITERATIONS})`);
                  logEvent('realtime.tool.result_sent', { toolName, callId, success: true, iteration: currentIteration });

                  // Request the model to continue generating a response
                  const continuePayload = { type: 'response.create' };
                  channel.send(JSON.stringify(continuePayload));
                } else {
                  console.warn('[Realtime] Cannot send tool result - channel not open');
                  logEvent('realtime.tool.result_failed', { toolName, callId, reason: 'channel_closed' });
                }
              } catch (toolError) {
                console.error(`[Realtime] Tool execution failed: ${toolName}`, toolError);
                logEvent('realtime.tool.error', { toolName, callId, error: toolError?.message });

                // Send error result back to the model
                const errorPayload = {
                  type: 'conversation.item.create',
                  item: {
                    type: 'function_call_output',
                    call_id: callId,
                    output: JSON.stringify({ error: toolError?.message || 'Tool execution failed' }),
                  },
                };

                if (channel.readyState === 'open') {
                  channel.send(JSON.stringify(errorPayload));
                  channel.send(JSON.stringify({ type: 'response.create' }));
                }
              }
            }
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

      console.log('[useRealtimeAiSHA] Calling OpenAI realtime API:', REALTIME_CALL_URL);
      console.log('[useRealtimeAiSHA] Ephemeral key length:', ephemeralKey?.length, 'starts with:', ephemeralKey?.substring(0, 20));
      console.log('[useRealtimeAiSHA] SDP offer length:', offer.sdp?.length);

      // Use original fetch to bypass the backoff wrapper which adds credentials: include
      // Cross-origin requests to OpenAI should NOT include credentials
      const nativeFetch = window.__originalFetch || window.fetch;
      
      let answerResponse;
      try {
        answerResponse = await nativeFetch(REALTIME_CALL_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${ephemeralKey}`,
            'Content-Type': 'application/sdp',
          },
          body: offer.sdp,
          credentials: 'omit', // Explicitly omit credentials for cross-origin
          mode: 'cors',
        });
        console.log('[useRealtimeAiSHA] OpenAI response status:', answerResponse.status, answerResponse.statusText);
      } catch (fetchError) {
        console.error('[useRealtimeAiSHA] OpenAI fetch error:', fetchError.message, fetchError);
        throw fetchError;
      }

      if (!answerResponse.ok) {
        const errText = await answerResponse.text().catch(() => 'no body');
        console.error('[useRealtimeAiSHA] OpenAI API error:', answerResponse.status, errText);
        throw Object.assign(new Error('Failed to start realtime session.'), { stage: 'connection_failed' });
      }

      const answerSdp = await answerResponse.text();
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

      // Set PTT mode flag - this controls whether auto-unmute happens after AI speaks
      pttModeRef.current = startMuted;

      // If startMuted option was passed, mute the mic immediately after connection
      // This is used for PTT mode where user must hold button to speak
      if (startMuted) {
        setMicMuted(true);
        logEvent('realtime.session.connected', { startMuted: true, pttMode: true });
        console.info('[Realtime] Session connected with mic MUTED (PTT mode)');
      } else {
        logEvent('realtime.session.connected', { startMuted: false, pttMode: false });
        console.info('[Realtime] Session connected with mic UNMUTED (continuous mode)');
      }

      setState((prev) => ({
        ...prev,
        isInitializing: false,
        isConnected: true,
        error: null,
        errorDetails: null,
      }));
      updateConnectionState('connected', 'answer_received');
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
  }, [applyErrorState, cleanup, clearErrorState, emitEvent, ensureAudioElement, logEvent, logTelemetryMetric, setMicMuted, state.isSupported, updateConnectionState]);

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

  /**
   * Trigger the AI to speak a greeting without user input.
   * Used for wake word activation to acknowledge "Hey Aisha".
   */
  const triggerGreeting = useCallback(() => {
    if (!dcRef.current || dcRef.current.readyState !== 'open') {
      logEvent('realtime.greeting.rejected', { reason: 'channel_not_ready' }, 'warn');
      return false;
    }
    // Send a system-level hint to trigger a greeting response
    // We inject a user message that prompts a short greeting, then trigger response
    const greetingPrompt = {
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: '[SYSTEM: User just said your wake word. Greet them briefly and ask how you can help. Keep it short and friendly, like "Hi! How can I help you today?"]',
          },
        ],
      },
    };
    dcRef.current.send(JSON.stringify(greetingPrompt));
    dcRef.current.send(JSON.stringify({ type: 'response.create' }));
    logEvent('realtime.greeting.triggered', {});
    logTelemetryMetric('greeting_triggered', {});
    return true;
  }, [logEvent, logTelemetryMetric]);

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
      isConnecting: state.isInitializing,
      isConnected: state.isConnected,
      isListening: state.isListening,
      isSpeaking: state.isSpeaking, // AI is currently speaking (mic auto-muted)
      isLive: Boolean(state.isConnected && state.isListening),
      error: state.error,
      errorDetails: state.errorDetails,
    }),
    [state],
  );

  // PTT (Push-to-Talk) controls for Realtime mode
  const muteMic = useCallback(() => setMicMuted(true), [setMicMuted]);
  const unmuteMic = useCallback(() => setMicMuted(false), [setMicMuted]);

  return {
    ...status,
    messages: messageLog,
    connectRealtime,
    startSession: connectRealtime,
    sendUserMessage,
    triggerGreeting,
    disconnectRealtime,
    stopSession: disconnectRealtime,
    // PTT controls
    muteMic,
    unmuteMic,
  };
}

export const __testing__ = {
  extractAssistantMessage,
  flattenRealtimeContent,
};
