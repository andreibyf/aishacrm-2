// src/hooks/useWakeWordDetection.js
//
// Wake word detection using Web Speech API (SpeechRecognition)
// Listens for wake words to activate voice interaction and end phrases to deactivate.
//
// Usage:
//   const { isAwake, status, error } = useWakeWordDetection({
//     enabled: true,
//     onWakeDetected: () => enableRealtime(),
//     onEndDetected: () => disableRealtime(),
//   });
//
// Status values:
//   - 'idle': Not listening (disabled or no permission)
//   - 'listening': Waiting for wake word
//   - 'awake': Wake word detected, conversation active
//   - 'ending': End phrase detected, transitioning back to listening

import { useCallback, useEffect, useRef, useState } from 'react';

// Wake words - case insensitive matching
const WAKE_WORDS = [
  'aisha',
  'hey aisha',
  'hi aisha',
  'ai sha',
  'a sha',
  'isha',    // Common mishearing
  'alisha',  // Common mishearing
  'ayesha',  // Alternate spelling
];

// End phrases - case insensitive matching
const END_PHRASES = [
  'thanks',
  'thank you',
  'thanks aisha',
  'thank you aisha',
  'goodbye',
  'bye',
  'bye aisha',
  "that's all",
  "that is all",
  'done',
  "i'm done",
  'stop listening',
  'go to sleep',
  'sleep',
  'dismiss',
];

// Cooldown after wake to avoid immediate false-positive end detection
const WAKE_COOLDOWN_MS = 2000;

// Auto-sleep timeout (return to listening after silence)
const AUTO_SLEEP_TIMEOUT_MS = 30000;

/**
 * Check if text contains any wake word
 */
const containsWakeWord = (text) => {
  if (!text) return false;
  const normalized = text.toLowerCase().trim();
  return WAKE_WORDS.some((word) => normalized.includes(word));
};

/**
 * Check if text contains any end phrase
 */
const containsEndPhrase = (text) => {
  if (!text) return false;
  const normalized = text.toLowerCase().trim();
  return END_PHRASES.some((phrase) => normalized.includes(phrase));
};

/**
 * Get SpeechRecognition constructor (with vendor prefix fallback)
 */
const getSpeechRecognition = () => {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
};

/**
 * Wake word detection hook
 * 
 * @param {Object} options
 * @param {boolean} [options.enabled=false] - Enable/disable wake word detection
 * @param {Function} [options.onWakeDetected] - Called when wake word is detected
 * @param {Function} [options.onEndDetected] - Called when end phrase is detected
 * @param {Function} [options.onTranscript] - Called with each transcript (for debugging)
 * @param {number} [options.autoSleepMs=30000] - Auto-sleep timeout after silence
 * @returns {{ isAwake: boolean, status: string, error: Error|null, forceWake: Function, forceSleep: Function }}
 */
