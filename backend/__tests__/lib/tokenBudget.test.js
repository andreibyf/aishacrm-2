import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  estimateTokens,
  estimateMessagesTokens,
  estimateToolsTokens,
  buildBudgetReport,
  applyBudgetCaps,
  enforceToolSchemaCap,
} from '../../lib/tokenBudget.js';

function makeTool(name, description = 'x'.repeat(200)) {
  return {
    type: 'function',
    function: {
      name,
      description,
      parameters: {
        type: 'object',
        properties: {
          q: { type: 'string', description: 'query' },
        },
      },
    },
  };
}

describe('tokenBudget', () => {
  it('estimates basic token counts', () => {
    assert.equal(estimateTokens(''), 0);
    assert.equal(estimateTokens('abcd'), 1);
    assert.equal(estimateTokens('abcde'), 2);

    const messages = [
      { role: 'user', content: 'hello world' },
      { role: 'assistant', content: 'done', tool_calls: [{ id: 't1', function: { name: 'x' } }] },
    ];
    assert.ok(estimateMessagesTokens(messages) > 0);

    const tools = [makeTool('toolA'), makeTool('toolB')];
    assert.ok(estimateToolsTokens(tools) > 0);
  });

  it('builds report and flags overBudget with custom caps', () => {
    const report = buildBudgetReport(
      {
        systemPrompt: 'S'.repeat(200),
        messages: [{ role: 'user', content: 'U'.repeat(300) }],
        tools: [makeTool('toolA')],
        memoryText: 'M'.repeat(100),
        toolResultSummaries: 'R'.repeat(100),
      },
      {
        HARD_CEILING: 50,
        SYSTEM_PROMPT: 20,
        TOOL_SCHEMA: 20,
        MEMORY: 20,
        TOOL_RESULT: 20,
        OUTPUT_MAX: 20,
      },
    );

    assert.equal(report.overBudget, true);
    assert.ok(report.totalTokens > 50);
    assert.match(report.breakdown.total, /\//);
  });

  it('enforces tool schema cap while retaining forced/core tools', () => {
    const tools = [
      makeTool('fetch_tenant_snapshot', 'c'.repeat(300)),
      makeTool('search_leads', 'c'.repeat(300)),
      makeTool('customToolA', 'c'.repeat(300)),
      makeTool('customToolB', 'c'.repeat(300)),
      makeTool('forcedTool', 'c'.repeat(300)),
    ];

    const capped = enforceToolSchemaCap(tools, {
      forcedTool: 'forcedTool',
      cap: estimateToolsTokens([tools[0], tools[1], tools[4]]) + 10,
    });

    const names = capped.map((t) => t.function?.name);
    assert.ok(names.includes('fetch_tenant_snapshot'));
    assert.ok(names.includes('search_leads'));
    assert.ok(names.includes('forcedTool'));
    assert.ok(
      estimateToolsTokens(capped) <= estimateToolsTokens([tools[0], tools[1], tools[4]]) + 10,
    );
  });

  it('applyBudgetCaps trims content in drop-order and returns actions', () => {
    const tools = [
      makeTool('fetch_tenant_snapshot', 'd'.repeat(300)),
      makeTool('search_leads', 'd'.repeat(300)),
      makeTool('customToolA', 'd'.repeat(300)),
      makeTool('customToolB', 'd'.repeat(300)),
    ];

    const messages = [
      { role: 'system', content: 'system baseline' },
      { role: 'user', content: 'u1 '.repeat(200) },
      { role: 'assistant', content: 'a1 '.repeat(150) },
      { role: 'user', content: 'u2 '.repeat(200) },
      { role: 'assistant', content: 'a2 '.repeat(150) },
      { role: 'user', content: 'u3 '.repeat(200) },
    ];

    const caps = {
      HARD_CEILING: 400,
      SYSTEM_PROMPT: 120,
      TOOL_SCHEMA: 120,
      MEMORY: 80,
      TOOL_RESULT: 80,
      OUTPUT_MAX: 80,
    };

    const before = buildBudgetReport(
      {
        systemPrompt: 'S'.repeat(1200),
        messages,
        tools,
        memoryText: 'M'.repeat(1200),
        toolResultSummaries: 'R'.repeat(1200),
      },
      caps,
    );

    const result = applyBudgetCaps({
      systemPrompt: 'S'.repeat(1200),
      messages,
      tools,
      memoryText: 'M'.repeat(1200),
      toolResultSummaries: 'R'.repeat(1200),
      forcedTool: 'search_leads',
      caps,
    });

    assert.ok(result.report.totalTokens < before.totalTokens);
    assert.ok(Array.isArray(result.actionsTaken));
    assert.ok(result.actionsTaken.length > 0);
    // last user must remain after message trimming safeguard
    const lastUser = result.messages.filter((m) => m.role === 'user').pop();
    assert.ok(lastUser);
    assert.ok(lastUser.content.includes('u3'));
  });
});
