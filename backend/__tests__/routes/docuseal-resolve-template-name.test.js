/**
 * docuseal-resolve-template-name.test.js
 *
 * Tests for resolveTemplateNameForTenant (4VD-34).
 *
 * The pre-fix bug: DocuSeal Community's POST /api/submissions response does
 * not include the template name, so submissions were saved with
 * template_name = null and the activity timeline rendered "unnamed template".
 *
 * The fix: resolveTemplateNameForTenant looks up the name via the per-tenant
 * cache populated by GET /api/docuseal/templates. Tests pin:
 *
 *   - Warm cache → no upstream HTTP call (fetchImpl never invoked)
 *   - Cold cache → upstream fetch fires, populates cache, returns name
 *   - Cache hit but template_id not in list → falls through to fresh fetch
 *   - Template never in tenant's list → returns null (tenant isolation defense)
 *   - Upstream error → returns null gracefully (submission still proceeds)
 *
 * Run:
 *   cd backend && node --test __tests__/routes/docuseal-resolve-template-name.test.js
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveTemplateNameForTenant,
  _clearTemplatesCacheForTest,
} from '../../routes/docuseal.js';

const TENANT_A = '00000000-0000-0000-0000-00000000000a';
const TENANT_B = '00000000-0000-0000-0000-00000000000b';
const API_KEY_A = 'apikey-tenant-A';
const API_KEY_B = 'apikey-tenant-B';
const BASE_URL = 'https://docuseal.example.com';

/**
 * Build a fetch double that records calls and returns a configurable response.
 * Returns { fetchImpl, calls } where calls is the array of (url, init) tuples.
 */
function makeFetchDouble(responder) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return responder(url, init);
  };
  return { fetchImpl, calls };
}

/** Standard DocuSeal /api/templates response shape (bare array). */
function templatesResponse(items) {
  return {
    ok: true,
    status: 200,
    json: async () => items,
    text: async () => JSON.stringify(items),
  };
}

describe('resolveTemplateNameForTenant — input validation', () => {
  beforeEach(() => _clearTemplatesCacheForTest());

  test('returns null when tenantId is missing', async () => {
    const out = await resolveTemplateNameForTenant({
      tenantId: '',
      apiKey: API_KEY_A,
      baseUrl: BASE_URL,
      templateId: 7,
    });
    assert.equal(out, null);
  });

  test('returns null when templateId is null/undefined', async () => {
    const out = await resolveTemplateNameForTenant({
      tenantId: TENANT_A,
      apiKey: API_KEY_A,
      baseUrl: BASE_URL,
      templateId: null,
    });
    assert.equal(out, null);
  });
});

describe('resolveTemplateNameForTenant — warm cache (the hot path)', () => {
  beforeEach(() => _clearTemplatesCacheForTest());

  test('cache hit returns name without firing any upstream fetch', async () => {
    // Prime the cache the way GET /api/docuseal/templates does
    const { fetchImpl: primeFetch, calls: primeCalls } = makeFetchDouble(() =>
      templatesResponse([
        { id: 7, name: 'NDA — Mutual', archived_at: null },
        { id: 9, name: 'MSA', archived_at: null },
      ]),
    );
    // Use the resolver itself to populate cache (cold path), then verify
    // the SECOND call doesn't re-fetch.
    const first = await resolveTemplateNameForTenant({
      tenantId: TENANT_A,
      apiKey: API_KEY_A,
      baseUrl: BASE_URL,
      templateId: 7,
      fetchImpl: primeFetch,
    });
    assert.equal(first, 'NDA — Mutual');
    assert.equal(primeCalls.length, 1, 'cold path should fire one fetch');

    // Now the cache is warm. A second resolve must NOT call fetchImpl.
    let warmCalled = false;
    const warmFetch = async () => {
      warmCalled = true;
      throw new Error('fetch should not be called on warm cache');
    };
    const second = await resolveTemplateNameForTenant({
      tenantId: TENANT_A,
      apiKey: API_KEY_A,
      baseUrl: BASE_URL,
      templateId: 9,
      fetchImpl: warmFetch,
    });
    assert.equal(second, 'MSA', 'warm cache resolves a different id');
    assert.equal(warmCalled, false, 'warm cache must not fire any fetch');
  });

  test('cache hit but template_id not in list → falls through to fresh fetch', async () => {
    // Prime cache with templates 7 and 9
    const { fetchImpl: primeFetch } = makeFetchDouble(() =>
      templatesResponse([
        { id: 7, name: 'NDA', archived_at: null },
        { id: 9, name: 'MSA', archived_at: null },
      ]),
    );
    await resolveTemplateNameForTenant({
      tenantId: TENANT_A,
      apiKey: API_KEY_A,
      baseUrl: BASE_URL,
      templateId: 7,
      fetchImpl: primeFetch,
    });

    // Now ask for template 11 (not in cache) — resolver must re-fetch.
    // The fresh fetch returns an updated list that DOES include 11.
    const { fetchImpl: refreshFetch, calls: refreshCalls } = makeFetchDouble(() =>
      templatesResponse([
        { id: 7, name: 'NDA', archived_at: null },
        { id: 9, name: 'MSA', archived_at: null },
        { id: 11, name: 'Employment Agreement', archived_at: null },
      ]),
    );
    const out = await resolveTemplateNameForTenant({
      tenantId: TENANT_A,
      apiKey: API_KEY_A,
      baseUrl: BASE_URL,
      templateId: 11,
      fetchImpl: refreshFetch,
    });
    assert.equal(out, 'Employment Agreement');
    assert.equal(refreshCalls.length, 1, 'cache miss for unknown id forces a fetch');
  });
});

