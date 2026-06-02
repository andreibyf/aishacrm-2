import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import createFinanceDomainService from '../../../../lib/finance/financeDomainService.js';
import { createInMemoryFinanceReadAdapter } from '../../../../lib/finance/readAdapters/inMemoryFinanceReadAdapter.js';

const T = '00000000-0000-4000-8000-000000000011';

async function seededService() {
  const service = createFinanceDomainService();
  await service.simulateDealWon({
    tenantId: T,
    actor: { id: 'user-1', type: 'human' },
    payload: { amount_cents: 250000, currency: 'usd' },
  });
  return service;
}

describe('InMemoryFinanceReadAdapter', () => {
  test('delegates reads to the domain service (pass-through)', async () => {
    const service = await seededService();
    const adapter = createInMemoryFinanceReadAdapter({ service });
    assert.deepEqual(await adapter.listJournalEntries(T), service.listJournalEntries(T));
    assert.deepEqual(await adapter.getLedger(T), service.getLedger(T));
    assert.deepEqual(await adapter.getProfitLoss(T), service.getProfitLoss(T));
    assert.deepEqual(await adapter.getBalanceSheet(T), service.getBalanceSheet(T));
  });

  test('getRuntimeStatus reports in_memory / mock_read_only with bucket counts', async () => {
    const service = await seededService();
    const adapter = createInMemoryFinanceReadAdapter({ service });
    const status = await adapter.getRuntimeStatus(T);
    assert.equal(status.tenant_id, T);
    assert.equal(status.runtime.persistence, 'in_memory');
    assert.equal(status.runtime.mode, 'mock_read_only');
    assert.equal(status.runtime.provider_sync, 'disabled');
    assert.equal(status.counts.journal_entries, service.listJournalEntries(T).length);
    assert.ok(status.counts.audit_events >= 1);
  });

  test('requires a service', () => {
    assert.throws(() => createInMemoryFinanceReadAdapter({}), /requires a domain service/);
  });
});
