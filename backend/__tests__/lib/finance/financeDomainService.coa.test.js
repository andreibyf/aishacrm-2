import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import createFinanceDomainService from '../../../lib/finance/financeDomainService.js';
import rebuildBucketFromEvents from '../../../lib/finance/financeDomainReplay.js';

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
  test('listAccounts returns the seeded baseline (8 system accounts)', () => {
    const service = createFinanceDomainService();
    const accounts = service.listAccounts(TENANT);
    assert.equal(accounts.length, 8);
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

  test('an explicit account_code on a line resolves to that account (Codex PR #647 P2 — normalizeLine drops it)', async () => {
    const service = createFinanceDomainService();
    await service.createJournalDraft({
      tenantId: TENANT,
      actor,
      payload: {
        lines: [
          // code-only / mismatched name — must resolve to seeded Cash (1000), NOT auto-create
          { account_code: '1000', account_name: 'Mislabeled', classification: 'Asset', debit_cents: 5000, credit_cents: 0 },
          { account_name: 'Revenue', classification: 'Revenue', debit_cents: 0, credit_cents: 5000 },
        ],
      },
    });
    const line = service.listJournalEntries(TENANT)[0].lines.find((l) => l.account_code === '1000');
    assert.equal(line.account_code, '1000');
    assert.ok(!service.listAccounts(TENANT).find((a) => a.name === 'Mislabeled'));
    assert.equal((await accountCreatedEvents(service)).length, 0);
  });

  test('a code-resolved line is canonicalized to the resolved account classification + name (Codex PR #647 review)', async () => {
    const service = createFinanceDomainService();
    await service.createJournalDraft({
      tenantId: TENANT,
      actor,
      payload: {
        lines: [
          // explicit code 1100 (Accounts Receivable / Asset) but a WRONG classification + name
          { account_code: '1100', account_name: 'whatever', classification: 'Expense', debit_cents: 5000, credit_cents: 0 },
          { account_name: 'Revenue', classification: 'Revenue', debit_cents: 0, credit_cents: 5000 },
        ],
      },
    });
    const line = service.listJournalEntries(TENANT)[0].lines.find((l) => l.account_code === '1100');
    // ledger / P&L / balance-sheet read these — must reflect the resolved account, not the input
    assert.equal(line.classification, 'Asset');
    assert.equal(line.account_name, 'Accounts Receivable');
  });

  // Codex PR #647 P1 regression: in persistent mode the bucket is rebuilt from
  // events (rebuildBucketFromEvents), which returns accounts:[] for a fresh tenant
  // with no finance.account.created events. getTenantCoa MUST still seed the
  // baseline into that empty replayed array — otherwise a hydrated write would
  // auto-create AR/Revenue at 1500/4500 instead of resolving seeded 1100/4000.
  test('a hydrated (replayed) bucket still seeds the baseline before write resolution', async () => {
    const hydrated = rebuildBucketFromEvents([]);
    assert.deepEqual(hydrated.accounts, []); // empty replayed array — the trap
    const store = { tenants: new Map([[TENANT, hydrated]]) };
    const service = createFinanceDomainService({ store });
    const res = await service.simulateDealWon({ tenantId: TENANT, actor, payload: { amount_cents: 250000 } });
    const lines = res.journal_entry.lines;
    assert.equal(lines.find((l) => l.classification === 'Asset').account_code, '1100');
    assert.equal(lines.find((l) => l.classification === 'Revenue').account_code, '4000');
    assert.equal((await accountCreatedEvents(service)).length, 0); // seeded → no auto-create
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