describe('resolveTemplateNameForTenant — cold cache (cache miss)', () => {
  beforeEach(() => _clearTemplatesCacheForTest());

  test('cold cache fires fetch with external_id=tenantId and stores in cache', async () => {
    const { fetchImpl, calls } = makeFetchDouble((url) => {
      assert.match(
        url,
        new RegExp(`external_id=${TENANT_A}`),
        'fetch URL must include external_id=tenantId for tenant isolation',
      );
      return templatesResponse([{ id: 42, name: 'Lease Agreement', archived_at: null }]);
    });
    const out = await resolveTemplateNameForTenant({
      tenantId: TENANT_A,
      apiKey: API_KEY_A,
      baseUrl: BASE_URL,
      templateId: 42,
      fetchImpl,
    });
    assert.equal(out, 'Lease Agreement');
    assert.equal(calls.length, 1);
  });

  test('coerces numeric template_id to string for comparison', async () => {
    const { fetchImpl } = makeFetchDouble(() =>
      // DocuSeal returns ids as numbers; the cache normalizes to strings.
      templatesResponse([{ id: 42, name: 'NDA', archived_at: null }]),
    );
    // Caller passes a number — resolver must still match.
    const fromNumber = await resolveTemplateNameForTenant({
      tenantId: TENANT_A,
      apiKey: API_KEY_A,
      baseUrl: BASE_URL,
      templateId: 42,
      fetchImpl,
    });
    assert.equal(fromNumber, 'NDA');

    // And a string id matches the same cache.
    const fromString = await resolveTemplateNameForTenant({
      tenantId: TENANT_A,
      apiKey: API_KEY_A,
      baseUrl: BASE_URL,
      templateId: '42',
      fetchImpl,
    });
    assert.equal(fromString, 'NDA');
  });
});

describe('resolveTemplateNameForTenant — tenant isolation defense', () => {
  beforeEach(() => _clearTemplatesCacheForTest());

  test('template_id not visible to this tenant → returns null', async () => {
    // Tenant A's templates list does not include id=99
    const { fetchImpl } = makeFetchDouble(() =>
      templatesResponse([{ id: 7, name: 'NDA', archived_at: null }]),
    );
    const out = await resolveTemplateNameForTenant({
      tenantId: TENANT_A,
      apiKey: API_KEY_A,
      baseUrl: BASE_URL,
      templateId: 99,
      fetchImpl,
    });
    assert.equal(out, null, 'cross-tenant template_id must resolve to null, not throw');
  });

  test('cache is keyed per tenant — Tenant B does not see Tenant A entries', async () => {
    // Tenant A primes cache with template 7
    const { fetchImpl: fetchA } = makeFetchDouble(() =>
      templatesResponse([{ id: 7, name: 'A only', archived_at: null }]),
    );
    await resolveTemplateNameForTenant({
      tenantId: TENANT_A,
      apiKey: API_KEY_A,
      baseUrl: BASE_URL,
      templateId: 7,
      fetchImpl: fetchA,
    });

    // Tenant B asks for the same template id. Must not return Tenant A's name —
    // must fire a fresh fetch with Tenant B's apiKey + external_id=B.
    const { fetchImpl: fetchB, calls: callsB } = makeFetchDouble((url, init) => {
      assert.equal(init.headers['X-Auth-Token'], API_KEY_B, 'must use Tenant B apiKey');
      assert.match(
        url,
        new RegExp(`external_id=${TENANT_B}`),
        'must pass external_id=B not A',
      );
      return templatesResponse([{ id: 7, name: 'B only', archived_at: null }]);
    });
    const out = await resolveTemplateNameForTenant({
      tenantId: TENANT_B,
      apiKey: API_KEY_B,
      baseUrl: BASE_URL,
      templateId: 7,
      fetchImpl: fetchB,
    });
    assert.equal(out, 'B only', 'must resolve to B, not the cached A entry');
    assert.equal(callsB.length, 1, 'cold cache for B forces a fetch even when A has data');
  });
});

describe('resolveTemplateNameForTenant — graceful degrade on upstream error', () => {
  beforeEach(() => _clearTemplatesCacheForTest());

  test('upstream 5xx → returns null (submission still proceeds)', async () => {
    const fetchImpl = async () => ({
      ok: false,
      status: 503,
      text: async () => 'Service Unavailable',
      json: async () => {
        throw new Error('not json');
      },
    });
    const out = await resolveTemplateNameForTenant({
      tenantId: TENANT_A,
      apiKey: API_KEY_A,
      baseUrl: BASE_URL,
      templateId: 7,
      fetchImpl,
    });
    assert.equal(out, null, '5xx must not throw — submission send must continue');
  });

  test('upstream 401 → returns null gracefully', async () => {
    const fetchImpl = async () => ({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
      json: async () => {
        throw new Error('not json');
      },
    });
    const out = await resolveTemplateNameForTenant({
      tenantId: TENANT_A,
      apiKey: API_KEY_A,
      baseUrl: BASE_URL,
      templateId: 7,
      fetchImpl,
    });
    assert.equal(out, null);
  });

  test('network throw → returns null', async () => {
    const fetchImpl = async () => {
      throw new Error('ECONNREFUSED');
    };
    const out = await resolveTemplateNameForTenant({
      tenantId: TENANT_A,
      apiKey: API_KEY_A,
      baseUrl: BASE_URL,
      templateId: 7,
      fetchImpl,
    });
    assert.equal(out, null);
  });
});
