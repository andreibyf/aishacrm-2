/**
 * Unit tests for LLM activity logger stats, persist payload shape,
 * model-aware cost resolution, and persist error counting.
 *
 * IMPORTANT: Mocks for `getSupabaseClient` are installed before the module
 * under test is imported, because ESM bindings are frozen after import.
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

import {
  logLLMActivity,
  getLLMActivity,
  getLLMActivityStats,
  clearLLMActivity,
  resolveModelRates,
  buildPersistPayload,
  getPersistCounters,
  __resetPersistCountersForTest,
  __setSupabaseClientForTest,
  __resetSupabaseClientForTest,
} from '../../lib/aiEngine/activityLogger.js';

// Per-test state for the injected Supabase stub.
let supabaseStub = null;
let insertSpy = null;
let insertResult = { error: null };

function makeSupabaseStub() {
  insertSpy = mock.fn(async () => insertResult);
  return {
    from: () => ({ insert: insertSpy }),
  };
}

function waitForPersist() {
  // Persist is fire-and-forget; flush the microtask queue.
  return new Promise((resolve) => setImmediate(resolve));
}

// --- Tests ----------------------------------------------------------------

describe('LLM Activity Logger stats', () => {
  beforeEach(() => {
    clearLLMActivity();
    __resetPersistCountersForTest();
    supabaseStub = null; // default: no supabase configured
    insertResult = { error: null };
    __setSupabaseClientForTest(() => supabaseStub);
  });

  afterEach(() => {
    __resetSupabaseClientForTest();
  });

  it('falls back to buffer window and exposes allTime + estimated cost fields', () => {
    const logSpy = mock.method(console, 'log', () => {});
    const debugSpy = mock.method(console, 'debug', () => {});
    try {
      logLLMActivity({
        tenantId: '00000000-0000-0000-0000-000000000001',
        capability: 'chat_tools',
        provider: 'openai',
        model: 'gpt-4o',
        status: 'success',
        durationMs: 1200,
        usage: {
          prompt_tokens: 1000,
          completion_tokens: 500,
          total_tokens: 1500,
        },
      });

      const entries = getLLMActivity({ limit: 1 });
      entries[0].timestamp = new Date(Date.now() - 6 * 60 * 1000).toISOString();

      const stats = getLLMActivityStats();

      assert.equal(stats.windowLabel, 'buffer');
      assert.equal(stats.last5Minutes, 0);
      assert.equal(stats.totalEntries, 1);
      assert.equal(stats.avgDurationMs, 1200);
      assert.equal(stats.allTime.byProvider.openai, 1);
      assert.equal(stats.allTime.byStatus.success, 1);
      assert.equal(stats.allTime.byCapability.chat_tools, 1);

      assert.equal(stats.tokenUsage.allTime.totalTokens, 1500);
      assert.equal(stats.tokenUsage.allTime.promptTokens, 1000);
      assert.equal(stats.tokenUsage.allTime.completionTokens, 500);
      assert.equal(stats.tokenUsage.allTime.estimatedCostUSD, 0.0075); // gpt-4o rates
    } finally {
      logSpy.mock.restore();
      debugSpy.mock.restore();
    }
  });

  it('exposes persistence counters in stats payload', () => {
    const logSpy = mock.method(console, 'log', () => {});
    try {
      const stats = getLLMActivityStats();
      assert.ok(stats.persistence);
      assert.equal(stats.persistence.attempts, 0);
      assert.equal(stats.persistence.errors, 0);
    } finally {
      logSpy.mock.restore();
    }
  });
});

describe('resolveModelRates (model-aware cost lookup)', () => {
  it('returns gpt-4o-mini rates when the model matches the mini variant', () => {
    const rates = resolveModelRates('openai', 'gpt-4o-mini-2024-07-18');
    assert.equal(rates.input, 0.00015);
    assert.equal(rates.output, 0.0006);
  });

  it('returns gpt-4o rates for the canonical model', () => {
    const rates = resolveModelRates('openai', 'gpt-4o');
    assert.equal(rates.input, 0.0025);
    assert.equal(rates.output, 0.01);
  });

  it('distinguishes claude haiku from sonnet and opus', () => {
    assert.deepEqual(resolveModelRates('anthropic', 'claude-haiku-4-5'), {
      input: 0.0008,
      output: 0.004,
    });
    assert.deepEqual(resolveModelRates('anthropic', 'claude-sonnet-4-6'), {
      input: 0.003,
      output: 0.015,
    });
    assert.deepEqual(resolveModelRates('anthropic', 'claude-opus-4-6'), {
      input: 0.015,
      output: 0.075,
    });
  });

  it('falls back to provider defaults for unknown models', () => {
    const rates = resolveModelRates('anthropic', 'claude-unknown-future-model');
    assert.equal(rates.input, 0.003);
    assert.equal(rates.output, 0.015);
  });

  it('treats local provider as free', () => {
    assert.deepEqual(resolveModelRates('local', 'qwen2.5-coder:3b'), {
      input: 0,
      output: 0,
    });
  });

  it('falls back to openai defaults for unknown provider', () => {
    const rates = resolveModelRates('unknown-vendor', 'whatever');
    assert.equal(rates.input, 0.0025);
    assert.equal(rates.output, 0.01);
  });
});

describe('buildPersistPayload', () => {
  it('maps buffer entry to DB column shape with external_id', () => {
    const row = buildPersistPayload({
      id: 'llm-123-abc',
      tenantId: '00000000-0000-0000-0000-000000000001',
      capability: 'chat_tools',
      provider: 'openai',
      model: 'gpt-4o',
      nodeId: 'ai:chat:iter0',
      containerId: 'backend-1',
      status: 'success',
      durationMs: 900,
      error: null,
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      toolsCalled: ['crm_search_accounts'],
      intent: 'LEAD_CREATE',
      taskId: 'task_1',
      requestId: 'req_1',
      attempt: 1,
      totalAttempts: 1,
      timestamp: '2026-04-14T00:00:00.000Z',
    });

    assert.equal(row.external_id, 'llm-123-abc');
    assert.equal(row.tenant_id, '00000000-0000-0000-0000-000000000001');
    assert.equal(row.provider, 'openai');
    assert.equal(row.model, 'gpt-4o');
    assert.deepEqual(row.tools_called, ['crm_search_accounts']);
    assert.equal(row.created_at, '2026-04-14T00:00:00.000Z');
    assert.ok(!('id' in row), 'PK is DB-generated (UUID default); payload must not include id');
  });

  it("normalizes tenant 'unknown' to null and non-array tools_called to []", () => {
    const row = buildPersistPayload({
      id: 'llm-x',
      tenantId: 'unknown',
      capability: 'chat_tools',
      provider: 'openai',
      model: 'gpt-4o',
      toolsCalled: null,
      timestamp: '2026-04-14T00:00:00.000Z',
    });
    assert.equal(row.tenant_id, null);
    assert.deepEqual(row.tools_called, []);
  });
});

describe('persistToDatabase (fire-and-forget)', () => {
  beforeEach(() => {
    clearLLMActivity();
    __resetPersistCountersForTest();
    supabaseStub = null;
    insertResult = { error: null };
    __setSupabaseClientForTest(() => supabaseStub);
  });

  afterEach(() => {
    __resetSupabaseClientForTest();
  });

  it('increments attempts+successes when supabase insert succeeds', async () => {
    const logSpy = mock.method(console, 'log', () => {});
    try {
      supabaseStub = makeSupabaseStub();
      logLLMActivity({
        tenantId: '00000000-0000-0000-0000-000000000001',
        capability: 'chat_tools',
        provider: 'openai',
        model: 'gpt-4o',
        status: 'success',
        durationMs: 50,
      });

      await waitForPersist();
      const counters = getPersistCounters();
      assert.equal(counters.attempts, 1);
      assert.equal(counters.successes, 1);
      assert.equal(counters.errors, 0);
      assert.equal(insertSpy.mock.callCount(), 1);

      // Payload must be the buildPersistPayload shape.
      const sent = insertSpy.mock.calls[0].arguments[0];
      assert.equal(sent.provider, 'openai');
      assert.equal(sent.model, 'gpt-4o');
      assert.equal(sent.status, 'success');
    } finally {
      logSpy.mock.restore();
    }
  });

  it('increments errors and records lastError when supabase returns an error', async () => {
    const logSpy = mock.method(console, 'log', () => {});
    const debugSpy = mock.method(console, 'debug', () => {});
    try {
      supabaseStub = makeSupabaseStub();
      insertResult = { error: { message: 'permission denied' } };

      logLLMActivity({
        tenantId: '00000000-0000-0000-0000-000000000001',
        capability: 'chat_tools',
        provider: 'openai',
        model: 'gpt-4o',
        status: 'success',
      });

      await waitForPersist();
      const counters = getPersistCounters();
      assert.equal(counters.attempts, 1);
      assert.equal(counters.successes, 0);
      assert.equal(counters.errors, 1);
      assert.equal(counters.lastError, 'permission denied');
      assert.ok(counters.lastErrorAt);
    } finally {
      logSpy.mock.restore();
      debugSpy.mock.restore();
    }
  });

  it('does not count errors when supabase client is unavailable (silent skip)', async () => {
    const logSpy = mock.method(console, 'log', () => {});
    try {
      supabaseStub = null; // getSupabaseClient() returns null
      logLLMActivity({
        tenantId: '00000000-0000-0000-0000-000000000001',
        capability: 'chat_tools',
        provider: 'openai',
        model: 'gpt-4o',
        status: 'success',
      });
      await waitForPersist();
      const counters = getPersistCounters();
      assert.equal(counters.attempts, 1);
      assert.equal(counters.successes, 0);
      assert.equal(counters.errors, 0);
    } finally {
      logSpy.mock.restore();
    }
  });
});
