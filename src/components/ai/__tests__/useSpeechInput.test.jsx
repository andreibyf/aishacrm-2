/* eslint-disable no-undef */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSpeechInput } from '../useSpeechInput.js';

describe('useSpeechInput', () => {
  it('injects transcript and fires onFinalTranscript callback after STT response', async () => {
    const blob = new Blob(['dummy'], { type: 'audio/webm' });
    const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] });
    global.navigator.mediaDevices = { getUserMedia };

    // Mock MediaRecorder
    class MockRecorder {
      constructor() {
        this.state = 'inactive';
      }
      start() { this.state = 'recording'; setTimeout(() => this.onstop && this.onstop(), 0); }
      stop() { this.state = 'inactive'; }
      ondataavailable() {}
      onstop() {}
    }
    // Provide a chunk
    vi.stubGlobal('MediaRecorder', class extends MockRecorder {
      start() { this.ondataavailable && this.ondataavailable({ data: blob }); super.start(); }
    });

    // Mock fetch STT
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ text: 'Hello world' }) });

    const onFinalTranscript = vi.fn();
    const { result } = renderHook(() => useSpeechInput({ onFinalTranscript }));
    await act(async () => { await result.current.startRecording(); });
    await act(async () => { await result.current.stopRecording(); });

    // Wait a tick for STT
    await new Promise((r) => setTimeout(r, 10));
    expect(onFinalTranscript).toHaveBeenCalledWith('Hello world');
    expect(result.current.transcript).toBe('Hello world');
  });
});
