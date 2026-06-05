/**
 * inMemoryFinanceReadAdapter.js
 *
 * Phase 4-1 §8 — the default FinanceReadAdapter. Wraps the in-memory
 * `financeDomainService` so the Finance v2 GET handlers can call
 * `adapter.method(tenantId)` without knowing which read path is active. Used
 * when `ENABLE_FINANCE_PERSISTENT_EVENTS` is false/unset. Behaviour is
 * identical to the pre-lift route handlers — zero behavioural change for the
 * default posture.
 */

export function createInMemoryFinanceReadAdapter({ service }) {
  if (!service) {
    throw new Error('createInMemoryFinanceReadAdapter requires a domain service');
  }

  return {
    // Reproduces the pre-lift /runtime/status assembly (finance.v2.js:152-188):
    // in-memory persistence, the mock_read_only mode placeholder, and counts
    // from the domain service bucket.
    async getRuntimeStatus(tenantId) {
      const state =
        typeof service.getState === 'function'
          ? await service.getState(tenantId)
          : {
              journalEntries: service.listJournalEntries(tenantId),
              approvals: service.listApprovals(tenantId),
              auditEvents: await service.listAuditEvents(tenantId),
              invoices: [],
              adapterJobs: [],
            };
      return {
        tenant_id: tenantId,
        runtime: {
          mode: 'mock_read_only',
          persistence: 'in_memory',
          provider_sync: 'disabled',
          governance: 'enabled',
        },
        counts: {
          journal_entries: Array.isArray(state.journalEntries) ? state.journalEntries.length : 0,
          invoices: Array.isArray(state.invoices) ? state.invoices.length : 0,
          approvals: Array.isArray(state.approvals) ? state.approvals.length : 0,
          audit_events: Array.isArray(state.auditEvents) ? state.auditEvents.length : 0,
          adapter_jobs: Array.isArray(state.adapterJobs) ? state.adapterJobs.length : 0,
        },
      };
    },

    async listJournalEntries(tenantId) {
      return service.listJournalEntries(tenantId);
    },

    async listInvoices(tenantId) {
      return service.listInvoices(tenantId);
    },

    async listApprovals(tenantId) {
      return service.listApprovals(tenantId);
    },

    async listAdapterJobs(tenantId) {
      return service.listAdapterJobs(tenantId);
    },

    async getLedger(tenantId) {
      return service.getLedger(tenantId);
    },

    async getProfitLoss(tenantId) {
      return service.getProfitLoss(tenantId);
    },

    async getBalanceSheet(tenantId) {
      return service.getBalanceSheet(tenantId);
    },
  };
}

export default createInMemoryFinanceReadAdapter;
