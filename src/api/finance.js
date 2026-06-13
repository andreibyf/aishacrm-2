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
 * Build request headers: tenant scoping (`x-tenant-id`) + the Supabase Bearer token
 * that every other app client sends (`src/api/functions` `getAuthorizationHeader`).
 *
 * Finance previously authenticated with the `aisha_access` cookie alone. That works
 * in dev — the backend injects a mock superadmin when auth is absent
 * (`validateTenant.js`, `NODE_ENV === 'development'`) — but 401s in staging/prod,
 * where there's no such fallback and the request carries no Bearer like the rest of
 * the app does. Sending the Bearer authenticates Finance identically to every other
 * client; `credentials: 'include'` is kept so cookie auth still works as a fallback.
 */
async function buildHeaders(tenantId, extra = {}) {
  const headers = { ...extra, 'x-tenant-id': tenantId };
  try {
    const { getAuthorizationHeader } = await import('@/api/functions');
    const auth = await getAuthorizationHeader();
    if (auth) headers.Authorization = auth;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('[finance] auth header lookup failed:', error?.message);
    }
    /* fall back to cookie auth (credentials:'include') */
  }
  return headers;
}

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
    headers: await buildHeaders(tenantId),
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

/**
 * Append query params to a path, omitting null / undefined / empty values so
 * the backend's optional-filter + pagination defaults apply cleanly.
 *
 * @param {string} path   base path under FINANCE_BASE_PATH
 * @param {Object} params plain object of param name -> value
 * @returns {string} path with a `?a=1&b=2` suffix, or the bare path if none
 */
