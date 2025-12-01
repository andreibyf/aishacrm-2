import { useCallback, useEffect, useRef, useState } from 'react';
import { resolveApiUrl } from '@/utils/resolveApiUrl.js';

const revokeIfBlobUrl = (url) => {
  if (url && url.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      /* ignore revoke errors */
    }
  }
};

export function useSpeechOutput({ onEnded } = {}) {
  const audioRef = useRef(null);
  const urlRef = useRef(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState(null);

  const stopPlayback = useCallback(() => {
    if (audioRef.current) {
      try {
        audioRef.current.pause();
      } catch {
        /* pause best-effort */
      }
      audioRef.current = null;
    }
    if (urlRef.current) {
      revokeIfBlobUrl(urlRef.current);
      urlRef.current = null;
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setIsPlaying(false);
  }, []);

  useEffect(() => () => {
    stopPlayback();
  }, [stopPlayback]);

  const playBrowserTTS = useCallback((text) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      throw new Error('Browser TTS not supported');
    }

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);

    // Attempt to select a decent voice
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v => v.name.includes('Google US English')) ||
      voices.find(v => v.lang === 'en-US') ||
      voices[0];

    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    utterance.onstart = () => {
      setIsPlaying(true);
      setIsLoading(false);
    };

    utterance.onend = () => {
      setIsPlaying(false);
      onEnded?.();
    };

    utterance.onerror = (e) => {
      console.warn('Browser TTS error:', e);
      setIsPlaying(false);
      setIsLoading(false);
      setError(new Error('Browser TTS failed'));
    };

    window.speechSynthesis.speak(utterance);
    // Fallback for onstart not firing on some browsers immediately
    setIsPlaying(true);
  }, [onEnded]);

  const playText = useCallback(async (text) => {
    const payload = (text || '').toString();
    if (!payload.trim()) return;

    stopPlayback();
    setError(null);
    setIsLoading(true);
    setIsPlaying(false);

    try {
      const resp = await fetch(resolveApiUrl('/api/ai/tts'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: payload.slice(0, 4000) })
      });

      if (!resp.ok) {
        // If backend fails (e.g. 503 not configured), throw to trigger fallback
        throw new Error(`TTS failed: ${resp.status}`);
      }

      const contentTypeGetter = resp.headers && typeof resp.headers.get === 'function'
        ? resp.headers.get('content-type')
        : resp.headers?.['content-type'];
      const contentType = (contentTypeGetter || '').toString().toLowerCase();

      if (!contentType.startsWith('audio/')) {
        throw new Error('TTS response missing audio payload');
      }

      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      urlRef.current = url;

      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onended = () => {
        setIsPlaying(false);
        stopPlayback();
        onEnded?.();
      };
      audio.onpause = () => {
        setIsPlaying(false);
      };
      audio.onerror = () => {
        // If audio playback fails, try fallback
        console.warn('Audio element playback error, trying fallback');
        playBrowserTTS(payload);
      };

      await audio.play();
      setIsPlaying(true);
    } catch (err) {
      console.warn('Backend TTS failed, switching to browser fallback:', err);
      try {
        playBrowserTTS(payload);
      } catch (fallbackErr) {
        stopPlayback();
        setError(fallbackErr instanceof Error ? fallbackErr : new Error('Unable to play audio'));
        setIsLoading(false);
      }
    } finally {
      // If we are using browser TTS, isLoading is handled in playBrowserTTS
      // If we successfully started audio.play(), isLoading is handled there too? 
      // Actually audio.play() is awaited, so we can set loading false here if it succeeded.
      // But if we switched to fallback, playBrowserTTS handles it.
      // Let's just ensure we don't leave it loading if we errored out completely.
      if (!window.speechSynthesis?.speaking && !audioRef.current) {
        // safety check
      }
    }
  }, [stopPlayback, playBrowserTTS, onEnded]);

  return {
    playText,
    stopPlayback,
    isLoading,
    isPlaying,
    error
  };
}
