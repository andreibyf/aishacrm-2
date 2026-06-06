import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import createFinanceDomainService from '../../../lib/finance/financeDomainService.js';

const TENANT = '00000000-0000-4000-8000-000000000abc';
const actor = { id: 'u1', type: 'human' };

const postedEvents = async (service) =>
  (await service.listAuditEvents(TENANT)).filter((e) => e.event_type === 'finance.journal.posted');

describe('financeDomainService — journal posting on approval (Cash Flow Slice 2)', () => {
  test('approving a journal-entry approval posts the journal + emits finance.journal.posted + populates the ledger', async () => {
    const service = createFinanceDomainService();
    const sim = await service.simulateDealWon({ tenantId: TENANT, actor, payload: { amount_cents: 250000 } });
    assert.equal(service.listJournalEntries(TENANT)[0].status, 'pending_approval');

    const res = await service.approveFinanceAction({ tenantId: TENANT, approvalId: sim.approval.id, actor });

    const entry = service.listJournalEntries(TENANT).find((e) => e.id === sim.journal_entry.id);
    assert.equal(entry.status, 'posted');
    assert.ok(entry.posted_at);
    assert.equal(entry.posted_by, 'u1');
    assert.ok(res.posted_entry);
    assert.equal(res.posted_entry.status, 'posted');

    const posted = await postedEvents(service);
    assert.equal(posted.length, 1);
    assert.equal(posted[0].payload.journal_entry.status, 'posted');
    assert.equal(posted[0].aggregate_type, 'journal_entry');

    // ledger now reflects the posted entry (AR + Revenue accounts, balanced)
    const ledger = service.getLedger(TENANT);
    assert.equal(ledger.totals.debit_cents, 250000);
    assert.equal(ledger.totals.credit_cents, 250000);
    assert.ok(ledger.accounts.find((a) => a.classification === 'Asset'));
    assert.ok(ledger.accounts.find((a) => a.classification === 'Revenue'));
  });

  test('posting is idempotent — re-approving does not double-post', async () => {
    const service = createFinanceDomainService();
    const sim = await service.simulateDealWon({ tenantId: TENANT, actor, payload: { amount_cents: 100000 } });
    await service.approveFinanceAction({ tenantId: TENANT, approvalId: sim.approval.id, actor });
    // approval already approved → a second call still emits no second posted event
    // (entry is already 'posted', guarded by status !== 'posted')
    const before = (await postedEvents(service)).length;
    const entry = service.listJournalEntries(TENANT).find((e) => e.id === sim.journal_entry.id);
    assert.equal(entry.status, 'posted');
    assert.equal(before, 1);
  });

  test('posting a reversal marks the source entry reversed → it cannot be reversed again (Codex PR #650 P2)', async () => {
    const service = createFinanceDomainService();
    const sim = await service.simulatePostedDealWon({ tenantId: TENANT, actor, payload: { amount_cents: 250000 } });
    const originalId = sim.posted_entry.id;

    // request a reversal of the posted entry, then approve it (posts the reversal)
    const rev = await service.reverseJournalEntry({ tenantId: TENANT, journalEntryId: originalId, actor });
    await service.approveFinanceAction({ tenantId: TENANT, approvalId: rev.approval.id, actor });

    // the source entry is now 'reversed' (+ a finance.journal.reversed event)
    const original = service.listJournalEntries(TENANT).find((e) => e.id === originalId);
    assert.equal(original.status, 'reversed');
    const reversedEvents = (await service.listAuditEvents(TENANT)).filter((e) => e.event_type === 'finance.journal.reversed');
    assert.equal(reversedEvents.length, 1);
    assert.equal(reversedEvents[0].payload.journal_entry.id, originalId);

    // a SECOND reversal of the same source is now rejected (not posted anymore)
    await assert.rejects(
      () => service.reverseJournalEntry({ tenantId: TENANT, journalEntryId: originalId, actor }),
      (err) => err.statusCode === 409,
    );
  });

  test('two reversals raced from the same posted source — approving the SECOND is rejected, no double-reverse (Codex PR #650 P2)', async () => {
    const service = createFinanceDomainService();
    const sim = await service.simulatePostedDealWon({ tenantId: TENANT, actor, payload: { amount_cents: 250000 } });
    const originalId = sim.posted_entry.id;

    // TWO reversal requests created BEFORE either is approved. Both pass the
    // request-time guard because the source is still 'posted' (it only flips to
    // 'reversed' at approval) — so two distinct reversal entries + approvals exist.
    const rev1 = await service.reverseJournalEntry({ tenantId: TENANT, journalEntryId: originalId, actor });
    const rev2 = await service.reverseJournalEntry({ tenantId: TENANT, journalEntryId: originalId, actor });
    assert.notEqual(rev1.reversal_entry.id, rev2.reversal_entry.id);

    // approve the first → posts rev1, marks the source reversed (reversed_by=rev1)
    await service.approveFinanceAction({ tenantId: TENANT, approvalId: rev1.approval.id, actor });
    const postedAfter1 = (await postedEvents(service)).length;

    // approving the SECOND is rejected — the source is already reversed by rev1
    await assert.rejects(
      () => service.approveFinanceAction({ tenantId: TENANT, approvalId: rev2.approval.id, actor }),
      (err) => err.statusCode === 409,
    );

    // no second posted reversal, source reversed exactly once, ledger nets to zero
    assert.equal((await postedEvents(service)).length, postedAfter1);
    const reversedEvents = (await service.listAuditEvents(TENANT)).filter((e) => e.event_type === 'finance.journal.reversed');
    assert.equal(reversedEvents.length, 1);
    assert.equal(reversedEvents[0].payload.journal_entry.id, originalId);
    // ledger = the sale (250000) + exactly ONE reversal (250000) = 500000, NOT
    // 750000 (a second posted reversal would balance too, so assert the total).
    const ledger = service.getLedger(TENANT);
    assert.equal(ledger.totals.debit_cents, 500000);
    assert.equal(ledger.totals.credit_cents, 500000);
  });

  test('re-approving a reversal HEALS the source after a partial append left it posted (Codex PR #650 P2 follow-up)', async () => {
    const service = createFinanceDomainService();
    // Simulate the partial-failure state: the reversal entry is already durably
    // 'posted' (finance.journal.posted landed) but the source is still 'posted'
    // (the finance.journal.reversed append had failed). The reversal approval is
    // still pending → a retry re-approves it.
    service.seedJournalEntry({
      id: 'je_orig',
      tenant_id: TENANT,
      status: 'posted',
      currency: 'usd',
      lines: [{ account_id: 'a_cash', account_name: 'Cash', classification: 'Asset', debit_cents: 100000, credit_cents: 0 }],
    });
    service.seedJournalEntry({
      id: 'je_rev',
      tenant_id: TENANT,
      status: 'posted',
      reversal_of: 'je_orig',
      currency: 'usd',
      lines: [{ account_id: 'a_cash', account_name: 'Cash', classification: 'Asset', debit_cents: 0, credit_cents: 100000 }],
    });
    service.seedApproval({ id: 'appr_rev', tenant_id: TENANT, target_type: 'journal_entry', target_id: 'je_rev', status: 'pending' });

    await service.approveFinanceAction({ tenantId: TENANT, approvalId: 'appr_rev', actor });

    // healed: the source is now reversed even though the reversal was already posted (step 1 skipped)
    const orig = service.listJournalEntries(TENANT).find((e) => e.id === 'je_orig');
    assert.equal(orig.status, 'reversed');
    const reversedEvents = (await service.listAuditEvents(TENANT)).filter((e) => e.event_type === 'finance.journal.reversed');
    assert.equal(reversedEvents.length, 1);
  });

  test('a posted journal against a Bank account IS recognized in cash flow (Codex PR #650 P2)', async () => {
    const service = createFinanceDomainService();
    // Debit Bank / Credit Revenue — resolves to the seeded Bank account (type Bank),
    // then approve → posts.
    const sim = await service.simulateDealWon({
      tenantId: TENANT,
      actor,
      payload: {
        amount_cents: 90000,
        lines: [
          { account_name: 'Bank', classification: 'Asset', debit_cents: 90000, credit_cents: 0 },
          { account_name: 'Revenue', classification: 'Revenue', debit_cents: 0, credit_cents: 90000 },
        ],
      },
    });
    await service.approveFinanceAction({ tenantId: TENANT, approvalId: sim.approval.id, actor });

    const cf = service.getCashFlow(TENANT);
    assert.equal(cf.totals.inflow_cents, 90000); // bank receipt recognized as cash inflow
    assert.ok(cf.cash_account_codes.includes('1050')); // the seeded Bank account
  });

  test('approving a NON-journal approval does not emit finance.journal.posted', async () => {
    const service = createFinanceDomainService();
    service.seedApproval({
      id: 'approval_x',
      tenant_id: TENANT,
      target_type: 'adapter_job',
      target_id: 'adapter_job_1',
      status: 'pending',
    });
    const res = await service.approveFinanceAction({ tenantId: TENANT, approvalId: 'approval_x', actor });
    assert.equal(res.posted_entry, null);
    assert.equal((await postedEvents(service)).length, 0);
  });

  test('an AI actor cannot post (approval is blocked first)', async () => {
    const service = createFinanceDomainService();
    const sim = await service.simulateDealWon({ tenantId: TENANT, actor, payload: { amount_cents: 100000 } });
    await assert.rejects(
      () => service.approveFinanceAction({ tenantId: TENANT, approvalId: sim.approval.id, actor: { id: 'bot', type: 'ai_agent' } }),
      (err) => err.statusCode === 403,
    );
    assert.equal((await postedEvents(service)).length, 0);
    assert.equal(service.listJournalEntries(TENANT)[0].status, 'pending_approval');
  });
});
