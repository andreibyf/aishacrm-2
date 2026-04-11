import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/api/functions', () => ({
  getAuthorizationHeader: vi.fn(async () => 'Bearer test-token'),
}));

describe('[INTEGRATIONS] emailTemplates tenant headers', () => {
  let originalFetch;
  let originalHref;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalHref = window.location.href;
    localStorage.clear();

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'success', data: [] }),
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    window.history.replaceState({}, '', originalHref);
    vi.restoreAllMocks();
  });

  it('uses explicit tenantId for template fetch headers', async () => {
    const { fetchEmailTemplates } = await import('./emailTemplates');

    await fetchEmailTemplates({ entityType: 'lead', tenantId: 'tenant-from-prop' });

    const [, options] = globalThis.fetch.mock.calls[0];
    expect(options.headers['x-tenant-id']).toBe('tenant-from-prop');
    expect(options.headers.Authorization).toBe('Bearer test-token');
  });

  it('falls back to URL tenant when explicit tenantId is missing', async () => {
    window.history.replaceState({}, '', '/crm?tenant=tenant-from-url');

    const { fetchEmailTemplates } = await import('./emailTemplates');

    await fetchEmailTemplates({ entityType: 'lead' });

    const [, options] = globalThis.fetch.mock.calls[0];
    expect(options.headers['x-tenant-id']).toBe('tenant-from-url');
  });
});
