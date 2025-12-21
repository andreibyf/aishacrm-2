/**
 * Unit tests for src/ai/engine/promptBuilder.ts
 * Tests prompt construction for AI chat
 */
import { describe, test, expect } from 'vitest';
import { buildPrompt } from './promptBuilder';
import type { IntentClassification } from '@/ai/nlu/intentClassifier';

describe('promptBuilder.ts', () => {
  test('buildPrompt creates valid PromptPayload structure', () => {
    const classification: IntentClassification = {
      intent: 'list_records',
      entity: 'leads',
      confidence: 0.95,
      filters: {
        timeframe: 'today',
        status: 'new',
      },
    };

    const result = buildPrompt({
      text: 'Show me new leads from today',
      classification,
      history: [],
      context: {
        tenantId: 'test-tenant',
        tenantName: 'Test Company',
        currentPath: '/leads',
        userName: 'Test User',
      },
    });

    // Verify structure
    expect(result).toHaveProperty('mode');
    expect(result).toHaveProperty('messages');
    expect(result).toHaveProperty('summary');
    
    // Verify mode is read_only for list_records intent
    expect(result.mode).toBe('read_only');
    
    // Verify messages array structure
    expect(result.messages).toBeInstanceOf(Array);
    expect(result.messages.length).toBeGreaterThan(0);
    expect(result.messages[0].role).toBe('system');
    
    // Verify summary contains classification info
    expect(result.summary).toContain('list_records');
    expect(result.summary).toContain('leads');
  });
});
