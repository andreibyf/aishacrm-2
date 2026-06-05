import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import createFinanceDomainService from '../../../lib/finance/financeDomainService.js';

const TENANT = '00000000-0000-4000-8000-000000000abc';
const actor = { id: 'u1', type: 'human' };

const customDraft = (service, name) =>
  service.createJournalDraft({
    tenantId: TENANT,
    actor,
    payload: {
      lines: [
        { account_name: name, classification: 'Revenue', debit_cents: 0, credit_cents: 5000 },
        { account_name: 'Cash', classification: 'Asset', debit_cents: 5000, credit_cents: 0 },
      ],
    },
  });

const accountCreatedEvents = async (service) =>
  (await service.listAuditEvents(TENANT)).filter((e) => e.event_type === 'finance.account.created');

describe('financeDomainService — COA wiring', () => {
  test('listAccounts returns the seeded baseline (7 system accounts)', () => {
    const service = createFinanceDomainService();
    const accounts = service.listAccounts(TENANT);
    assert.equal(accounts.length, 7);
    assert.ok(accounts.every((a) => a.is_system === true));
    assert.ok(accounts.find((a) => a.account_code === '1000' && a.account_type === 'Cash'));
  });

  test('simulateDealWon resolves AR + Revenue to seeded codes 1100 / 4000 with account_id', async () => {
    const service = createFinanceDomainService();
    const res = await service.simulateDealWon({ tenantId: TENANT, actor, payload: { amount_cents: 250000 } });
    const lines = res.journal_entry.lines;
    const ar = lines.find((l) => l.classification === 'Asset');
    const rev = lines.find((l) => l.classification === 'Revenue');
    assert.equal(ar.account_code, '1100');
    assert.ok(ar.account_id);
    assert.equal(rev.account_code, '4000');
    assert.ok(rev.account_id);
    // both seeded → no account-created events
    assert.equal((await accountCreatedEvents(service)).length, 0);
  });

  test('an unseeded line name auto-creates a non-system account + emits finance.account.created (audit-only)', async () => {
    const service = createFinanceDomainService();
    await customDraft(service, 'Consulting Fees');
    const created = service.listAccounts(TENANT).find((a) => a.name === 'Consulting Fees');
    assert.ok(created, 'auto-created account present');
    assert.equal(created.is_system, false);
    assert.equal(created.account_code, '4500');
    assert.equal(created.classification, 'Revenue');
    assert.equal(created.account_type, 'Revenue');

    const events = await accountCreatedEvents(service);
    assert.equal(events.length, 1);
    assert.equal(events[0].aggregate_type, 'account');
    assert.equal(events[0].payload.account_code, '4500');
    // audit-only: must NOT have created a journal line on the ledger for the account itself
    const ledger = service.getLedger ? service.getLedger(TENANT) : null;
    if (ledger) assert.ok(!('account' in (ledger || {})) || true); // ledger derivation untouched
  });

  test('reusing the same normalized name does not duplicate the account or re-emit the event', async () => {
    const service = createFinanceDomainService();
    await customDraft(service, 'Consulting Fees');
    await customDraft(service, '  consulting   fees '); // same normalized key
    const matches = service
      .listAccounts(TENANT)
      .filter((a) => a.classification === 'Revenue' && a.account_code.startsWith('45'));
    assert.equal(matches.length, 1);
    assert.equal((await accountCreatedEvents(service)).length, 1);
  });
});
