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

  // Editable Chart of Accounts manager clients (Phase 5 / Task 16).
  describe('COA manager clients', () => {
    it('createAccount POSTs /accounts with the create body', async () => {
      const fetchMock = mockFetch({ body: { status: 'success', data: { id: 'acct_1' } } });
      const result = await writes.createAccount(TENANT_ID, {
        name: 'Operating Bank',
        classification: 'Asset',
        account_type: 'Bank',
      });
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(`${BACKEND}/api/v2/finance/accounts`);
      expect(init.method).toBe('POST');
      expect(init.headers['x-tenant-id']).toBe(TENANT_ID);
      expect(JSON.parse(init.body)).toEqual({
        name: 'Operating Bank',
        classification: 'Asset',
        account_type: 'Bank',
      });
      expect(result).toEqual({ id: 'acct_1' });
    });

    it('updateAccount PATCHes /accounts/:id with the edit body', async () => {
      const fetchMock = mockFetch({});
      await writes.updateAccount(TENANT_ID, 'acct_42', {
        name: 'Renamed',
        account_type: 'Cash',
        reason: 'fixing a typo',
      });
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(`${BACKEND}/api/v2/finance/accounts/acct_42`);
      expect(init.method).toBe('PATCH');
      expect(JSON.parse(init.body)).toEqual({
        name: 'Renamed',
        account_type: 'Cash',
        reason: 'fixing a typo',
      });
    });

    it('deactivateAccount POSTs /accounts/:id/deactivate with a reason', async () => {
      const fetchMock = mockFetch({});
      await writes.deactivateAccount(TENANT_ID, 'acct_7', { reason: 'closed' });
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(`${BACKEND}/api/v2/finance/accounts/acct_7/deactivate`);
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body)).toEqual({ reason: 'closed' });
    });

    it('reactivateAccount POSTs /accounts/:id/reactivate with a reason', async () => {
      const fetchMock = mockFetch({});
      await writes.reactivateAccount(TENANT_ID, 'acct_7', { reason: 'reopening' });
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(`${BACKEND}/api/v2/finance/accounts/acct_7/reactivate`);
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body)).toEqual({ reason: 'reopening' });
    });

    it('url-encodes the account id', async () => {
      const fetchMock = mockFetch({});
      await writes.updateAccount(TENANT_ID, 'acct/weird id', { name: 'x' });
      expect(fetchMock.mock.calls[0][0]).toBe(
        `${BACKEND}/api/v2/finance/accounts/acct%2Fweird%20id`,
      );
    });

    it('surfaces a FINANCE_COA_* error code from a rejected mutation', async () => {
      mockFetch({
        ok: false,
        status: 409,
        body: { code: 'FINANCE_COA_DUPLICATE_NAME', message: 'already exists' },
      });
      await expect(
        writes.createAccount(TENANT_ID, { name: 'Cash', classification: 'Asset', account_type: 'Cash' }),
      ).rejects.toMatchObject({ status: 409, code: 'FINANCE_COA_DUPLICATE_NAME' });
    });

    it('requires a tenant id client-side for COA mutations', async () => {
      await expect(writes.createAccount(undefined, {})).rejects.toMatchObject({
        code: 'CLIENT_MISSING_TENANT',
      });
    });
  });
});
