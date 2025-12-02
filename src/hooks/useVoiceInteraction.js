// src/hooks/useVoiceInteraction.js
//
// PH2-VOICE-001 – Unified voice interaction hook
//
// Coordinates STT (useSpeechInput), TTS (useSpeechOutput), and realtime session
// state (useRealtimeAiSHA) behind a single API for AiSidebar consumption.
//
// Voice modes:
//   - 'idle': No voice interaction active
//   - 'continuous': Auto-listen after TTS ends (hands-free Bluetooth mode)
//   - 'push_to_talk': Listen only while Space (or configured key) is held
//
// Safety: All voice transcripts pass through the same pipeline as text messages,
// including destructive-phrase guards enforced in AiSidebar. This hook does NOT
// bypass any safety checks.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSpeechInput } from '@/components/ai/useSpeechInput.js';
import { useSpeechOutput } from '@/components/ai/useSpeechOutput.js';
import { useRealtimeAiSHA } from '@/hooks/useRealtimeAiSHA.js';

/**
 * @typedef {'idle' | 'continuous' | 'push_to_talk'} VoiceMode
 */

/**
 * @typedef {Object} VoiceInteractionState
 * @property {VoiceMode} mode - Current voice mode
 * @property {boolean} isListening - Mic is actively capturing
 * @property {boolean} isTranscribing - STT is processing audio
 * @property {boolean} isSpeaking - TTS is playing audio
 * @property {string} lastTranscript - Most recent STT result
 * @property {Error|null} error - Combined error from STT/TTS/realtime
 */

/**
 * Unified voice interaction hook.
 *
 * @param {Object} options
 * @param {Function} [options.onTranscript] - Called when STT produces a final transcript
 * @param {Function} [options.onSpeechEnd] - Called when TTS playback ends
 * @param {boolean} [options.autoSpeakResponses=true] - Auto-speak AI responses in voice modes
 * @returns {VoiceInteractionState & VoiceInteractionActions}
 */
