import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectionRunner } from '../../../../lib/finance/projections/projectionRunner.js';
import { createMemoryProjectionStoreProvider } from '../../../../lib/finance/projections/projectionStore.memory.js';
import {
  createLedgerProjectionWorker,
  LEDGER_PROJECTION_NAME,
} from '../../../../lib/finance/projections/ledgerProjection.js';
import { buildLedger } from '../../../../lib/finance/accountingEngine.js';

const TENANT_A = '00000000-0000-4000-8000-aaaaaaaaaaaa';
const TENANT_B = '00000000-0000-4000-8000-bbbbbbbbbbbb';

// ── Test doubles ──────────────────────────────────────────────────────────────

function line({ accountId = null, name, classification, debit = 0, credit = 0 }) {
  return {
    account_id: accountId,
    account_name: name,
    classification,
    debit_cents: debit,
    credit_cents: credit,
  };
}

function journalPosted(id, lines, { tenant = TENANT_A, createdAt } = {}) {
  return {
    id,
    tenant_id: tenant,
    event_type: 'finance.journal.posted',
    created_at: createdAt || '2026-05-21T00:00:00.000Z',
    aggregate_type: 'journal_entry',
    aggregate_id: `je-${id}`,
    payload: { journal_entry: { id: `je-${id}`, lines } },
  };
}

function fakeEventStore(eventsByTenant = {}) {
  return {
    async replay(tenantId) {
      return (eventsByTenant[tenantId] || []).slice();
    },
  };
}

function makeRunner({ eventStore, storeProvider } = {}) {
  return createProjectionRunner({
    eventStore: eventStore || fakeEventStore(),
    storeProvider: storeProvider || createMemoryProjectionStoreProvider(),
    retryBackoffMs: 0,
  });
}

function ledgerOf(worker, provider, tenantId) {
  return worker.getProjection(
    tenantId,
    {},
    provider.getLiveStore(LEDGER_PROJECTION_NAME, tenantId),
  );
}

function accountByName(ledger, name) {
  return ledger.accounts.find((a) => a.account_name === name);
}

// A balanced posting: debit Cash, credit Revenue.
function balancedPosting(id, amount, opts) {
  return journalPosted(
    id,
    [
      line({ name: 'Cash', classification: 'Asset', debit: amount }),
      line({ name: 'Revenue', classification: 'Revenue', credit: amount }),
    ],
    opts,
  );
}

// ── Accumulation ──────────────────────────────────────────────────────────────

test('a finance.journal.posted event accumulates its lines into the ledger', async () => {
  const provider = createMemoryProjectionStoreProvider();
  const runner = makeRunner({ storeProvider: provider });
  const worker = createLedgerProjectionWorker();
  runner.register(worker);

  await runner.dispatch(balancedPosting('e1', 1000));

  const ledger = ledgerOf(worker, provider, TENANT_A);
  assert.equal(ledger.tenant_id, TENANT_A);
  assert.equal(ledger.accounts.length, 2);

  const cash = accountByName(ledger, 'Cash');
  assert.equal(cash.debit_cents, 1000);
  assert.equal(cash.credit_cents, 0);
  assert.equal(cash.balance_cents, 1000);
  assert.equal(cash.classification, 'Asset');

  const revenue = accountByName(ledger, 'Revenue');
  assert.equal(revenue.credit_cents, 1000);
  assert.equal(revenue.balance_cents, -1000);

  assert.deepEqual(ledger.totals, { debit_cents: 1000, credit_cents: 1000 });
});

test('multiple postings to the same account accumulate', async () => {
  const provider = createMemoryProjectionStoreProvider();
  const runner = makeRunner({ storeProvider: provider });
  const worker = createLedgerProjectionWorker();
  runner.register(worker);

  await runner.dispatch(balancedPosting('e1', 1000, { createdAt: '2026-05-21T01:00:00.000Z' }));
  await runner.dispatch(balancedPosting('e2', 500, { createdAt: '2026-05-21T02:00:00.000Z' }));

  const ledger = ledgerOf(worker, provider, TENANT_A);
  assert.equal(accountByName(ledger, 'Cash').debit_cents, 1500);
  assert.equal(accountByName(ledger, 'Revenue').credit_cents, 1500);
  assert.deepEqual(ledger.totals, { debit_cents: 1500, credit_cents: 1500 });
});

