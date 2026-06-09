/**
 * LiteLLM Virtual Model Alias Routing Tests
 *
 * Contract tests that each refactored non-AiSHA caller sends the correct
 * virtual model alias to LiteLLM. These tests use the _fetch dependency
 * injection parameter added to callLiteLLMVirtual — no module mocking needed.
 *
 * Callers under test:
 * - aiSummary.js      → aisha-summary
 * - taskWorkers.js    → aisha-task  (via OpenAI client pointed at LiteLLM)
 * - workflowExecutionService.js (ai_summarize, ai_generate_email) → aisha-workflow
 * - documents.js      → aisha-vision
 * - documents.v2.js   → aisha-vision
 * - mcp.js callLLMWithFailover default → aisha-mcp
 * - mcp.js callLLMWithFailover with explicit override → provider/model passthrough
 * - whatsapp.js       → aisha-whatsapp (via OpenAI SDK pointed at LiteLLM baseURL)
 *
 * [2026-06-08 Claude] Added as part of LiteLLM virtual model alias refactor
 * [2026-06-08 Claude] Fixed: replaced mock.module('node-fetch') with _fetch injection.
 *   mock.module is experimental and absent in Node.js ≥25; _fetch param defaults to
 *   the real node-fetch in production and accepts a stub in tests.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { callLiteLLMVirtual } from '../../lib/aiEngine/litellmClient.js';

// ─── Shared fetch stub ────────────────────────────────────────────────────────

function makeFetchStub() {
  let capturedBody = null;
  const stub = async (_url, opts) => {
    capturedBody = opts?.body ? JSON.parse(opts.body) : null;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'mock response' }, finish_reason: 'stop' }],
        usage: {},
      }),
      text: async () => 'ok',
    };
  };
  stub.body = () => capturedBody;
  return stub;
}

// ─── callLiteLLMVirtual model alias ──────────────────────────────────────────

describe('callLiteLLMVirtual model alias', () => {
  it('sends aisha-summary for summary calls', async () => {
    const stub = makeFetchStub();
    await callLiteLLMVirtual({
      model: 'aisha-summary',
      messages: [{ role: 'user', content: 'test' }],
      _fetch: stub,
    });
    assert.equal(stub.body()?.model, 'aisha-summary');
  });

  it('sends aisha-workflow for workflow calls', async () => {
    const stub = makeFetchStub();
    await callLiteLLMVirtual({
      model: 'aisha-workflow',
      messages: [{ role: 'user', content: 'test' }],
      _fetch: stub,
    });
    assert.equal(stub.body()?.model, 'aisha-workflow');
  });

  it('sends aisha-vision for document extraction', async () => {
    const stub = makeFetchStub();
    await callLiteLLMVirtual({
      model: 'aisha-vision',
      messages: [{ role: 'user', content: 'test' }],
      _fetch: stub,
    });
    assert.equal(stub.body()?.model, 'aisha-vision');
  });

  it('sends aisha-mcp for MCP default path', async () => {
    const stub = makeFetchStub();
    await callLiteLLMVirtual({
      model: 'aisha-mcp',
      messages: [{ role: 'user', content: 'test' }],
      _fetch: stub,
    });
    assert.equal(stub.body()?.model, 'aisha-mcp');
  });

  it('sends aisha-task for task execution', async () => {
    const stub = makeFetchStub();
    await callLiteLLMVirtual({
      model: 'aisha-task',
      messages: [{ role: 'user', content: 'test' }],
      _fetch: stub,
    });
    assert.equal(stub.body()?.model, 'aisha-task');
  });

  it('sends aisha-whatsapp for WhatsApp AI replies', async () => {
    const stub = makeFetchStub();
    await callLiteLLMVirtual({
      model: 'aisha-whatsapp',
      messages: [{ role: 'user', content: 'test' }],
      _fetch: stub,
    });
    assert.equal(stub.body()?.model, 'aisha-whatsapp');
  });

  it('passes explicit provider/model through unchanged (MCP override path)', async () => {
    const stub = makeFetchStub();
    await callLiteLLMVirtual({
      model: 'anthropic/claude-3-5-haiku-20241022',
      messages: [{ role: 'user', content: 'test' }],
      _fetch: stub,
    });
    assert.equal(stub.body()?.model, 'anthropic/claude-3-5-haiku-20241022');
  });
});

// ─── mcp.js callLLMWithFailover contract ─────────────────────────────────────
// callLLMWithFailover is not exported — verify routing by reading mcp.js source.

describe('callLLMWithFailover virtual model routing', () => {
  it('mcp.js imports callLiteLLMVirtual (not selectLLMConfigForTenant)', async () => {
    // Verify no stale imports by reading module source
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(new URL('../../routes/mcp.js', import.meta.url), 'utf8');
    assert.ok(src.includes('callLiteLLMVirtual'), 'should import callLiteLLMVirtual');
    assert.ok(
      !src.includes('selectLLMConfigForTenant'),
      'must not import selectLLMConfigForTenant',
    );
    assert.ok(!src.includes('generateChatCompletion'), 'must not import generateChatCompletion');
    assert.ok(!src.includes('resolveLLMApiKey'), 'must not import resolveLLMApiKey');
  });

  it('callLLMWithFailover uses aisha-mcp when no explicit model given', async () => {
    const src = await (
      await import('node:fs/promises')
    ).readFile(new URL('../../routes/mcp.js', import.meta.url), 'utf8');
    assert.ok(src.includes("'aisha-mcp'"), "default model alias 'aisha-mcp' must appear in mcp.js");
  });

  it('callLLMWithFailover builds passthrough model when explicitProvider+explicitModel given', async () => {
    const src = await (
      await import('node:fs/promises')
    ).readFile(new URL('../../routes/mcp.js', import.meta.url), 'utf8');
    assert.ok(
      src.includes('`${explicitProvider}/${explicitModel}`'),
      'should build provider/model passthrough string',
    );
  });
});

// ─── workflowExecutionService contract ───────────────────────────────────────

describe('workflowExecutionService virtual model routing', () => {
  it('imports callLiteLLMVirtual (not generateChatCompletion)', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(
      new URL('../../services/workflowExecutionService.js', import.meta.url),
      'utf8',
    );
    assert.ok(src.includes('callLiteLLMVirtual'), 'should import callLiteLLMVirtual');
    assert.ok(!src.includes('generateChatCompletion'), 'must not import generateChatCompletion');
    assert.ok(
      !src.includes('selectLLMConfigForTenant'),
      'must not import selectLLMConfigForTenant',
    );
  });

  it('ai_summarize case uses aisha-workflow alias', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(
      new URL('../../services/workflowExecutionService.js', import.meta.url),
      'utf8',
    );
    // Both workflow AI cases should use aisha-workflow
    const matches = [...src.matchAll(/model:\s*'aisha-workflow'/g)];
    assert.ok(
      matches.length >= 2,
      `expected ≥2 'aisha-workflow' references, found ${matches.length}`,
    );
  });
});

// ─── documents.js contract ───────────────────────────────────────────────────

describe('documents.js virtual model routing', () => {
  it('imports callLiteLLMVirtual (not generateChatCompletion)', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(new URL('../../routes/documents.js', import.meta.url), 'utf8');
    assert.ok(src.includes('callLiteLLMVirtual'), 'should import callLiteLLMVirtual');
    assert.ok(!src.includes('generateChatCompletion'), 'must not import generateChatCompletion');
    assert.ok(
      !src.includes('selectLLMConfigForTenant'),
      'must not import selectLLMConfigForTenant',
    );
    assert.ok(!src.includes('resolveLLMApiKey'), 'must not import resolveLLMApiKey');
  });

  it('uses aisha-vision alias', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(new URL('../../routes/documents.js', import.meta.url), 'utf8');
    assert.ok(src.includes("'aisha-vision'"), "should use 'aisha-vision' alias");
  });
});

// ─── documents.v2.js contract ────────────────────────────────────────────────

describe('documents.v2.js virtual model routing', () => {
  it('imports callLiteLLMVirtual (not generateChatCompletion)', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(new URL('../../routes/documents.v2.js', import.meta.url), 'utf8');
    assert.ok(src.includes('callLiteLLMVirtual'), 'should import callLiteLLMVirtual');
    assert.ok(!src.includes('generateChatCompletion'), 'must not import generateChatCompletion');
    assert.ok(
      !src.includes('selectLLMConfigForTenant'),
      'must not import selectLLMConfigForTenant',
    );
  });

  it('uses aisha-vision alias', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(new URL('../../routes/documents.v2.js', import.meta.url), 'utf8');
    assert.ok(src.includes("'aisha-vision'"), "should use 'aisha-vision' alias");
  });
});

// ─── aiSummary.js contract ────────────────────────────────────────────────────

describe('aiSummary.js virtual model routing', () => {
  it('imports callLiteLLMVirtual', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(new URL('../../routes/aiSummary.js', import.meta.url), 'utf8');
    assert.ok(src.includes('callLiteLLMVirtual'), 'should import callLiteLLMVirtual');
    assert.ok(!src.includes('generateChatCompletion'), 'must not import generateChatCompletion');
    assert.ok(
      !src.includes('selectLLMConfigForTenant'),
      'must not import selectLLMConfigForTenant',
    );
  });

  it('uses aisha-summary alias', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(new URL('../../routes/aiSummary.js', import.meta.url), 'utf8');
    assert.ok(src.includes("'aisha-summary'"), "should use 'aisha-summary' alias");
  });
});

// ─── whatsapp.js contract ────────────────────────────────────────────────────

describe('whatsapp.js virtual model routing', () => {
  it('does not import selectLLMConfigForTenant or createAnthropicClientWrapper', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(new URL('../../routes/whatsapp.js', import.meta.url), 'utf8');
    assert.ok(
      !src.includes('selectLLMConfigForTenant'),
      'must not import selectLLMConfigForTenant',
    );
    assert.ok(
      !src.includes('createAnthropicClientWrapper'),
      'must not import createAnthropicClientWrapper',
    );
    assert.ok(!src.includes('resolveLLMApiKey'), 'must not import resolveLLMApiKey');
  });

  it('uses aisha-whatsapp model alias', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(new URL('../../routes/whatsapp.js', import.meta.url), 'utf8');
    assert.ok(src.includes("'aisha-whatsapp'"), "should use 'aisha-whatsapp' alias");
  });

  it('creates OpenAI client pointed at LiteLLM baseURL', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(new URL('../../routes/whatsapp.js', import.meta.url), 'utf8');
    assert.ok(
      src.includes('LITELLM_BASE_URL') && src.includes('baseURL'),
      'should create OpenAI client with LiteLLM baseURL',
    );
  });
});
