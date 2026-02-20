/**
 * PEP LLM Parser Tests
 *
 * 8 tests with mocked generateChatCompletion — no real LLM calls.
 *
 * Test runner: Node.js native test runner
 * Run: node --experimental-test-module-mocks --test pep/tests/llmParser.test.js
 */

import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parse as parseYaml } from 'yaml';

// ---------------------------------------------------------------------------
// Mock generateChatCompletion BEFORE importing llmParser
// ---------------------------------------------------------------------------
const mockGenerate = mock.fn(async () => ({ status: 'success', content: '{}' }));

mock.module('../../backend/lib/aiEngine/llmClient.js', {
  namedExports: {
    generateChatCompletion: mockGenerate,
  },
});

// Dynamic import AFTER mocking so llmParser picks up the mock
const { parseLLM, buildCatalogSummaries, buildSystemPrompt } = await import(
  '../compiler/llmParser.js'
);

// ---------------------------------------------------------------------------
// Load catalogs
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const entityCatalog = parseYaml(
  readFileSync(join(__dirname, '..', 'catalogs', 'entity-catalog.yaml'), 'utf8'),
);
const capabilityCatalog = parseYaml(
  readFileSync(join(__dirname, '..', 'catalogs', 'capability-catalog.yaml'), 'utf8'),
);

const catalogs = { entity_catalog: entityCatalog, capability_catalog: capabilityCatalog };

// ---------------------------------------------------------------------------
// Canned LLM responses
// ---------------------------------------------------------------------------
const VALID_FULL_RESPONSE = JSON.stringify({
  match: true,
  trigger: { entity_ref: 'cash flow transaction', state_change: 'marked as recurring' },
  action: {
    capability_ref: 'create the next transaction',
    entity_ref: 'CashFlowTransaction',
    attribute_ref: 'recurrence pattern',
  },
  fallback: {
    outcome_condition: 'creation fails',
    capability_ref: 'notify',
    role_ref: 'owner',
  },
});

