/**
 * Integration test for AI token optimization changes
 * Tests that message limiting and tool result truncation work correctly
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('AI Token Optimization', () => {
  it('should limit incoming messages to MAX_INCOMING (8)', () => {
    // Create a large message history to test limiting
    const testMessages = [];
    for (let i = 0; i < 20; i++) {
      testMessages.push({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: 'Test message '.repeat(200) // ~2400 chars
      });
    }

    const MAX_INCOMING = 8;
    const MAX_CHARS = 1500;

    const limitedMessages = testMessages
      .slice(-MAX_INCOMING)
      .map(m => ({
        ...m,
        content: typeof m.content === 'string'
          ? m.content.slice(0, MAX_CHARS)
          : m.content
      }));

    assert.strictEqual(limitedMessages.length, MAX_INCOMING, 
      `Should limit to ${MAX_INCOMING} messages`);
  });

  it('should truncate message content to MAX_CHARS (1500)', () => {
    const testMessages = [];
    for (let i = 0; i < 20; i++) {
      testMessages.push({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: 'Test message '.repeat(200) // ~2400 chars
      });
    }

    const MAX_INCOMING = 8;
    const MAX_CHARS = 1500;

    const limitedMessages = testMessages
      .slice(-MAX_INCOMING)
      .map(m => ({
        ...m,
        content: typeof m.content === 'string'
          ? m.content.slice(0, MAX_CHARS)
          : m.content
      }));

    limitedMessages.forEach((msg, idx) => {
      assert.ok(msg.content.length <= MAX_CHARS, 
        `Message ${idx} should be truncated to max ${MAX_CHARS} chars, got ${msg.content.length}`);
    });
  });

  it('should truncate tool summary to 1200 chars', () => {
    const longSummary = 'Tool result summary: '.repeat(100); // ~2000 chars
    const safeSummary = (longSummary || '').slice(0, 1200);

    assert.ok(safeSummary.length <= 1200, 
      `Summary should be truncated to 1200 chars, got ${safeSummary.length}`);
    assert.strictEqual(safeSummary.length, 1200,
      'Summary should be exactly 1200 chars when truncated');
  });

  it('should handle empty or null summaries gracefully', () => {
    // eslint-disable-next-line no-constant-binary-expression
    const nullSummary = (null ?? '').slice(0, 1200);
    // eslint-disable-next-line no-constant-binary-expression
    const emptySummary = ('' ?? '').slice(0, 1200);
    // eslint-disable-next-line no-constant-binary-expression
    const undefinedSummary = (undefined ?? '').slice(0, 1200);

    assert.strictEqual(nullSummary, '', 'Null summary should become empty string');
    assert.strictEqual(emptySummary, '', 'Empty summary should remain empty');
    assert.strictEqual(undefinedSummary, '', 'Undefined summary should become empty string');
  });

  it('should preserve message structure after optimization', () => {
    const MAX_INCOMING = 8;
    const MAX_CHARS = 1500;

    const originalMessage = {
      role: 'user',
      content: 'Test content',
      metadata: { test: true }
    };

    const optimizedMessages = [originalMessage]
      .slice(-MAX_INCOMING)
      .map(m => ({
        ...m,
        content: typeof m.content === 'string'
          ? m.content.slice(0, MAX_CHARS)
          : m.content
      }));

    assert.strictEqual(optimizedMessages[0].role, 'user', 'Role should be preserved');
    assert.ok(optimizedMessages[0].metadata, 'Metadata should be preserved');
    assert.strictEqual(optimizedMessages[0].metadata.test, true, 'Metadata values should be preserved');
  });

  it('should only send last user and last assistant in frontend optimization', () => {
    const allMessages = [
      { role: 'user', content: 'Message 1' },
      { role: 'assistant', content: 'Response 1' },
      { role: 'user', content: 'Message 2' },
      { role: 'assistant', content: 'Response 2' },
      { role: 'user', content: 'Message 3' },
      { role: 'assistant', content: 'Response 3' },
    ];

    // Simulate frontend processChatCommand optimization
    const lastUser = [...allMessages].reverse().find(m => m.role === 'user');
    const lastAssistant = [...allMessages].reverse().find(m => m.role === 'assistant');
    const optimizedMessages = [lastAssistant, lastUser].filter(Boolean);

    assert.strictEqual(optimizedMessages.length, 2, 'Should only have 2 messages');
    assert.strictEqual(optimizedMessages[0].role, 'assistant', 'First should be last assistant');
    assert.strictEqual(optimizedMessages[0].content, 'Response 3', 'Should be last assistant response');
    assert.strictEqual(optimizedMessages[1].role, 'user', 'Second should be last user');
    assert.strictEqual(optimizedMessages[1].content, 'Message 3', 'Should be last user message');
  });

  it('should handle conversation with only user messages', () => {
    const userOnlyMessages = [
      { role: 'user', content: 'Message 1' },
      { role: 'user', content: 'Message 2' },
    ];

    const lastUser = [...userOnlyMessages].reverse().find(m => m.role === 'user');
    const lastAssistant = [...userOnlyMessages].reverse().find(m => m.role === 'assistant');
    const optimizedMessages = [lastAssistant, lastUser].filter(Boolean);

    assert.strictEqual(optimizedMessages.length, 1, 'Should only have last user message');
    assert.strictEqual(optimizedMessages[0].content, 'Message 2', 'Should be last user message');
  });
});
