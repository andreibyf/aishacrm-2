import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useRealtimeAiSHA, __testing__ } from '../useRealtimeAiSHA.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useRealtimeAiSHA helpers', () => {
  it('flattens deeply nested realtime payloads into readable text', () => {
    const nestedPayload = {
      content: [
        'Hello ',
        { type: 'text', text: { content: 'from ' } },
        { type: 'audio_transcript', transcript: 'AiSHA' },
      ],
    };
    expect(__testing__.flattenRealtimeContent(nestedPayload)).toBe('Hello from AiSHA');
  });

  it('extracts assistant messages from conversation payloads', () => {
    const message = __testing__.extractAssistantMessage({
      type: 'conversation.item.created',
      item: {
        role: 'assistant',
        content: [
          { type: 'output_text', text: 'Realtime' },
          { type: 'output_text', text: ' ready' },
        ],
      },
    });
    expect(message).toMatchObject({ role: 'assistant', content: 'Realtime ready' });
  });
});

describe('useRealtimeAiSHA hook', () => {
  it('surfaces channel_not_ready errors when datachannel is missing', async () => {
    const { result } = renderHook(() => useRealtimeAiSHA());

    await act(async () => {
      await expect(result.current.sendUserMessage('hello realtime')).rejects.toThrow('Realtime connection is not ready yet.');
    });

    await waitFor(() => {
      expect(result.current.errorDetails?.code).toBe('channel_not_ready');
    });
  });
});