test('accounts are returned sorted by account_name', async () => {
  const provider = createMemoryProjectionStoreProvider();
  const runner = makeRunner({ storeProvider: provider });
  const worker = createLedgerProjectionWorker();
  runner.register(worker);

  await runner.dispatch(
    journalPosted('e1', [
      line({ name: 'Zeta', classification: 'Expense', debit: 100 }),
      line({ name: 'Alpha', classification: 'Asset', debit: 100 }),
      line({ name: 'Mu', classification: 'Liability', credit: 200 }),
    ]),
  );

  const ledger = ledgerOf(worker, provider, TENANT_A);
  assert.deepEqual(
    ledger.accounts.map((a) => a.account_name),
    ['Alpha', 'Mu', 'Zeta'],
  );
});

// ── Replay rebuild (acceptance) ────────────────────────────────────────────────

test('replay rebuilds an identical ledger and a repeated replay does not corrupt balances', async () => {
  const events = [
    balancedPosting('e1', 1000, { createdAt: '2026-05-21T01:00:00.000Z' }),
    balancedPosting('e2', 500, { createdAt: '2026-05-21T02:00:00.000Z' }),
  ];
  const provider = createMemoryProjectionStoreProvider();
  const runner = makeRunner({
    eventStore: fakeEventStore({ [TENANT_A]: events }),
    storeProvider: provider,
  });
  const worker = createLedgerProjectionWorker();
  runner.register(worker);

  await runner.replay(LEDGER_PROJECTION_NAME, TENANT_A);
  const first = ledgerOf(worker, provider, TENANT_A);

  await runner.replay(LEDGER_PROJECTION_NAME, TENANT_A);
  const second = ledgerOf(worker, provider, TENANT_A);

  assert.deepEqual(second, first, 'a repeated replay reproduces identical ledger state');
  assert.equal(
    first.accounts.find((a) => a.account_name === 'Cash').debit_cents,
    1500,
    'a repeated replay must not double the balances',
  );
});

test('replay and event-by-event dispatch produce the same ledger', async () => {
  const events = [
    balancedPosting('e1', 1000, { createdAt: '2026-05-21T01:00:00.000Z' }),
    balancedPosting('e2', 250, { createdAt: '2026-05-21T02:00:00.000Z' }),
    balancedPosting('e3', 700, { createdAt: '2026-05-21T03:00:00.000Z' }),
  ];

  const providerReplay = createMemoryProjectionStoreProvider();
  const runnerReplay = makeRunner({
    eventStore: fakeEventStore({ [TENANT_A]: events }),
    storeProvider: providerReplay,
  });
  const workerReplay = createLedgerProjectionWorker();
  runnerReplay.register(workerReplay);
  await runnerReplay.replay(LEDGER_PROJECTION_NAME, TENANT_A);

  const providerDispatch = createMemoryProjectionStoreProvider();
  const runnerDispatch = makeRunner({ storeProvider: providerDispatch });
  const workerDispatch = createLedgerProjectionWorker();
  runnerDispatch.register(workerDispatch);
  for (const event of events) {
    await runnerDispatch.dispatch(event);
  }

  assert.deepEqual(
    ledgerOf(workerDispatch, providerDispatch, TENANT_A),
    ledgerOf(workerReplay, providerReplay, TENANT_A),
  );
});

// ── Event filtering (acceptance) ───────────────────────────────────────────────

test('the ledger projection ignores finance.audit.event_appended', async () => {
  const provider = createMemoryProjectionStoreProvider();
  const runner = makeRunner({ storeProvider: provider });
  const worker = createLedgerProjectionWorker();
  runner.register(worker);

  await runner.dispatch({
    id: 'infra-1',
    tenant_id: TENANT_A,
    event_type: 'finance.audit.event_appended',
    created_at: '2026-05-21T01:00:00.000Z',
    payload: {},
  });

  assert.equal(ledgerOf(worker, provider, TENANT_A).accounts.length, 0);
  assert.equal((await runner.status(LEDGER_PROJECTION_NAME, TENANT_A)).cursor, null);
});

test('the ledger projection ignores events it does not consume', async () => {
  const provider = createMemoryProjectionStoreProvider();
  const runner = makeRunner({ storeProvider: provider });
  const worker = createLedgerProjectionWorker();
  runner.register(worker);

  await runner.dispatch({
    id: 'inv-1',
    tenant_id: TENANT_A,
    event_type: 'finance.invoice.draft_created',
    created_at: '2026-05-21T01:00:00.000Z',
    payload: {},
  });

  assert.equal(ledgerOf(worker, provider, TENANT_A).accounts.length, 0);
});

// ── Degraded behavior (acceptance) ─────────────────────────────────────────────

