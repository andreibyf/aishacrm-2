/**
 * Tests for useRefresh hook
 * Verifies client cache clearing, backend invalidation, reload callbacks, and error handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';

// --- Mocks ---

const mockClearCacheByKey = vi.fn();
const mockClearCache = vi.fn();

vi.mock('@/components/shared/ApiManager', () => ({
  useApiManager: () => ({
    clearCacheByKey: mockClearCacheByKey,
    clearCache: mockClearCache,
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/api/backendUrl', () => ({
  getBackendUrl: () => 'http://localhost:4001',
}));

import { useRefresh } from '../useRefresh';
import { toast } from 'sonner';

// --- Setup ---

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });
});

describe('useRefresh', () => {
  it('returns refresh function and refreshing state', () => {
    const { result } = renderHook(() => useRefresh({ modules: ['leads'], onReload: vi.fn() }));

    expect(result.current.refresh).toBeTypeOf('function');
    expect(result.current.refreshing).toBe(false);
  });

  it('clears correct ApiManager entity keys using MODULE_TO_ENTITY_KEY mapping', async () => {
    const onReload = vi.fn();
    const { result } = renderHook(() =>
      useRefresh({
        modules: ['leads', 'bizdevsources', 'accounts'],
        onReload,
        tenantId: 'test-tenant',
      }),
    );

    await act(async () => {
      await result.current.refresh();
    });

    // Should map: leads→Lead, bizdevsources→BizDevSource, accounts→Account
    expect(mockClearCacheByKey).toHaveBeenCalledWith('Lead');
    expect(mockClearCacheByKey).toHaveBeenCalledWith('BizDevSource');
    expect(mockClearCacheByKey).toHaveBeenCalledWith('Account');
    expect(mockClearCacheByKey).toHaveBeenCalledTimes(3);
  });

  it('uses explicit clientCacheKeys when provided (overrides module mapping)', async () => {
    const { result } = renderHook(() =>
      useRefresh({
        modules: ['leads'],
        clientCacheKeys: ['MyCustomKey', 'AnotherKey'],
        onReload: vi.fn(),
        tenantId: 'test-tenant',
      }),
    );

    await act(async () => {
      await result.current.refresh();
    });

    expect(mockClearCacheByKey).toHaveBeenCalledWith('MyCustomKey');
    expect(mockClearCacheByKey).toHaveBeenCalledWith('AnotherKey');
    expect(mockClearCacheByKey).toHaveBeenCalledTimes(2);
  });

  it('calls backend /api/cache/invalidate endpoint when tenantId and modules are provided', async () => {
    const { result } = renderHook(() =>
      useRefresh({
        modules: ['leads', 'contacts'],
        onReload: vi.fn(),
        tenantId: 'test-tenant-uuid',
      }),
    );

    await act(async () => {
      await result.current.refresh();
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:4001/api/cache/invalidate',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          tenant_id: 'test-tenant-uuid',
          modules: ['leads', 'contacts'],
        }),
      }),
    );
  });

  it('does NOT call backend invalidate when tenantId is missing', async () => {
    const { result } = renderHook(() =>
      useRefresh({
        modules: ['leads'],
        onReload: vi.fn(),
        // no tenantId
      }),
    );

    await act(async () => {
      await result.current.refresh();
    });

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('calls onReload callback', async () => {
    const onReload = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useRefresh({ modules: ['leads'], onReload }));

    await act(async () => {
      await result.current.refresh();
    });

    expect(onReload).toHaveBeenCalledOnce();
  });

  it('shows toast on success when toastMessage is provided', async () => {
    const { result } = renderHook(() =>
      useRefresh({
        modules: ['leads'],
        onReload: vi.fn(),
        toastMessage: 'Data refreshed!',
      }),
    );

    await act(async () => {
      await result.current.refresh();
    });

    expect(toast.success).toHaveBeenCalledWith('Data refreshed!');
  });

  it('does not show toast when toastMessage is not provided', async () => {
    const { result } = renderHook(() => useRefresh({ modules: ['leads'], onReload: vi.fn() }));

    await act(async () => {
      await result.current.refresh();
    });

    expect(toast.success).not.toHaveBeenCalled();
  });

  it('shows error toast and resets refreshing on reload failure', async () => {
    const onReload = vi.fn().mockRejectedValue(new Error('Network error'));
    const { result } = renderHook(() => useRefresh({ modules: ['leads'], onReload }));

    await act(async () => {
      await result.current.refresh();
    });

    expect(toast.error).toHaveBeenCalledWith('Refresh failed — try again');
    expect(result.current.refreshing).toBe(false);
  });

  it('resets refreshing to false after successful refresh', async () => {
    const { result } = renderHook(() => useRefresh({ modules: ['leads'], onReload: vi.fn() }));

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.refreshing).toBe(false);
  });

  it('silently handles backend invalidation failure (non-fatal)', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

    const onReload = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useRefresh({
        modules: ['leads'],
        onReload,
        tenantId: 'test-tenant',
      }),
    );

    await act(async () => {
      await result.current.refresh();
    });

    // Should still call onReload and not show error toast
    expect(onReload).toHaveBeenCalledOnce();
    expect(toast.error).not.toHaveBeenCalled();
  });
});
