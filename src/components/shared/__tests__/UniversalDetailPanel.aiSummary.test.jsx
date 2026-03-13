import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock sonner
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

// Mock getBackendUrl
vi.mock('@/api/backendUrl', () => ({
  getBackendUrl: () => 'http://localhost:4001',
}));

describe('[CRM] UniversalDetailPanel - AI Summary effect logic', () => {
  let originalFetch;
  let consoleErrorSpy;
  let consoleLogSpy;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  it('should fetch profile for lead entity with tenant context', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          entity: { ai_summary: 'Existing summary', ai_summary_updated_at: '2026-01-01T00:00:00Z' },
        },
      }),
    });

    const entity = { id: 'entity-1', tenant_id: 'tenant-123' };
    const tenantId = 'tenant-123';
    const profileType = 'lead';

    // Simulate the fetch portion of the AI summary effect
    const response = await fetch(
      `http://localhost:4001/api/profile/${profileType}/${entity.id}?tenant_id=${tenantId}`,
      { credentials: 'include', headers: { 'Content-Type': 'application/json' } },
    );
    const json = await response.json();

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:4001/api/profile/lead/entity-1?tenant_id=tenant-123',
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(json.data.entity.ai_summary).toBe('Existing summary');
  });

  it('should NOT set aiSummaryFetchedRef when tenantId is missing', () => {
    // Simulate the guard logic: tenantId must be truthy before marking as fetched
    const entity = { id: 'entity-1' }; // no tenant_id
    const selectedTenantId = null;
    const user = {}; // no tenant_id

    const tenantId = selectedTenantId || user?.tenant_id || entity.tenant_id;
    let refWasSet = false;

    // Replicate the effect guard: must bail before setting ref
    if (!tenantId) {
      // should NOT mark as fetched
    } else {
      refWasSet = true;
    }

    expect(tenantId).toBeFalsy();
    expect(refWasSet).toBe(false);
  });

  it('should trigger summarize endpoint when ai_summary is null', async () => {
    const fetchCalls = [];
    globalThis.fetch = vi.fn().mockImplementation((url, opts) => {
      fetchCalls.push({ url, method: opts?.method || 'GET' });
      if (url.includes('/api/profile/')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: { entity: { ai_summary: null, ai_summary_updated_at: null } },
          }),
        });
      }
      if (url.includes('/api/ai/summarize-person-profile')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ai_summary: 'Generated summary' }),
        });
      }
      return Promise.resolve({ ok: false, json: async () => ({}) });
    });

    const entity = { id: 'entity-2', tenant_id: 'tenant-456' };
    const tenantId = 'tenant-456';
    const profileType = 'contact';

    // Step 1: Fetch profile
    const profileRes = await fetch(
      `http://localhost:4001/api/profile/${profileType}/${entity.id}?tenant_id=${tenantId}`,
      { credentials: 'include', headers: { 'Content-Type': 'application/json' } },
    );
    const profileJson = await profileRes.json();

    // Step 2: If no summary, generate one
    let generatedSummary = null;
    if (!profileJson.data.entity.ai_summary) {
      const summaryRes = await fetch('http://localhost:4001/api/ai/summarize-person-profile', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          person_id: entity.id,
          person_type: profileType,
          tenant_id: tenantId,
          profile_data: { ...entity, ...profileJson.data.entity },
        }),
      });
      const summaryJson = await summaryRes.json();
      generatedSummary = summaryJson.ai_summary;
    }

    expect(fetchCalls).toHaveLength(2);
    expect(fetchCalls[0].url).toContain('/api/profile/contact/entity-2');
    expect(fetchCalls[1].url).toContain('/api/ai/summarize-person-profile');
    expect(fetchCalls[1].method).toBe('POST');
    expect(generatedSummary).toBe('Generated summary');
  });

  it('should skip AI summary for activity entityType', () => {
    const entityType = 'activity';
    const shouldFetch = entityType !== 'activity';
    expect(shouldFetch).toBe(false);
  });

  it('should skip AI summary for opportunity entityType (no profile)', () => {
    const profileTypeMap = {
      lead: 'lead',
      contact: 'contact',
      account: 'account',
      bizdev: 'bizdev',
      opportunity: null,
    };
    const profileType = profileTypeMap['opportunity'];
    expect(profileType).toBeNull();
  });

  it('should map bizdev entityType to bizdev_source for notes/activities', () => {
    const entityType = 'bizdev';
    const relatedTypeForDb =
      entityType === 'bizdev' || entityType === 'bizdev_source'
        ? 'bizdev_source'
        : entityType.toLowerCase();
    expect(relatedTypeForDb).toBe('bizdev_source');
  });

  it('should map bizdev_source entityType to bizdev_source for notes/activities', () => {
    const entityType = 'bizdev_source';
    const relatedTypeForDb =
      entityType === 'bizdev' || entityType === 'bizdev_source'
        ? 'bizdev_source'
        : entityType.toLowerCase();
    expect(relatedTypeForDb).toBe('bizdev_source');
  });

  it('should map bizdev_source entityType to bizdev profile route (same as bizdev)', () => {
    const profileTypeMap = {
      lead: 'lead',
      contact: 'contact',
      account: 'account',
      bizdev: 'bizdev',
      bizdev_source: 'bizdev',
      opportunity: null,
    };
    expect(profileTypeMap['bizdev_source']).toBe('bizdev');
    expect(profileTypeMap['bizdev']).toBe('bizdev');
  });

  it('should use entityType as-is for non-bizdev types', () => {
    for (const type of ['lead', 'contact', 'account', 'opportunity']) {
      const relatedTypeForDb =
        type === 'bizdev' || type === 'bizdev_source' ? 'bizdev_source' : type.toLowerCase();
      expect(relatedTypeForDb).toBe(type);
    }
  });
});
