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

export function useSpeechOutput() {
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
    setIsPlaying(false);
  }, []);

  useEffect(() => () => {
    stopPlayback();
  }, [stopPlayback]);

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
        const message = `TTS failed: ${resp.status}`;
        throw new Error(message);
      }

      const contentTypeGetter = resp.headers && typeof resp.headers.get === 'function'
        ? resp.headers.get('content-type')
        : resp.headers?.['content-type'];
      const contentType = (contentTypeGetter || '').toString().toLowerCase();

      if (!contentType.startsWith('audio/')) {
        const fallbackText = await resp.text().catch(() => '');
        let errorMessage = fallbackText?.trim() || 'TTS response missing audio payload';
        try {
          const parsed = JSON.parse(fallbackText);
          errorMessage = parsed?.message || errorMessage;
        } catch {
          // ignore JSON parse errors
        }
        throw new Error(errorMessage || 'TTS response missing audio payload');
      }

      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      urlRef.current = url;

      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onended = () => {
        setIsPlaying(false);
        stopPlayback();
      };
      audio.onpause = () => {
        setIsPlaying(false);
      };

      await audio.play();
      setIsPlaying(true);
    } catch (err) {
      stopPlayback();
      setError(err instanceof Error ? err : new Error('Unable to play audio'));
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [stopPlayback]);

  return {
    playText,
    stopPlayback,
    isLoading,
    isPlaying,
    error
  };
}
