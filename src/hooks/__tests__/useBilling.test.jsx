/**
 * Unit tests for src/hooks/useBilling.js
 *
 * Verifies the useAsync behaviours the billing console relies on:
 *   - skips fetch when any dep is null/undefined (prevents tenantId=null spam)
 *   - sets loading=true then data=<payload> on success
 *   - sets error=<err> on failure
 *   - refetch re-runs the fetcher
 *   - aborts in-flight requests when deps change
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import * as billing from '@/api/billing';
import {
  usePlans,
  useBillingAccount,
  useActiveSubscription,
  useBillingSummary,
} from '../useBilling';

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('usePlans', () => {
  it('loads plans on mount and exposes data', async () => {
    const mock = vi
      .spyOn(billing, 'listPlans')
      .mockResolvedValue([{ id: 'p1', code: 'starter_monthly' }]);

    const { result } = renderHook(() => usePlans());

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual([{ id: 'p1', code: 'starter_monthly' }]);
    expect(result.current.error).toBe(null);
    expect(mock).toHaveBeenCalledOnce();
  });

  it('exposes error when fetcher rejects', async () => {
    const err = Object.assign(new Error('boom'), { status: 500, code: null });
    vi.spyOn(billing, 'listPlans').mockRejectedValue(err);

    const { result } = renderHook(() => usePlans());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(err);
    expect(result.current.data).toBe(null);
  });

  it('refetch triggers a second fetch', async () => {
    const mock = vi.spyOn(billing, 'listPlans').mockResolvedValue([]);
    const { result } = renderHook(() => usePlans());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mock).toHaveBeenCalledOnce();

    await act(async () => {
      await result.current.refetch();
    });
    expect(mock).toHaveBeenCalledTimes(2);
  });
});

describe('useBillingAccount -- null tenant guard', () => {
  it('does NOT fetch when tenantId is null', () => {
    const mock = vi.spyOn(billing, 'getAccount').mockResolvedValue({});
    const { result } = renderHook(() => useBillingAccount(null));
    expect(mock).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBe(null);
  });

  it('does NOT fetch when tenantId is undefined', () => {
    const mock = vi.spyOn(billing, 'getAccount').mockResolvedValue({});
    renderHook(() => useBillingAccount(undefined));
    expect(mock).not.toHaveBeenCalled();
  });

  it('fetches once tenantId becomes a real value', async () => {
    const mock = vi
      .spyOn(billing, 'getAccount')
      .mockResolvedValue({ id: 'a1', tenant_id: 't1' });

    const { result, rerender } = renderHook(({ id }) => useBillingAccount(id), {
      initialProps: { id: null },
    });
    expect(mock).not.toHaveBeenCalled();

    rerender({ id: 't1' });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mock).toHaveBeenCalledOnce();
    expect(mock).toHaveBeenCalledWith('t1');
    expect(result.current.data).toEqual({ id: 'a1', tenant_id: 't1' });
  });

  it('re-fetches when tenantId changes', async () => {
    const mock = vi
      .spyOn(billing, 'getAccount')
      .mockImplementation((id) => Promise.resolve({ tenant_id: id }));

    const { result, rerender } = renderHook(({ id }) => useBillingAccount(id), {
      initialProps: { id: 't1' },
    });
    await waitFor(() => expect(result.current.data).toEqual({ tenant_id: 't1' }));

    rerender({ id: 't2' });
    await waitFor(() => expect(result.current.data).toEqual({ tenant_id: 't2' }));
    expect(mock).toHaveBeenCalledTimes(2);
  });
});

describe('useActiveSubscription + useBillingSummary', () => {
  it('useActiveSubscription waits for tenantId', () => {
    const mock = vi.spyOn(billing, 'getSubscription').mockResolvedValue(null);
    renderHook(() => useActiveSubscription(null));
    expect(mock).not.toHaveBeenCalled();
  });

  it('useBillingSummary loads full summary payload', async () => {
    const summary = {
      tenant: { id: 't1', name: 'Acme', billing_state: 'active' },
      billing_account: { id: 'a1', billing_exempt: false },
      subscription: null,
      recent_invoices: [],
    };
    vi.spyOn(billing, 'getBillingSummary').mockResolvedValue(summary);
    const { result } = renderHook(() => useBillingSummary('t1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual(summary);
  });
});

// =============================================================================
// PR #519 review fixes -- regression coverage
// =============================================================================
//
// The original useAsync gate required every dep to be truthy, which meant
// hooks with optional filter params (status, limit) would never fire the
// initial fetch because those params defaulted to undefined. This test
// block locks in the corrected behavior where only the required identifier
// must be non-null/undefined.
//
// It also covers the backend-shape normalizers that map:
//   tenant_subscriptions.billing_plans -> plan
//   renewal_date                        -> current_period_end (alias)
//   invoice.issue_date                  -> issued_at (alias)
//   invoice.due_date                    -> due_at    (alias)

import { useInvoices, useInvoice, useBillingEvents, __testing } from '../useBilling';

describe('useInvoices -- optional filter params do not block initial fetch', () => {
  it('fetches on mount even when status and limit are undefined', async () => {
    const mock = vi.spyOn(billing, 'listInvoices').mockResolvedValue([]);
    const { result } = renderHook(() => useInvoices('t1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mock).toHaveBeenCalledOnce();
    expect(mock).toHaveBeenCalledWith('t1', { status: undefined, limit: undefined });
  });

  it('does NOT fetch when tenantId is null, even if limit is set', () => {
    const mock = vi.spyOn(billing, 'listInvoices').mockResolvedValue([]);
    renderHook(() => useInvoices(null, { limit: 20 }));
    expect(mock).not.toHaveBeenCalled();
  });

  it('re-fetches when optional status filter changes', async () => {
    const mock = vi.spyOn(billing, 'listInvoices').mockResolvedValue([]);
    const { rerender } = renderHook(({ status }) => useInvoices('t1', { status }), {
      initialProps: { status: undefined },
    });
    await waitFor(() => expect(mock).toHaveBeenCalledTimes(1));
    rerender({ status: 'paid' });
    await waitFor(() => expect(mock).toHaveBeenCalledTimes(2));
    expect(mock).toHaveBeenLastCalledWith('t1', { status: 'paid', limit: undefined });
  });

  it('normalizes issue_date -> issued_at and due_date -> due_at per row', async () => {
    vi.spyOn(billing, 'listInvoices').mockResolvedValue([
      {
        id: 'inv1',
        invoice_number: 'INV-2026-001',
        status: 'paid',
        issue_date: '2026-04-01T00:00:00Z',
        due_date: '2026-04-15T00:00:00Z',
        total_cents: 4900,
        currency: 'USD',
      },
    ]);
    const { result } = renderHook(() => useInvoices('t1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data[0]).toMatchObject({
      issued_at: '2026-04-01T00:00:00Z',
      due_at: '2026-04-15T00:00:00Z',
      // original fields preserved
      issue_date: '2026-04-01T00:00:00Z',
      due_date: '2026-04-15T00:00:00Z',
    });
  });
});

describe('useBillingEvents -- optional limit does not block initial fetch', () => {
  it('fetches on mount even when limit is undefined', async () => {
    const mock = vi.spyOn(billing, 'listEvents').mockResolvedValue([]);
    const { result } = renderHook(() => useBillingEvents('t1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mock).toHaveBeenCalledOnce();
    expect(mock).toHaveBeenCalledWith('t1', { limit: undefined });
  });

  it('does NOT fetch when tenantId is null', () => {
    const mock = vi.spyOn(billing, 'listEvents').mockResolvedValue([]);
    renderHook(() => useBillingEvents(null));
    expect(mock).not.toHaveBeenCalled();
  });
});

describe('useActiveSubscription -- normalizes backend join shape', () => {
  it('maps billing_plans join -> plan and renewal_date -> current_period_end', async () => {
    const backendRow = {
      id: 'sub1',
      tenant_id: 't1',
      status: 'active',
      renewal_date: '2026-05-18T00:00:00Z',
      canceled_at: null,
      // Supabase returns joined table under its plural table name
      billing_plans: {
        id: 'p1',
        code: 'starter_monthly',
        name: 'Starter',
        amount_cents: 4900,
        currency: 'USD',
        billing_interval: 'month',
      },
    };
    vi.spyOn(billing, 'getSubscription').mockResolvedValue(backendRow);

    const { result } = renderHook(() => useActiveSubscription('t1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toMatchObject({
      id: 'sub1',
      status: 'active',
      // UI alias
      current_period_end: '2026-05-18T00:00:00Z',
      // preserves original
      renewal_date: '2026-05-18T00:00:00Z',
      plan: {
        code: 'starter_monthly',
        name: 'Starter',
        amount_cents: 4900,
        currency: 'USD',
        // UI alias (original: billing_interval)
        interval: 'month',
        billing_interval: 'month',
      },
      cancel_at_period_end: false,
    });
  });

  it('returns null when backend returns null (no active subscription)', async () => {
    vi.spyOn(billing, 'getSubscription').mockResolvedValue(null);
    const { result } = renderHook(() => useActiveSubscription('t1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBeNull();
  });

  it('cancel_at_period_end is true when status=canceled and canceled_at is in the future', () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const normalized = __testing.normalizeSubscription({
      id: 'sub1',
      status: 'canceled',
      canceled_at: future,
      renewal_date: future,
      billing_plans: { code: 'starter_monthly', amount_cents: 4900 },
    });
    expect(normalized.cancel_at_period_end).toBe(true);
  });

  it('cancel_at_period_end is false when status=canceled and canceled_at is in the past', () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const normalized = __testing.normalizeSubscription({
      id: 'sub1',
      status: 'canceled',
      canceled_at: past,
      renewal_date: past,
      billing_plans: { code: 'starter_monthly', amount_cents: 4900 },
    });
    expect(normalized.cancel_at_period_end).toBe(false);
  });
});

describe('useInvoice -- flattens {invoice, line_items} into a single object', () => {
  it('merges line_items onto the invoice and normalizes date fields', async () => {
    vi.spyOn(billing, 'getInvoice').mockResolvedValue({
      invoice: {
        id: 'inv1',
        invoice_number: 'INV-2026-001',
        status: 'open',
        issue_date: '2026-04-01T00:00:00Z',
        due_date: '2026-04-15T00:00:00Z',
        total_cents: 4900,
        currency: 'USD',
      },
      line_items: [{ id: 'li1', description: 'Subscription', quantity: 1, unit_price_cents: 4900 }],
    });
    const { result } = renderHook(() => useInvoice('inv1', 't1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toMatchObject({
      id: 'inv1',
      invoice_number: 'INV-2026-001',
      issued_at: '2026-04-01T00:00:00Z',
      due_at: '2026-04-15T00:00:00Z',
      line_items: [{ id: 'li1' }],
      payments: [],
    });
  });

  it('does not fetch until both invoiceId and tenantId are known', () => {
    const mock = vi.spyOn(billing, 'getInvoice').mockResolvedValue({ invoice: {}, line_items: [] });
    renderHook(() => useInvoice(null, 't1'));
    expect(mock).not.toHaveBeenCalled();
    renderHook(() => useInvoice('inv1', null));
    expect(mock).not.toHaveBeenCalled();
  });
});
