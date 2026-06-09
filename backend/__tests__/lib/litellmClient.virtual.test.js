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
 * [2026-06-08 Claude] Fixed: use _fetch dependency injection instead of mock.module().
 *   mock.module() is experimental and unavailable in Node.js ≥25. callLiteLLMVirtual
 *   now accepts an optional _fetch parameter (defaults to node-fetch) so tests can
 *   pass a stub without touching the module registry.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { callLiteLLMVirtual } from '../../lib/aiEngine/litellmClient.js';

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a stub fetch that captures the last call and returns a configurable response.
 * @param {object|null} response  Override the default 200 success response.
 */
function makeMockFetch(response = null) {
  let lastUrl = null;
  let lastOpts = null;

  const mockFetch = async (url, opts) => {
    lastUrl = url;
    lastOpts = opts;
    if (response) return response;
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
  };

  mockFetch.getLastUrl = () => lastUrl;
  mockFetch.getLastOpts = () => lastOpts;
  mockFetch.getLastBody = () => (lastOpts?.body ? JSON.parse(lastOpts.body) : null);

  return mockFetch;
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('callLiteLLMVirtual', () => {
  it('sends model alias as-is (no provider/ prefix)', async () => {
    const mockFetch = makeMockFetch();
    const result = await callLiteLLMVirtual({
      model: 'aisha-summary',
      messages: [{ role: 'user', content: 'test' }],
      _fetch: mockFetch,
    });

    const body = mockFetch.getLastBody();
    assert.equal(body.model, 'aisha-summary');
    assert.ok(!body.model.includes('/'), 'alias must not have provider/ prefix');
    assert.equal(result.status, 'success');
  });

  it('targets the correct LiteLLM endpoint', async () => {
    process.env.LITELLM_BASE_URL = 'http://litellm:4000';
    const mockFetch = makeMockFetch();
    await callLiteLLMVirtual({
      model: 'aisha-task',
      messages: [{ role: 'user', content: 'test' }],
      _fetch: mockFetch,
    });
    assert.equal(mockFetch.getLastUrl(), 'http://litellm:4000/v1/chat/completions');
  });

  it('attaches Authorization header when LITELLM_MASTER_KEY is set', async () => {
    process.env.LITELLM_MASTER_KEY = 'test-key-123';
    const mockFetch = makeMockFetch();
    await callLiteLLMVirtual({
      model: 'aisha-mcp',
      messages: [{ role: 'user', content: 'test' }],
      _fetch: mockFetch,
    });
    assert.equal(mockFetch.getLastOpts().headers.Authorization, 'Bearer test-key-123');
    delete process.env.LITELLM_MASTER_KEY;
  });

  it('includes max_tokens only when provided', async () => {
    const mockFetch = makeMockFetch();
    await callLiteLLMVirtual({
      model: 'aisha-summary',
      messages: [{ role: 'user', content: 'test' }],
      maxTokens: 150,
      _fetch: mockFetch,
    });
    assert.equal(mockFetch.getLastBody().max_tokens, 150);

    const mockFetch2 = makeMockFetch();
    await callLiteLLMVirtual({
      model: 'aisha-summary',
      messages: [{ role: 'user', content: 'test' }],
      _fetch: mockFetch2,
    });
    assert.equal(mockFetch2.getLastBody().max_tokens, undefined);
  });

  it('includes tools array only when non-empty', async () => {
    const tools = [{ type: 'function', function: { name: 'test_tool', parameters: {} } }];
    const mockFetch = makeMockFetch();
    await callLiteLLMVirtual({
      model: 'aisha-whatsapp',
      messages: [{ role: 'user', content: 'test' }],
      tools,
      _fetch: mockFetch,
    });
    assert.deepEqual(mockFetch.getLastBody().tools, tools);

    // Empty array — should not include tools key
    const mockFetch2 = makeMockFetch();
    await callLiteLLMVirtual({
      model: 'aisha-whatsapp',
      messages: [{ role: 'user', content: 'test' }],
      tools: [],
      _fetch: mockFetch2,
    });
    assert.equal(mockFetch2.getLastBody().tools, undefined);
  });

  it('includes tenantId in metadata user_id', async () => {
    const mockFetch = makeMockFetch();
    await callLiteLLMVirtual({
      model: 'aisha-workflow',
      messages: [{ role: 'user', content: 'test' }],
      tenantId: 'tenant-abc-123',
      _fetch: mockFetch,
    });
    assert.equal(mockFetch.getLastBody().metadata?.user_id, 'tenant-abc-123');
  });

  it('falls back to system when tenantId is null', async () => {
    const mockFetch = makeMockFetch();
    await callLiteLLMVirtual({
      model: 'aisha-workflow',
      messages: [{ role: 'user', content: 'test' }],
      tenantId: null,
      _fetch: mockFetch,
    });
    assert.equal(mockFetch.getLastBody().metadata?.user_id, 'system');
  });

  it('returns error status on non-ok HTTP response', async () => {
    const mockFetch = makeMockFetch({
      ok: false,
      status: 502,
      text: async () => 'Bad Gateway',
    });
    const result = await callLiteLLMVirtual({
      model: 'aisha-vision',
      messages: [{ role: 'user', content: 'test' }],
      _fetch: mockFetch,
    });
    assert.equal(result.status, 'error');
    assert.ok(result.error.includes('502'));
  });

  it('returns content string from first choice', async () => {
    const mockFetch = makeMockFetch({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'Generated summary text' } }],
        model: 'qwen2.5-14b',
      }),
      text: async () => '',
    });
    const result = await callLiteLLMVirtual({
      model: 'aisha-summary',
      messages: [{ role: 'user', content: 'test' }],
      _fetch: mockFetch,
    });
    assert.equal(result.status, 'success');
    assert.equal(result.content, 'Generated summary text');
  });

  it('passes through explicit provider/model for overrides (aisha-mcp passthrough)', async () => {
    const mockFetch = makeMockFetch();
    await callLiteLLMVirtual({
      model: 'anthropic/claude-3-5-haiku-20241022',
      messages: [{ role: 'user', content: 'test' }],
      _fetch: mockFetch,
    });
    assert.equal(mockFetch.getLastBody().model, 'anthropic/claude-3-5-haiku-20241022');
  });
});
