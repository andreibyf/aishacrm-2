/**
 * Unit tests for createSuggestionIfNew()
 *
 * Tests all 6 outcome paths (suggestion_created, duplicate_suppressed,
 * generation_failed, constraint_violation, error, catch-all) using
 * lightweight mock dependencies — no containers, no real DB.
 *
 * Run with: node --test backend/__tests__/ai/createSuggestionIfNew.test.js
 */

import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { createSuggestionIfNew } from '../../lib/aiTriggersWorker.js';
import { OUTCOME_TYPES } from '../../lib/care/careTypes.js';
import { CareAuditEventType } from '../../lib/care/careAuditTypes.js';

// ============================================================================
// Shared fixtures
// ============================================================================

const TENANT_UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const TRIGGER_DATA = {
  triggerId: 'lead_stagnant',
  recordType: 'lead',
  recordId: '11111111-2222-3333-4444-555555555555',
  context: { days_stagnant: 14, last_activity: '2026-01-01' },
  priority: 'high',
};

const VALID_SUGGESTION = {
  action: { tool_name: 'update_lead', tool_args: { status: 'contacted' } },
  confidence: 0.85,
  reasoning: 'Lead has been stagnant for 14 days. Recommend follow-up.',
};

const INSERTED_ID = '99999999-0000-1111-2222-333333333333';

// ============================================================================
// Mock factories
// ============================================================================

/** Silent logger — captures nothing, prints nothing */
function noopLogger() {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {},
  };
}

/**
 * Build a mock Supabase client.
 *
 * @param {object} opts
 * @param {object|null} opts.selectData   — rows returned by the cooldown SELECT
 * @param {object|null} opts.selectError  — error returned by the cooldown SELECT
 * @param {object|null} opts.insertData   — row returned after INSERT
 * @param {object|null} opts.insertError  — error returned by INSERT
 */
function createMockSupabase({ selectData = [], selectError = null, insertData = null, insertError = null } = {}) {
  const calls = { from: [], select: [], insert: [] };

  // --- SELECT chain (cooldown/duplicate check) ---
  const selectChain = {
    eq() { return selectChain; },
    or() { return selectChain; },
    limit() { return Promise.resolve({ data: selectData, error: selectError }); },
  };

  // --- INSERT chain ---
  const insertSingleChain = {
    single() { return Promise.resolve({ data: insertData, error: insertError }); },
  };
  const insertSelectChain = {
    select() { return insertSingleChain; },
  };

  const fromHandler = (table) => {
    calls.from.push(table);
    return {
      select(columns) {
        calls.select.push(columns);
        return selectChain;
      },
      insert(payload) {
        calls.insert.push(payload);
        return insertSelectChain;
      },
    };
  };

  return { from: fromHandler, _calls: calls };
}

/** Mock generateAiSuggestion — returns what you tell it to. */
function mockGenerate(returnValue) {
  let callCount = 0;
  const fn = async () => { callCount++; return returnValue; };
  fn.callCount = () => callCount;
  return fn;
}

/** Mock emitTenantWebhooks — resolved promise, records calls. */
function mockWebhooks() {
  const calls = [];
  const fn = async (...args) => { calls.push(args); };
  fn.calls = calls;
  return fn;
}

/** Mock emitCareAudit — records calls synchronously. */
function mockAudit() {
  const calls = [];
  const fn = (event) => { calls.push(event); };
  fn.calls = calls;
  return fn;
}

// ============================================================================
// Tests
// ============================================================================

