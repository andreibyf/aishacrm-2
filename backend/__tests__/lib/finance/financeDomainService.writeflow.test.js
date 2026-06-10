import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import createFinanceDomainService from '../../../lib/finance/financeDomainService.js';

const TENANT = '00000000-0000-4000-8000-000000000abc';
const actor = { id: 'u1', type: 'human' };
const aiActor = { id: 'bot', type: 'ai_agent' };

function balancedDraftPayload(cents = 50000) {
  return {
    currency: 'usd',
    memo: 'Manual entry',
    lines: [
      { account_name: 'Cash', classification: 'Asset', debit_cents: cents, credit_cents: 0 },
      {
        account_name: 'Sales Revenue',
        classification: 'Revenue',
        debit_cents: 0,
        credit_cents: cents,
      },
    ],
  };
}

describe('financeDomainService — manual journal write flow (submit → approve → post)', () => {
  test('create draft → submit enqueues an approval → approve posts it to the ledger', async () => {
    const service = createFinanceDomainService();

    const draft = await service.createJournalDraft({
      tenantId: TENANT,
      actor,
      payload: balancedDraftPayload(50000),
    });
    const entryId = draft.journal_entry.id;
    assert.equal(draft.journal_entry.status, 'draft');
    // A plain draft does NOT enqueue an approval.
    assert.equal(service.listApprovals(TENANT).length, 0);

    const submitted = await service.submitJournalDraftForApproval({
      tenantId: TENANT,
      journalEntryId: entryId,
      actor,
    });
    assert.equal(submitted.journal_entry.status, 'pending_approval');
    const approvals = service.listApprovals(TENANT);
    assert.equal(approvals.length, 1);
    assert.equal(approvals[0].status, 'pending');
    assert.equal(approvals[0].target_type, 'journal_entry');
    assert.equal(approvals[0].target_id, entryId);

    const approved = await service.approveFinanceAction({
      tenantId: TENANT,
      approvalId: submitted.approval.id,
      actor,
    });
    assert.equal(approved.posted_entry.status, 'posted');

    const entry = service.listJournalEntries(TENANT).find((e) => e.id === entryId);
    assert.equal(entry.status, 'posted');

    const ledger = service.getLedger(TENANT);
    assert.equal(ledger.totals.debit_cents, 50000);
    assert.equal(ledger.totals.credit_cents, 50000);
  });

  test('submitting a non-draft entry is rejected (409 FINANCE_JOURNAL_NOT_DRAFT)', async () => {
    const service = createFinanceDomainService();
    const draft = await service.createJournalDraft({
      tenantId: TENANT,
      actor,
      payload: balancedDraftPayload(),
    });
    await service.submitJournalDraftForApproval({
      tenantId: TENANT,
      journalEntryId: draft.journal_entry.id,
      actor,
    });
    // Second submit → entry is already pending_approval.
    await assert.rejects(
      () =>
        service.submitJournalDraftForApproval({
          tenantId: TENANT,
          journalEntryId: draft.journal_entry.id,
          actor,
        }),
      (err) => err.statusCode === 409 && err.code === 'FINANCE_JOURNAL_NOT_DRAFT',
    );
  });

  test('an AI actor cannot submit a draft for approval (403)', async () => {
    const service = createFinanceDomainService();
    const draft = await service.createJournalDraft({
      tenantId: TENANT,
      actor,
      payload: balancedDraftPayload(),
    });
    await assert.rejects(
      () =>
        service.submitJournalDraftForApproval({
          tenantId: TENANT,
          journalEntryId: draft.journal_entry.id,
          actor: aiActor,
        }),
      (err) => err.statusCode === 403,
    );
    // The draft stays a draft (no phantom approval).
    assert.equal(service.listApprovals(TENANT).length, 0);
    assert.equal(
      service.listJournalEntries(TENANT).find((e) => e.id === draft.journal_entry.id).status,
      'draft',
    );
  });
});

