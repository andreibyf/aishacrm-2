/**
 * Regression test for persistent generation_skipped cooldown.
 *
 * The in-memory cooldown (incident 2026-04-25 fix) prevented the CPU storm
 * during normal operation, but cleared on every container restart — meaning
 * the loop resumed immediately after a crash. This persistent variant writes
 * a `generation_skipped` marker row to `ai_suggestions` so the dedup check
 * survives restarts.
 *
 * Run with: node --test backend/__tests__/lib/aiTriggersWorker-persistent-cooldown.test.js
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { createSuggestionIfNew, _resetGenerationCooldown } from '../../lib/aiTriggersWorker.js';

const TENANT = '00000000-0000-0000-0000-0000000000aa';
const RECORD = '00000000-0000-0000-0000-0000000000bb';

/**
 * Supabase stub that tracks insert calls and can simulate
 * a "generation_skipped" row existing in ai_suggestions.
 */
function makeSupabaseStub({ existingRows = [], insertError = null } = {}) {
  const insertCalls = [];

  const builder = {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    or() {
      return this;
    },
    in() {
      return this;
    },
    limit() {
      // Return existingRows for the dedup check
      return Promise.resolve({ data: [...existingRows], error: null });
    },
    insert(row) {
      insertCalls.push(row);
      if (insertError) {
        return {
          select() {
            return {
              single() {
                return Promise.resolve({ data: null, error: insertError });
              },
            };
          },
        };
      }
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
    from() {
      return builder;
    },
    _insertCalls: insertCalls,
  };
}

const nopLogger = { debug() {}, info() {}, warn() {}, error() {} };

describe('aiTriggersWorker persistent generation_skipped cooldown', () => {
  beforeEach(() => {
    _resetGenerationCooldown();
  });

  // --------------------------------------------------------------------------
  // Test 1: generation_failed inserts a generation_skipped row to DB
  // --------------------------------------------------------------------------
  test('generation_failed writes a generation_skipped marker row to ai_suggestions', async () => {
    const supabase = makeSupabaseStub();

    const trigger = {
      triggerId: 'closing_thirty_days',
      recordType: 'opportunity',
      recordId: RECORD,
      context: { deal_name: 'Test Deal' },
    };

    await createSuggestionIfNew(TENANT, trigger, {
      supabase,
      generateAiSuggestion: async () => null, // generation_failed
      emitTenantWebhooks: async () => {},
      emitCareAudit: () => {},
      logger: nopLogger,
    });

    // Should have TWO inserts: (1) generation_skipped marker, (2) none for suggestion
    // Actually the suggestion insert doesn't happen because generation_failed returns early.
    // The only insert should be the generation_skipped marker.
    const skippedInserts = supabase._insertCalls.filter(
      (row) => row.status === 'generation_skipped',
    );
    assert.equal(skippedInserts.length, 1, 'Should insert exactly one generation_skipped row');
    assert.equal(skippedInserts[0].trigger_id, 'closing_thirty_days');
    assert.equal(skippedInserts[0].record_id, RECORD);
    assert.equal(skippedInserts[0].confidence, 0);
    assert.ok(skippedInserts[0].expires_at, 'Should have an expires_at timestamp');
  });

  // --------------------------------------------------------------------------
  // Test 2: low_confidence also inserts a generation_skipped row
  // --------------------------------------------------------------------------
  test('low_confidence writes a generation_skipped marker row to ai_suggestions', async () => {
    const supabase = makeSupabaseStub();

    const trigger = {
      triggerId: 'deal_decay',
      recordType: 'opportunity',
      recordId: RECORD,
      context: { deal_name: 'Low Conf Deal' },
    };

    await createSuggestionIfNew(TENANT, trigger, {
      supabase,
      generateAiSuggestion: async () => ({
        action: { tool_name: 'noop', tool_args: {} },
        confidence: 0.3, // below 0.7 threshold
        reasoning: 'unsure',
      }),
      emitTenantWebhooks: async () => {},
      emitCareAudit: () => {},
      logger: nopLogger,
    });

    const skippedInserts = supabase._insertCalls.filter(
      (row) => row.status === 'generation_skipped',
    );
    assert.equal(skippedInserts.length, 1, 'Low confidence should also persist a cooldown marker');
  });

  // --------------------------------------------------------------------------
  // Test 3: After "restart" (clear in-memory cooldown), DB row blocks LLM
  // --------------------------------------------------------------------------
  test('dedup check finds generation_skipped row after in-memory cooldown is cleared', async () => {
    let generateCalls = 0;

    // Simulate: the generation_skipped row already exists in the DB
    // (written by a previous container instance before crash)
    const supabase = makeSupabaseStub({
      existingRows: [
        {
          id: '00000000-0000-0000-0000-0000000000dd',
          status: 'generation_skipped',
          updated_at: new Date().toISOString(),
        },
      ],
    });

    const trigger = {
      triggerId: 'closing_thirty_days',
      recordType: 'opportunity',
      recordId: RECORD,
      context: {},
    };

    // In-memory cooldown is cleared (simulating restart via beforeEach)
    // The dedup check should find the generation_skipped row and return early
    const result = await createSuggestionIfNew(TENANT, trigger, {
      supabase,
      generateAiSuggestion: async () => {
        generateCalls += 1;
        return null;
      },
      emitTenantWebhooks: async () => {},
      emitCareAudit: () => {},
      logger: nopLogger,
    });

    assert.equal(result, null);
    assert.equal(
      generateCalls,
      0,
      'LLM must NOT be called when a generation_skipped row exists in the DB',
    );
  });

  // --------------------------------------------------------------------------
  // Test 4: DB insert failure is non-fatal (in-memory cooldown still works)
  // --------------------------------------------------------------------------
  test('_persistGenerationSkipped failure does not crash the worker', async () => {
    let generateCalls = 0;

    // Supabase insert will error for the generation_skipped row
    const supabase = makeSupabaseStub({
      insertError: { code: '42P01', message: 'table does not exist' },
    });

    const trigger = {
      triggerId: 'closing_thirty_days',
      recordType: 'opportunity',
      recordId: RECORD,
      context: {},
    };

    const deps = {
      supabase,
      generateAiSuggestion: async () => {
        generateCalls += 1;
        return null;
      },
      emitTenantWebhooks: async () => {},
      emitCareAudit: () => {},
      logger: nopLogger,
    };

    // First call should succeed despite DB insert failure
    const r1 = await createSuggestionIfNew(TENANT, trigger, deps);
    assert.equal(r1, null);
    assert.equal(generateCalls, 1);

    // Second call should be blocked by in-memory cooldown even though DB insert failed
    const r2 = await createSuggestionIfNew(TENANT, trigger, deps);
    assert.equal(r2, null);
    assert.equal(generateCalls, 1, 'In-memory cooldown must still work even if DB persist fails');
  });

  // --------------------------------------------------------------------------
  // Test 5: Successful suggestion does NOT write generation_skipped
  // --------------------------------------------------------------------------
  test('successful suggestion creation does not write a generation_skipped row', async () => {
    const supabase = makeSupabaseStub();

    const trigger = {
      triggerId: 'lead_stagnant',
      recordType: 'lead',
      recordId: RECORD,
      context: { lead_name: 'Test Lead', days_stagnant: 10 },
    };

    await createSuggestionIfNew(TENANT, trigger, {
      supabase,
      generateAiSuggestion: async () => ({
        action: { tool_name: 'create_activity', tool_args: {} },
        confidence: 0.85,
        reasoning: 'Test suggestion',
      }),
      emitTenantWebhooks: async () => {},
      emitCareAudit: () => {},
      logger: nopLogger,
    });

    const skippedInserts = supabase._insertCalls.filter(
      (row) => row.status === 'generation_skipped',
    );
    assert.equal(
      skippedInserts.length,
      0,
      'Successful generation must NOT write a generation_skipped row',
    );
  });
});