export function useVoiceInteraction(options = {}) {
  const {
    onTranscript,
    onSpeechEnd,
    autoSpeakResponses = true,
  } = options;

  // ─────────────────────────────────────────────────────────────────────────
  // Voice mode state
  // ─────────────────────────────────────────────────────────────────────────
  const [mode, setModeInternal] = useState('idle');
  const [lastTranscript, setLastTranscript] = useState('');
  const modeRef = useRef(mode);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // ─────────────────────────────────────────────────────────────────────────
  // Callback refs to avoid stale closures
  // ─────────────────────────────────────────────────────────────────────────
  const onTranscriptRef = useRef(onTranscript);
  const onSpeechEndRef = useRef(onSpeechEnd);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    onSpeechEndRef.current = onSpeechEnd;
  }, [onSpeechEnd]);

  // ─────────────────────────────────────────────────────────────────────────
  // TTS: Speech output hook
  // ─────────────────────────────────────────────────────────────────────────
  const handleSpeechEnded = useCallback(() => {
    // Notify parent
    if (typeof onSpeechEndRef.current === 'function') {
      onSpeechEndRef.current();
    }

    // In continuous mode, re-open mic after TTS finishes
    if (modeRef.current === 'continuous') {
      // Small delay for natural turn-taking
      setTimeout(() => {
        if (modeRef.current === 'continuous') {
          startRecordingRef.current?.();
        }
      }, 300);
    }
  }, []);

  const {
    playText: playSpeech,
    stopPlayback: stopSpeech,
    isLoading: isTTSLoading,
    isPlaying: isTTSPlaying,
    error: ttsError,
  } = useSpeechOutput({ onEnded: handleSpeechEnded });

  // ─────────────────────────────────────────────────────────────────────────
  // STT: Speech input hook
  // ─────────────────────────────────────────────────────────────────────────
  const handleFinalTranscript = useCallback((text) => {
    const safeText = (text || '').trim();
    if (!safeText) return;

    setLastTranscript(safeText);

    // Forward to parent callback (e.g., to send message)
    if (typeof onTranscriptRef.current === 'function') {
      onTranscriptRef.current(safeText);
    }
  }, []);

  const {
    isRecording,
    isTranscribing,
    error: sttError,
    startRecording,
    stopRecording,
  } = useSpeechInput({ onFinalTranscript: handleFinalTranscript });

  // Keep a ref to startRecording for the TTS ended callback
  const startRecordingRef = useRef(startRecording);
  useEffect(() => {
    startRecordingRef.current = startRecording;
  }, [startRecording]);

  // ─────────────────────────────────────────────────────────────────────────
  // Realtime session state (for status display; actual send is in AiSidebar)
  // ─────────────────────────────────────────────────────────────────────────
  const {
    isConnected: isRealtimeConnected,
    isListening: isRealtimeListening,
    error: realtimeError,
  } = useRealtimeAiSHA();

  // ─────────────────────────────────────────────────────────────────────────
  // Combined error state
  // ─────────────────────────────────────────────────────────────────────────
  const error = useMemo(() => {
    return sttError || ttsError || realtimeError || null;
  }, [sttError, ttsError, realtimeError]);

  // ─────────────────────────────────────────────────────────────────────────
  // Mode setters
  // ─────────────────────────────────────────────────────────────────────────
  const setMode = useCallback((nextMode) => {
    const validModes = ['idle', 'continuous', 'push_to_talk'];
    if (!validModes.includes(nextMode)) {
      console.warn(`[useVoiceInteraction] Invalid mode: ${nextMode}`);
      return;
    }

    // Stop any active recording when changing modes
    if (isRecording) {
      stopRecording();
    }

    // Stop TTS when switching to idle
    if (nextMode === 'idle') {
      stopSpeech();
    }

    setModeInternal(nextMode);
  }, [isRecording, stopRecording, stopSpeech]);

  // ─────────────────────────────────────────────────────────────────────────
  // Continuous mode controls
  // ─────────────────────────────────────────────────────────────────────────
  const startContinuous = useCallback(() => {
    setModeInternal('continuous');
    startRecording();
  }, [startRecording]);

  const stopContinuous = useCallback(() => {
    if (isRecording) {
      stopRecording();
    }
    stopSpeech();
    setModeInternal('idle');
  }, [isRecording, stopRecording, stopSpeech]);

  // ─────────────────────────────────────────────────────────────────────────
  // Push-to-talk controls
  // ─────────────────────────────────────────────────────────────────────────
  const startPushToTalk = useCallback(() => {
    if (modeRef.current !== 'push_to_talk') {
      setModeInternal('push_to_talk');
    }
    startRecording();
  }, [startRecording]);

  const stopPushToTalk = useCallback(() => {
    stopRecording();
    // Stay in PTT mode after release (user can press again)
  }, [stopRecording]);

  // ─────────────────────────────────────────────────────────────────────────
  // Text message helper (wraps existing send path)
  // This is provided for convenience but AiSidebar has its own sendMessage
  // ─────────────────────────────────────────────────────────────────────────
  const sendTextMessage = useCallback(async (text, opts = {}) => {
    // This is a passthrough stub; actual send is handled by AiSidebar's
    // sendMessage or sendViaRealtime. This just returns the structured input.
    const safeText = (text || '').trim();
    if (!safeText) return null;

    return {
      text: safeText,
      metadata: {
        origin: 'voice',
        ...opts,
      },
    };
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Reset all state
  // ─────────────────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    if (isRecording) {
      stopRecording();
    }
    stopSpeech();
    setModeInternal('idle');
    setLastTranscript('');
  }, [isRecording, stopRecording, stopSpeech]);

  // ─────────────────────────────────────────────────────────────────────────
  // Derived state
  // ─────────────────────────────────────────────────────────────────────────
  const isListening = isRecording || isRealtimeListening;
  const isSpeaking = isTTSPlaying || isTTSLoading;
  const isVoiceModeActive = mode !== 'idle';

  return {
    // State
    mode,
    isListening,
    isTranscribing,
    isSpeaking,
    lastTranscript,
    error,
    isVoiceModeActive,
    isRealtimeConnected,

    // TTS controls
    playSpeech,
    stopSpeech,
    autoSpeakResponses,

    // Mode controls
    setMode,
    startContinuous,
    stopContinuous,
    startPushToTalk,
    stopPushToTalk,

    // Recording controls (direct access if needed)
    startRecording,
    stopRecording,

    // Utilities
    sendTextMessage,
    reset,
  };
}
