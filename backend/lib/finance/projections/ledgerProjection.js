/**
 * ledgerProjection.js
 *
 * Phase 2B-8 — Minimal ledger projection worker. The first real projection
 * consumer built on the Projection Runtime (Phase 2B-7).
 *
 * See docs/architecture/finance/projection-runtime.md (the worker contract)
 * and docs/architecture/finance/projection-contracts.md §3 (the ledger read
 * model).
 *
 * Scope (2B-8): consumes `finance.journal.posted` only and maintains a
 * tenant-scoped double-entry ledger in a memory ProjectionStore. No DB
 * persistence, no HTTP routes. `finance.journal.reversed` and point-in-time
 * queries are deferred to a later phase.
 */

export const LEDGER_PROJECTION_NAME = 'finance.projection.ledger';

const CONSUMED_EVENTS = ['finance.journal.posted'];

/**
 * Per-account store key: an explicit `account_id` when present, otherwise the
 * classification + account name. Mirrors the keying in accountingEngine's
 * ledger build and projection-contracts.md §3.
 */
function accountKey(line) {
  if (line.account_id) return `id:${line.account_id}`;
  return `name:${line.classification}:${line.account_name}`;
}

/**
 * Apply one `finance.journal.posted` event to the store, accumulating each
 * journal line into its account bucket. Written immutably — a fetched bucket
 * is never mutated; a fresh bucket is always stored.
 *
 * A `finance.journal.posted` event must carry `payload.journal_entry.lines`;
 * a malformed one throws, which the runtime surfaces as a degraded projection.
 */
function applyJournalPosted(event, store) {
  const journal = event && event.payload && event.payload.journal_entry;
  if (!journal || !Array.isArray(journal.lines)) {
    throw new Error(
      `ledger projection: finance.journal.posted event ${event && event.id} ` +
        'is missing payload.journal_entry.lines',
    );
  }
  for (const line of journal.lines) {
    const key = accountKey(line);
    const prev = store.get(key);
    store.set(key, {
      account_id: line.account_id ?? (prev ? prev.account_id : null),
      account_name: line.account_name ?? (prev ? prev.account_name : null),
      classification: line.classification ?? (prev ? prev.classification : null),
      debit_cents: (prev ? prev.debit_cents : 0) + (line.debit_cents || 0),
      credit_cents: (prev ? prev.credit_cents : 0) + (line.credit_cents || 0),
    });
  }
}

/**
 * Create the ledger ProjectionWorker. Conforms to the Projection Runtime
 * worker contract: `handleEvent` / `replay` receive their tenant-scoped store
 * from the runner; `getProjection` assembles the ledger read model from that
 * same store (passed as its third argument, consistent with the other two
 * methods).
 */
export function createLedgerProjectionWorker() {
  return {
    projectionName: LEDGER_PROJECTION_NAME,
    consumedEvents: CONSUMED_EVENTS,
    schemaVersion: 1,

    handleEvent(event, store) {
      applyJournalPosted(event, store);
    },

    replay(events, store) {
      for (const event of events) {
        applyJournalPosted(event, store);
      }
    },

    getProjection(tenantId, _opts, store) {
      const accounts = store
        .keys()
        .map((key) => {
          const bucket = store.get(key);
          return {
            account_id: bucket.account_id,
            account_name: bucket.account_name,
            classification: bucket.classification,
            debit_cents: bucket.debit_cents,
            credit_cents: bucket.credit_cents,
            balance_cents: bucket.debit_cents - bucket.credit_cents,
          };
        })
        .sort((a, b) => {
          if (a.account_name < b.account_name) return -1;
          if (a.account_name > b.account_name) return 1;
          return 0;
        });
      const totals = accounts.reduce(
        (acc, account) => ({
          debit_cents: acc.debit_cents + account.debit_cents,
          credit_cents: acc.credit_cents + account.credit_cents,
        }),
        { debit_cents: 0, credit_cents: 0 },
      );
      return { tenant_id: tenantId, accounts, totals };
    },
  };
}

export default createLedgerProjectionWorker;
