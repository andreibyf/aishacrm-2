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
import { seedAccountsForTenant } from '../chartOfAccounts.js';
import { buildCashFlowStatement } from '../cashFlowStatement.js';

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
// draft+queued+running+failed+completed).
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
  const { ledger, journalEntries, approvalQueue, adapterQueue, invoices } = workers;
  if (!ledger || !journalEntries || !approvalQueue || !adapterQueue || !invoices) {
    throw new Error(
      'createProjectionBackedFinanceReadAdapter requires ledger, journalEntries, approvalQueue, adapterQueue, invoices workers',
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

  // COA Slice 1: the event-sourced chart of accounts — baseline seed merged with
  // auto-created accounts folded from `finance.account.created` (partition-aware).
  // Fail-closed: a reader error propagates → 503. Deduped by account_id (Codex
  // PR #647 P1). Shared by listAccounts + getCashFlow.
  async function foldChartOfAccounts(tenantId, isTestData) {
    let created;
    try {
      const payloads = await auditEventsReader.listByType(tenantId, 'finance.account.created', isTestData);
      created = payloads.map((p) => ({
        id: p.account_id,
        tenant_id: tenantId,
        account_code: p.account_code,
        name: p.name,
        classification: p.classification,
        account_type: p.account_type,
        parent_account_id: null,
        is_system: false,
        is_active: true,
      }));
    } catch (err) {
      throw new FinanceReadDegradedError('Failed to read chart of accounts', err);
    }
    const accounts = seedAccountsForTenant(tenantId);
    const seenIds = new Set(accounts.map((a) => a.id));
    for (const acc of created) {
      if (acc.id && !seenIds.has(acc.id)) {
        accounts.push(acc);
        seenIds.add(acc.id);
      }
    }
    return accounts;
  }

  return {
    async listJournalEntries(tenantId) {
      return readProjection(createStoreProvider(), journalEntries, tenantId);
    },

    // The invoices projection stores FULL invoice snapshots and getProjection
    // returns them as an insertion-ordered array — the same shape
    // `service.listInvoices()` returns — so it is served as-is. The route's
    // /draft-invoices handler reads id/status/customer_id/currency/total_cents/
    // created_at/updated_at off each record, all present on the snapshot.
    async listInvoices(tenantId) {
      return readProjection(createStoreProvider(), invoices, tenantId);
    },

    // COA Slice 1: the tenant chart of accounts, event-sourced in persistent mode
    // — the baseline system accounts (not events; re-seeded deterministically)
    // merged with the auto-created accounts folded from `finance.account.created`
    // events in append order. Fail-closed: a reader error propagates → 503
    // (no in-memory fallback), per the §6 no-silent-fallback contract.
    async listAccounts(tenantId, { isTestData = null } = {}) {
      return foldChartOfAccounts(tenantId, isTestData);
    },

    // COA Slice 1 + Cash Flow Slice 2: the cash-flow statement, derived from the
    // posted/reversed journal lines (journal_entries projection) on cash/bank
    // accounts (COA account_type). Partition-aware; fail-closed via the same
    // event-sourced COA fold.
    async getCashFlow(tenantId, { isTestData = null } = {}) {
      const [entries, accounts] = await Promise.all([
        readProjection(createStoreProvider(), journalEntries, tenantId),
        foldChartOfAccounts(tenantId, isTestData),
      ]);
      return buildCashFlowStatement(entries, accounts);
    },

    // Reconstruct a flat approval list matching `service.listApprovals()` on the
    // route-consumed fields (finance.v2.js /approvals: id/status/target_type/
    // target_id/requested_by/requested_at + the decision actor/timestamp the
    // route coalesces into decided_by/decided_at). The approval_queue projection
    // splits records into pending/resolved buckets, so flatten both: pending
    // entries map straight through; resolved entries map resolved_by/resolved_at
    // into the status-specific decision fields (approved_/rejected_/cancelled_)
    // the route coalesces over.
    async listApprovals(tenantId) {
      const queue = await readProjection(createStoreProvider(), approvalQueue, tenantId);
      const pending = (queue?.pending || []).map((entry) => ({
        id: entry.approval_id,
        tenant_id: entry.tenant_id ?? null,
        target_type: entry.target_type,
        target_id: entry.target_id,
        status: 'pending',
        requested_by: entry.requested_by ?? null,
        requested_at: entry.created_at,
      }));
      const resolved = (queue?.resolved || []).map((entry) => {
        const record = {
          id: entry.approval_id,
          tenant_id: entry.tenant_id ?? null,
          target_type: entry.target_type,
          target_id: entry.target_id,
          status: entry.status,
          requested_by: entry.requested_by ?? null,
          requested_at: entry.requested_at ?? null,
        };
        // Stamp the decision actor + timestamp onto the status-specific fields
        // (approved_by/at | rejected_by/at | cancelled_by/at) the route's
        // decided_by/decided_at coalescing reads from.
        if (entry.status === 'approved') {
          record.approved_by = entry.resolved_by;
          record.approved_at = entry.resolved_at;
        } else if (entry.status === 'rejected') {
          record.rejected_by = entry.resolved_by;
          record.rejected_at = entry.resolved_at;
        } else if (entry.status === 'cancelled') {
          record.cancelled_by = entry.resolved_by;
          record.cancelled_at = entry.resolved_at;
        }
        return record;
      });
      return [...pending, ...resolved];
    },

    // Reconstruct a flat adapter-job list matching `service.listAdapterJobs()` on
    // the route-consumed fields (finance.v2.js /adapter-jobs: id/operation/status/
    // attempts/created_at). The adapter_queue projection splits records into
    // draft/queued/running/failed/completed buckets keyed by adapter_job_id;
    // concat all buckets and map adapter_job_id -> id. The projection now
    // materializes a draft job from the `finance.approval.requested` adapter_job
    // snapshot (before any sync event), so an un-synced draft is present here —
    // matching the in-memory domain service's listAdapterJobs().
    async listAdapterJobs(tenantId) {
      const buckets = await readProjection(createStoreProvider(), adapterQueue, tenantId);
      const items = [
        ...(buckets?.draft || []),
        ...(buckets?.queued || []),
        ...(buckets?.running || []),
        ...(buckets?.failed || []),
        ...(buckets?.completed || []),
      ];
      return items.map((item) => ({
        id: item.adapter_job_id,
        tenant_id: item.tenant_id,
        provider: item.provider,
        aggregate_type: item.aggregate_type,
        aggregate_id: item.aggregate_id,
        operation: item.operation,
        mode: item.mode,
        status: item.status,
        attempts: item.attempts,
        // Codex PR #633 P2: the projection now stores a retryable failure's backoff
        // ETA on the queue item; the route serializes `j.next_attempt_at`. Carry it
        // through or `/adapter-jobs?status=queued` reports `next_attempt_at: null`.
        next_attempt_at: item.next_attempt_at ?? null,
        // The route serializer (finance.v2.js GET /adapter-jobs) reads `last_error`
        // — the in-memory contract's field name. The adapter_queue projection
        // stores the error under `error_message`, so map it back to `last_error`
        // here or the route emits `last_error: null` and drops the failure text
        // for failed jobs in persistent mode (Codex PR #632-followup P2).
        last_error: item.error_message ?? null,
        created_at: item.created_at,
        updated_at: item.updated_at,
      }));
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

    async getRuntimeStatus(tenantId, { isTestData = null } = {}) {
      const storeProvider = createStoreProvider();
      let auditCount;
      try {
        // Codex PR #634 P2: partition the audit count by the active mode so it
        // matches the (partitioned) /audit-events read. `null` = all (back-compat).
        auditCount = await auditEventsReader.count(tenantId, isTestData);
      } catch (err) {
        throw new FinanceReadDegradedError('audit_events read failed', err);
      }

      const je = await readProjection(storeProvider, journalEntries, tenantId);
      const inv = await readProjection(storeProvider, invoices, tenantId);
      const ap = await readProjection(storeProvider, approvalQueue, tenantId);
      const aj = await readProjection(storeProvider, adapterQueue, tenantId);

      // Per-projection cursor + degraded flag — the honest lag signal (§6 row 2):
      // expose where each projection is, never mask staleness by re-reading
      // audit_events directly.
      // §6 no-silent-fallback: getState failures must raise FinanceReadDegradedError,
      // not be silently collapsed to null — that would mask projection_state read
      // failures and return 200 instead of 503.
      const lag = {};
      for (const worker of [ledger, journalEntries, approvalQueue, adapterQueue, invoices]) {
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
          invoices: countReadModel(inv),
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