const VALID_NO_FALLBACK_RESPONSE = JSON.stringify({
  match: true,
  trigger: { entity_ref: 'cash flow transaction', state_change: 'marked as recurring' },
  action: {
    capability_ref: 'create the next transaction',
    entity_ref: 'CashFlowTransaction',
    attribute_ref: 'recurrence pattern',
  },
  // No fallback key at all
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('PEP LLM Parser', () => {
  beforeEach(() => {
    mockGenerate.mock.resetCalls();
  });

  // -------------------------------------------------------------------------
  // Test 1: Valid CBE pattern JSON (full, with fallback) → match: true
  // -------------------------------------------------------------------------
  it('Test 1: valid CBE pattern with fallback returns match: true with all fields', async () => {
    mockGenerate.mock.mockImplementation(async () => ({
      status: 'success',
      content: VALID_FULL_RESPONSE,
    }));

    const result = await parseLLM(
      'When a cash flow transaction is marked as recurring, create the next transaction. If creation fails, notify the owner.',
      catalogs,
    );

    assert.equal(result.match, true);
    assert.ok(result.trigger, 'Should have trigger');
    assert.equal(result.trigger.entity_ref, 'cash flow transaction');
    assert.equal(result.trigger.state_change, 'marked as recurring');
    assert.ok(result.action, 'Should have action');
    assert.equal(result.action.capability_ref, 'create the next transaction');
    assert.ok(result.fallback, 'Should have fallback');
    assert.equal(result.fallback.role_ref, 'owner');
    assert.ok(result.raw, 'Should have raw source');
  });

  // -------------------------------------------------------------------------
  // Test 2: LLM returns { match: false, reason: "unclear trigger" }
  // -------------------------------------------------------------------------
  it('Test 2: LLM returns match: false with reason → passes through reason', async () => {
    mockGenerate.mock.mockImplementation(async () => ({
      status: 'success',
      content: JSON.stringify({ match: false, reason: 'unclear trigger' }),
    }));

    const result = await parseLLM('Do something vague', catalogs);

    assert.equal(result.match, false);
    assert.equal(result.reason, 'unclear trigger');
  });

  // -------------------------------------------------------------------------
  // Test 3: Malformed JSON → match: false, reason contains "invalid JSON"
  // -------------------------------------------------------------------------
  it('Test 3: malformed JSON response → match: false with "invalid JSON" in reason', async () => {
    mockGenerate.mock.mockImplementation(async () => ({
      status: 'success',
      content: 'not json at all',
    }));

    const result = await parseLLM('Something', catalogs);

    assert.equal(result.match, false);
    assert.ok(
      result.reason.includes('invalid JSON'),
      `Reason should contain "invalid JSON", got: ${result.reason}`,
    );
  });

  // -------------------------------------------------------------------------
  // Test 4: Empty string response → match: false
  // -------------------------------------------------------------------------
  it('Test 4: empty string response → match: false', async () => {
    mockGenerate.mock.mockImplementation(async () => ({
      status: 'success',
      content: '',
    }));

    const result = await parseLLM('Something', catalogs);

    assert.equal(result.match, false);
  });

  // -------------------------------------------------------------------------
  // Test 5: Valid pattern missing fallback key → match: true, fallback: null
  // -------------------------------------------------------------------------
  it('Test 5: valid pattern without fallback key → match: true, fallback: null', async () => {
    mockGenerate.mock.mockImplementation(async () => ({
      status: 'success',
      content: VALID_NO_FALLBACK_RESPONSE,
    }));

    const result = await parseLLM('Create next transaction when recurring', catalogs);

    assert.equal(result.match, true);
    assert.equal(result.fallback, null, 'Missing fallback should default to null');
    assert.ok(result.trigger);
    assert.ok(result.action);
  });

  // -------------------------------------------------------------------------
  // Test 6: generateChatCompletion throws → match: false, reason "unavailable"
  // -------------------------------------------------------------------------
  it('Test 6: generateChatCompletion throws network error → match: false with "unavailable"', async () => {
    mockGenerate.mock.mockImplementation(async () => {
      throw new Error('Network timeout');
    });

    const result = await parseLLM('Something', catalogs);

    assert.equal(result.match, false);
    assert.ok(
      result.reason.includes('unavailable'),
      `Reason should contain "unavailable", got: ${result.reason}`,
    );
  });

  // -------------------------------------------------------------------------
  // Test 7: System prompt contains "CashFlowTransaction"
  // -------------------------------------------------------------------------
  it('Test 7: system prompt sent to LLM contains "CashFlowTransaction"', async () => {
    mockGenerate.mock.mockImplementation(async () => ({
      status: 'success',
      content: VALID_FULL_RESPONSE,
    }));

    await parseLLM('Create next transaction', catalogs);

    assert.equal(
      mockGenerate.mock.callCount(),
      1,
      'Should have called generateChatCompletion once',
    );
    const callArgs = mockGenerate.mock.calls[0].arguments[0];
    const systemMsg = callArgs.messages.find((m) => m.role === 'system');
    assert.ok(systemMsg, 'Should have a system message');
    assert.ok(
      systemMsg.content.includes('CashFlowTransaction'),
      'System prompt should include CashFlowTransaction from entity catalog',
    );
  });

  // -------------------------------------------------------------------------
  // Test 8: temperature: 0 sent to LLM
  // -------------------------------------------------------------------------
  it('Test 8: temperature sent to LLM is 0', async () => {
    mockGenerate.mock.mockImplementation(async () => ({
      status: 'success',
      content: VALID_FULL_RESPONSE,
    }));

    await parseLLM('Create next transaction', catalogs);

    assert.equal(
      mockGenerate.mock.callCount(),
      1,
      'Should have called generateChatCompletion once',
    );
    const callArgs = mockGenerate.mock.calls[0].arguments[0];
    assert.equal(callArgs.temperature, 0, 'Temperature must be 0 for deterministic parsing');
  });
});