describe('createSuggestionIfNew', () => {
  let log;
  let audit;
  let webhooks;

  beforeEach(() => {
    log = noopLogger();
    audit = mockAudit();
    webhooks = mockWebhooks();
  });

  // --------------------------------------------------------------------------
  // 1. duplicate_suppressed
  // --------------------------------------------------------------------------
  describe('duplicate_suppressed', () => {
    test('returns null when an existing pending suggestion is found', async () => {
      const supabase = createMockSupabase({
        selectData: [{ id: 'existing-1', status: 'pending', updated_at: new Date().toISOString() }],
      });
      const generate = mockGenerate(VALID_SUGGESTION);

      const result = await createSuggestionIfNew(TENANT_UUID, TRIGGER_DATA, {
        supabase,
        generateAiSuggestion: generate,
        emitTenantWebhooks: webhooks,
        logger: log,
        emitCareAudit: audit,
      });

      assert.equal(result, null, 'should return null for duplicate');
      assert.equal(supabase._calls.insert.length, 0, 'should NOT insert');
      assert.equal(generate.callCount(), 0, 'should NOT call generateAiSuggestion');
    });

    test('returns null when a recently rejected suggestion exists', async () => {
      const supabase = createMockSupabase({
        selectData: [{ id: 'existing-2', status: 'rejected', updated_at: new Date().toISOString() }],
      });
      const generate = mockGenerate(VALID_SUGGESTION);

      const result = await createSuggestionIfNew(TENANT_UUID, TRIGGER_DATA, {
        supabase,
        generateAiSuggestion: generate,
        emitTenantWebhooks: webhooks,
        logger: log,
        emitCareAudit: audit,
      });

      assert.equal(result, null);
      assert.equal(supabase._calls.insert.length, 0, 'no insert on duplicate');
    });

    test('emits ACTION_OUTCOME audit with outcome_type duplicate_suppressed', async () => {
      const supabase = createMockSupabase({
        selectData: [{ id: 'dup', status: 'pending', updated_at: new Date().toISOString() }],
      });

      await createSuggestionIfNew(TENANT_UUID, TRIGGER_DATA, {
        supabase,
        generateAiSuggestion: mockGenerate(VALID_SUGGESTION),
        emitTenantWebhooks: webhooks,
        logger: log,
        emitCareAudit: audit,
      });

      assert.equal(audit.calls.length, 1, 'audit emitted exactly once');
      assert.equal(audit.calls[0].event_type, CareAuditEventType.ACTION_OUTCOME);
      assert.equal(audit.calls[0].meta.outcome_type, OUTCOME_TYPES.duplicate_suppressed);
    });
  });

  // --------------------------------------------------------------------------
  // 2. generation_failed
  // --------------------------------------------------------------------------
  describe('generation_failed', () => {
    test('returns null when generateAiSuggestion returns null', async () => {
      const supabase = createMockSupabase({ selectData: [] });
      const generate = mockGenerate(null);

      const result = await createSuggestionIfNew(TENANT_UUID, TRIGGER_DATA, {
        supabase,
        generateAiSuggestion: generate,
        emitTenantWebhooks: webhooks,
        logger: log,
        emitCareAudit: audit,
      });

      assert.equal(result, null, 'should return null');
      assert.equal(generate.callCount(), 1, 'generateAiSuggestion called once');
      assert.equal(supabase._calls.insert.length, 0, 'should NOT insert');
    });

    test('emits ACTION_OUTCOME audit with outcome_type generation_failed', async () => {
      const supabase = createMockSupabase({ selectData: [] });

      await createSuggestionIfNew(TENANT_UUID, TRIGGER_DATA, {
        supabase,
        generateAiSuggestion: mockGenerate(null),
        emitTenantWebhooks: webhooks,
        logger: log,
        emitCareAudit: audit,
      });

      assert.equal(audit.calls.length, 1);
      assert.equal(audit.calls[0].meta.outcome_type, OUTCOME_TYPES.generation_failed);
    });
  });

  // --------------------------------------------------------------------------
  // 3. suggestion_created
  // --------------------------------------------------------------------------
  describe('suggestion_created', () => {
    test('returns inserted id on happy path', async () => {
      const supabase = createMockSupabase({
        selectData: [],
        insertData: { id: INSERTED_ID },
      });
      const generate = mockGenerate(VALID_SUGGESTION);

      const result = await createSuggestionIfNew(TENANT_UUID, TRIGGER_DATA, {
        supabase,
        generateAiSuggestion: generate,
        emitTenantWebhooks: webhooks,
        logger: log,
        emitCareAudit: audit,
      });

      assert.equal(result, INSERTED_ID);
    });

    test('insert payload contains outcome_type = suggestion_created', async () => {
      const supabase = createMockSupabase({
        selectData: [],
        insertData: { id: INSERTED_ID },
      });

      await createSuggestionIfNew(TENANT_UUID, TRIGGER_DATA, {
        supabase,
        generateAiSuggestion: mockGenerate(VALID_SUGGESTION),
        emitTenantWebhooks: webhooks,
        logger: log,
        emitCareAudit: audit,
      });

      assert.equal(supabase._calls.insert.length, 1, 'insert called once');
      const payload = supabase._calls.insert[0];
      assert.equal(payload.outcome_type, OUTCOME_TYPES.suggestion_created);
      assert.equal(payload.status, 'pending');
      assert.equal(payload.tenant_id, TENANT_UUID);
      assert.equal(payload.trigger_id, TRIGGER_DATA.triggerId);
      assert.equal(payload.record_type, TRIGGER_DATA.recordType);
      assert.equal(payload.record_id, TRIGGER_DATA.recordId);
      assert.equal(payload.priority, TRIGGER_DATA.priority);
    });

    test('insert payload uses suggestion confidence and reasoning', async () => {
      const supabase = createMockSupabase({
        selectData: [],
        insertData: { id: INSERTED_ID },
      });

      await createSuggestionIfNew(TENANT_UUID, TRIGGER_DATA, {
        supabase,
        generateAiSuggestion: mockGenerate(VALID_SUGGESTION),
        emitTenantWebhooks: webhooks,
        logger: log,
        emitCareAudit: audit,
      });

      const payload = supabase._calls.insert[0];
      assert.equal(payload.confidence, VALID_SUGGESTION.confidence);
      assert.equal(payload.reasoning, VALID_SUGGESTION.reasoning);
      assert.deepEqual(payload.action, VALID_SUGGESTION.action);
    });

    test('defaults confidence to 0.75 when suggestion omits it', async () => {
      const supabase = createMockSupabase({
        selectData: [],
        insertData: { id: INSERTED_ID },
      });
      const noConfidence = { action: VALID_SUGGESTION.action };

      await createSuggestionIfNew(TENANT_UUID, TRIGGER_DATA, {
        supabase,
        generateAiSuggestion: mockGenerate(noConfidence),
        emitTenantWebhooks: webhooks,
        logger: log,
        emitCareAudit: audit,
      });

      assert.equal(supabase._calls.insert[0].confidence, 0.75);
      assert.equal(supabase._calls.insert[0].reasoning, '');
    });

    test('emits tenant webhook after successful insert', async () => {
      const supabase = createMockSupabase({
        selectData: [],
        insertData: { id: INSERTED_ID },
      });

      await createSuggestionIfNew(TENANT_UUID, TRIGGER_DATA, {
        supabase,
        generateAiSuggestion: mockGenerate(VALID_SUGGESTION),
        emitTenantWebhooks: webhooks,
        logger: log,
        emitCareAudit: audit,
      });

      assert.equal(webhooks.calls.length, 1, 'webhook emitted once');
      const [tenant, event, payload] = webhooks.calls[0];
      assert.equal(tenant, TENANT_UUID);
      assert.equal(event, 'ai.suggestion.generated');
      assert.equal(payload.suggestion_id, INSERTED_ID);
    });

    test('emits ACTION_OUTCOME audit with outcome_type suggestion_created', async () => {
      const supabase = createMockSupabase({
        selectData: [],
        insertData: { id: INSERTED_ID },
      });

      await createSuggestionIfNew(TENANT_UUID, TRIGGER_DATA, {
        supabase,
        generateAiSuggestion: mockGenerate(VALID_SUGGESTION),
        emitTenantWebhooks: webhooks,
        logger: log,
        emitCareAudit: audit,
      });

      assert.equal(audit.calls.length, 1);
      const ev = audit.calls[0];
      assert.equal(ev.event_type, CareAuditEventType.ACTION_OUTCOME);
      assert.equal(ev.meta.outcome_type, OUTCOME_TYPES.suggestion_created);
      assert.equal(ev.meta.suggestion_id, INSERTED_ID);
      assert.equal(ev.tenant_id, TENANT_UUID);
    });

    test('defaults priority to normal when triggerData omits it', async () => {
      const supabase = createMockSupabase({
        selectData: [],
        insertData: { id: INSERTED_ID },
      });
      const noPriority = { ...TRIGGER_DATA };
      delete noPriority.priority;

      await createSuggestionIfNew(TENANT_UUID, noPriority, {
        supabase,
        generateAiSuggestion: mockGenerate(VALID_SUGGESTION),
        emitTenantWebhooks: webhooks,
        logger: log,
        emitCareAudit: audit,
      });

      assert.equal(supabase._calls.insert[0].priority, 'normal');
    });
  });

  // --------------------------------------------------------------------------
  // 4. constraint_violation (23505)
  // --------------------------------------------------------------------------
  describe('constraint_violation', () => {
    test('returns null when insert returns error code 23505', async () => {
      const supabase = createMockSupabase({
        selectData: [],
        insertError: { code: '23505', message: 'duplicate key value violates unique constraint' },
      });

      const result = await createSuggestionIfNew(TENANT_UUID, TRIGGER_DATA, {
        supabase,
        generateAiSuggestion: mockGenerate(VALID_SUGGESTION),
        emitTenantWebhooks: webhooks,
        logger: log,
        emitCareAudit: audit,
      });

      assert.equal(result, null, 'should return null');
      assert.equal(webhooks.calls.length, 0, 'webhook NOT emitted on constraint violation');
    });

    test('emits ACTION_OUTCOME audit with outcome_type constraint_violation', async () => {
      const supabase = createMockSupabase({
        selectData: [],
        insertError: { code: '23505', message: 'dup' },
      });

      await createSuggestionIfNew(TENANT_UUID, TRIGGER_DATA, {
        supabase,
        generateAiSuggestion: mockGenerate(VALID_SUGGESTION),
        emitTenantWebhooks: webhooks,
        logger: log,
        emitCareAudit: audit,
      });

      assert.equal(audit.calls.length, 1);
      assert.equal(audit.calls[0].meta.outcome_type, OUTCOME_TYPES.constraint_violation);
    });
  });

  // --------------------------------------------------------------------------
  // 5. error — Supabase insert returns a non-23505 error
  // --------------------------------------------------------------------------
  describe('error (insert returns non-23505 error)', () => {
    test('returns null on generic insert error', async () => {
      const supabase = createMockSupabase({
        selectData: [],
        insertError: { code: '42P01', message: 'relation does not exist' },
      });

      const result = await createSuggestionIfNew(TENANT_UUID, TRIGGER_DATA, {
        supabase,
        generateAiSuggestion: mockGenerate(VALID_SUGGESTION),
        emitTenantWebhooks: webhooks,
        logger: log,
        emitCareAudit: audit,
      });

      assert.equal(result, null);
      assert.equal(webhooks.calls.length, 0);
    });

    test('emits ACTION_OUTCOME audit with outcome_type error', async () => {
      const supabase = createMockSupabase({
        selectData: [],
        insertError: { code: '42P01', message: 'relation does not exist' },
      });

      await createSuggestionIfNew(TENANT_UUID, TRIGGER_DATA, {
        supabase,
        generateAiSuggestion: mockGenerate(VALID_SUGGESTION),
        emitTenantWebhooks: webhooks,
        logger: log,
        emitCareAudit: audit,
      });

      assert.equal(audit.calls.length, 1);
      assert.equal(audit.calls[0].meta.outcome_type, OUTCOME_TYPES.error);
    });

    test('returns null when insert data is null (no row returned)', async () => {
      const supabase = createMockSupabase({
        selectData: [],
        insertData: null,
        insertError: null,
      });

      const result = await createSuggestionIfNew(TENANT_UUID, TRIGGER_DATA, {
        supabase,
        generateAiSuggestion: mockGenerate(VALID_SUGGESTION),
        emitTenantWebhooks: webhooks,
        logger: log,
        emitCareAudit: audit,
      });

      assert.equal(result, null);
      assert.equal(audit.calls[0].meta.outcome_type, OUTCOME_TYPES.error);
    });
  });

  // --------------------------------------------------------------------------
  // 6. catch block — unexpected throw during select
  // --------------------------------------------------------------------------
  describe('catch block (unexpected throw)', () => {
    test('returns null when select chain throws', async () => {
      const throwingSupabase = {
        from() {
          return {
            select() {
              return {
                eq() { return this; },
                or() { return this; },
                limit() { throw new Error('Network failure'); },
              };
            },
          };
        },
      };

      const result = await createSuggestionIfNew(TENANT_UUID, TRIGGER_DATA, {
        supabase: throwingSupabase,
        generateAiSuggestion: mockGenerate(VALID_SUGGESTION),
        emitTenantWebhooks: webhooks,
        logger: log,
        emitCareAudit: audit,
      });

      assert.equal(result, null);
    });

    test('returns null when generateAiSuggestion throws', async () => {
      const supabase = createMockSupabase({ selectData: [] });
      const throwingGenerate = async () => { throw new Error('AI engine crash'); };

      const result = await createSuggestionIfNew(TENANT_UUID, TRIGGER_DATA, {
        supabase,
        generateAiSuggestion: throwingGenerate,
        emitTenantWebhooks: webhooks,
        logger: log,
        emitCareAudit: audit,
      });

      assert.equal(result, null);
    });

    test('returns null when insert chain throws', async () => {
      // Build a supabase mock where SELECT succeeds but INSERT throws
      const throwingInsertSupabase = {
        from(table) {
          let isFirstCall = true;
          return {
            select() {
              // Cooldown check chain
              return {
                eq() { return this; },
                or() { return this; },
                limit() { return Promise.resolve({ data: [], error: null }); },
              };
            },
            insert() {
              throw new Error('Connection reset');
            },
          };
        },
      };

      const result = await createSuggestionIfNew(TENANT_UUID, TRIGGER_DATA, {
        supabase: throwingInsertSupabase,
        generateAiSuggestion: mockGenerate(VALID_SUGGESTION),
        emitTenantWebhooks: webhooks,
        logger: log,
        emitCareAudit: audit,
      });

      assert.equal(result, null);
    });

    test('emits ACTION_OUTCOME audit with outcome_type error on throw', async () => {
      const throwingSupabase = {
        from() {
          return {
            select() {
              return {
                eq() { return this; },
                or() { return this; },
                limit() { throw new Error('boom'); },
              };
            },
          };
        },
      };

      await createSuggestionIfNew(TENANT_UUID, TRIGGER_DATA, {
        supabase: throwingSupabase,
        generateAiSuggestion: mockGenerate(VALID_SUGGESTION),
        emitTenantWebhooks: webhooks,
        logger: log,
        emitCareAudit: audit,
      });

      assert.equal(audit.calls.length, 1);
      assert.equal(audit.calls[0].meta.outcome_type, OUTCOME_TYPES.error);
    });
  });

  // --------------------------------------------------------------------------
  // Cross-cutting assertions
  // --------------------------------------------------------------------------
  describe('cross-cutting', () => {
    test('audit event always includes tenant_id, trigger_id, record_id', async () => {
      // Run each path and verify common fields
      const paths = [
        // duplicate_suppressed
        { selectData: [{ id: 'x', status: 'pending', updated_at: new Date().toISOString() }] },
        // generation_failed
        { selectData: [], generateReturn: null },
        // suggestion_created
        { selectData: [], insertData: { id: INSERTED_ID } },
        // constraint_violation
        { selectData: [], insertError: { code: '23505', message: 'dup' } },
        // error
        { selectData: [], insertError: { code: '42P01', message: 'fail' } },
      ];

      for (const cfg of paths) {
        const a = mockAudit();
        const supabase = createMockSupabase(cfg);
        const gen = mockGenerate(cfg.generateReturn !== undefined ? cfg.generateReturn : VALID_SUGGESTION);

        await createSuggestionIfNew(TENANT_UUID, TRIGGER_DATA, {
          supabase,
          generateAiSuggestion: gen,
          emitTenantWebhooks: mockWebhooks(),
          logger: noopLogger(),
          emitCareAudit: a,
        });

        assert.equal(a.calls.length, 1, `audit emitted for config: ${JSON.stringify(cfg)}`);
        const ev = a.calls[0];
        assert.equal(ev.tenant_id, TENANT_UUID);
        assert.equal(ev.meta.trigger_id, TRIGGER_DATA.triggerId);
        assert.equal(ev.meta.record_type, TRIGGER_DATA.recordType);
        assert.equal(ev.meta.record_id, TRIGGER_DATA.recordId);
      }
    });

    test('outcome_type is always a valid OUTCOME_TYPES value', async () => {
      const validValues = new Set(Object.values(OUTCOME_TYPES));

      const configs = [
        { selectData: [{ id: 'x', status: 'pending', updated_at: new Date().toISOString() }] },
        { selectData: [], generateReturn: null },
        { selectData: [], insertData: { id: INSERTED_ID } },
        { selectData: [], insertError: { code: '23505', message: 'dup' } },
        { selectData: [], insertError: { code: '42P01', message: 'fail' } },
      ];

      for (const cfg of configs) {
        const a = mockAudit();
        const supabase = createMockSupabase(cfg);
        const gen = mockGenerate(cfg.generateReturn !== undefined ? cfg.generateReturn : VALID_SUGGESTION);

        await createSuggestionIfNew(TENANT_UUID, TRIGGER_DATA, {
          supabase,
          generateAiSuggestion: gen,
          emitTenantWebhooks: mockWebhooks(),
          logger: noopLogger(),
          emitCareAudit: a,
        });

        const ot = a.calls[0]?.meta?.outcome_type;
        assert.ok(validValues.has(ot), `outcome_type "${ot}" must be in OUTCOME_TYPES`);
      }
    });

    test('webhook failure does not prevent suggestion_created return', async () => {
      const supabase = createMockSupabase({
        selectData: [],
        insertData: { id: INSERTED_ID },
      });
      const failingWebhooks = async () => { throw new Error('webhook down'); };

      const result = await createSuggestionIfNew(TENANT_UUID, TRIGGER_DATA, {
        supabase,
        generateAiSuggestion: mockGenerate(VALID_SUGGESTION),
        emitTenantWebhooks: failingWebhooks,
        logger: log,
        emitCareAudit: audit,
      });

      assert.equal(result, INSERTED_ID, 'should still return the id');
    });

    test('audit failure does not throw from createSuggestionIfNew', async () => {
      const supabase = createMockSupabase({
        selectData: [],
        insertData: { id: INSERTED_ID },
      });
      const throwingAudit = () => { throw new Error('audit boom'); };

      // Should not throw
      const result = await createSuggestionIfNew(TENANT_UUID, TRIGGER_DATA, {
        supabase,
        generateAiSuggestion: mockGenerate(VALID_SUGGESTION),
        emitTenantWebhooks: webhooks,
        logger: log,
        emitCareAudit: throwingAudit,
      });

      assert.equal(result, INSERTED_ID);
    });

    test('select checkError is logged but does not abort flow', async () => {
      // selectError present but selectData is empty → should continue to generate
      const errorCalls = [];
      const errorLog = {
        debug() {},
        info() {},
        warn() {},
        error(...args) { errorCalls.push(args); },
      };
      const supabase = createMockSupabase({
        selectData: [],
        selectError: { message: 'RLS policy error' },
        insertData: { id: INSERTED_ID },
      });

      const result = await createSuggestionIfNew(TENANT_UUID, TRIGGER_DATA, {
        supabase,
        generateAiSuggestion: mockGenerate(VALID_SUGGESTION),
        emitTenantWebhooks: webhooks,
        logger: errorLog,
        emitCareAudit: audit,
      });

      assert.equal(result, INSERTED_ID, 'should still succeed');
      assert.ok(errorCalls.length >= 1, 'logger.error called for checkError');
    });
  });
});
