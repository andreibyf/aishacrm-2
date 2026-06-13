/**
 * Finance v2 WRITE client — the create/act mutations for the Finance Ops
 * console. Kept separate from the read-only `finance.js` so that module's
 * GET-only contract stays intact; this is where the mutating affordances live.
 *
 * These call the existing Finance v2 mutating endpoints (no new backend
 * surface). The backend governs each command (financeGovernanceDecision +
 * actor checks). The SIMULATE helpers are only exposed in TEST mode (their
 * entries are sandbox/test data); the CHART-OF-ACCOUNTS mutations
 * (create/update/deactivate/reactivate) are admin-gated and live-capable —
 * the backend (`requireCoaManage` + the domain lock rules) is the authority.
 *
 * Tenant is forwarded as `x-tenant-id` (also satisfies validateTenantAccess for
 * superadmins). Errors are thrown with the structured { status, code, details }
 * shape the console already renders.
 */

import { getBackendUrl } from './backendUrl';

const FINANCE_BASE_PATH = '/api/v2/finance';

/**
 * Tenant scoping (`x-tenant-id`) + the Supabase Bearer token the rest of the app
 * sends. Finance previously used the `aisha_access` cookie alone, which works in dev
 * (backend injects a mock superadmin when auth is absent) but 401s in staging/prod.
 * Sending the Bearer authenticates Finance like every other client; cookie auth is
 * kept (`credentials: 'include'`) as a fallback. Mirrors `finance.js` `buildHeaders`.
 */
async function buildHeaders(tenantId, extra = {}) {
  const headers = { ...extra, 'x-tenant-id': tenantId };
  try {
    const { getAuthorizationHeader } = await import('@/api/functions');
    const auth = await getAuthorizationHeader();
    if (auth) headers.Authorization = auth;
  } catch {
    /* no Supabase session — fall back to cookie auth (credentials:'include') */
  }
  return headers;
}

async function mutate(path, { tenantId, method = 'POST', body, signal } = {}) {
  if (!tenantId) {
    const err = new Error('finance writes client: tenant_id is required');
    err.status = 0;
    err.code = 'CLIENT_MISSING_TENANT';
    err.details = null;
    throw err;
  }
  const res = await fetch(`${getBackendUrl()}${FINANCE_BASE_PATH}${path}`, {
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

/** POST /simulate/deal-won — create a representative journal + approval + draft adapter job. */
export function simulateDealWon(tenantId, payload = {}, { signal } = {}) {
  return mutate('/simulate/deal-won', { tenantId, method: 'POST', body: payload, signal });
}

/**
 * POST /simulate/posted-deal-won — test-mode sandbox: create a won-deal journal
 * AND post it (auto-approve), so the ledger / P&L / balance-sheet / cash-flow
 * show sample data. Used only by the test-mode create panel; not a general
 * approve control.
 */
export function simulatePostedDealWon(tenantId, payload = {}, { signal } = {}) {
  return mutate('/simulate/posted-deal-won', { tenantId, method: 'POST', body: payload, signal });
}

/** POST /journal-drafts — create a balanced journal draft. */
export function createJournalDraft(tenantId, payload = {}, { signal } = {}) {
  return mutate('/journal-drafts', { tenantId, method: 'POST', body: payload, signal });
}

/** POST /journal-drafts/:id/submit — promote a draft journal entry to pending_approval. */
export function submitJournalDraft(tenantId, entryId, { signal } = {}) {
  return mutate(`/journal-drafts/${encodeURIComponent(entryId)}/submit`, {
    tenantId,
    method: 'POST',
    signal,
  });
}

/** POST /draft-invoices — create a draft invoice. */
export function createDraftInvoice(tenantId, payload = {}, { signal } = {}) {
  return mutate('/draft-invoices', { tenantId, method: 'POST', body: payload, signal });
}

/** POST /draft-invoices/:id/submit — promote a draft invoice to pending_approval. */
export function submitDraftInvoice(tenantId, invoiceId, { signal } = {}) {
  return mutate(`/draft-invoices/${encodeURIComponent(invoiceId)}/submit`, {
    tenantId,
    method: 'POST',
    signal,
  });
}

/** POST /approvals/:id/approve — approve a pending finance approval (posts the journal / invoice). */
export function approveFinanceAction(tenantId, approvalId, { signal } = {}) {
  return mutate(`/approvals/${encodeURIComponent(approvalId)}/approve`, {
    tenantId,
    method: 'POST',
    signal,
  });
}

/** POST /journal-entries/:id/reverse — request a reversal of a posted entry `{ reason }`. */
export function reverseJournalEntry(tenantId, entryId, payload = {}, { signal } = {}) {
  return mutate(`/journal-entries/${encodeURIComponent(entryId)}/reverse`, {
    tenantId,
    method: 'POST',
    body: payload,
    signal,
  });
}

// ============================================================================
// Editable Chart of Accounts manager (design 2026-06-06, Phase 5 / Task 16).
//
// The four COA mutations. The backend enforces EVERY lock rule (system-locked,
// posted-history field locks, nonzero-balance, uniqueness, AI-blocked, RBAC) and
// returns a stable `FINANCE_COA_*` code on failure (design §6) which `mutate`
// surfaces as err.code — the panel maps it to a human message. The UI's
// disabling/hiding is presentation only; the server is the authority.
// ============================================================================

/** POST /accounts — create a manual account `{ name, classification, account_type }`. */
export function createAccount(tenantId, payload = {}, { signal } = {}) {
  return mutate('/accounts', { tenantId, method: 'POST', body: payload, signal });
}

/**
 * PATCH /accounts/:id — edit a non-system account. `payload` is a subset of
 * `{ name, classification, account_code, account_type, reason }`.
 */
export function updateAccount(tenantId, accountId, payload = {}, { signal } = {}) {
  return mutate(`/accounts/${encodeURIComponent(accountId)}`, {
    tenantId,
    method: 'PATCH',
    body: payload,
    signal,
  });
}

/** POST /accounts/:id/deactivate — deactivate an account `{ reason }` (required). */
export function deactivateAccount(tenantId, accountId, payload = {}, { signal } = {}) {
  return mutate(`/accounts/${encodeURIComponent(accountId)}/deactivate`, {
    tenantId,
    method: 'POST',
    body: payload,
    signal,
  });
}

/** POST /accounts/:id/reactivate — reactivate an inactive account `{ reason }` (required). */
export function reactivateAccount(tenantId, accountId, payload = {}, { signal } = {}) {
  return mutate(`/accounts/${encodeURIComponent(accountId)}/reactivate`, {
    tenantId,
    method: 'POST',
    body: payload,
    signal,
  });
}
