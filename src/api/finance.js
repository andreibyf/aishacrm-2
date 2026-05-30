/**
 * Finance Ops Read-only API Client (UI Slice 1 / UI-1A)
 *
 * Single source of truth for HTTP calls to the Finance v2 read surface from
 * the frontend. Consumes ONLY the 5 GET endpoints documented in the design
 * freeze §8.1 (`docs/architecture/finance/finance-ui-slice-1-read-only-console-design.md`).
 *
 * Hard constraints (UI Slice 1):
 *   - This module exports GET-only functions. No POST, PATCH, DELETE.
 *   - The 6 mutating Finance v2 endpoints listed in design freeze §8.3
 *     (POST /draft-invoices, PATCH /draft-invoices/:id, POST /journal-drafts,
 *     POST /simulate/deal-won, POST /journal-entries/:id/reverse,
 *     POST /approvals/:id/approve) are NOT referenced anywhere in this file.
 *     Adding a wrapper for any of them in a Slice 1 PR is a structural
 *     violation of §1 + §15.
 *   - Access follows the backend contract: the route enforces
 *     `validateTenantAccess` + the per-tenant `financeOps` module gate
 *     (`backend/routes/finance.v2.js:67-85`). No role check is required or
 *     enforced. The client passes the caller's `tenant_id` via the
 *     `x-tenant-id` header so the existing tenant-validation middleware
 *     can apply.
 *   - Missing backend APIs (design freeze §8.2 gap inventory) are surfaced
 *     via the `FINANCE_API_GAPS` table below, NOT by inventing frontend
 *     data sources. Callers consult that table and render the gap state.
 *
 * Mounted backend path: `/api/v2/finance` (see `backend/server.js:537`).
 *
 * Response envelope (all 5 GETs): `{ status, data }`. This client unwraps
 * `data` on success. On non-2xx, throws an Error with:
 *   err.status: HTTP status code
 *   err.code:   backend `code` field if present, otherwise null
 *   err.message: backend `message` if present, otherwise `HTTP N`
 *   err.details: backend `details` if present, otherwise null
 *
 * Two error codes have semantic meaning to the UI:
 *   - HTTP 404 (route absent)  → finance ops surface not mounted in this env.
 *     Triggered when `ENABLE_FINANCE_OPS !== 'true'` server-side
 *     (`backend/lib/finance/financeRuntimeGate.js`). UI renders the
 *     "Route disabled" state per design freeze §12.1.
 *   - HTTP 403 with message containing "Finance Ops is not enabled for this
 *     tenant" → per-tenant module gate denied. Triggered when the tenant has
 *     no `financeOps`/`enterpriseFinance` row enabled in `modulesettings`.
 *     UI renders the "Tenant not enrolled" state per design freeze §12.2.
 *
 * Usage:
 *   import * as finance from '@/api/finance';
 *   const status = await finance.getRuntimeStatus(tenantId);
 */

import { getBackendUrl } from './backendUrl';

const FINANCE_BASE_PATH = '/api/v2/finance';

/**
 * Internal request helper. Throws structured errors on non-2xx.
 * Returns the unwrapped `data` field on success.
 *
 * Forwards an AbortSignal so callers can cancel in-flight requests when
 * navigating away from a tab or unmounting a panel.
 */
async function request(path, { tenantId, signal } = {}) {
  if (!tenantId) {
    // Refuse to dispatch a request without a tenant. The backend would 400
    // anyway (`resolveTenantId` returns null and the middleware rejects),
    // but catching it client-side gives a deterministic error shape to
    // tests and the UI.
    const err = new Error('finance api client: tenant_id is required');
    err.status = 0;
    err.code = 'CLIENT_MISSING_TENANT';
    err.details = null;
    throw err;
  }

  const url = `${getBackendUrl()}${FINANCE_BASE_PATH}${path}`;
  const res = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    signal,
    headers: {
      'x-tenant-id': tenantId,
    },
  });

  // Parse JSON even on error so we can surface backend error codes/messages.
  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = new Error(json.message || `HTTP ${res.status}`);
    err.status = res.status;
    err.code = json.code || null;
    err.details = json.details || null;
    throw err;
  }

  // Standard backend envelope: { status, data }. Unwrap data.
  // Some endpoints return data as { journal_entries: [...] }, others as
  // an opaque object (ledger, profit-loss, balance-sheet). Both are
  // forwarded as-is without shape coercion -- §7.2 / §7.5 design freeze
  // explicitly notes the in-memory domain service shape may differ from
  // the projection-backed shape, and the UI renders defensively.
  return json.data;
}

