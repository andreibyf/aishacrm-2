import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as writes from '../financeWrites';

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
  const fetchMock = vi.fn().mockResolvedValue({ ok, status, json: async () => body });
  globalThis.fetch = fetchMock;
  return fetchMock;
}

describe('financeWrites', () => {
  it('simulateDealWon POSTs /simulate/deal-won with body + tenant header', async () => {
    const fetchMock = mockFetch({
      body: { status: 'success', data: { approval_required: true } },
    });
    const result = await writes.simulateDealWon(TENANT_ID, {
      amount_cents: 250000,
      currency: 'usd',
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BACKEND}/api/v2/finance/simulate/deal-won`);
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(init.headers['x-tenant-id']).toBe(TENANT_ID);
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ amount_cents: 250000, currency: 'usd' });
    expect(result).toEqual({ approval_required: true });
  });

  it('createJournalDraft POSTs /journal-drafts', async () => {
    const fetchMock = mockFetch({});
    await writes.createJournalDraft(TENANT_ID, { lines: [] });
    expect(fetchMock.mock.calls[0][0]).toBe(`${BACKEND}/api/v2/finance/journal-drafts`);
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
  });

  it('createDraftInvoice POSTs /draft-invoices', async () => {
    const fetchMock = mockFetch({});
    await writes.createDraftInvoice(TENANT_ID, { customer_id: 'C', total_cents: 100 });
    expect(fetchMock.mock.calls[0][0]).toBe(`${BACKEND}/api/v2/finance/draft-invoices`);
  });

  it('approveFinanceAction POSTs /approvals/:id/approve', async () => {
    const fetchMock = mockFetch({});
    await writes.approveFinanceAction(TENANT_ID, 'appr_1');
    expect(fetchMock.mock.calls[0][0]).toBe(`${BACKEND}/api/v2/finance/approvals/appr_1/approve`);
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
  });

  it('requires a tenant id client-side', async () => {
    await expect(writes.simulateDealWon(undefined, {})).rejects.toMatchObject({
      code: 'CLIENT_MISSING_TENANT',
    });
  });

  it('propagates a backend error', async () => {
    mockFetch({ ok: false, status: 403, body: { code: 'NOPE', message: 'blocked' } });
    await expect(writes.createJournalDraft(TENANT_ID, {})).rejects.toMatchObject({
      status: 403,
      code: 'NOPE',
    });
  });
});
