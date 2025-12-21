import { useCallback, useEffect, useRef, useState } from 'react';
import { resolveApiUrl } from '@/utils/resolveApiUrl.js';

// Preferred MIME types for OpenAI Whisper compatibility (in order of preference)
const PREFERRED_MIME_TYPES = [
  'audio/webm;codecs=opus',  // Best quality, widely supported
  'audio/webm',              // Fallback webm
  'audio/mp4',               // Safari/iOS
  'audio/ogg;codecs=opus',   // Firefox
  'audio/wav',               // Uncompressed fallback
];

// Silence detection configuration
const SILENCE_THRESHOLD = 0.01;        // Audio level below this is considered silence
const SILENCE_DURATION_MS = 1500;      // How long silence must persist before ending utterance
const MIN_RECORDING_MS = 500;          // Minimum recording length to process
const AUDIO_CHECK_INTERVAL_MS = 100;   // How often to check audio levels

/**
 * Get the best supported MIME type for recording
 */
function getSupportedMimeType() {
  for (const mimeType of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType;
    }
  }
  return undefined;
}

/**
 * Get file extension from MIME type
 */
function getExtensionFromMime(mimeType) {
  if (!mimeType) return 'webm';
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'mp4';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('wav')) return 'wav';
  return 'webm';
}

/**
 * Continuous speech input hook with automatic silence detection.
 * When continuous mode is enabled, the mic stays open and automatically
 * detects speech pauses to send transcriptions.
 */