// ============================================================================
// 5 existing Finance v2 GET endpoints (design freeze §8.1)
// ============================================================================

/**
 * GET /api/v2/finance/runtime/status
 *
 * Returns runtime mode + persistence + provider_sync + governance posture
 * plus the 5 entity counts (journal entries, invoices, approvals, audit
 * events, adapter jobs).
 *
 * Drives:
 *   - §7.1 Runtime overview tab
 *   - §10.1 persistent-events fail-closed banner (via `runtime.persistence`)
 *   - §10.2 provider-writes default-closed banner (via `runtime.provider_sync`)
 *
 * @param {string} tenantId  UUID tenant id (forwarded as `x-tenant-id`).
 * @param {Object} [opts]    { signal } for AbortController cancellation.
 * @returns {Promise<{
 *   tenant_id: string,
 *   runtime: { mode: string, persistence: string, provider_sync: string, governance: string },
 *   counts: { journal_entries: number, invoices: number, approvals: number,
 *             audit_events: number, adapter_jobs: number },
 * }>}
 */
export function getRuntimeStatus(tenantId, { signal } = {}) {
  return request('/runtime/status', { tenantId, signal });
}

/**
 * GET /api/v2/finance/journal-entries
 *
 * Returns posted journal entries for the tenant. The in-memory domain service
 * guarantees `id`, `aggregate_id`, `status`, `created_at` per row; additional
 * fields (account_code, amount, currency, posted_at) may appear if the
 * underlying state has them and are forwarded as-is.
 *
 * Drives: §7.5 Journal entries tab.
 *
 * @returns {Promise<{ journal_entries: Array<Object> }>}
 */
export function getJournalEntries(tenantId, { signal } = {}) {
  return request('/journal-entries', { tenantId, signal });
}

/**
 * GET /api/v2/finance/ledger
 *
 * Returns the opaque ledger object for the tenant. Shape is treated as
 * unstructured by the UI in Slice 1 per design freeze §7.2 (the in-memory
 * shape may differ from the projection-backed shape that lands later).
 *
 * Drives: §7.2 Ledger summary tab.
 *
 * @returns {Promise<Object>}  opaque ledger object
 */
export function getLedger(tenantId, { signal } = {}) {
  return request('/ledger', { tenantId, signal });
}

/**
 * GET /api/v2/finance/profit-loss
 *
 * Returns the opaque P&L object for the tenant.
 *
 * Drives: §7.2 Ledger summary tab (P&L section).
 *
 * @returns {Promise<Object>}  opaque P&L object
 */
export function getProfitLoss(tenantId, { signal } = {}) {
  return request('/profit-loss', { tenantId, signal });
}

/**
 * GET /api/v2/finance/balance-sheet
 *
 * Returns the opaque balance-sheet object for the tenant.
 *
 * Drives: §7.2 Ledger summary tab (balance-sheet section).
 *
 * @returns {Promise<Object>}  opaque balance-sheet object
 */
export function getBalanceSheet(tenantId, { signal } = {}) {
  return request('/balance-sheet', { tenantId, signal });
}

// ============================================================================
// API gap registry (design freeze §8.2)
//
// Each entry describes a read-side endpoint Slice 1 cannot satisfy honestly
// today. UI-1C consumes this table directly to render the consistent gap
// state via `<GapStateCard>` instead of inventing fake data sources.
//
// Adding a row here does NOT add an endpoint. Adding the endpoint to the
// backend is a separate slice; when that lands, the entry below is removed
// and the matching `get*` wrapper above is added in the same PR.
// ============================================================================

