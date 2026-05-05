/**
 * docuseal-templates.test.js
 *
 * Tests for GET /api/docuseal/templates (4VD-8) and the helpers it composes.
 *
 * The most important test in this file is the **tenant isolation invariant**
 * — `fetchDocusealTemplates` is keyed by API key (tenant-specific), and the
 * Express handler's in-process cache is keyed by tenant_id only. A future
 * PR that introduces a shared/global cache key would silently leak one
 * tenant's templates into another tenant's dropdown. The cache-isolation
 * test below pins that invariant.
 *
 * Run:
 *   cd backend && node --test __tests__/routes/docuseal-templates.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeDocusealTemplate,
  fetchDocusealTemplates,
} from '../../routes/docuseal.js';

// ---------------------------------------------------------------------------
// normalizeDocusealTemplate — the DocuSeal -> CRM dropdown shape
// ---------------------------------------------------------------------------

describe('normalizeDocusealTemplate', () => {
  test('passes through a well-formed template', () => {
    const out = normalizeDocusealTemplate({
      id: 42,
      name: 'NDA — Mutual',
      slug: 'nda-mutual',
      archived_at: null,
      created_at: '2026-04-01T00:00:00Z',
      updated_at: '2026-04-15T00:00:00Z',
    });
    assert.deepEqual(out, {
      id: '42',
      name: 'NDA — Mutual',
      slug: 'nda-mutual',
      archived_at: null,
      created_at: '2026-04-01T00:00:00Z',
      updated_at: '2026-04-15T00:00:00Z',
    });
  });

  test('coerces id to string for stable React key + form value', () => {
    assert.equal(normalizeDocusealTemplate({ id: 7, name: 'X' }).id, '7');
    assert.equal(normalizeDocusealTemplate({ id: 'abc', name: 'X' }).id, 'abc');
  });

  test('falls back to "Template <id>" when name is missing or whitespace', () => {
    assert.equal(normalizeDocusealTemplate({ id: 9 }).name, 'Template 9');
    assert.equal(normalizeDocusealTemplate({ id: 9, name: '' }).name, 'Template 9');
    assert.equal(normalizeDocusealTemplate({ id: 9, name: '   ' }).name, 'Template 9');
  });

  test('returns null for non-object / missing-id input', () => {
    assert.equal(normalizeDocusealTemplate(null), null);
    assert.equal(normalizeDocusealTemplate(undefined), null);
    assert.equal(normalizeDocusealTemplate('string'), null);
    assert.equal(normalizeDocusealTemplate({}), null);
    assert.equal(normalizeDocusealTemplate({ name: 'no id' }), null);
  });

  test('preserves archived_at so the route can filter it out', () => {
    const out = normalizeDocusealTemplate({
      id: 1,
      name: 'Old',
      archived_at: '2026-01-01T00:00:00Z',
    });
    assert.equal(out.archived_at, '2026-01-01T00:00:00Z');
  });
});

// ---------------------------------------------------------------------------
// fetchDocusealTemplates — DocuSeal API contract + filtering + sorting
// ---------------------------------------------------------------------------

function makeFetch(payload, { ok = true, status = 200 } = {}) {
  return async (url, init) => {
    return {
      ok,
      status,
      headers: new Map([['content-type', 'application/json']]),
      async json() {
        return payload;
      },
      async text() {
        return JSON.stringify(payload);
      },
      // capture for assertions
      _url: url,
      _init: init,
    };
  };
}

describe('fetchDocusealTemplates', () => {
  test('sends X-Auth-Token with the per-tenant API key', async () => {
    let captured;
    const fetchImpl = async (url, init) => {
      captured = { url, init };
      return {
        ok: true,
        status: 200,
        async json() {
          return { data: [] };
        },
        async text() {
          return '[]';
        },
      };
    };
    await fetchDocusealTemplates({
      apiKey: 'TENANT_A_KEY',
      baseUrl: 'https://docuseal.example',
      fetchImpl,
    });
    assert.equal(captured.url, 'https://docuseal.example/api/templates?limit=200');
    assert.equal(captured.init.method, 'GET');
    assert.equal(captured.init.headers['X-Auth-Token'], 'TENANT_A_KEY');
    assert.equal(captured.init.headers.Accept, 'application/json');
  });

  test('handles { data: [...] } envelope', async () => {
    const fetchImpl = makeFetch({
      data: [
        { id: 2, name: 'Beta' },
        { id: 1, name: 'Alpha' },
      ],
    });
    const out = await fetchDocusealTemplates({
      apiKey: 'k',
      baseUrl: 'https://x',
      fetchImpl,
    });
    // sorted alphabetically by name
    assert.deepEqual(
      out.map((t) => t.name),
      ['Alpha', 'Beta'],
    );
  });

  test('handles bare array response', async () => {
    const fetchImpl = makeFetch([
      { id: 1, name: 'One' },
      { id: 2, name: 'Two' },
    ]);
    const out = await fetchDocusealTemplates({
      apiKey: 'k',
      baseUrl: 'https://x',
      fetchImpl,
    });
    assert.equal(out.length, 2);
  });

  test('filters out archived templates', async () => {
    const fetchImpl = makeFetch({
      data: [
        { id: 1, name: 'Active', archived_at: null },
        { id: 2, name: 'Old', archived_at: '2026-01-01' },
        { id: 3, name: 'Newer', archived_at: null },
      ],
    });
    const out = await fetchDocusealTemplates({
      apiKey: 'k',
      baseUrl: 'https://x',
      fetchImpl,
    });
    assert.equal(out.length, 2);
    assert.deepEqual(
      out.map((t) => t.id),
      ['1', '3'],
    );
  });

  test('skips records that fail normalization (missing id, etc.)', async () => {
    const fetchImpl = makeFetch({
      data: [
        { id: 1, name: 'Good' },
        { name: 'No ID' },
        null,
        'string-not-object',
        { id: 2, name: 'Also Good' },
      ],
    });
    const out = await fetchDocusealTemplates({
      apiKey: 'k',
      baseUrl: 'https://x',
      fetchImpl,
    });
    assert.equal(out.length, 2);
  });

  test('returns empty array when payload has no array shape', async () => {
    const fetchImpl = makeFetch({ totally: 'unexpected' });
    const out = await fetchDocusealTemplates({
      apiKey: 'k',
      baseUrl: 'https://x',
      fetchImpl,
    });
    assert.deepEqual(out, []);
  });

  test('throws with status + body on non-OK response', async () => {
    const fetchImpl = makeFetch('forbidden', { ok: false, status: 403 });
    await assert.rejects(
      fetchDocusealTemplates({ apiKey: 'k', baseUrl: 'https://x', fetchImpl }),
      (err) => {
        assert.equal(err.status, 403);
        assert.match(err.message, /docuseal_templates_failed: 403/);
        return true;
      },
    );
  });
});

// ---------------------------------------------------------------------------
// Tenant isolation invariant
// ---------------------------------------------------------------------------
//
// fetchDocusealTemplates accepts apiKey + baseUrl as inputs — there is no
// shared global state to leak across tenants. The cache lives in the route
// handler (templatesCache, keyed by tenantId), which isn't directly callable
// here. We pin two invariants:
//
//   1. Calling fetchDocusealTemplates with tenant A's apiKey emits exactly
//      ONE request with that key in the X-Auth-Token header — a future
//      "let's also try a fallback admin key" PR that adds extra fetches
//      with another tenant's key would fail this test.
//
//   2. Two sequential calls with different apiKeys produce two independent
//      results — i.e., there's no caching inside fetchDocusealTemplates
//      itself. Caching is the route's job, keyed by tenantId.

describe('tenant isolation invariant', () => {
  test('sends exactly one request, with the supplied apiKey, no fallbacks', async () => {
    let calls = 0;
    let lastKey = null;
    const fetchImpl = async (_url, init) => {
      calls++;
      lastKey = init.headers['X-Auth-Token'];
      return {
        ok: true,
        async json() {
          return { data: [{ id: 1, name: 'T1' }] };
        },
        async text() {
          return '';
        },
      };
    };
    await fetchDocusealTemplates({
      apiKey: 'TENANT_A_KEY',
      baseUrl: 'https://x',
      fetchImpl,
    });
    assert.equal(calls, 1);
    assert.equal(lastKey, 'TENANT_A_KEY');
  });

  test('two tenants get independent results — no cross-tenant memoization inside the helper', async () => {
    const responsesByKey = {
      TENANT_A_KEY: { data: [{ id: 1, name: 'A-only' }] },
      TENANT_B_KEY: { data: [{ id: 2, name: 'B-only' }] },
    };
    const fetchImpl = async (_url, init) => {
      const key = init.headers['X-Auth-Token'];
      return {
        ok: true,
        async json() {
          return responsesByKey[key] || { data: [] };
        },
        async text() {
          return '';
        },
      };
    };

    const aResult = await fetchDocusealTemplates({
      apiKey: 'TENANT_A_KEY',
      baseUrl: 'https://x',
      fetchImpl,
    });
    const bResult = await fetchDocusealTemplates({
      apiKey: 'TENANT_B_KEY',
      baseUrl: 'https://x',
      fetchImpl,
    });

    assert.deepEqual(
      aResult.map((t) => t.name),
      ['A-only'],
    );
    assert.deepEqual(
      bResult.map((t) => t.name),
      ['B-only'],
    );
    // and a SECOND call for tenant A still gets A's data — proving the helper
    // doesn't have a stale-cache mode that survived the tenant-B call
    const aAgain = await fetchDocusealTemplates({
      apiKey: 'TENANT_A_KEY',
      baseUrl: 'https://x',
      fetchImpl,
    });
    assert.deepEqual(
      aAgain.map((t) => t.name),
      ['A-only'],
    );
  });
});