test('a malformed finance.journal.posted degrades the projection and pauses later dispatch', async () => {
  const provider = createMemoryProjectionStoreProvider();
  const runner = makeRunner({ storeProvider: provider });
  const worker = createLedgerProjectionWorker();
  runner.register(worker);

  // Malformed: a finance.journal.posted with no journal_entry payload.
  await runner.dispatch({
    id: 'bad',
    tenant_id: TENANT_A,
    event_type: 'finance.journal.posted',
    created_at: '2026-05-21T01:00:00.000Z',
    payload: {},
  });
  assert.equal((await runner.status(LEDGER_PROJECTION_NAME, TENANT_A)).is_degraded, true);

  // A subsequent valid posting is paused while degraded.
  await runner.dispatch(balancedPosting('e2', 999, { createdAt: '2026-05-21T02:00:00.000Z' }));

  assert.equal(
    ledgerOf(worker, provider, TENANT_A).accounts.length,
    0,
    'while degraded, later events are not applied to the ledger',
  );
  assert.equal((await runner.status(LEDGER_PROJECTION_NAME, TENANT_A)).cursor, null);
});

// ── Tenant isolation (acceptance) ──────────────────────────────────────────────

test('ledger projection state is isolated per tenant', async () => {
  const provider = createMemoryProjectionStoreProvider();
  const runner = makeRunner({ storeProvider: provider });
  const worker = createLedgerProjectionWorker();
  runner.register(worker);

  await runner.dispatch(balancedPosting('a1', 1000, { tenant: TENANT_A }));
  await runner.dispatch(balancedPosting('b1', 25, { tenant: TENANT_B }));

  assert.equal(accountByName(ledgerOf(worker, provider, TENANT_A), 'Cash').debit_cents, 1000);
  assert.equal(accountByName(ledgerOf(worker, provider, TENANT_B), 'Cash').debit_cents, 25);
});

// ── Parity with the canonical ledger derivation ────────────────────────────────

// Guard against contract drift: the ledger projection must derive the same
// ledger as accountingEngine.buildLedger() — the existing canonical derivation —
// for the same set of posted journals.
test('replayed ledger projection matches accountingEngine.buildLedger (parity)', async () => {
  // Posted journal entries spanning all five classifications, with `Cash`
  // appearing in multiple entries to exercise cross-entry accumulation.
  const entries = [
    {
      id: 'je-1',
      status: 'posted',
      lines: [
        line({ name: 'Cash', classification: 'Asset', debit: 100000 }),
        line({ name: 'Sales Revenue', classification: 'Revenue', credit: 100000 }),
      ],
    },
    {
      id: 'je-2',
      status: 'posted',
      lines: [
        line({ name: 'Office Expense', classification: 'Expense', debit: 30000 }),
        line({ name: 'Cash', classification: 'Asset', credit: 30000 }),
      ],
    },
    {
      id: 'je-3',
      status: 'posted',
      lines: [
        line({ name: 'Inventory', classification: 'Asset', debit: 20000 }),
        line({ name: 'Accounts Payable', classification: 'Liability', credit: 20000 }),
      ],
    },
    {
      id: 'je-4',
      status: 'posted',
      lines: [
        line({ name: 'Cash', classification: 'Asset', debit: 50000 }),
        line({ name: 'Owner Equity', classification: 'Equity', credit: 50000 }),
      ],
    },
  ];

  // Canonical ledger.
  const canonical = buildLedger(entries);

  // Projection ledger — replay the same journals as finance.journal.posted events.
  const events = entries.map((entry, i) => ({
    id: `evt-${i + 1}`,
    tenant_id: TENANT_A,
    event_type: 'finance.journal.posted',
    created_at: `2026-05-21T0${i + 1}:00:00.000Z`,
    aggregate_type: 'journal_entry',
    aggregate_id: entry.id,
    payload: { journal_entry: entry },
  }));
  const provider = createMemoryProjectionStoreProvider();
  const runner = makeRunner({
    eventStore: fakeEventStore({ [TENANT_A]: events }),
    storeProvider: provider,
  });
  const worker = createLedgerProjectionWorker();
  runner.register(worker);
  await runner.replay(LEDGER_PROJECTION_NAME, TENANT_A);
  const projection = ledgerOf(worker, provider, TENANT_A);

  // Compare account-by-account (keyed by name, order-independent) and totals.
  const byName = (accounts) => Object.fromEntries(accounts.map((a) => [a.account_name, a]));
  assert.deepEqual(
    byName(projection.accounts),
    byName(canonical.accounts),
    'per-account ledger buckets must match accountingEngine.buildLedger',
  );
  assert.deepEqual(
    projection.totals,
    canonical.totals,
    'ledger totals must match accountingEngine.buildLedger',
  );
});
