// src/__tests__/ai/useVoiceInteraction.test.jsx
//
// NOTE:
// This suite tests the unified voice interaction hook with mocked dependencies.
// We avoid direct media/network calls to prevent jsdom crashes.
// Tests focus on state transitions and hook shape verification.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVoiceInteraction } from '../../hooks/useVoiceInteraction.js';

// Mock dependencies to avoid touching real media / network
vi.mock('@/components/ai/useSpeechInput.js', () => ({
  useSpeechInput: vi.fn(() => ({
    transcript: '',
    isRecording: false,
    isTranscribing: false,
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
    error: null,
  })),
}));

vi.mock('@/components/ai/useSpeechOutput.js', () => ({
  useSpeechOutput: vi.fn(() => ({
    isLoading: false,
    isPlaying: false,
    playText: vi.fn(),
    stopPlayback: vi.fn(),
    error: null,
  })),
}));

vi.mock('@/hooks/useRealtimeAiSHA.js', () => ({
  useRealtimeAiSHA: vi.fn(() => ({
    isConnected: false,
    isListening: false,
    error: null,
    connectRealtime: vi.fn(),
    disconnectRealtime: vi.fn(),
    sendUserMessage: vi.fn(),
  })),
}));

describe('useVoiceInteraction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns idle mode by default', () => {
    const { result } = renderHook(() => useVoiceInteraction());

    expect(result.current.mode).toBe('idle');
    expect(result.current.isListening).toBe(false);
    expect(result.current.isSpeaking).toBe(false);
    expect(result.current.isVoiceModeActive).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('allows changing mode via setMode', () => {
    const { result } = renderHook(() => useVoiceInteraction());

    act(() => {
      result.current.setMode('continuous');
    });

    expect(result.current.mode).toBe('continuous');
    expect(result.current.isVoiceModeActive).toBe(true);
  });

  it('rejects invalid modes', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(() => useVoiceInteraction());

    act(() => {
      result.current.setMode('invalid_mode');
    });

    expect(result.current.mode).toBe('idle');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid mode'));
    warnSpy.mockRestore();
  });

  it('exposes startContinuous/stopContinuous handlers', () => {
    const { result } = renderHook(() => useVoiceInteraction());

    expect(typeof result.current.startContinuous).toBe('function');
    expect(typeof result.current.stopContinuous).toBe('function');
  });

  it('exposes startPushToTalk/stopPushToTalk handlers', () => {
    const { result } = renderHook(() => useVoiceInteraction());

    expect(typeof result.current.startPushToTalk).toBe('function');
    expect(typeof result.current.stopPushToTalk).toBe('function');
  });

  it('startContinuous sets mode to continuous', () => {
    const { result } = renderHook(() => useVoiceInteraction());

    act(() => {
      result.current.startContinuous();
    });

    expect(result.current.mode).toBe('continuous');
  });

  it('stopContinuous sets mode to idle', () => {
    const { result } = renderHook(() => useVoiceInteraction());

    act(() => {
      result.current.startContinuous();
    });
    expect(result.current.mode).toBe('continuous');

    act(() => {
      result.current.stopContinuous();
    });
    expect(result.current.mode).toBe('idle');
  });

  it('startPushToTalk sets mode to push_to_talk', () => {
    const { result } = renderHook(() => useVoiceInteraction());

    act(() => {
      result.current.startPushToTalk();
    });

    expect(result.current.mode).toBe('push_to_talk');
  });

  it('reset clears all state', () => {
    const { result } = renderHook(() => useVoiceInteraction());

    act(() => {
      result.current.startContinuous();
    });
    expect(result.current.mode).toBe('continuous');

    act(() => {
      result.current.reset();
    });

    expect(result.current.mode).toBe('idle');
    expect(result.current.lastTranscript).toBe('');
  });

  it('exposes sendTextMessage function', async () => {
    const { result } = renderHook(() => useVoiceInteraction());

    let response;
    await act(async () => {
      response = await result.current.sendTextMessage('hello');
    });

    expect(response).toEqual({
      text: 'hello',
      metadata: expect.objectContaining({ origin: 'voice' }),
    });
  });

  it('sendTextMessage returns null for empty text', async () => {
    const { result } = renderHook(() => useVoiceInteraction());

    let response;
    await act(async () => {
      response = await result.current.sendTextMessage('   ');
    });

    expect(response).toBeNull();
  });

  it('exposes playSpeech and stopSpeech controls', () => {
    const { result } = renderHook(() => useVoiceInteraction());

    expect(typeof result.current.playSpeech).toBe('function');
    expect(typeof result.current.stopSpeech).toBe('function');
  });
});
