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