describe('financeDomainService — invoice AR posting (submit → approve → AR journal posts)', () => {
  function invoicePayload({ subtotal = 100000, tax = 8000 } = {}) {
    return {
      customer_id: 'cust-1',
      invoice_number: 'INV-001',
      currency: 'usd',
      subtotal_cents: subtotal,
      tax_cents: tax,
      total_cents: subtotal + tax,
      line_items: [{ description: 'Consulting', amount_cents: subtotal }],
    };
  }

  test('create invoice → submit → approve generates + posts a balanced AR journal', async () => {
    const service = createFinanceDomainService();

    const inv = await service.createDraftInvoice({
      tenantId: TENANT,
      actor,
      payload: invoicePayload(),
    });
    const invoiceId = inv.invoice.id;
    assert.equal(inv.invoice.status, 'draft');
    assert.equal(service.listApprovals(TENANT).length, 0);

    const submitted = await service.submitInvoiceForApproval({
      tenantId: TENANT,
      invoiceId,
      actor,
    });
    assert.equal(submitted.invoice.status, 'pending_approval');
    const approvals = service.listApprovals(TENANT);
    assert.equal(approvals.length, 1);
    assert.equal(approvals[0].target_type, 'invoice');
    assert.equal(approvals[0].target_id, invoiceId);

    await service.approveFinanceAction({
      tenantId: TENANT,
      approvalId: submitted.approval.id,
      actor,
    });

    // Invoice is posted + linked to a journal entry.
    const posted = service.listInvoices(TENANT).find((i) => i.id === invoiceId);
    assert.equal(posted.status, 'posted');
    assert.ok(posted.journal_entry_id);

    // A balanced AR journal posted: Dr AR (subtotal+tax), Cr Revenue (subtotal), Cr Tax (tax).
    const ledger = service.getLedger(TENANT);
    assert.equal(ledger.totals.debit_cents, 108000);
    assert.equal(ledger.totals.credit_cents, 108000);
    const ar = ledger.accounts.find((a) => a.classification === 'Asset');
    assert.ok(ar, 'AR (Asset) line present');
    assert.ok(ledger.accounts.find((a) => a.classification === 'Revenue'));
    assert.ok(ledger.accounts.find((a) => a.classification === 'Liability'));

    // P&L reflects the revenue; balance sheet reflects AR.
    const pl = service.getProfitLoss(TENANT);
    assert.ok(pl);
    const bs = service.getBalanceSheet(TENANT);
    assert.ok(bs);
  });

  test('an AI actor cannot submit an invoice for approval (403)', async () => {
    const service = createFinanceDomainService();
    const inv = await service.createDraftInvoice({
      tenantId: TENANT,
      actor,
      payload: invoicePayload(),
    });
    await assert.rejects(
      () =>
        service.submitInvoiceForApproval({
          tenantId: TENANT,
          invoiceId: inv.invoice.id,
          actor: aiActor,
        }),
      (err) => err.statusCode === 403,
    );
    assert.equal(service.listApprovals(TENANT).length, 0);
    assert.equal(service.listInvoices(TENANT).find((i) => i.id === inv.invoice.id).status, 'draft');
  });

  test('zero-tax invoice posts a 2-line AR journal', async () => {
    const service = createFinanceDomainService();
    const inv = await service.createDraftInvoice({
      tenantId: TENANT,
      actor,
      payload: invoicePayload({ subtotal: 50000, tax: 0 }),
    });
    const submitted = await service.submitInvoiceForApproval({
      tenantId: TENANT,
      invoiceId: inv.invoice.id,
      actor,
    });
    await service.approveFinanceAction({
      tenantId: TENANT,
      approvalId: submitted.approval.id,
      actor,
    });
    const ledger = service.getLedger(TENANT);
    assert.equal(ledger.totals.debit_cents, 50000);
    assert.equal(ledger.totals.credit_cents, 50000);
    // No Liability (tax) line when tax is zero.
    assert.equal(ledger.accounts.filter((a) => a.classification === 'Liability').length, 0);
  });
});
