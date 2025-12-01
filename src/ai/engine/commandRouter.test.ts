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
  beforeAll(() => { (window as any).__DISABLE_GLOBAL_FETCH_STUB = true; });
  afterAll(() => { delete (window as any).__DISABLE_GLOBAL_FETCH_STUB; });
  it('returns local action for list intents with confidence', async () => {
    const result = await routeCommand({ text: 'show leads', classification: baseClassification, prompt: basePrompt });
    expect(result.type).toBe('local_action');
    if (result.type === 'local_action') {
      expect(result.action.entity).toBe('leads');
      expect(result.action.intent).toBe('list_records');
    }
  });

  it('routes forecast intent to brain task', async () => {
    const classification: IntentClassification = {
      ...baseClassification,
      intent: 'forecast',
      entity: 'pipeline',
      confidence: 0.7
    };
    const callBrainTest = vi.fn().mockResolvedValue({ status: 200, data: { summary: 'ok' } });
    const result = await routeCommand({
      text: 'forecast pipeline',
      classification,
      prompt: { ...basePrompt, mode: 'propose_actions' },
      adapters: { callBrainTest }
    });
    expect(callBrainTest).toHaveBeenCalled();
    expect(result.type).toBe('ai_brain');
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
