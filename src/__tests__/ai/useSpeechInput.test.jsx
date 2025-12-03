/* eslint-disable no-undef */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSpeechInput } from '../../components/ai/useSpeechInput.js';

describe('useSpeechInput', () => {
  let originalAudioContext;
  
  beforeEach(() => {
    // Store original
    originalAudioContext = window.AudioContext;
    
    // Mock AudioContext for silence detection - must be a proper class
    class MockAudioContext {
      constructor() {
        this.state = 'running';
      }
      createMediaStreamSource() {
        return { connect: vi.fn() };
      }
      createAnalyser() {
        return {
          fftSize: 2048,
          getByteTimeDomainData: vi.fn((arr) => {
            // Fill with silence (128 = zero crossing)
            for (let i = 0; i < arr.length; i++) arr[i] = 128;
          }),
        };
      }
      close() {}
    }
    window.AudioContext = MockAudioContext;
  });
  
  afterEach(() => {
    window.AudioContext = originalAudioContext;
    vi.restoreAllMocks();
  });

  it('injects transcript and fires onFinalTranscript callback after STT response', async () => {
    // Create a blob large enough to pass the 1000 byte minimum check
    const dummyData = new Array(1500).fill('x').join('');
    const blob = new Blob([dummyData], { type: 'audio/webm' });
    const mockTrack = { stop: vi.fn() };
    const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [mockTrack] });
    global.navigator.mediaDevices = { getUserMedia };

    // Mock MediaRecorder
    class MockRecorder {
      constructor() {
        this.state = 'inactive';
        this.mimeType = 'audio/webm';
      }
      start() { 
        this.state = 'recording'; 
        // Simulate data available and stop after a tick
        setTimeout(() => {
          if (this.ondataavailable) this.ondataavailable({ data: blob });
          if (this.onstop) this.onstop();
        }, 5);
      }
      stop() { 
        this.state = 'inactive'; 
      }
      ondataavailable() {}
      onstop() {}
    }
    vi.stubGlobal('MediaRecorder', MockRecorder);
    MediaRecorder.isTypeSupported = vi.fn(() => true);

    // Mock fetch STT
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ text: 'Hello world' }) });

    const onFinalTranscript = vi.fn();
    const { result } = renderHook(() => useSpeechInput({ onFinalTranscript }));
    
    await act(async () => { 
      await result.current.startListening(); 
    });
    
    // Wait for recorder to fire onstop and transcription
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    
    await act(async () => { 
      result.current.stopListening(); 
    });

    expect(onFinalTranscript).toHaveBeenCalledWith('Hello world');
    expect(result.current.transcript).toBe('Hello world');
  });
});
