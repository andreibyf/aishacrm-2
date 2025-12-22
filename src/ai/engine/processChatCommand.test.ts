/**
 * Unit tests for src/ai/engine/processChatCommand.ts
 * Tests chat command processing logic
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { processChatCommand } from './processChatCommand';
import type { IntentClassification } from '@/ai/nlu/intentClassifier';

// Mock dependencies
vi.mock('@/lib/intentParser', () => ({
  parseIntent: vi.fn(),
  enforceParserSafety: vi.fn(),
  legacyIntentFromParser: vi.fn(),
}));

vi.mock('@/ai/nlu/intentClassifier', () => ({
  classifyIntent: vi.fn(),
}));

vi.mock('./promptBuilder', () => ({
  buildPrompt: vi.fn(),
}));

vi.mock('./commandRouter', () => ({
  routeCommand: vi.fn(),
}));

vi.mock('@/lib/ambiguityResolver', () => ({
  resolveAmbiguity: vi.fn(),
  getContextualExamples: vi.fn(),
  buildFallbackMessage: vi.fn(),
}));

describe('processChatCommand.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('processes basic chat command successfully', async () => {
    // Mock successful parsing
    const mockParsedIntent = {
      intent: 'list_records' as const,
      entities: [{ type: 'entity', value: 'leads', confidence: 0.9 }],
      confidence: 0.95,
    };

    const { parseIntent } = await import('@/lib/intentParser');
    vi.mocked(parseIntent).mockResolvedValue(mockParsedIntent);

    // Mock classification
    const mockClassification: IntentClassification = {
      intent: 'list_records',
      entity: 'leads',
      confidence: 0.95,
      filters: {},
    };

    const { classifyIntent } = await import('@/ai/nlu/intentClassifier');
    vi.mocked(classifyIntent).mockResolvedValue(mockClassification);

    // Mock routing to AI chat
    const { routeCommand } = await import('./commandRouter');
    vi.mocked(routeCommand).mockReturnValue({
      route: 'ai_chat',
      assistantMessage: {
        content: 'Here are your leads',
        actions: [],
      },
      classification: mockClassification,
    });

    const result = await processChatCommand({
      text: 'Show me my leads',
      history: [],
      context: {
        tenantId: 'test-tenant',
        tenantName: 'Test Company',
        currentPath: '/leads',
        userName: 'Test User',
      },
    });

    expect(result).toHaveProperty('route');
    expect(result).toHaveProperty('assistantMessage');
    expect(result).toHaveProperty('classification');
    expect(result.route).toBe('ai_chat');
    expect(result.assistantMessage.content).toBe('Here are your leads');
  });

  test('handles parser failure and falls back to legacy classifier', async () => {
    // Mock parser failure
    const { parseIntent } = await import('@/lib/intentParser');
    vi.mocked(parseIntent).mockImplementation(() => {
      throw new Error('Parser failed');
    });

    // Mock legacy classification
    const mockClassification: IntentClassification = {
      intent: 'create_record',
      entity: 'lead',
      confidence: 0.8,
      filters: {},
    };

    const { classifyIntent } = await import('@/ai/nlu/intentClassifier');
    vi.mocked(classifyIntent).mockResolvedValue(mockClassification);

    // Mock routing
    const { routeCommand } = await import('./commandRouter');
    vi.mocked(routeCommand).mockReturnValue({
      route: 'ai_chat',
      assistantMessage: {
        content: 'Fallback response',
        actions: [],
      },
      classification: mockClassification,
    });

    const result = await processChatCommand({
      text: 'Create a new lead',
      history: [],
    });

    expect(result.route).toBe('ai_chat');
    expect(result.classification.intent).toBe('create_record');
  });

  test('resolves entity context from session entities', async () => {
    const sessionEntities = [
      { id: '123', type: 'lead', name: 'John Doe', aliases: ['john'] },
    ];

    // Mock parsing
    const mockParsedIntent = {
      intent: 'view_record' as const,
      entities: [],
      confidence: 0.9,
    };

    const { parseIntent } = await import('@/lib/intentParser');
    vi.mocked(parseIntent).mockResolvedValue(mockParsedIntent);

    const mockClassification: IntentClassification = {
      intent: 'view_record',
      entity: 'lead',
      confidence: 0.9,
      filters: { id: '123' },
    };

    const { classifyIntent } = await import('@/ai/nlu/intentClassifier');
    vi.mocked(classifyIntent).mockResolvedValue(mockClassification);

    const { routeCommand } = await import('./commandRouter');
    vi.mocked(routeCommand).mockReturnValue({
      route: 'local_action',
      localAction: { type: 'navigate', target: '/leads/123' },
      assistantMessage: {
        content: 'Opening John Doe\'s profile',
        actions: [],
      },
      classification: mockClassification,
    });

    const result = await processChatCommand({
      text: 'Show me john',
      sessionEntities,
    });

    expect(result.route).toBe('local_action');
    expect(result.localAction?.target).toBe('/leads/123');
  });
});