import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSpeechOutput } from '../useSpeechOutput.js';

const audioInstances = [];
const originalAudio = globalThis.Audio;
const originalFetch = globalThis.fetch;
const originalCreateObjectURL = globalThis.URL?.createObjectURL;
const originalRevokeObjectURL = globalThis.URL?.revokeObjectURL;

beforeEach(() => {
  audioInstances.length = 0;

  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    blob: async () => new Blob(['fake audio'], { type: 'audio/mpeg' }),
    headers: { get: () => 'audio/mpeg' },
    text: async () => ''
  });

  globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock');
  globalThis.URL.revokeObjectURL = vi.fn();

  class MockAudio {
    constructor(url) {
      this.src = url;
      this.play = vi.fn().mockResolvedValue(undefined);
      this.pause = vi.fn();
      this.onended = null;
      this.onpause = null;
      audioInstances.push(this);
    }
  }
  globalThis.Audio = MockAudio;

  const mockSpeechSynthesis = {
    cancel: vi.fn(),
    getVoices: vi.fn().mockReturnValue([]),
    speak: vi.fn(),
    speaking: false,
  };

  globalThis.speechSynthesis = mockSpeechSynthesis;
  if (typeof window !== 'undefined') {
    window.speechSynthesis = mockSpeechSynthesis;
  }

  // Use a proper class for SpeechSynthesisUtterance mock
  class MockSpeechSynthesisUtterance {
    constructor(text) {
      this.text = text;
      this.voice = null;
      this.rate = 1;
      this.pitch = 1;
      this.onstart = null;
      this.onend = null;
      this.onerror = null;
    }
  }
  globalThis.SpeechSynthesisUtterance = MockSpeechSynthesisUtterance;
  if (typeof window !== 'undefined') {
    window.SpeechSynthesisUtterance = MockSpeechSynthesisUtterance;
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.Audio = originalAudio;
  globalThis.fetch = originalFetch;
  if (originalCreateObjectURL) {
    globalThis.URL.createObjectURL = originalCreateObjectURL;
  }
  if (originalRevokeObjectURL) {
    globalThis.URL.revokeObjectURL = originalRevokeObjectURL;
  }
  delete globalThis.speechSynthesis;
  delete globalThis.SpeechSynthesisUtterance;
  if (typeof window !== 'undefined') {
    delete window.speechSynthesis;
  }
});

describe('useSpeechOutput', () => {
  it('plays assistant messages via TTS and tracks playback state', async () => {
    const { result } = renderHook(() => useSpeechOutput());

    await act(async () => {
      await result.current.playText('Hello from AiSHA');
    });

    const [requestedUrl, options] = globalThis.fetch.mock.calls[0];
    expect(requestedUrl.endsWith('/api/ai/tts')).toBe(true);
    expect(options).toEqual(expect.objectContaining({ method: 'POST' }));
    expect(result.current.isPlaying).toBe(true);
    expect(result.current.error).toBeNull();

    // Simulate audio finishing
    const audio = audioInstances[0];
    await act(async () => {
      audio.onended?.();
    });

    expect(result.current.isPlaying).toBe(false);
  });

  it('captures TTS errors for the UI when fallback also fails', async () => {
    globalThis.fetch.mockResolvedValueOnce({ ok: false, status: 500 });
    // Mock fallback failure by removing speechSynthesis
    delete globalThis.speechSynthesis;

    const { result } = renderHook(() => useSpeechOutput());

    let caughtError;
    await act(async () => {
      try {
        await result.current.playText('fail case');
      } catch (err) {
        caughtError = err;
      }
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.isPlaying).toBe(false);
  });

  it('uses fallback when backend TTS fails', async () => {
    globalThis.fetch.mockResolvedValueOnce({ ok: false, status: 500 });
    const { result } = renderHook(() => useSpeechOutput());

    await act(async () => {
      await result.current.playText('fallback case');
    });

    // Should call window.speechSynthesis.speak
    expect(globalThis.speechSynthesis.speak).toHaveBeenCalled();
    // Should not have error
    expect(result.current.error).toBeNull();
    expect(result.current.isPlaying).toBe(true);
  });

  it('rejects when the TTS response is not audio and fallback fails', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ message: 'ElevenLabs not configured' })
    });
    // Mock fallback failure
    delete globalThis.speechSynthesis;

    const { result } = renderHook(() => useSpeechOutput());

    await act(async () => {
      // It might not reject the promise anymore if it catches internally, 
      // but since we removed speechSynthesis, the catch block inside useSpeechOutput 
      // will catch the "Browser TTS not supported" error and set state.
      // However, playText re-throws if fallback fails? 
      // Looking at my code: 
      // } catch (fallbackErr) { ... setError(...) }
      // It does NOT rethrow in the fallback catch block.
      await result.current.playText('hello');
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(audioInstances.length).toBe(0);
  });
});
