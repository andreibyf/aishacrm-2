/**
 * projectionBackedFinanceReadAdapter.js
 *
 * Phase 4-1 §8 — the FinanceReadAdapter used when
 * `ENABLE_FINANCE_PERSISTENT_EVENTS=true`. Reads the Finance v2 GET surface
 * from Postgres-backed projections (per design §4) instead of the in-memory
 * domain service.
 *
 * §6 no-silent-fallback contract: if a projection-store / audit-events read
 * fails, the adapter throws `FinanceReadDegradedError` (→ 503 at the route).
 * It NEVER falls back to in-memory data — doing so would silently re-introduce
 * the split-brain the persistent-events guard exists to prevent.
 */

import { profitAndLossFromLedger, balanceSheetFromLedger } from '../accountingEngine.js';

export class FinanceReadDegradedError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'FinanceReadDegradedError';
    this.code = 'FINANCE_READ_DEGRADED';
    this.statusCode = 503;
    if (cause) this.cause = cause;
  }
}

// Count a projection read model: arrays by length, bucket-objects by summing
// their array values (approval_queue: pending+resolved; adapter_queue:
// queued+running+failed+completed).
function countReadModel(readModel) {
  if (Array.isArray(readModel)) return readModel.length;
  if (readModel && typeof readModel === 'object') {
    return Object.values(readModel).reduce(
      (sum, value) => sum + (Array.isArray(value) ? value.length : 0),
      0,
    );
  }
  return 0;
}

export function createProjectionBackedFinanceReadAdapter({
  createStoreProvider,
  auditEventsReader,
  workers,
}) {
  if (typeof createStoreProvider !== 'function' || !auditEventsReader || !workers) {
    throw new Error(
      'createProjectionBackedFinanceReadAdapter requires createStoreProvider(fn), auditEventsReader, workers',
    );
  }
  const { ledger, journalEntries, approvalQueue, adapterQueue } = workers;
  if (!ledger || !journalEntries || !approvalQueue || !adapterQueue) {
    throw new Error(
      'createProjectionBackedFinanceReadAdapter requires ledger, journalEntries, approvalQueue, adapterQueue workers',
    );
  }

  // Read one projection's read model from a per-request store provider. A fresh
  // provider is built per request (see each method) so the route never serves a
  // snapshot cached for the router lifetime — it always reflects the latest
  // worker-persisted projection_state. Any store failure becomes a degraded
  // error — never a silent in-memory fallback (§6).
  async function readProjection(storeProvider, worker, tenantId) {
    let store;
    try {
      store = await storeProvider.getLiveStore(worker.projectionName, tenantId);
    } catch (err) {
      throw new FinanceReadDegradedError(
        `projection store read failed for ${worker.projectionName}`,
        err,
      );
    }
    return worker.getProjection(tenantId, {}, store);
  }

  async function ledgerReadModel(storeProvider, tenantId) {
    const lm = await readProjection(storeProvider, ledger, tenantId);
    return {
      accounts: Array.isArray(lm?.accounts) ? lm.accounts : [],
      totals: lm?.totals || { debit_cents: 0, credit_cents: 0 },
    };
  }

  return {
    async listJournalEntries(tenantId) {
      return readProjection(createStoreProvider(), journalEntries, tenantId);
    },

    async getLedger(tenantId) {
      // Strip the projection read model's tenant_id wrapper so the shape matches
      // the in-memory `service.getLedger()` ({ accounts, totals }).
      return ledgerReadModel(createStoreProvider(), tenantId);
    },

    async getProfitLoss(tenantId) {
      return profitAndLossFromLedger(await ledgerReadModel(createStoreProvider(), tenantId));
    },

    async getBalanceSheet(tenantId) {
      return balanceSheetFromLedger(await ledgerReadModel(createStoreProvider(), tenantId));
    },

    async getRuntimeStatus(tenantId) {
      const storeProvider = createStoreProvider();
      let auditCount;
      try {
        auditCount = await auditEventsReader.count(tenantId);
      } catch (err) {
        throw new FinanceReadDegradedError('audit_events read failed', err);
      }

      const je = await readProjection(storeProvider, journalEntries, tenantId);
      const ap = await readProjection(storeProvider, approvalQueue, tenantId);
      const aj = await readProjection(storeProvider, adapterQueue, tenantId);

      // Per-projection cursor + degraded flag — the honest lag signal (§6 row 2):
      // expose where each projection is, never mask staleness by re-reading
      // audit_events directly.
      // §6 no-silent-fallback: getState failures must raise FinanceReadDegradedError,
      // not be silently collapsed to null — that would mask projection_state read
      // failures and return 200 instead of 503.
      const lag = {};
      for (const worker of [ledger, journalEntries, approvalQueue, adapterQueue]) {
        let state;
        try {
          state = await storeProvider.getState(worker.projectionName, tenantId);
        } catch (err) {
          throw new FinanceReadDegradedError(
            `projection_state read failed for ${worker.projectionName}`,
            err,
          );
        }
        lag[worker.projectionName] = {
          cursor: state?.cursor ?? null,
          is_degraded: Boolean(state?.is_degraded),
        };
      }

      return {
        tenant_id: tenantId,
        runtime: {
          mode: 'persistent',
          persistence: 'persistent',
          provider_sync: 'disabled',
          governance: 'enabled',
        },
        counts: {
          journal_entries: countReadModel(je),
          invoices: 0, // no invoice projection; draft-invoices is a deferred gap endpoint
          approvals: countReadModel(ap),
          audit_events: auditCount,
          adapter_jobs: countReadModel(aj),
        },
        persistence_lag: {
          audit_events_total: auditCount,
          projections: lag,
        },
      };
    },
  };
}

export default createProjectionBackedFinanceReadAdapter;
