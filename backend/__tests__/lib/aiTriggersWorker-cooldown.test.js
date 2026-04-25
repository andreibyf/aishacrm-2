/**
 * Regression test for the CARE trigger CPU storm (incident 2026-04-25).
 *
 * Bug: When AI Brain returned no proposed actions ("generation_failed") OR
 * a low-confidence suggestion, no row was written to `ai_suggestions`.
 * The worker's existence check therefore never short-circuited subsequent
 * ticks, and the same expensive LLM call was re-issued every minute against
 * the same record. With ~10 matching opportunities per tick × ~12s/LLM call,
 * the worker drove the VPS to 933% CPU and required a hard reboot.
 *
 * Fix: in-memory cooldown keyed by (tenant, trigger, record) that suppresses
 * the LLM call for `CARE_GENERATION_COOLDOWN_MS` (default 1h) after a failed
 * or low-confidence outcome.
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  createSuggestionIfNew,
  _resetGenerationCooldown,
} from '../../lib/aiTriggersWorker.js';

const TENANT = '00000000-0000-0000-0000-0000000000aa';
const RECORD = '00000000-0000-0000-0000-0000000000bb';

function makeSupabaseStub() {
  // Returns no existing suggestion so the cooldown is the only thing that
  // can short-circuit a second invocation.
  const builder = {
    select() { return this; },
    eq() { return this; },
    or() { return this; },
    limit() { return Promise.resolve({ data: [], error: null }); },
    insert() {
      return {
        select() {
          return {
            single() {
              return Promise.resolve({
                data: { id: '00000000-0000-0000-0000-0000000000cc' },
                error: null,
              });
            },
          };
        },
      };
    },
  };
  return {
    from() { return builder; },
  };
}

describe('aiTriggersWorker generation cooldown', () => {
  beforeEach(() => {
    _resetGenerationCooldown();
  });

  test('generation_failed result skips LLM on subsequent calls within TTL', async () => {
    let generateCalls = 0;
    const supabase = makeSupabaseStub();

    const trigger = {
      triggerId: 'closing_thirty_days',
      recordType: 'opportunity',
      recordId: RECORD,
      context: {},
    };

    const generateAiSuggestion = async () => {
      generateCalls += 1;
      return null; // simulate AI Brain returning no proposed actions
    };

    const deps = {
      supabase,
      generateAiSuggestion,
      emitTenantWebhooks: async () => {},
      emitCareAudit: () => {},
      logger: { debug() {}, info() {}, warn() {}, error() {} },
    };

    const r1 = await createSuggestionIfNew(TENANT, trigger, deps);
    const r2 = await createSuggestionIfNew(TENANT, trigger, deps);
    const r3 = await createSuggestionIfNew(TENANT, trigger, deps);

    assert.equal(r1, null);
    assert.equal(r2, null);
    assert.equal(r3, null);
    assert.equal(
      generateCalls,
      1,
      'AI Brain must only be called once for the same (trigger, record) within the cooldown window',
    );
  });

  test('low_confidence result also enters cooldown', async () => {
    let generateCalls = 0;
    const supabase = makeSupabaseStub();

    const trigger = {
      triggerId: 'closing_thirty_days',
      recordType: 'opportunity',
      recordId: RECORD,
      context: {},
    };

    const generateAiSuggestion = async () => {
      generateCalls += 1;
      return {
        action: { tool_name: 'noop', tool_args: {} },
        confidence: 0.3, // below the 0.7 gate
        reasoning: 'unsure',
      };
    };

    const deps = {
      supabase,
      generateAiSuggestion,
      emitTenantWebhooks: async () => {},
      emitCareAudit: () => {},
      logger: { debug() {}, info() {}, warn() {}, error() {} },
    };

    await createSuggestionIfNew(TENANT, trigger, deps);
    await createSuggestionIfNew(TENANT, trigger, deps);

    assert.equal(
      generateCalls,
      1,
      'Low-confidence outcome must also gate further LLM calls',
    );
  });

  test('cooldown is keyed per-record — different records still hit the LLM', async () => {
    let generateCalls = 0;
    const supabase = makeSupabaseStub();

    const generateAiSuggestion = async () => {
      generateCalls += 1;
      return null;
    };

    const deps = {
      supabase,
      generateAiSuggestion,
      emitTenantWebhooks: async () => {},
      emitCareAudit: () => {},
      logger: { debug() {}, info() {}, warn() {}, error() {} },
    };

    await createSuggestionIfNew(TENANT, {
      triggerId: 'closing_thirty_days',
      recordType: 'opportunity',
      recordId: '00000000-0000-0000-0000-0000000000b1',
      context: {},
    }, deps);

    await createSuggestionIfNew(TENANT, {
      triggerId: 'closing_thirty_days',
      recordType: 'opportunity',
      recordId: '00000000-0000-0000-0000-0000000000b2',
      context: {},
    }, deps);

    assert.equal(
      generateCalls,
      2,
      'Cooldown must NOT block a different recordId',
    );
  });
});
