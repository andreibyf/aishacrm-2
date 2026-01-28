import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import type { IntentClassification } from '@/ai/nlu/intentClassifier';
import { routeCommand } from './commandRouter';

const baseClassification: IntentClassification = {
  rawText: 'show leads',
  normalized: 'show leads',
  intent: 'list_records',
  entity: 'leads',
  filters: {},
  confidence: 0.8,
  matchedKeywords: ['show', 'lead']
};

const basePrompt = {
  mode: 'read_only' as const,
  messages: [
    { role: 'system' as const, content: 'test' },
    { role: 'user' as const, content: 'Show leads' }
  ],
  summary: 'summary'
};

describe('commandRouter', () => {
  beforeAll(() => { window.__DISABLE_GLOBAL_FETCH_STUB = true; });
  afterAll(() => { delete window.__DISABLE_GLOBAL_FETCH_STUB; });
  it('routes list intent to chat when local actions disabled', async () => {
    // Local actions are disabled (localIntentSet is empty) to force Braid tool usage for all data queries
    const callChatApi = vi.fn().mockResolvedValue({ status: 200, data: { status: 'success', response: 'Here are your leads' } });
    const result = await routeCommand({ text: 'show leads', classification: baseClassification, prompt: basePrompt, adapters: { callChatApi } });
    expect(result.type).toBe('ai_chat');
    expect(callChatApi).toHaveBeenCalled();
  });

  it('routes forecast intent to chat (brain-test disabled)', async () => {
    // Note: brainIntentSet was disabled to route all requests through /api/ai/chat
    // Previously this would route to brain-test, now it goes to chat
    const classification: IntentClassification = {
      ...baseClassification,
      intent: 'forecast',
      entity: 'pipeline',
      confidence: 0.7
    };
    const callChatApi = vi.fn().mockResolvedValue({ status: 200, data: { status: 'success', response: 'Here is your forecast' } });
    const result = await routeCommand({
      text: 'forecast pipeline',
      classification,
      prompt: { ...basePrompt, mode: 'propose_actions' },
      adapters: { callChatApi }
    });
    expect(callChatApi).toHaveBeenCalled();
    expect(result.type).toBe('ai_chat');
  });

  it('routes unknown intent to chat endpoint', async () => {
    const classification: IntentClassification = {
      ...baseClassification,
      intent: 'generic_question',
      confidence: 0.4
    };
    const callChatApi = vi.fn().mockResolvedValue({ status: 200, data: { status: 'success', response: 'hi' } });
    const result = await routeCommand({
      text: 'how are you?',
      classification,
      prompt: basePrompt,
      adapters: { callChatApi }
    });
    expect(callChatApi).toHaveBeenCalled();
    expect(result.type).toBe('ai_chat');
  });
});
