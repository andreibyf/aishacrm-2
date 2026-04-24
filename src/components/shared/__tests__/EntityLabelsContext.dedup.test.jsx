/**
 * Tests that EntityLabelsProvider:
 * 1. does NOT include a cache-buster query param (was bypassing all dedup),
 * 2. routes the fetch through ApiManager.cachedRequest so a re-mount or
 *    tenant-switch-back within the TTL window reuses the cached labels.
 *
 * Prior bug: every mount issued `GET /api/entity-labels/{tid}?_t=<Date.now()>`.
 * Superadmins switching tenants during a session thus bypassed both browser
 * HTTP cache and the in-memory cachedRequest dedup, adding a fresh request
 * to every tenant switch.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import React from 'react';
import { ApiProvider } from '../ApiManager.jsx';
import { EntityLabelsProvider } from '../EntityLabelsContext.jsx';

vi.mock('@/api/entities', () => ({
  BACKEND_URL: 'http://api.test.local',
}));

describe('EntityLabelsProvider request dedup', () => {
  let originalFetch;
  let fetchMock;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'success',
        data: { labels: { leads: { plural: 'Leads', singular: 'Lead' } }, customized: [] },
      }),
    });
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('issues a fetch WITHOUT a cache-busting query parameter', async () => {
    render(
      <ApiProvider>
        <EntityLabelsProvider tenantId="tenant-abc">
          <div>child</div>
        </EntityLabelsProvider>
      </ApiProvider>,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const calledUrl = fetchMock.mock.calls[0][0];
    expect(calledUrl).toContain('/api/entity-labels/tenant-abc');
    expect(calledUrl).not.toMatch(/[?&]_t=/);
  });

  it('a second mount for the same tenant within TTL reuses the cache (no second fetch)', async () => {
    const { rerender, unmount } = render(
      <ApiProvider>
        <EntityLabelsProvider tenantId="tenant-abc">
          <div>child</div>
        </EntityLabelsProvider>
      </ApiProvider>,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    // Simulate the superadmin flipping to another tenant and then flipping
    // back to the original within the TTL window — must not refetch.
    rerender(
      <ApiProvider>
        <EntityLabelsProvider tenantId="tenant-other">
          <div>child</div>
        </EntityLabelsProvider>
      </ApiProvider>,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    rerender(
      <ApiProvider>
        <EntityLabelsProvider tenantId="tenant-abc">
          <div>child</div>
        </EntityLabelsProvider>
      </ApiProvider>,
    );

    // Give any pending effects a chance to run, then assert no additional fetch
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    unmount();
  });

  it('sends credentials: include with the request (unchanged behavior)', async () => {
    render(
      <ApiProvider>
        <EntityLabelsProvider tenantId="tenant-abc">
          <div>child</div>
        </EntityLabelsProvider>
      </ApiProvider>,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const init = fetchMock.mock.calls[0][1];
    expect(init).toBeDefined();
    expect(init.credentials).toBe('include');
  });
});