export const FINANCE_API_GAPS = Object.freeze({
  draftInvoices: Object.freeze({
    endpoint: 'GET /api/v2/finance/draft-invoices',
    designRef: '§8.2.1',
    naturalBackingSource:
      'financeDomainService.bucket.invoices (in-memory today; persistent invoices projection later)',
    affectedScreen: 'Draft invoices (§7.3)',
    operatorSummary:
      'Draft invoice data is not available in this preview yet. This section will show read-only draft invoices once the backend read endpoint is added.',
  }),
  journalDrafts: Object.freeze({
    endpoint: 'GET /api/v2/finance/journal-drafts',
    designRef: '§8.2.2',
    naturalBackingSource:
      'domain service journal-draft state (currently merged into listJournalEntries for posted only)',
    affectedScreen: 'Journal drafts (§7.4)',
    operatorSummary:
      'Journal draft records are not available in this preview yet. This section will show draft journal entries once the read-only backend endpoint is added.',
  }),
  approvals: Object.freeze({
    endpoint: 'GET /api/v2/finance/approvals',
    designRef: '§8.2.3',
    naturalBackingSource:
      'financeDomainService.listApprovals(tenantId) + future approval_queue projection',
    affectedScreen: 'Approval queue (§7.6)',
    operatorSummary:
      'Approval queue data is not available in this preview yet. No approval actions are available in this read-only slice.',
  }),
  adapterJobs: Object.freeze({
    endpoint: 'GET /api/v2/finance/adapter-jobs',
    designRef: '§8.2.4',
    naturalBackingSource:
      'adapterQueueProjection per projection-contracts.md §7; backed by finance.adapter_jobs once persistent',
    affectedScreen: 'Adapter queue (§7.7)',
    operatorSummary:
      'Adapter job history is not available in this preview yet. No retry, cancel, or provider-sync actions are available in this read-only view.',
  }),
  auditEvents: Object.freeze({
    endpoint: 'GET /api/v2/finance/audit-events',
    designRef: '§8.2.5',
    naturalBackingSource:
      'financeDomainService.listAuditEvents(tenantId) + auditTimelineProjection',
    affectedScreen: 'Audit timeline (§7.8)',
    operatorSummary:
      'Audit event history is not available in this preview yet. This section will show read-only finance activity once the audit-events endpoint is added.',
  }),
  projectionCursors: Object.freeze({
    endpoint: 'GET /api/v2/finance/projection/cursors',
    designRef: '§8.2.6',
    naturalBackingSource: 'projectionStore.{memory,pg}.js cursors per projection per tenant',
    affectedScreen: 'Projection / degraded status (§7.9)',
    operatorSummary:
      'Detailed projection status (cursors and lag) is not available in this preview yet. This section will show read-only projection health once the backend read endpoint is added.',
  }),
  registeredAdapters: Object.freeze({
    endpoint: 'GET /api/v2/finance/adapters',
    designRef: '§8.2.7',
    naturalBackingSource:
      'adapter registry constructed inside financeAdapterWorker.js / adapterJobProcessor.js',
    affectedScreen: 'Sandbox adapter status (§7.10)',
    operatorSummary:
      'The registered-adapter list and capabilities are not available in this preview yet. This section will show read-only sandbox adapter details once the backend read endpoint is added.',
  }),
  evidencePacks: Object.freeze({
    endpoint: 'GET /api/v2/finance/evidence-packs',
    designRef: '§8.2.8',
    naturalBackingSource:
      'backend/lib/finance/auditEvidenceBuilder.js (runtime exists; no HTTP surface yet)',
    affectedScreen: 'Evidence / audit pack placeholder (§7.11)',
    operatorSummary:
      'Evidence packs are not available in this preview yet. This section will show read-only audit evidence once the backend read endpoint is added.',
  }),
  // §8.2.9 — accuracy concern flagged by the design freeze: the runtime.mode
  // field on /runtime/status is currently a hard-coded 'mock_read_only'
  // placeholder (backend/routes/finance.v2.js:110). It is NOT an authoritative
  // representation of the running mode (e.g. in_memory_draft_only, persistent)
  // until a real mode signal is published by the domain service. Slice 1
  // surfaces this limitation via the runtime overview annotation rather than
  // rendering the placeholder as authoritative.
  runtimeMode: Object.freeze({
    endpoint: 'GET /api/v2/finance/runtime/status (runtime.mode field)',
    designRef: '§8.2.9',
    naturalBackingSource:
      'domain service should publish an authoritative mode value (e.g. in_memory_draft_only / persistent) instead of the hard-coded mock_read_only string at backend/routes/finance.v2.js:110',
    affectedScreen: 'Runtime overview (§7.1) — mode row',
  }),
});

/**
 * Helper for UI-1C gap-state cards: returns the gap descriptor for a known
 * UI screen, or null if the screen has a live backing endpoint. Keeps the
 * gap reference table the single source of truth.
 *
 * @param {string} key  one of the FINANCE_API_GAPS keys above
 * @returns {{endpoint:string,designRef:string,naturalBackingSource:string,affectedScreen:string}|null}
 */
export function getFinanceApiGap(key) {
  return FINANCE_API_GAPS[key] || null;
}
