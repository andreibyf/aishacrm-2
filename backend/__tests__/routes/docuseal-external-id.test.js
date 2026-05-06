// @ts-check
/**
 * docuseal-external-id.test.js (4VD-15)
 *
 * Pins the multi-tenant isolation contract:
 *
 *   - loadDocusealConfig prefers DOCUSEAL_PLATFORM_API_KEY + _BASE_URL when
 *     both env vars are set, regardless of what's in tenant_integrations.
 *   - loadDocusealConfig falls back to the legacy per-tenant lookup when the
 *     platform env vars are unset (back-compat during migration).
 *   - fetchDocusealTemplates appends &external_id=<id> to the upstream URL
 *     when externalId is provided, omits it when not.
 *   - buildDocusealSubmissionPayload includes the external_id field when
 *     externalId is provided, omits it when not. Defends against accidentally
 *     leaking client-supplied external_id (the route is responsible for always
 *     passing tenantId — never the client value).
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadDocusealConfig,
  fetchDocusealTemplates,
  buildDocusealSubmissionPayload,
} from '../../routes/docuseal.js';

// ----------------------------------------------------------------------------
// loadDocusealConfig — platform key vs tenant fallback
// ----------------------------------------------------------------------------

describe('loadDocusealConfig — platform key fast path', () => {
  const originalApiKey = process.env.DOCUSEAL_PLATFORM_API_KEY;
  const originalBaseUrl = process.env.DOCUSEAL_PLATFORM_BASE_URL;

  beforeEach(() => {
    delete process.env.DOCUSEAL_PLATFORM_API_KEY;
    delete process.env.DOCUSEAL_PLATFORM_BASE_URL;
  });
  afterEach(() => {
    if (originalApiKey === undefined) delete process.env.DOCUSEAL_PLATFORM_API_KEY;
    else process.env.DOCUSEAL_PLATFORM_API_KEY = originalApiKey;
    if (originalBaseUrl === undefined) delete process.env.DOCUSEAL_PLATFORM_BASE_URL;
    else process.env.DOCUSEAL_PLATFORM_BASE_URL = originalBaseUrl;
  });

  test('returns platform creds when both env vars set, no Supabase call', async () => {
    process.env.DOCUSEAL_PLATFORM_API_KEY = 'platform-key-xyz';
    process.env.DOCUSEAL_PLATFORM_BASE_URL = 'https://docuseal.aishacrm.com/';

    let supabaseCalled = false;
    const fakeSupabase = {
      from() {
        supabaseCalled = true;
        throw new Error('platform path should not query Supabase');
      },
    };

    const cfg = await loadDocusealConfig(fakeSupabase, 'tenant-A');
    assert.equal(cfg.error, undefined);
    assert.equal(cfg.apiKey, 'platform-key-xyz');
    assert.equal(cfg.baseUrl, 'https://docuseal.aishacrm.com'); // trailing slash stripped
    assert.equal(cfg.source, 'platform');
    assert.equal(supabaseCalled, false, 'platform path must not hit DB');
  });

  test('falls back to tenant lookup when only one platform env var is set', async () => {
    process.env.DOCUSEAL_PLATFORM_API_KEY = 'partial-platform';
    // DOCUSEAL_PLATFORM_BASE_URL deliberately unset

    const fakeSupabase = makeFakeSupabaseWithRow({
      api_credentials: { api_key: 'tenant-key' },
      config: { base_url: 'https://tenant.example.com' },
      is_active: true,
    });

    const cfg = await loadDocusealConfig(fakeSupabase, 'tenant-A');
    assert.equal(cfg.error, undefined);
    // source==='tenant' is sufficient evidence the DB path was taken; if the
    // platform fast path had matched, source would be 'platform'.
    assert.equal(cfg.source, 'tenant');
    assert.equal(cfg.apiKey, 'tenant-key');
  });

  test('falls back to tenant lookup when neither platform env var is set', async () => {
    const fakeSupabase = makeFakeSupabaseWithRow({
      api_credentials: { api_key: 'tenant-key' },
      config: { base_url: 'https://tenant.example.com' },
      is_active: true,
    });

    const cfg = await loadDocusealConfig(fakeSupabase, 'tenant-A');
    assert.equal(cfg.source, 'tenant');
    assert.equal(cfg.apiKey, 'tenant-key');
  });

  test('returns docuseal_not_configured when both paths fail', async () => {
    const fakeSupabase = makeFakeSupabaseWithRow(null);
    const cfg = await loadDocusealConfig(fakeSupabase, 'tenant-A');
    assert.equal(cfg.error, 'docuseal_not_configured');
  });

  test('platform path overrides even when a tenant row exists (no Supabase call)', async () => {
    process.env.DOCUSEAL_PLATFORM_API_KEY = 'platform-wins';
    process.env.DOCUSEAL_PLATFORM_BASE_URL = 'https://docuseal.aishacrm.com';

    let supabaseCalled = false;
    const fakeSupabase = {
      from() {
        supabaseCalled = true;
        return makeFakeSupabaseWithRow({
          api_credentials: { api_key: 'tenant-key' },
          config: { base_url: 'https://tenant.example.com' },
          is_active: true,
        }).from();
      },
    };

    const cfg = await loadDocusealConfig(fakeSupabase, 'tenant-A');
    assert.equal(cfg.apiKey, 'platform-wins', 'platform key must win when set');
    assert.equal(cfg.source, 'platform');
    assert.equal(supabaseCalled, false, 'platform path must short-circuit Supabase');
  });
});

// ----------------------------------------------------------------------------
// fetchDocusealTemplates — external_id query param
// ----------------------------------------------------------------------------

describe('fetchDocusealTemplates — external_id filter', () => {
  test('appends &external_id=<id> when externalId is provided', async () => {
    let capturedUrl = null;
    const fakeFetch = async (url) => {
      capturedUrl = url;
      return jsonResponse({ data: [] });
    };
    await fetchDocusealTemplates({
      apiKey: 'k',
      baseUrl: 'https://docuseal.example',
      externalId: 'tenant-uuid-aaa',
      fetchImpl: fakeFetch,
    });
    assert.ok(capturedUrl.includes('external_id=tenant-uuid-aaa'),
      `URL should include external_id filter, got: ${capturedUrl}`);
    assert.ok(capturedUrl.includes('limit=200'),
      `URL should preserve limit, got: ${capturedUrl}`);
  });

  test('omits external_id when not provided (back-compat with existing callers)', async () => {
    let capturedUrl = null;
    const fakeFetch = async (url) => {
      capturedUrl = url;
      return jsonResponse({ data: [] });
    };
    await fetchDocusealTemplates({
      apiKey: 'k',
      baseUrl: 'https://docuseal.example',
      fetchImpl: fakeFetch,
    });
    assert.ok(!capturedUrl.includes('external_id'),
      `URL should not include external_id when none provided, got: ${capturedUrl}`);
  });

  test('URL-encodes external_id (defends against tenant ids with special chars)', async () => {
    let capturedUrl = null;
    const fakeFetch = async (url) => {
      capturedUrl = url;
      return jsonResponse({ data: [] });
    };
    await fetchDocusealTemplates({
      apiKey: 'k',
      baseUrl: 'https://docuseal.example',
      externalId: 'has spaces & ampersand',
      fetchImpl: fakeFetch,
    });
    // URLSearchParams encodes space as + and & as %26
    assert.ok(capturedUrl.includes('external_id=has+spaces+%26+ampersand') ||
              capturedUrl.includes('external_id=has%20spaces%20%26%20ampersand'),
      `external_id should be URL-encoded, got: ${capturedUrl}`);
  });

  test('coerces non-string externalId to string (e.g., numeric tenant_id)', async () => {
    let capturedUrl = null;
    const fakeFetch = async (url) => {
      capturedUrl = url;
      return jsonResponse({ data: [] });
    };
    await fetchDocusealTemplates({
      apiKey: 'k',
      baseUrl: 'https://docuseal.example',
      externalId: 12345,
      fetchImpl: fakeFetch,
    });
    assert.ok(capturedUrl.includes('external_id=12345'),
      `numeric externalId should be coerced to string, got: ${capturedUrl}`);
  });
});

// ----------------------------------------------------------------------------
// buildDocusealSubmissionPayload — external_id field
// ----------------------------------------------------------------------------

describe('buildDocusealSubmissionPayload — external_id stamp', () => {
  test('includes external_id when externalId is provided', () => {
    const payload = buildDocusealSubmissionPayload({
      template_id: 1,
      recipient_email: 'r@example.com',
      externalId: 'tenant-uuid-bbb',
    });
    assert.equal(payload.external_id, 'tenant-uuid-bbb');
  });

  test('omits external_id when externalId is not provided (back-compat)', () => {
    const payload = buildDocusealSubmissionPayload({
      template_id: 1,
      recipient_email: 'r@example.com',
    });
    assert.equal(Object.prototype.hasOwnProperty.call(payload, 'external_id'), false,
      'external_id key should be ABSENT, not just falsy, when not provided');
  });

  test('coerces non-string externalId to string', () => {
    const payload = buildDocusealSubmissionPayload({
      template_id: 1,
      recipient_email: 'r@example.com',
      externalId: 42,
    });
    assert.equal(payload.external_id, '42');
    assert.equal(typeof payload.external_id, 'string');
  });

  test('payload shape preserves send_email=false and submitters', () => {
    const payload = buildDocusealSubmissionPayload({
      template_id: 7,
      recipient_email: 'r@example.com',
      recipient_name: 'Recipient',
      externalId: 'tenant-X',
    });
    assert.equal(payload.send_email, false);
    assert.equal(payload.template_id, 7);
    assert.deepEqual(payload.submitters, [{ email: 'r@example.com', name: 'Recipient' }]);
    assert.equal(payload.external_id, 'tenant-X');
    // No `message` field — same regression as the existing payload test.
    assert.equal(Object.prototype.hasOwnProperty.call(payload, 'message'), false);
  });
});

// ----------------------------------------------------------------------------
// helpers
// ----------------------------------------------------------------------------

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function makeFakeSupabaseWithRow(row) {
  return {
    from() {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        async maybeSingle() {
          return { data: row, error: null };
        },
      };
    },
  };
}