function withQuery(path, params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    search.append(key, String(value));
  }
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
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
 * Internal mutation helper. The finance v2 module is otherwise GET-only (a
 * read-only console); this is the single intentional mutation surface — the
 * superadmin-controlled Test/Live data mode. Sends the tenant as `x-tenant-id`
 * (which also satisfies the backend's superadmin-write tenant requirement) plus
 * a JSON body, and unwraps the standard { status, data } envelope.
 */
async function mutate(path, { tenantId, method = 'PUT', body, signal } = {}) {
  if (!tenantId) {
    const err = new Error('finance api client: tenant_id is required');
    err.status = 0;
    err.code = 'CLIENT_MISSING_TENANT';
    err.details = null;
    throw err;
  }
  const url = `${getBackendUrl()}${FINANCE_BASE_PATH}${path}`;
  const res = await fetch(url, {
    method,
    credentials: 'include',
    signal,
    headers: await buildHeaders(tenantId, { 'Content-Type': 'application/json' }),
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.message || `HTTP ${res.status}`);
    err.status = res.status;
    err.code = json.code || null;
    err.details = json.details || null;
    throw err;
  }
  return json.data;
}

/**
 * PUT /api/v2/finance/settings/data-mode — superadmin-only. Flip the tenant's
 * Test/Live finance data mode.
 *
 * @param {string} tenantId
 * @param {'test'|'live'} mode
 * @param {Object} [opts] { signal }
 * @returns {Promise<{ mode: 'test'|'live' }>}
 */
export function updateFinanceDataMode(tenantId, mode, { signal } = {}) {
  return mutate('/settings/data-mode', { tenantId, method: 'PUT', body: { mode }, signal });
}

/**
 * GET /api/v2/finance/journal-entries
 *
 * Returns journal entries for the tenant across ALL statuses (`draft`,
 * `pending_approval`, `posted`, `reversed`) — not posted-only (Codex PR #650 P3).
 * The in-memory domain service guarantees `id`, `aggregate_id`, `status`,
 * `created_at` per row; additional fields (account_code, amount, currency,
 * posted_at) may appear if the underlying state has them and are forwarded as-is.
 *
 * Drives: §7.5 Journal entries tab.
 *
 * @returns {Promise<{ journal_entries: Array<Object> }>}
 */
export function getJournalEntries(tenantId, { signal } = {}) {
  return request('/journal-entries', { tenantId, signal });
}

/**
 * GET /api/v2/finance/accounts
 *
 * Returns the tenant chart of accounts (baseline system accounts + any
 * auto-created / manually-created accounts). This GET stays read-only here; the
 * editable COA manager's create/edit/deactivate/reactivate helpers live in
 * `src/api/financeWrites.js` (Phase 5) so this module's GET-only contract holds.
 *
 * Each account carries the flags the COA manager UI renders the lock rules from
 * (passthrough — no shape coercion): `is_system`, `is_active`, `source`, and
 * `has_posted_history` (true when the account appears in a posted/reversed
 * journal line — drives the classification/code lock + required reason). The
 * server remains the authority for every lock rule.
 *
 * Drives: the Chart of accounts tab.
 *
 * @returns {Promise<{ accounts: Array<Object> }>}
 */
export function getAccounts(tenantId, { signal } = {}) {
  return request('/accounts', { tenantId, signal });
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
/**
 * GET /api/v2/finance/cash-flow
 *
 * Read-only cash-flow statement (Bridge B) derived from posted journal lines on
 * cash/bank accounts. `{ cash_flow: { cash_account_codes, periods, totals } }`.
 * Drives: the Cash flow tab.
 */
export function getCashFlow(tenantId, { signal } = {}) {
  return request('/cash-flow', { tenantId, signal });
}

export function getBalanceSheet(tenantId, { signal } = {}) {
  return request('/balance-sheet', { tenantId, signal });
}

// ============================================================================
// Read API Slice 1 — newly implemented read-only GET endpoints.
//
// These replace the matching FINANCE_API_GAPS entries (removed below) with
// real backend reads. All remain GET-only; no mutating companion is added.
// Contracts: docs/architecture/finance/finance-ui-slice-1-api-gaps-design.md §6.
// ============================================================================

/**
 * GET /api/v2/finance/draft-invoices (§6.1) — draft invoices for the tenant.
 * @returns {Promise<{ invoices: Array<Object>, total: number, source: Object }>}
 */
export function getDraftInvoices(tenantId, { customerId, limit, offset, signal } = {}) {
  return request(withQuery('/draft-invoices', { customer_id: customerId, limit, offset }), {
    tenantId,
    signal,
  });
}

/**
 * GET /api/v2/finance/journal-drafts (§6.2) — draft + pending-approval journal
 * entries (the non-posted slice of /journal-entries).
 * @returns {Promise<{ journal_drafts: Array<Object>, total: number, source: Object }>}
 */
export function getJournalDrafts(tenantId, { aggregateId, limit, offset, signal } = {}) {
  return request(withQuery('/journal-drafts', { aggregate_id: aggregateId, limit, offset }), {
    tenantId,
    signal,
  });
}

/**
 * GET /api/v2/finance/approvals (§6.3) — approval queue. `status` defaults to
 * pending server-side; pass 'all' for every status.
 * @returns {Promise<{ approvals: Array<Object>, total: number, source: Object }>}
 */
export function getApprovals(tenantId, { status, limit, offset, signal } = {}) {
  return request(withQuery('/approvals', { status, limit, offset }), { tenantId, signal });
}

/**
 * GET /api/v2/finance/adapter-jobs (§6.4) — adapter job queue (read-only; no
 * retry/cancel companion).
 * @returns {Promise<{ adapter_jobs: Array<Object>, total: number, source: Object }>}
 */
export function getAdapterJobs(tenantId, { status, operation, limit, offset, signal } = {}) {
  return request(withQuery('/adapter-jobs', { status, operation, limit, offset }), {
    tenantId,
    signal,
  });
}

/**
 * GET /api/v2/finance/audit-events (§6.5) — cursor-paginated audit timeline,
 * newest first. Pass the returned `next_cursor` to page.
 * @returns {Promise<{ events: Array<Object>, next_cursor: string|null, source: Object }>}
 */
export function getAuditEvents(tenantId, { cursor, eventType, limit, signal } = {}) {
  return request(withQuery('/audit-events', { cursor, event_type: eventType, limit }), {
    tenantId,
    signal,
  });
}

/**
 * GET /api/v2/finance/adapters (§6.7) — read-only declarative metadata for the
 * known accounting adapters (capability / status / posture discovery only).
 * @returns {Promise<{ adapters: Array<Object>, source: Object }>}
 */
export function getAdapters(tenantId, { signal } = {}) {
  return request('/adapters', { tenantId, signal });
}

/**
 * GET /api/v2/finance/evidence-packs (§6.8) — builds a single tamper-evident
 * evidence pack on demand from the tenant event stream and returns metadata +
 * integrity hashes. Singular: no historical list/registry exists.
 * @returns {Promise<{ pack: Object, source: Object }>}
 */
export function getEvidencePack(tenantId, { from, to, targetId, signal } = {}) {
  return request(withQuery('/evidence-packs', { from, to, target_id: targetId }), {
    tenantId,
    signal,
  });
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
  // Read API Slice 1 retired these gaps by implementing their GET endpoints:
  // draftInvoices (§8.2.1), journalDrafts (§8.2.2), approvals (§8.2.3),
  // adapterJobs (§8.2.4), auditEvents (§8.2.5), registeredAdapters (§8.2.7),
  // evidencePacks (§8.2.8). Their `get*` wrappers are above. Two gaps remain.
  projectionCursors: Object.freeze({
    endpoint: 'GET /api/v2/finance/projection/cursors',
    designRef: '§8.2.6',
    naturalBackingSource: 'projectionStore.{memory,pg}.js cursors per projection per tenant',
    affectedScreen: 'Projection / degraded status (§7.9)',
    operatorSummary:
      'Detailed projection status (cursors and lag) is not available in this preview yet. This section will show read-only projection health once the backend read endpoint is added.',
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
