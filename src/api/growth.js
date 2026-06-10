/**
 * Growth / OSINT Opportunity Intelligence API helpers
 *
 * Shared frontend client for the `/api/v2/growth/*` backend endpoints.
 * Mirrors the authed-backend-call pattern used by src/api/emailTemplates.js:
 *  - Authorization header resolved lazily via getAuthorizationHeader()
 *  - Tenant scoped via x-tenant-id header
 *  - Backend base resolved via getBackendUrl()
 */
import { getBackendUrl } from '@/api/backendUrl';

async function getHeaders(tenantId) {
  const headers = { 'Content-Type': 'application/json' };
  if (tenantId) headers['x-tenant-id'] = String(tenantId);

  // Dynamic import to avoid circular dependency (matches emailTemplates.js)
  const { getAuthorizationHeader } = await import('@/api/functions');
  const auth = await getAuthorizationHeader();
  if (auth) headers.Authorization = auth;
  return headers;
}

const base = () => `${getBackendUrl()}/api/v2/growth`;

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------
export async function getProfile(tenantId) {
  const resp = await fetch(`${base()}/profile`, {
    method: 'GET',
    headers: await getHeaders(tenantId),
    credentials: 'include',
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.message || 'Failed to fetch growth profile');
  return json.data?.profile;
}

export async function saveProfile(tenantId, patch) {
  const resp = await fetch(`${base()}/profile`, {
    method: 'PUT',
    headers: await getHeaders(tenantId),
    credentials: 'include',
    body: JSON.stringify(patch || {}),
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.message || 'Failed to save growth profile');
  return json.data?.profile;
}

// ---------------------------------------------------------------------------
// Insights
// ---------------------------------------------------------------------------
export async function getCurrentInsight(tenantId) {
  const resp = await fetch(`${base()}/insights/current`, {
    method: 'GET',
    headers: await getHeaders(tenantId),
    credentials: 'include',
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.message || 'Failed to fetch current insight');
  return json.data?.insight ?? null;
}

/**
 * Request a new insight run.
 *
 * Does NOT throw on 429 (cooldown) — returns a structured result so the UI can
 * show the cooldown message instead of surfacing an error.
 *  - 202 (accepted)  → { ok: true, data: { id, status, eta_seconds, eta_range } }
 *  - 429 (cooldown)  → { ok: false, status: 429, next_available_at, message }
 *  - other non-2xx   → { ok: false, status, message }
 */
export async function requestInsightRun(tenantId) {
  const resp = await fetch(`${base()}/insights`, {
    method: 'POST',
    headers: await getHeaders(tenantId),
    credentials: 'include',
    body: JSON.stringify({}),
  });
  const json = await resp.json().catch(() => ({}));

  if (resp.ok) {
    return { ok: true, data: json.data };
  }

  if (resp.status === 429) {
    return {
      ok: false,
      status: 429,
      next_available_at: json.next_available_at,
      message: json.message || 'Insight generation is on cooldown.',
    };
  }

  return {
    ok: false,
    status: resp.status,
    message: json.message || 'Failed to request insight run.',
  };
}

// ---------------------------------------------------------------------------
// Opportunities
// ---------------------------------------------------------------------------
export async function listOpportunities(tenantId, params = {}) {
  const url = new URL(`${base()}/opportunities`);
  if (params.type) url.searchParams.set('type', params.type);
  if (params.status) url.searchParams.set('status', params.status);
  if (params.min_score !== undefined && params.min_score !== null) {
    url.searchParams.set('min_score', String(params.min_score));
  }

  const resp = await fetch(url.toString(), {
    method: 'GET',
    headers: await getHeaders(tenantId),
    credentials: 'include',
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.message || 'Failed to fetch opportunities');
  // Backend returns { data: { opportunities: [...] } }; the consumer expects the array.
  return json.data?.opportunities ?? [];
}

export async function getOpportunity(tenantId, id) {
  const resp = await fetch(`${base()}/opportunities/${id}`, {
    method: 'GET',
    headers: await getHeaders(tenantId),
    credentials: 'include',
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.message || 'Failed to fetch opportunity');
  return json.data;
}

export async function dismissOpportunity(tenantId, id, reason) {
  const resp = await fetch(`${base()}/opportunities/${id}/dismiss`, {
    method: 'POST',
    headers: await getHeaders(tenantId),
    credentials: 'include',
    body: JSON.stringify({ reason }),
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.message || 'Failed to dismiss opportunity');
  return json.data ?? json;
}

export async function actionOpportunity(tenantId, id, overrides) {
  const resp = await fetch(`${base()}/opportunities/${id}/action`, {
    method: 'POST',
    headers: await getHeaders(tenantId),
    credentials: 'include',
    body: JSON.stringify({ overrides: overrides || {} }),
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.message || 'Failed to action opportunity');
  return json.data ?? json;
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
export async function getDashboard(tenantId) {
  const resp = await fetch(`${base()}/dashboard`, {
    method: 'GET',
    headers: await getHeaders(tenantId),
    credentials: 'include',
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.message || 'Failed to fetch growth dashboard');
  return json.data;
}
