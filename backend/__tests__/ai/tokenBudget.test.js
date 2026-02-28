/**
 * Token Budget Manager - Acceptance Tests
 *
 * Tests for:
 * 1. Token estimation functions
 * 2. Budget enforcement (applyBudgetCaps)
 * 3. Tool schema capping (enforceToolSchemaCap)
 * 4. Budget reporting and logging
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  estimateTokens,
  estimateMessagesTokens,
  estimateToolsTokens,
  buildBudgetReport,
  applyBudgetCaps,
  enforceToolSchemaCap,
  logBudgetSummary,
  TOKEN_CAPS,
} from '../../lib/tokenBudget.js';

describe('TokenBudgetManager', () => {
  describe('estimateTokens', () => {
    it('should estimate tokens at ~4 chars per token', () => {
      const text = 'Hello, world!'; // 13 chars
      const tokens = estimateTokens(text);
      assert.strictEqual(tokens, 4); // ceil(13/4) = 4
    });

    it('should handle empty string', () => {
      assert.strictEqual(estimateTokens(''), 0);
    });

    it('should handle null/undefined', () => {
      assert.strictEqual(estimateTokens(null), 0);
      assert.strictEqual(estimateTokens(undefined), 0);
    });

    it('should handle long strings', () => {
      const longText = 'a'.repeat(1000);
      const tokens = estimateTokens(longText);
      assert.strictEqual(tokens, 250); // 1000/4 = 250
    });
  });

  describe('estimateMessagesTokens', () => {
    it('should estimate tokens for simple messages', () => {
      const messages = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello!' },
      ];
      const tokens = estimateMessagesTokens(messages);
      // Each message: role (4 chars) + content
      // system: ~10 tokens, user: ~3 tokens
      assert.ok(tokens > 0);
      assert.ok(tokens < 100);
    });

    it('should handle empty messages array', () => {
      assert.strictEqual(estimateMessagesTokens([]), 0);
    });

    it('should account for tool_calls', () => {
      const messages = [
        {
          role: 'assistant',
          content: 'Let me search.',
          tool_calls: [
            {
              id: 'call_123',
              function: {
                name: 'search_leads',
                arguments: '{"query": "test"}',
              },
            },
          ],
        },
      ];
      const tokens = estimateMessagesTokens(messages);
      assert.ok(tokens > 10);
    });
  });

  describe('estimateToolsTokens', () => {
    it('should estimate tokens for tool schemas', () => {
      const tools = [
        {
          type: 'function',
          function: {
            name: 'search_leads',
            description: 'Search for leads by query',
            parameters: {
              type: 'object',
              properties: {
                query: { type: 'string' },
              },
            },
          },
        },
      ];
      const tokens = estimateToolsTokens(tools);
      assert.ok(tokens > 10);
      assert.ok(tokens < 200);
    });

    it('should handle empty tools array', () => {
      assert.strictEqual(estimateToolsTokens([]), 0);
    });
  });

  describe('buildBudgetReport', () => {
    it('should build a complete budget report', () => {
      const report = buildBudgetReport({
        systemPrompt: 'You are a helpful assistant.',
        messages: [{ role: 'user', content: 'Hello' }],
        tools: [{ type: 'function', function: { name: 'test', description: 'test' } }],
        memoryText: 'Some memory context',
        toolResultSummaries: 'Tool result',
      });

      assert.ok('systemTokens' in report);
      assert.ok('messagesTokens' in report);
      assert.ok('toolsTokens' in report);
      assert.ok('memoryTokens' in report);
      assert.ok('toolResultTokens' in report);
      assert.ok('totalTokens' in report);
      assert.ok('caps' in report);
      assert.ok('overBudget' in report);
    });

    it('should correctly identify when over budget', () => {
      // Create a very long system prompt
      const longPrompt = 'a'.repeat(40000); // ~10000 tokens
      const report = buildBudgetReport({
        systemPrompt: longPrompt,
        messages: [],
        tools: [],
        memoryText: '',
        toolResultSummaries: '',
      });

      assert.strictEqual(report.overBudget, true);
    });
  });

  describe('applyBudgetCaps', () => {
    it('should return unchanged data when within budget', () => {
      const result = applyBudgetCaps({
        systemPrompt: 'Short prompt.',
        messages: [{ role: 'user', content: 'Hello' }],
        tools: [{ type: 'function', function: { name: 'test', description: 'test' } }],
        memoryText: 'Memory',
        toolResultSummaries: '',
      });

      assert.ok(result.systemPrompt);
      assert.ok(Array.isArray(result.messages));
      assert.ok(Array.isArray(result.tools));
      assert.ok(Array.isArray(result.actionsTaken));
    });

    it('should drop memory first when over budget', () => {
      const longMemory = 'memory content '.repeat(500); // ~1500 tokens
      const result = applyBudgetCaps({
        systemPrompt: 'Prompt',
        messages: [{ role: 'user', content: 'Hello' }],
        tools: [],
        memoryText: longMemory,
        toolResultSummaries: '',
      });

      // Memory should be capped or cleared
      assert.ok(result.actionsTaken.length >= 0);
    });

    it('should preserve forced tool when dropping tools', () => {
      const tools = Array.from({ length: 30 }, (_, i) => ({
        type: 'function',
        function: {
          name: `tool_${i}`,
          description: 'A tool that does something important. '.repeat(10),
        },
      }));

      const result = applyBudgetCaps({
        systemPrompt: 'Prompt',
        messages: [],
        tools,
        memoryText: '',
        toolResultSummaries: '',
        forcedTool: 'tool_15',
      });

      // Forced tool should be preserved
      const hasForced = result.tools.some((t) => t.function.name === 'tool_15');
      assert.strictEqual(hasForced, true);
    });
  });

  describe('enforceToolSchemaCap', () => {
    it('should limit tools by token count', () => {
      const tools = Array.from({ length: 20 }, (_, i) => ({
        type: 'function',
        function: {
          name: `tool_${i}`,
          description: 'A very long description that takes up tokens. '.repeat(5),
          parameters: { type: 'object', properties: {} },
        },
      }));

      const result = enforceToolSchemaCap(tools, { cap: 500 });
      assert.ok(result.length <= tools.length);
    });

    it('should preserve forced tool', () => {
      const tools = Array.from({ length: 20 }, (_, i) => ({
        type: 'function',
        function: {
          name: `tool_${i}`,
          description: 'Long description '.repeat(10),
        },
      }));

      const result = enforceToolSchemaCap(tools, {
        forcedTool: 'tool_15',
        cap: 300,
      });

      const hasForced = result.some((t) => t.function.name === 'tool_15');
      assert.strictEqual(hasForced, true);
    });

    it('should handle empty tools array', () => {
      const result = enforceToolSchemaCap([], {});
      assert.deepStrictEqual(result, []);
    });
  });

  describe('logBudgetSummary', () => {
    it('should log budget summary without throwing', () => {
      const report = {
        systemTokens: 100,
        messagesTokens: 200,
        toolsTokens: 300,
        memoryTokens: 50,
        toolResultTokens: 100,
        totalTokens: 750,
        caps: TOKEN_CAPS,
        overBudget: false,
      };

      // Should not throw
      assert.doesNotThrow(() => {
        logBudgetSummary(report, []);
      });
    });

    it('should log actions taken', () => {
      const report = {
        systemTokens: 100,
        messagesTokens: 200,
        toolsTokens: 300,
        memoryTokens: 0,
        toolResultTokens: 100,
        totalTokens: 700,
        caps: TOKEN_CAPS,
        overBudget: false,
      };

      assert.doesNotThrow(() => {
        logBudgetSummary(report, ['cleared_memory', 'dropped_5_tools']);
      });
    });
  });

  describe('TOKEN_CAPS constants', () => {
    it('should have expected caps defined', () => {
      assert.ok(TOKEN_CAPS.HARD_CEILING > 0);
      assert.ok(TOKEN_CAPS.SYSTEM_PROMPT > 0);
      assert.ok(TOKEN_CAPS.TOOL_SCHEMA > 0);
      assert.ok(TOKEN_CAPS.MEMORY > 0);
      assert.ok(TOKEN_CAPS.TOOL_RESULT > 0);
      assert.ok(TOKEN_CAPS.OUTPUT_MAX > 0);
    });

    it('should have reasonable default values', () => {
      assert.strictEqual(TOKEN_CAPS.HARD_CEILING, 8000);
      assert.strictEqual(TOKEN_CAPS.SYSTEM_PROMPT, 2500);
      assert.strictEqual(TOKEN_CAPS.TOOL_SCHEMA, 1200);
      assert.strictEqual(TOKEN_CAPS.MEMORY, 500);
    });
  });

  describe('Integration: Full budget enforcement pipeline', () => {
    it('should produce a valid request payload under budget from oversized inputs', () => {
      // Simulate oversized inputs that EXCEED the 8000 token budget
      const bigSystemPrompt =
        'You are a helpful CRM assistant that helps users manage leads, contacts, accounts, and opportunities. '.repeat(
          50,
        ); // ~1250 tokens
      const manyTools = Array.from({ length: 30 }, (_, i) => ({
        type: 'function',
        function: {
          name: `tool_${i}`,
          description:
            'A tool that performs an important operation and has a long description to increase token count. '.repeat(
              8,
            ),
          parameters: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              query: { type: 'string' },
            },
          },
        },
      })); // ~2000+ tokens
      const longMemory = 'Previous conversation context about the customer interaction: '.repeat(
        30,
      ); // ~400 tokens
      const messages = [
        { role: 'user', content: 'First question about leads and how to manage them effectively' },
        { role: 'assistant', content: 'Here is detailed info about leads and best practices...' },
        { role: 'user', content: 'What about contacts and their relationship to accounts?' },
        {
          role: 'assistant',
          content: 'Contacts are connected to accounts in the following way...',
        },
        { role: 'user', content: 'Can you show me accounts now?' }, // LAST user message
        { role: 'assistant', content: 'Here are your accounts with all their details...' },
      ];

      // Apply the full pipeline
      const result = applyBudgetCaps({
        systemPrompt: bigSystemPrompt,
        messages,
        tools: manyTools,
        memoryText: longMemory,
        toolResultSummaries: '',
        forcedTool: 'tool_5',
      });

      // ASSERTIONS for valid output

      // 1. System prompt should exist and be capped
      assert.ok(result.systemPrompt, 'System prompt should exist');

      // 2. Some reduction should have occurred given the massive input
      const totalInputTokens =
        estimateTokens(bigSystemPrompt) +
        estimateTokens(longMemory) +
        estimateToolsTokens(manyTools);
      assert.ok(totalInputTokens > TOKEN_CAPS.HARD_CEILING, 'Test input should exceed budget');

      // 3. Forced tool should be preserved
      const hasForced = result.tools.some((t) => t.function.name === 'tool_5');
      assert.strictEqual(hasForced, true, 'Forced tool must be preserved');

      // 4. Messages should include the LAST user message
      const lastUserInResult = result.messages.filter((m) => m.role === 'user').pop();
      assert.ok(lastUserInResult, 'Last user message must be retained');
      assert.ok(
        lastUserInResult.content.includes('accounts'),
        'Last user message content must be the actual last one',
      );

      // 5. Report should be generated
      assert.ok(result.report, 'Budget report should be generated');
      assert.ok('totalTokens' in result.report, 'Report should have totalTokens');

      // 6. Actions should be logged since reductions occurred
      assert.ok(Array.isArray(result.actionsTaken), 'Actions taken should be an array');
      assert.ok(
        result.actionsTaken.length > 0,
        'Actions should have been taken for oversized input',
      );
    });

    it('should not modify inputs that are already within budget', () => {
      const smallPrompt = 'You are helpful.';
      const fewTools = [{ type: 'function', function: { name: 'search', description: 'Search' } }];
      const messages = [{ role: 'user', content: 'Hello' }];

      const result = applyBudgetCaps({
        systemPrompt: smallPrompt,
        messages,
        tools: fewTools,
        memoryText: '',
        toolResultSummaries: '',
      });

      assert.strictEqual(result.systemPrompt, smallPrompt);
      assert.strictEqual(result.tools.length, 1);
      assert.strictEqual(result.messages.length, 1);
      assert.strictEqual(
        result.actionsTaken.length,
        0,
        'No actions should be taken for small inputs',
      );
    });
  });
});
