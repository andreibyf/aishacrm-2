/**
 * Unit tests for src/api/billing.js
 *
 * Mocks global fetch; asserts URL shape, method, body, and error
 * propagation (status + code + message).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as billing from '../billing';

const BACKEND = 'http://localhost:4001';

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

describe('billing API client -- URL + method shape', () => {
  it('listPlans GETs /api/billing/plans and unwraps data', async () => {
    const fetchMock = mockFetch({
      body: { status: 'success', data: [{ id: 'p1', code: 'starter_monthly' }] },
    });
    const result = await billing.listPlans();
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BACKEND}/api/billing/plans`);
    expect(init.method).toBe('GET');
    expect(init.credentials).toBe('include');
    expect(result).toEqual([{ id: 'p1', code: 'starter_monthly' }]);
  });

  it('getAccount adds tenant_id as query param', async () => {
    const fetchMock = mockFetch({ body: { status: 'success', data: { id: 'a1' } } });
    await billing.getAccount('tenant-uuid-1');
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BACKEND}/api/billing/account?tenant_id=tenant-uuid-1`);
  });

  it('updateAccount PUTs body with tenant_id + fields', async () => {
    const fetchMock = mockFetch({ body: { status: 'success', data: {} } });
    await billing.updateAccount('t1', { billing_email: 'x@y.z' });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({ tenant_id: 't1', billing_email: 'x@y.z' });
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('listInvoices omits empty query params', async () => {
    const fetchMock = mockFetch({ body: { status: 'success', data: [] } });
    await billing.listInvoices('t1', { limit: 50 });
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BACKEND}/api/billing/invoices?tenant_id=t1&limit=50`);
  });

  it('createCheckoutSession posts only the 4 expected keys', async () => {
    const fetchMock = mockFetch({
      body: { status: 'success', data: { url: 'https://stripe/session' } },
    });
    await billing.createCheckoutSession({
      tenant_id: 't1',
      plan_code: 'starter_monthly',
      success_url: 'https://x',
      cancel_url: 'https://y',
      extra_field: 'should be dropped',
    });
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body).toEqual({
      tenant_id: 't1',
      plan_code: 'starter_monthly',
      success_url: 'https://x',
      cancel_url: 'https://y',
    });
    expect(body.extra_field).toBeUndefined();
  });

  it('assignPlan POSTs to /api/billing-admin/tenants/:id/subscription', async () => {
    const fetchMock = mockFetch({ body: { status: 'success', data: { id: 's1' } } });
    await billing.assignPlan('t1', { plan_code: 'starter_monthly' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BACKEND}/api/billing-admin/tenants/t1/subscription`);
    expect(init.method).toBe('POST');
  });

  it('cancelSubscription DELETEs with reason in body', async () => {
    const fetchMock = mockFetch({ body: { status: 'success', data: {} } });
    await billing.cancelSubscription('t1', { reason: 'customer request' });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('DELETE');
    expect(JSON.parse(init.body)).toEqual({ reason: 'customer request' });
  });

  it('listEvents includes limit query param', async () => {
    const fetchMock = mockFetch({ body: { status: 'success', data: [] } });
    await billing.listEvents('t1', { limit: 50 });
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BACKEND}/api/billing-admin/tenants/t1/events?limit=50`);
  });
});

describe('billing API client -- error propagation (PR #517 BillingError codes)', () => {
  it('throws with status + code + message when backend returns non-2xx', async () => {
    mockFetch({
      ok: false,
      status: 409,
      body: {
        status: 'error',
        message: 'tenant already has an active subscription',
        code: 'CONFLICT',
      },
    });
    await expect(billing.assignPlan('t1', { plan_code: 'starter_monthly' })).rejects.toMatchObject(
      {
        status: 409,
        code: 'CONFLICT',
        message: 'tenant already has an active subscription',
      },
    );
  });

  it('falls back to HTTP N message when backend returns no body', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => {
        throw new Error('bad json');
      },
    });
    await expect(billing.listPlans()).rejects.toMatchObject({
      status: 503,
      message: 'HTTP 503',
      code: null,
    });
  });

  it('surfaces EXEMPT code on invoice creation for exempt tenants', async () => {
    mockFetch({
      ok: false,
      status: 409,
      body: {
        status: 'error',
        message: 'createInvoice: tenant is billing-exempt; no invoice created',
        code: 'EXEMPT',
      },
    });
    await expect(
      billing.createInvoice('t1', { line_items: [{ item_type: 's', description: 'x', quantity: 1, unit_price_cents: 1 }] }),
    ).rejects.toMatchObject({ status: 409, code: 'EXEMPT' });
  });

  it('surfaces NOT_FOUND on missing invoice', async () => {
    mockFetch({
      ok: false,
      status: 404,
      body: { status: 'error', message: 'voidInvoice: invoice not found', code: 'NOT_FOUND' },
    });
    await expect(billing.voidInvoice('inv-x', { reason: 'test' })).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });
  });
});

describe('billing API client -- AbortController integration', () => {
  it('forwards signal to fetch so callers can cancel in-flight requests', async () => {
    const fetchMock = mockFetch({ body: { status: 'success', data: [] } });
    const controller = new AbortController();
    // Use __internal to inject signal (the named hooks don't expose it)
    await billing.__internal.request('/api/billing/plans', { signal: controller.signal });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.signal).toBe(controller.signal);
  });
});