export function useSpeechInput(options = {}) {
  const { onFinalTranscript, continuousMode = false, pauseListening = false } = options;
  
  // Core state
  const [isListening, setIsListening] = useState(false);  // Overall listening session active
  const [isRecording, setIsRecording] = useState(false);  // Currently capturing audio
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState(null);
  
  // Refs for audio handling
  const mediaRecorderRef = useRef(null);
  const audioStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const chunksRef = useRef([]);
  const mimeTypeRef = useRef('audio/webm');
  const finalTranscriptRef = useRef(onFinalTranscript);
  const continuousModeRef = useRef(continuousMode);
  const pauseListeningRef = useRef(pauseListening);
  
  // Silence detection refs
  const silenceStartRef = useRef(null);
  const recordingStartRef = useRef(null);
  const silenceCheckIntervalRef = useRef(null);
  const hasSpokenRef = useRef(false);

  // Keep refs in sync with props
  useEffect(() => {
    finalTranscriptRef.current = onFinalTranscript;
  }, [onFinalTranscript]);
  
  useEffect(() => {
    continuousModeRef.current = continuousMode;
  }, [continuousMode]);
  
  useEffect(() => {
    pauseListeningRef.current = pauseListening;
  }, [pauseListening]);

  /**
   * Transcribe audio blob via backend STT
   */
  const transcribeAudio = useCallback(async (blob) => {
    const extension = getExtensionFromMime(mimeTypeRef.current);
    
    console.log('[useSpeechInput] Transcribing audio:', {
      mimeType: mimeTypeRef.current,
      extension,
      blobSize: blob.size,
    });
    
    if (blob.size < 1000) {
      console.warn('[useSpeechInput] Recording too short, skipping');
      return null;
    }
    
    setIsTranscribing(true);
    try {
      const form = new FormData();
      form.append('file', blob, `voice.${extension}`);
      const resp = await fetch(resolveApiUrl('/api/ai/speech-to-text'), {
        method: 'POST',
        body: form,
      });
      if (!resp.ok) {
        const errorData = await resp.json().catch(() => ({}));
        throw new Error(errorData.message || `STT failed: ${resp.status}`);
      }
      const data = await resp.json();
      return data?.text?.trim() || '';
    } catch (err) {
      console.error('[useSpeechInput] Transcription error:', err);
      setError(err);
      return null;
    } finally {
      setIsTranscribing(false);
    }
  }, []);

  /**
   * Process recorded audio and handle transcript
   */
  const processRecording = useCallback(async () => {
    if (chunksRef.current.length === 0) return;
    
    const actualMimeType = mediaRecorderRef.current?.mimeType || mimeTypeRef.current;
    const blob = new Blob(chunksRef.current, { type: actualMimeType });
    chunksRef.current = [];
    
    const text = await transcribeAudio(blob);
    
    if (text) {
      setTranscript(text);
      if (typeof finalTranscriptRef.current === 'function') {
        try {
          finalTranscriptRef.current(text);
        } catch (callbackError) {
          console.warn('[useSpeechInput] onFinalTranscript callback failed:', callbackError);
        }
      }
    }
  }, [transcribeAudio]);

  /**
   * Check audio levels for silence detection
   */
  const checkAudioLevel = useCallback(() => {
    if (!analyserRef.current || !isRecording) return;
    
    const dataArray = new Uint8Array(analyserRef.current.fftSize);
    analyserRef.current.getByteTimeDomainData(dataArray);
    
    // Calculate RMS (root mean square) for audio level
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const normalized = (dataArray[i] - 128) / 128;
      sum += normalized * normalized;
    }
    const rms = Math.sqrt(sum / dataArray.length);
    
    const now = Date.now();
    
    if (rms > SILENCE_THRESHOLD) {
      // Sound detected
      silenceStartRef.current = null;
      hasSpokenRef.current = true;
    } else if (hasSpokenRef.current) {
      // Silence after speech
      if (!silenceStartRef.current) {
        silenceStartRef.current = now;
      } else if (now - silenceStartRef.current >= SILENCE_DURATION_MS) {
        // Silence threshold reached - end this utterance
        const recordingDuration = now - (recordingStartRef.current || now);
        if (recordingDuration >= MIN_RECORDING_MS) {
          console.log('[useSpeechInput] Silence detected, processing utterance');
          
          // Stop current recording to process
          if (mediaRecorderRef.current?.state === 'recording') {
            mediaRecorderRef.current.stop();
          }
        }
        silenceStartRef.current = null;
        hasSpokenRef.current = false;
      }
    }
  }, [isRecording]);

  /**
   * Start a new recording segment (used internally for continuous mode)
   */
  const startRecordingSegment = useCallback(() => {
    if (!audioStreamRef.current || pauseListeningRef.current) return;
    
    const mimeType = getSupportedMimeType();
    mimeTypeRef.current = mimeType || 'audio/webm';
    
    const recorderOptions = mimeType ? { mimeType } : {};
    const recorder = new MediaRecorder(audioStreamRef.current, recorderOptions);
    
    chunksRef.current = [];
    hasSpokenRef.current = false;
    silenceStartRef.current = null;
    recordingStartRef.current = Date.now();
    
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };
    
    recorder.onstop = async () => {
      setIsRecording(false);
      
      // Process the recorded audio
      await processRecording();
      
      // If still in listening mode and continuous, start new segment
      if (isListening && continuousModeRef.current && !pauseListeningRef.current) {
        // Small delay before starting next segment
        setTimeout(() => {
          if (isListening && !pauseListeningRef.current) {
            startRecordingSegment();
          }
        }, 200);
      }
    };
    
    recorder.start(100); // Collect data every 100ms for smoother processing
    mediaRecorderRef.current = recorder;
    setIsRecording(true);
    
    console.log('[useSpeechInput] Recording segment started');
  }, [isListening, processRecording]);

  /**
   * Start listening session
   */
  const startListening = useCallback(async () => {
    try {
      setError(null);
      setTranscript('');
      
      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });
      audioStreamRef.current = stream;
      
      // Set up audio analysis for silence detection
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      
      setIsListening(true);
      
      // Start silence detection interval
      silenceCheckIntervalRef.current = setInterval(checkAudioLevel, AUDIO_CHECK_INTERVAL_MS);
      
      // Start first recording segment
      startRecordingSegment();
      
      console.log('[useSpeechInput] Listening session started', { continuousMode: continuousModeRef.current });
    } catch (err) {
      console.error('[useSpeechInput] Failed to start listening:', err);
      setError(err);
      setIsListening(false);
    }
  }, [checkAudioLevel, startRecordingSegment]);

  /**
   * Stop listening session completely
   */
  const stopListening = useCallback(() => {
    console.log('[useSpeechInput] Stopping listening session');
    
    // Clear silence detection
    if (silenceCheckIntervalRef.current) {
      clearInterval(silenceCheckIntervalRef.current);
      silenceCheckIntervalRef.current = null;
    }
    
    // Stop recorder
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    
    // Close audio context
    if (audioContextRef.current?.state !== 'closed') {
      audioContextRef.current?.close();
    }
    audioContextRef.current = null;
    analyserRef.current = null;
    
    // Release microphone
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => track.stop());
      audioStreamRef.current = null;
    }
    
    setIsListening(false);
    setIsRecording(false);
  }, []);

  /**
   * Toggle listening on/off
   */
  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  // Legacy API compatibility - startRecording/stopRecording map to listening session
  const startRecording = startListening;
  const stopRecording = stopListening;

  // Handle pause/resume based on pauseListening prop
  useEffect(() => {
    if (pauseListening && isRecording) {
      // Pause: stop current recording but keep listening session
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    } else if (!pauseListening && isListening && !isRecording && !isTranscribing) {
      // Resume: start new recording segment
      startRecordingSegment();
    }
  }, [pauseListening, isListening, isRecording, isTranscribing, startRecordingSegment]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (silenceCheckIntervalRef.current) {
        clearInterval(silenceCheckIntervalRef.current);
      }
      if (audioContextRef.current?.state !== 'closed') {
        audioContextRef.current?.close();
      }
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  return { 
    // State
    transcript, 
    isListening,      // New: overall session active
    isRecording,      // Currently capturing audio
    isTranscribing, 
    error, 
    
    // Actions
    startListening,   // New: start continuous session
    stopListening,    // New: stop continuous session
    toggleListening,  // New: toggle session
    
    // Legacy API (maps to listening session for compatibility)
    startRecording, 
    stopRecording 
  };
}
