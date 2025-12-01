import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/ai/engine/processChatCommand', () => ({
  processChatCommand: vi.fn().mockResolvedValue({
    route: 'ai_chat',
    assistantMessage: { content: 'acknowledged' },
    classification: {
      rawText: '',
      normalized: '',
      intent: 'generic_question',
      entity: 'general',
      filters: {},
      confidence: 0.5,
      matchedKeywords: []
    }
  })
}));

import { AiSidebarProvider, useAiSidebarState } from '../useAiSidebarState.jsx';
import { processChatCommand } from '@/ai/engine/processChatCommand';

beforeEach(() => {
  processChatCommand.mockClear();
});

describe('useAiSidebarState', () => {
  it('routes voice-originated messages through processChatCommand and tags metadata', async () => {
    const wrapper = ({ children }) => <AiSidebarProvider>{children}</AiSidebarProvider>;
    const { result } = renderHook(() => useAiSidebarState(), { wrapper });

    await act(async () => {
      await result.current.sendMessage('Voice command text', { origin: 'voice' });
    });

    expect(processChatCommand).toHaveBeenCalledTimes(1);
    const userMessage = result.current.messages.find((msg) => msg.role === 'user' && msg.content === 'Voice command text');
    expect(userMessage?.metadata?.origin).toBe('voice');
  });

  it('adds realtime messages without invoking processChatCommand', () => {
    const wrapper = ({ children }) => <AiSidebarProvider>{children}</AiSidebarProvider>;
    const { result } = renderHook(() => useAiSidebarState(), { wrapper });

    act(() => {
      result.current.addRealtimeMessage({ role: 'assistant', content: 'Streaming hello' });
    });

    expect(processChatCommand).not.toHaveBeenCalled();
    const latest = result.current.messages.at(-1);
    expect(latest?.content).toBe('Streaming hello');
    expect(latest?.metadata?.origin).toBe('realtime');
  });
});
