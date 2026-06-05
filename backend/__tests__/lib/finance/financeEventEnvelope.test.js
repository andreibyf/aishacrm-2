import test from 'node:test';
import assert from 'node:assert/strict';
import createFinanceEventEnvelope from '../../../lib/finance/financeEventEnvelope.js';

const TENANT = '00000000-0000-4000-8000-aaaaaaaaaaaa';

function baseArgs(overrides = {}) {
  return {
    tenantId: TENANT,
    eventType: 'finance.journal.posted',
    aggregateType: 'journal_entry',
    aggregateId: '00000000-0000-4000-8000-00000000a001',
    ...overrides,
  };
}

// ── Test/Live partition flag (slice 6a) ───────────────────────────────────────

test('createFinanceEventEnvelope defaults is_test_data to false (live)', () => {
  const envelope = createFinanceEventEnvelope(baseArgs());
  assert.equal(envelope.is_test_data, false, 'is_test_data must default to false (live)');
});

test('createFinanceEventEnvelope sets is_test_data from isTestData=true', () => {
  const envelope = createFinanceEventEnvelope(baseArgs({ isTestData: true }));
  assert.equal(envelope.is_test_data, true, 'is_test_data must reflect isTestData=true');
});

test('createFinanceEventEnvelope sets is_test_data from isTestData=false', () => {
  const envelope = createFinanceEventEnvelope(baseArgs({ isTestData: false }));
  assert.equal(envelope.is_test_data, false, 'is_test_data must reflect isTestData=false');
});
