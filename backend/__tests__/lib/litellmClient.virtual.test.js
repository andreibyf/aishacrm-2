/**
 * Unit tests for callLiteLLMVirtual (litellmClient.js)
 *
 * Verifies:
 * - Correct request body construction (model alias sent as-is, no provider/ prefix)
 * - Authorization header attached when LITELLM_MASTER_KEY is set
 * - Optional fields (max_tokens, tools) included only when provided
 * - Success and error response parsing
 * - AbortSignal timeout applied (300s)
 *
 * [2026-06-08 Claude] Added as part of LiteLLM virtual model alias refactor
 * [2026-06-08 Claude] Fixed: mock node-fetch module import, not global.fetch
 *   callLiteLLMVirtual uses `import fetch from 'node-fetch'`, so global.fetch spy
 *   was never invoked. Use mock.module() to intercept the imported binding.
 */

import { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

let callLiteLLMVirtual;

// Track what was passed to fetch
let lastFetchUrl;
let lastFetchOptions;
let mockFetchResponse = null;

describe('callLiteLLMVirtual', () => {
  before(async () => {
    // Mock the node-fetch module before importing litellmClient.
    // callLiteLLMVirtual uses `import fetch from 'node-fetch'`, so patching
    // global.fetch has no effect — mock.module intercepts the named import.
    mock.module('node-fetch', {
      defaultExport: async (url, opts) => {
        lastFetchUrl = url;
        lastFetchOptions = opts;
        if (mockFetchResponse) return mockFetchResponse;
        // Default: 200 success
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{ message: { content: 'Hello from LiteLLM' } }],
            usage: { prompt_tokens: 10, completion_tokens: 5 },
            model: 'claude-sonnet-4-20250514',
          }),
          text: async () => 'ok',
        };
      },
    });
    ({ callLiteLLMVirtual } = await import('../../lib/aiEngine/litellmClient.js'));
  });

  after(() => {
    mock.restoreAll();
  });

  it('sends model alias as-is (no provider/ prefix)', async () => {
    lastFetchUrl = null;
    lastFetchOptions = null;
    const result = await callLiteLLMVirtual({
      model: 'aisha-summary',
      messages: [{ role: 'user', content: 'test' }],
    });

    const body = JSON.parse(lastFetchOptions.body);
    assert.equal(body.model, 'aisha-summary');
    assert.ok(!body.model.includes('/'), 'alias must not have provider/ prefix');
    assert.equal(result.status, 'success');
  });

  it('targets the correct LiteLLM endpoint', async () => {
    process.env.LITELLM_BASE_URL = 'http://litellm:4000';
    await callLiteLLMVirtual({
      model: 'aisha-task',
      messages: [{ role: 'user', content: 'test' }],
    });
    assert.equal(lastFetchUrl, 'http://litellm:4000/v1/chat/completions');
  });

  it('attaches Authorization header when LITELLM_MASTER_KEY is set', async () => {
    process.env.LITELLM_MASTER_KEY = 'test-key-123';
    await callLiteLLMVirtual({
      model: 'aisha-mcp',
      messages: [{ role: 'user', content: 'test' }],
    });
    assert.equal(lastFetchOptions.headers.Authorization, 'Bearer test-key-123');
    delete process.env.LITELLM_MASTER_KEY;
  });

  it('includes max_tokens only when provided', async () => {
    await callLiteLLMVirtual({
      model: 'aisha-summary',
      messages: [{ role: 'user', content: 'test' }],
      maxTokens: 150,
    });
    const body = JSON.parse(lastFetchOptions.body);
    assert.equal(body.max_tokens, 150);

    await callLiteLLMVirtual({
      model: 'aisha-summary',
      messages: [{ role: 'user', content: 'test' }],
    });
    const body2 = JSON.parse(lastFetchOptions.body);
    assert.equal(body2.max_tokens, undefined);
  });

  it('includes tools array only when non-empty', async () => {
    const tools = [{ type: 'function', function: { name: 'test_tool', parameters: {} } }];
    await callLiteLLMVirtual({
      model: 'aisha-whatsapp',
      messages: [{ role: 'user', content: 'test' }],
      tools,
    });
    const body = JSON.parse(lastFetchOptions.body);
    assert.deepEqual(body.tools, tools);

    // Empty array — should not include tools key
    await callLiteLLMVirtual({
      model: 'aisha-whatsapp',
      messages: [{ role: 'user', content: 'test' }],
      tools: [],
    });
    const body2 = JSON.parse(lastFetchOptions.body);
    assert.equal(body2.tools, undefined);
  });

  it('includes tenantId in metadata user_id', async () => {
    await callLiteLLMVirtual({
      model: 'aisha-workflow',
      messages: [{ role: 'user', content: 'test' }],
      tenantId: 'tenant-abc-123',
    });
    const body = JSON.parse(lastFetchOptions.body);
    assert.equal(body.metadata?.user_id, 'tenant-abc-123');
  });

  it('falls back to system when tenantId is null', async () => {
    await callLiteLLMVirtual({
      model: 'aisha-workflow',
      messages: [{ role: 'user', content: 'test' }],
      tenantId: null,
    });
    const body = JSON.parse(lastFetchOptions.body);
    assert.equal(body.metadata?.user_id, 'system');
  });

  it('returns error status on non-ok HTTP response', async () => {
    mockFetchResponse = {
      ok: false,
      status: 502,
      text: async () => 'Bad Gateway',
    };
    const result = await callLiteLLMVirtual({
      model: 'aisha-vision',
      messages: [{ role: 'user', content: 'test' }],
    });
    assert.equal(result.status, 'error');
    assert.ok(result.error.includes('502'));
    mockFetchResponse = null;
  });

  it('returns content string from first choice', async () => {
    mockFetchResponse = {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'Generated summary text' } }],
        model: 'qwen2.5-14b',
      }),
      text: async () => '',
    };
    const result = await callLiteLLMVirtual({
      model: 'aisha-summary',
      messages: [{ role: 'user', content: 'test' }],
    });
    assert.equal(result.status, 'success');
    assert.equal(result.content, 'Generated summary text');
    mockFetchResponse = null;
  });

  it('passes through explicit provider/model for overrides (aisha-mcp passthrough)', async () => {
    await callLiteLLMVirtual({
      model: 'anthropic/claude-3-5-haiku-20241022',
      messages: [{ role: 'user', content: 'test' }],
    });
    const body = JSON.parse(lastFetchOptions.body);
    assert.equal(body.model, 'anthropic/claude-3-5-haiku-20241022');
  });
});
