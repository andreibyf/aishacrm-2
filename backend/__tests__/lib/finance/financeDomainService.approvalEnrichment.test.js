import test from 'node:test';
import assert from 'node:assert/strict';
import createFinanceDomainService from '../../../lib/finance/financeDomainService.js';

// Phase 4-1 Amendment A: the single finance.approval.requested emit must carry
// the post-transition journal_entry (status pending_approval) so the
// journal_entries projection can reproduce service.listJournalEntries()
// bit-for-bit. Additive — the existing approval + adapter_job keys remain.

const TENANT_ID = '00000000-0000-4000-8000-000000000001';

test('finance.approval.requested carries the post-transition journal_entry', async () => {
  const service = createFinanceDomainService();
  const result = await service.simulateDealWon({
    tenantId: TENANT_ID,
    actor: { id: 'user-1', type: 'human' },
    payload: { amount_cents: 250000, currency: 'usd' },
  });

  const events = await service.listAuditEvents(TENANT_ID);
  const requested = events.find((e) => e.event_type === 'finance.approval.requested');
  assert.ok(requested, 'approval.requested event emitted');

  // The enrichment: post-transition journal entry, status pending_approval.
  assert.ok(requested.payload.journal_entry, 'payload carries journal_entry');
  assert.equal(requested.payload.journal_entry.status, 'pending_approval');
  assert.equal(requested.payload.journal_entry.id, result.journal_entry.id);

  // Additive — original keys preserved (consumers unaffected).
  assert.ok(requested.payload.approval, 'still carries approval');
  assert.ok(requested.payload.adapter_job, 'still carries adapter_job');
});
