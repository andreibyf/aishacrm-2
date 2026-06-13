/**
 * Regression test for the Finance client auth fix.
 *
 * Finance previously authenticated with the `aisha_access` cookie alone — which
 * works in dev (the backend injects a mock superadmin when auth is absent) but 401s
 * in staging/prod, where every other client authenticates with the Supabase Bearer
 * token. These tests lock in that the Finance read + write clients now attach that
 * Bearer (when a session exists) while still keeping cookie auth (`credentials:'include'`)
 * as a fallback.
 *
 * The mock for `@/api/functions` is isolated to this file so the 43 existing
 * finance client tests (which run with no session → no Authorization) are unaffected.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Controllable Supabase auth-header source (matches the real getAuthorizationHeader,
// which returns `Bearer <token>` or null).
const authHeaderMock = vi.fn();
vi.mock('@/api/functions', () => ({ getAuthorizationHeader: authHeaderMock }));

import * as finance from '../finance';
import * as financeWrites from '../financeWrites';

const BACKEND = 'http://localhost:4001';
const TENANT_ID = 'a11dfb63-4b18-4eb8-872e-747af2e37c46';

function mockFetch() {
  const fetchMock = vi
    .fn()
    .mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 'success', data: {} }) });
  globalThis.fetch = fetchMock;
  return fetchMock;
}

beforeEach(() => {
  if (typeof window !== 'undefined') {
    window._env_ = { VITE_AISHACRM_BACKEND_URL: BACKEND };
  }
  authHeaderMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('finance read client (finance.js) — Bearer auth', () => {
  it('attaches the Supabase Bearer token + tenant header when a session exists', async () => {
    authHeaderMock.mockResolvedValue('Bearer test-token');
    const fetchMock = mockFetch();
    await finance.getRuntimeStatus(TENANT_ID);
    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers.Authorization).toBe('Bearer test-token');
    expect(headers['x-tenant-id']).toBe(TENANT_ID);
    expect(fetchMock.mock.calls[0][1].credentials).toBe('include'); // cookie fallback kept
  });

  it('omits Authorization when there is no session (cookie-only fallback)', async () => {
    authHeaderMock.mockResolvedValue(null);
    const fetchMock = mockFetch();
    await finance.getRuntimeStatus(TENANT_ID);
    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers.Authorization).toBeUndefined();
    expect(headers['x-tenant-id']).toBe(TENANT_ID);
  });
});

describe('finance write client (financeWrites.js) — Bearer auth', () => {
  it('attaches the Bearer token + Content-Type on mutations', async () => {
    authHeaderMock.mockResolvedValue('Bearer test-token');
    const fetchMock = mockFetch();
    await financeWrites.createJournalDraft(TENANT_ID, { lines: [] });
    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers.Authorization).toBe('Bearer test-token');
    expect(headers['x-tenant-id']).toBe(TENANT_ID);
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('still posts (cookie-only) when no session is available', async () => {
    authHeaderMock.mockResolvedValue(null);
    const fetchMock = mockFetch();
    await financeWrites.createJournalDraft(TENANT_ID, { lines: [] });
    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers.Authorization).toBeUndefined();
    expect(headers['x-tenant-id']).toBe(TENANT_ID);
  });
});
