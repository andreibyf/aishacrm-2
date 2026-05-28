/**
 * Unit tests for src/api/finance.js (UI Slice 1 / UI-1A).
 *
 * Asserts:
 *  - The 5 GET endpoints map to the correct URL + method + tenant header
 *  - Response envelope `{ status, data }` is unwrapped on success
 *  - Non-2xx responses throw structured errors (status + code + message)
 *  - The 403 "not enabled for tenant" and 404 "route absent" semantic
 *    error states surface cleanly for the UI's gap/disabled paths
 *  - AbortController signal is forwarded to fetch
 *  - The API gap registry stays the single source of truth for missing
 *    endpoints (no fake data, no mutating endpoint references)
 *  - The module exports no mutating helpers (read-only safety check)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as finance from '../finance';

const BACKEND = 'http://localhost:4001';
const TENANT_ID = 'a11dfb63-4b18-4eb8-872e-747af2e37c46';

beforeEach(() => {
  if (typeof window !== 'undefined') {
    window._env_ = { VITE_AISHACRM_BACKEND_URL: BACKEND };
  }
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function mockFetch({ ok = true, status = 200, body = { status: 'success', data: {} } }) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
  });
  globalThis.fetch = fetchMock;
  return fetchMock;
}

describe('finance API client -- URL + method shape (5 GET endpoints)', () => {
  it('getRuntimeStatus GETs /api/v2/finance/runtime/status with tenant header and unwraps data', async () => {
    const runtimeBody = {
      tenant_id: TENANT_ID,
      runtime: {
        mode: 'mock_read_only',
        persistence: 'in_memory',
        provider_sync: 'disabled',
        governance: 'enabled',
      },
      counts: {
        journal_entries: 0,
        invoices: 0,
        approvals: 0,
        audit_events: 0,
        adapter_jobs: 0,
      },
    };
    const fetchMock = mockFetch({ body: { status: 'success', data: runtimeBody } });

    const result = await finance.getRuntimeStatus(TENANT_ID);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BACKEND}/api/v2/finance/runtime/status`);
    expect(init.method).toBe('GET');
    expect(init.credentials).toBe('include');
    expect(init.headers['x-tenant-id']).toBe(TENANT_ID);
    expect(result).toEqual(runtimeBody);
  });

  it('getJournalEntries GETs /journal-entries and unwraps { journal_entries: [...] }', async () => {
    const entries = [{ id: 'je_1', aggregate_id: 'agg_1', status: 'posted', created_at: 'now' }];
    const fetchMock = mockFetch({
      body: { status: 'success', data: { journal_entries: entries } },
    });

    const result = await finance.getJournalEntries(TENANT_ID);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BACKEND}/api/v2/finance/journal-entries`);
    expect(init.method).toBe('GET');
    expect(init.headers['x-tenant-id']).toBe(TENANT_ID);
    expect(result).toEqual({ journal_entries: entries });
  });

  it('getLedger GETs /ledger and unwraps opaque ledger payload', async () => {
    const ledger = { accounts: { 1000: { debits: 0, credits: 0 } }, currency: 'USD' };
    const fetchMock = mockFetch({ body: { status: 'success', data: ledger } });

    const result = await finance.getLedger(TENANT_ID);

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BACKEND}/api/v2/finance/ledger`);
    expect(result).toEqual(ledger);
  });

  it('getProfitLoss GETs /profit-loss and unwraps opaque payload', async () => {
    const pl = { revenue: 0, expenses: 0, net: 0 };
    const fetchMock = mockFetch({ body: { status: 'success', data: pl } });

    const result = await finance.getProfitLoss(TENANT_ID);

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BACKEND}/api/v2/finance/profit-loss`);
    expect(result).toEqual(pl);
  });

  it('getBalanceSheet GETs /balance-sheet and unwraps opaque payload', async () => {
    const bs = { assets: 0, liabilities: 0, equity: 0 };
    const fetchMock = mockFetch({ body: { status: 'success', data: bs } });

    const result = await finance.getBalanceSheet(TENANT_ID);

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BACKEND}/api/v2/finance/balance-sheet`);
    expect(result).toEqual(bs);
  });

  it('every GET sends GET method + credentials include + x-tenant-id header (no implicit POST)', async () => {
    const fetchMock = mockFetch({ body: { status: 'success', data: {} } });

    await finance.getRuntimeStatus(TENANT_ID);
    await finance.getJournalEntries(TENANT_ID);
    await finance.getLedger(TENANT_ID);
    await finance.getProfitLoss(TENANT_ID);
    await finance.getBalanceSheet(TENANT_ID);

    expect(fetchMock).toHaveBeenCalledTimes(5);
    for (const [, init] of fetchMock.mock.calls) {
      expect(init.method).toBe('GET');
      expect(init.credentials).toBe('include');
      expect(init.headers['x-tenant-id']).toBe(TENANT_ID);
    }
  });
});

describe('finance API client -- tenant identity is required client-side', () => {
  it('throws CLIENT_MISSING_TENANT before dispatching any fetch when tenantId is missing', async () => {
    const fetchMock = mockFetch({ body: { status: 'success', data: {} } });

    await expect(finance.getRuntimeStatus(undefined)).rejects.toMatchObject({
      status: 0,
      code: 'CLIENT_MISSING_TENANT',
    });
    await expect(finance.getRuntimeStatus(null)).rejects.toMatchObject({
      code: 'CLIENT_MISSING_TENANT',
    });
    await expect(finance.getJournalEntries('')).rejects.toMatchObject({
      code: 'CLIENT_MISSING_TENANT',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('finance API client -- error propagation', () => {
  it('throws with status + code + message on non-2xx', async () => {
    mockFetch({
      ok: false,
      status: 500,
      body: { status: 'error', message: 'Unexpected finance route error' },
    });

    let caught;
    try {
      await finance.getRuntimeStatus(TENANT_ID);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    expect(caught.status).toBe(500);
    expect(caught.message).toBe('Unexpected finance route error');
  });

  it('surfaces 404 (route absent — ENABLE_FINANCE_OPS!=true server-side)', async () => {
    mockFetch({
      ok: false,
      status: 404,
      body: {},
    });

    let caught;
    try {
      await finance.getRuntimeStatus(TENANT_ID);
    } catch (e) {
      caught = e;
    }
    expect(caught.status).toBe(404);
    expect(caught.message).toBe('HTTP 404');
  });

  it('surfaces 403 with the "Finance Ops is not enabled for this tenant" message', async () => {
    mockFetch({
      ok: false,
      status: 403,
      body: { status: 'error', message: 'Finance Ops is not enabled for this tenant' },
    });

    let caught;
    try {
      await finance.getRuntimeStatus(TENANT_ID);
    } catch (e) {
      caught = e;
    }
    expect(caught.status).toBe(403);
    expect(caught.message).toBe('Finance Ops is not enabled for this tenant');
  });

  it('falls back to "HTTP N" when backend returns no parseable body', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error('bad json');
      },
    });
    await expect(finance.getLedger(TENANT_ID)).rejects.toMatchObject({
      status: 502,
      message: 'HTTP 502',
      code: null,
    });
  });
});

describe('finance API client -- AbortController integration', () => {
  it('forwards signal to fetch so callers can cancel in-flight requests', async () => {
    const fetchMock = mockFetch({ body: { status: 'success', data: {} } });
    const ctrl = new AbortController();

    await finance.getRuntimeStatus(TENANT_ID, { signal: ctrl.signal });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.signal).toBe(ctrl.signal);
  });
});

describe('finance API client -- API gap registry (design freeze §8.2)', () => {
  it('exposes all 9 known gaps with required descriptor fields', () => {
    const expectedKeys = [
      'draftInvoices',
      'journalDrafts',
      'approvals',
      'adapterJobs',
      'auditEvents',
      'projectionCursors',
      'registeredAdapters',
      'evidencePacks',
      'runtimeMode',
    ];

    expect(Object.keys(finance.FINANCE_API_GAPS).sort()).toEqual([...expectedKeys].sort());

    for (const key of expectedKeys) {
      const entry = finance.FINANCE_API_GAPS[key];
      expect(entry).toBeDefined();
      expect(typeof entry.endpoint).toBe('string');
      // Most gaps name a missing GET endpoint; the runtime-mode gap names an
      // existing endpoint's field that is a hard-coded placeholder.
      expect(entry.endpoint).toMatch(/^GET \/api\/v2\/finance\//);
      expect(typeof entry.designRef).toBe('string');
      expect(entry.designRef).toMatch(/^§8\.2\./);
      expect(typeof entry.naturalBackingSource).toBe('string');
      expect(typeof entry.affectedScreen).toBe('string');
    }
  });

  it('runtimeMode gap names §8.2.9 and points at the runtime-overview screen', () => {
    const g = finance.FINANCE_API_GAPS.runtimeMode;
    expect(g.designRef).toBe('§8.2.9');
    expect(g.affectedScreen).toMatch(/Runtime overview/);
    expect(g.naturalBackingSource).toMatch(/authoritative mode/);
  });

  it('FINANCE_API_GAPS is frozen (immutable from caller-side)', () => {
    expect(Object.isFrozen(finance.FINANCE_API_GAPS)).toBe(true);
    expect(Object.isFrozen(finance.FINANCE_API_GAPS.draftInvoices)).toBe(true);
    expect(() => {
      finance.FINANCE_API_GAPS.draftInvoices.endpoint = 'tampered';
    }).toThrow();
  });

  it('getFinanceApiGap returns the descriptor for known keys and null for unknown', () => {
    expect(finance.getFinanceApiGap('draftInvoices')).toBe(finance.FINANCE_API_GAPS.draftInvoices);
    expect(finance.getFinanceApiGap('approvals')).toBe(finance.FINANCE_API_GAPS.approvals);
    expect(finance.getFinanceApiGap('runtimeStatus')).toBeNull();
    expect(finance.getFinanceApiGap('nonsense')).toBeNull();
  });

  it('gap entries reference design freeze §8.2.x numerically, one per gap', () => {
    const refs = Object.values(finance.FINANCE_API_GAPS).map((g) => g.designRef);
    expect(new Set(refs).size).toBe(refs.length); // all unique
  });
});

describe('finance API client -- read-only safety (no mutating exports)', () => {
  it('exposes only GET wrappers + the gap registry + getFinanceApiGap helper', () => {
    const exportNames = Object.keys(finance);
    // Read-only allow-list. Updating this list requires updating the
    // design freeze §1 + §8.3 first. New exports must be GET-only.
    const allowedExports = [
      'getRuntimeStatus',
      'getJournalEntries',
      'getLedger',
      'getProfitLoss',
      'getBalanceSheet',
      'FINANCE_API_GAPS',
      'getFinanceApiGap',
    ];
    expect(new Set(exportNames)).toEqual(new Set(allowedExports));
  });

  it('does not export any function whose name suggests mutation', () => {
    const mutatingPrefixes =
      /^(create|update|delete|patch|post|reverse|approve|reject|retry|cancel|trigger|sync|enable|disable|activate|deactivate|set)/i;
    for (const name of Object.keys(finance)) {
      // Allow the read-only GAPS table and the gap-lookup helper.
      if (name === 'FINANCE_API_GAPS' || name === 'getFinanceApiGap') continue;
      expect(name).toMatch(/^get/i);
      expect(name).not.toMatch(mutatingPrefixes);
    }
  });
});