export function useWakeWordDetection(options = {}) {
  const {
    enabled = false,
    onWakeDetected,
    onEndDetected,
    onTranscript,
    autoSleepMs = AUTO_SLEEP_TIMEOUT_MS,
  } = options;

  const [status, setStatus] = useState('idle'); // 'idle' | 'listening' | 'awake' | 'ending'
  const [error, setError] = useState(null);
  const [lastTranscript, setLastTranscript] = useState('');

  const recognitionRef = useRef(null);
  const isAwakeRef = useRef(false);
  const wakeCooldownRef = useRef(null);
  const autoSleepTimerRef = useRef(null);
  const enabledRef = useRef(enabled);

  // Keep enabled ref in sync
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  // Callback refs to avoid stale closures
  const onWakeDetectedRef = useRef(onWakeDetected);
  const onEndDetectedRef = useRef(onEndDetected);
  const onTranscriptRef = useRef(onTranscript);

  useEffect(() => { onWakeDetectedRef.current = onWakeDetected; }, [onWakeDetected]);
  useEffect(() => { onEndDetectedRef.current = onEndDetected; }, [onEndDetected]);
  useEffect(() => { onTranscriptRef.current = onTranscript; }, [onTranscript]);

  // Reset auto-sleep timer
  const resetAutoSleepTimer = useCallback(() => {
    if (autoSleepTimerRef.current) {
      clearTimeout(autoSleepTimerRef.current);
    }
    if (isAwakeRef.current && autoSleepMs > 0) {
      autoSleepTimerRef.current = setTimeout(() => {
        console.log('[WakeWord] Auto-sleep triggered after silence');
        isAwakeRef.current = false;
        setStatus('listening');
        onEndDetectedRef.current?.();
      }, autoSleepMs);
    }
  }, [autoSleepMs]);

  // Handle wake detection
  const handleWake = useCallback(() => {
    if (isAwakeRef.current) return; // Already awake

    console.log('[WakeWord] Wake word detected!');
    isAwakeRef.current = true;
    setStatus('awake');

    // Set cooldown to prevent immediate end detection
    wakeCooldownRef.current = Date.now() + WAKE_COOLDOWN_MS;

    // Start auto-sleep timer
    resetAutoSleepTimer();

    // Notify parent
    onWakeDetectedRef.current?.();
  }, [resetAutoSleepTimer]);

  // Handle end detection
  const handleEnd = useCallback(() => {
    // Check cooldown
    if (wakeCooldownRef.current && Date.now() < wakeCooldownRef.current) {
      console.log('[WakeWord] End phrase ignored (within cooldown)');
      return;
    }

    if (!isAwakeRef.current) return; // Not awake

    console.log('[WakeWord] End phrase detected!');
    isAwakeRef.current = false;
    setStatus('ending');

    // Clear auto-sleep timer
    if (autoSleepTimerRef.current) {
      clearTimeout(autoSleepTimerRef.current);
    }

    // Short delay then return to listening
    setTimeout(() => {
      if (enabledRef.current) {
        setStatus('listening');
      }
    }, 500);

    // Notify parent
    onEndDetectedRef.current?.();
  }, []);

  // Force wake (for programmatic activation)
  const forceWake = useCallback(() => {
    handleWake();
  }, [handleWake]);

  // Force sleep (for programmatic deactivation)
  const forceSleep = useCallback(() => {
    handleEnd();
  }, [handleEnd]);

  // Initialize Speech Recognition
  useEffect(() => {
    const SpeechRecognition = getSpeechRecognition();

    if (!enabled) {
      // Cleanup if disabled
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // Ignore abort errors
        }
        recognitionRef.current = null;
      }
      setStatus('idle');
      isAwakeRef.current = false;
      return;
    }

    if (!SpeechRecognition) {
      setError(new Error('Speech recognition not supported in this browser'));
      setStatus('idle');
      return;
    }

    // Create recognition instance
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 3; // Get multiple interpretations for better matching

    recognition.onstart = () => {
      console.log('[WakeWord] Speech recognition started');
      setError(null);
      if (!isAwakeRef.current) {
        setStatus('listening');
      }
    };

    recognition.onresult = (event) => {
      // Process all results (including interim)
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        
        // Check all alternatives for better matching
        for (let j = 0; j < result.length; j++) {
          const transcript = result[j].transcript;
          
          setLastTranscript(transcript);
          onTranscriptRef.current?.(transcript, result.isFinal);

          if (!isAwakeRef.current) {
            // Looking for wake word
            if (containsWakeWord(transcript)) {
              handleWake();
              break;
            }
          } else {
            // Looking for end phrase (only on final results to avoid false positives)
            if (result.isFinal && containsEndPhrase(transcript)) {
              handleEnd();
              break;
            }
            // Reset auto-sleep timer on any speech
            if (result.isFinal) {
              resetAutoSleepTimer();
            }
          }
        }
      }
    };

    recognition.onerror = (event) => {
      console.warn('[WakeWord] Speech recognition error:', event.error);
      
      // Handle different error types
      switch (event.error) {
        case 'not-allowed':
        case 'service-not-allowed':
          setError(new Error('Microphone access denied. Please allow microphone access for wake word detection.'));
          setStatus('idle');
          break;
        case 'no-speech':
          // Not an error, just no speech detected - restart
          break;
        case 'audio-capture':
          setError(new Error('No microphone detected. Please connect a microphone.'));
          setStatus('idle');
          break;
        case 'network':
          setError(new Error('Network error. Speech recognition requires internet.'));
          // Try to restart
          break;
        case 'aborted':
          // Intentionally aborted, ignore
          break;
        default:
          setError(new Error(`Speech recognition error: ${event.error}`));
      }
    };

    recognition.onend = () => {
      console.log('[WakeWord] Speech recognition ended');
      
      // Auto-restart if still enabled (continuous listening)
      if (enabledRef.current) {
        try {
          setTimeout(() => {
            if (enabledRef.current && recognitionRef.current) {
              console.log('[WakeWord] Restarting speech recognition...');
              recognitionRef.current.start();
            }
          }, 100);
        } catch (err) {
          console.warn('[WakeWord] Failed to restart:', err);
        }
      }
    };

    recognitionRef.current = recognition;

    // Start listening
    try {
      recognition.start();
    } catch (err) {
      console.error('[WakeWord] Failed to start speech recognition:', err);
      setError(err);
    }

    // Cleanup
    return () => {
      if (autoSleepTimerRef.current) {
        clearTimeout(autoSleepTimerRef.current);
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // Ignore
        }
        recognitionRef.current = null;
      }
    };
  }, [enabled, handleWake, handleEnd, resetAutoSleepTimer]);

  return {
    isAwake: status === 'awake',
    status,
    error,
    lastTranscript,
    forceWake,
    forceSleep,
  };
}

export { WAKE_WORDS, END_PHRASES };
