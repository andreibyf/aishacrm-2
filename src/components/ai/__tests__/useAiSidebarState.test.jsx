import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('@/api/functions', () => ({
  processChatCommand: vi.fn().mockResolvedValue({
    data: {
      response: 'acknowledged',
      route: 'ai_chat',
      classification: {
        rawText: '',
        normalized: '',
        intent: 'generic_question',
        entity: 'general',
        filters: {},
        confidence: 0.5,
        matchedKeywords: [],
        parserResult: null
      }
    }
  }),
  processDeveloperCommand: vi.fn()
}));

vi.mock('@/lib/suggestionEngine', () => ({
  addHistoryEntry: vi.fn(),
  getRecentHistory: vi.fn(() => []),
  getSuggestions: vi.fn(() => [])
}));

import { AiSidebarProvider, useAiSidebarState } from '../useAiSidebarState.jsx';
import { processChatCommand } from '@/api/functions';
import { addHistoryEntry, getSuggestions } from '@/lib/suggestionEngine';

beforeEach(() => {
  processChatCommand.mockClear();
  addHistoryEntry.mockClear();
  getSuggestions.mockReturnValue([]);
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

  it('provides suggestions and exposes helper to apply commands', async () => {
    const suggestion = {
      id: 'context:dashboard:0',
      label: 'Dashboard overview',
      command: 'Give me a dashboard summary',
      confidence: 0.82,
      source: 'context'
    };
    getSuggestions.mockReturnValue([suggestion]);
    const wrapper = ({ children }) => <AiSidebarProvider>{children}</AiSidebarProvider>;
    const { result } = renderHook(() => useAiSidebarState(), { wrapper });

    await waitFor(() => {
      expect(result.current.suggestions).toHaveLength(1);
    });

    const command = result.current.applySuggestion('context:dashboard:0');
    expect(command).toBe('Give me a dashboard summary');
  });

  it('records parser-driven history entries after successful send', async () => {
    processChatCommand.mockResolvedValueOnce({
      data: {
        response: 'done',
        route: 'ai_chat',
        classification: {
          parserResult: { intent: 'query', entity: 'leads' }
        }
      }
    });

    const wrapper = ({ children }) => <AiSidebarProvider>{children}</AiSidebarProvider>;
    const { result } = renderHook(() => useAiSidebarState(), { wrapper });

    await act(async () => {
      await result.current.sendMessage('show my leads', { origin: 'text' });
    });

    expect(addHistoryEntry).toHaveBeenCalledWith(expect.objectContaining({ intent: 'query', entity: 'leads' }));
  });
});
