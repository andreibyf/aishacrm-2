### 3) Test scaffolds

These are intentionally minimal and “light” to avoid the Vitest/jsdom crash you hit earlier. They just verify hook shape and basic behavior.

`// src/hooks/__tests__/useVoiceInteraction.test.jsx`
`import { describe, expect, it, vi } from 'vitest';`
`import { renderHook, act } from '@testing-library/react';`
`import { useVoiceInteraction } from '../useVoiceInteraction.js';`

`// Mock dependencies to avoid touching real media / network`
`vi.mock('@/components/ai/useSpeechInput.js', () => ({`
  `useSpeechInput: () => ({`
    `transcript: '',`
    `isRecording: false,`
    `isTranscribing: false,`
    `startRecording: vi.fn(),`
    `stopRecording: vi.fn(),`
    `resetTranscript: vi.fn(),`
    `error: null,`
  `}),`
`}));`

`vi.mock('@/components/ai/useSpeechOutput.js', () => ({`
  `useSpeechOutput: () => ({`
    `isLoading: false,`
    `isPlaying: false,`
    `playText: vi.fn(),`
    `stop: vi.fn(),`
    `error: null,`
  `}),`
`}));`

`vi.mock('@/hooks/useRealtimeAiSHA.js', () => ({`
  `useRealtimeAiSHA: () => ({`
    `isRealtimeActive: false,`
    `connectRealtime: vi.fn(),`
    `disconnectRealtime: vi.fn(),`
    `sendUserMessage: vi.fn(),`
    `error: null,`
  `}),`
`}));`

`describe('useVoiceInteraction', () => {`
  `it('returns idle mode by default', () => {`
    `const { result } = renderHook(() => useVoiceInteraction());`
    `expect(result.current.mode).toBe('idle');`
    `expect(result.current.isListening).toBe(false);`
    `expect(result.current.isSpeaking).toBe(false);`
    `expect(result.current.error).toBeNull();`
  `});`

  `it('allows changing mode via setMode', () => {`
    `const { result } = renderHook(() => useVoiceInteraction());`
    `act(() => {`
      `result.current.setMode('continuous');`
    `});`
    `expect(result.current.mode).toBe('continuous');`
  `});`

  `it('exposes start/stopContinuous handlers', () => {`
    `const { result } = renderHook(() => useVoiceInteraction());`
    `expect(typeof result.current.startContinuous).toBe('function');`
    `expect(typeof result.current.stopContinuous).toBe('function');`
  `});`

  `it('exposes sendTextMessage function', async () => {`
    `const { result } = renderHook(() => useVoiceInteraction());`
    `await act(async () => {`
      `const res = await result.current.sendTextMessage('hello', { useRealtime: false });`
      `expect(res).toEqual({`
        `text: 'hello',`
        `metadata: expect.objectContaining({ origin: 'voice' }),`
      `});`
    `});`
  `});`
`});`

If `renderHook` is not yet available, install `@testing-library/react-hooks` or switch to `@testing-library/react`’s built-in hook support depending on your version. Adjust imports accordingly.