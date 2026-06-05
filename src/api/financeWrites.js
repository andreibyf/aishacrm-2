/**
 * Finance v2 WRITE client — the create/act mutations for the Finance Ops
 * console. Kept separate from the read-only `finance.js` so that module's
 * GET-only contract stays intact; this is where the mutating affordances live.
 *
 * These call the existing Finance v2 mutating endpoints (no new backend
 * surface). The backend governs each command (financeGovernanceDecision +
 * actor checks); the UI only exposes them when the tenant is in TEST mode, so
 * the entries created here are sandbox/test data.
 *
 * Tenant is forwarded as `x-tenant-id` (also satisfies validateTenantAccess for
 * superadmins). Errors are thrown with the structured { status, code, details }
 * shape the console already renders.
 */

import { getBackendUrl } from './backendUrl';

const FINANCE_BASE_PATH = '/api/v2/finance';

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
    headers: { 'Content-Type': 'application/json', 'x-tenant-id': tenantId },
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

/** POST /journal-drafts — create a balanced journal draft. */
export function createJournalDraft(tenantId, payload = {}, { signal } = {}) {
  return mutate('/journal-drafts', { tenantId, method: 'POST', body: payload, signal });
}

/** POST /draft-invoices — create a draft invoice. */
export function createDraftInvoice(tenantId, payload = {}, { signal } = {}) {
  return mutate('/draft-invoices', { tenantId, method: 'POST', body: payload, signal });
}

/** POST /approvals/:id/approve — approve a pending finance approval. */
export function approveFinanceAction(tenantId, approvalId, { signal } = {}) {
  return mutate(`/approvals/${encodeURIComponent(approvalId)}/approve`, {
    tenantId,
    method: 'POST',
    signal,
  });
}
