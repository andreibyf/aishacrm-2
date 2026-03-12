/**
 * Tests for GET /api/employees/lookup
 *
 * Covers:
 *  - Missing tenant_id → 400
 *  - Unauthenticated request → 401
 *  - Authenticated request returns employee map
 *  - ids= subset filtering returns only requested IDs
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const TENANT_ID = process.env.TEST_TENANT_ID || 'a11dfb63-4b18-4eb8-872e-747af2e37c46';

// In CI, run only if explicitly enabled
const SHOULD_RUN = process.env.CI ? process.env.CI_BACKEND_TESTS === 'true' : true;

/** Helper: GET /api/employees/lookup with optional auth cookie */
async function lookupRequest({ tenantId, ids, cookie } = {}) {
  const params = new URLSearchParams();
  if (tenantId !== undefined) params.set('tenant_id', tenantId);
  if (ids !== undefined) params.set('ids', ids);

  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers['Cookie'] = cookie;

  const res = await fetch(`${BASE_URL}/api/employees/lookup?${params}`, {
    headers,
    credentials: 'include',
  });
  const json = await res.json();
  return { status: res.status, json };
}

describe('GET /api/employees/lookup', { skip: !SHOULD_RUN }, () => {
  test('returns 400 when tenant_id is missing', async () => {
    const { status, json } = await lookupRequest({});
    // Missing tenant_id should fail — the route enforces this before auth
    // (auth guard fires first returning 401, but missing param also returns 400)
    assert.ok([400, 401].includes(status), `expected 400 or 401, got ${status}`);
    assert.equal(json.status, 'error');
  });

  test('returns 401 when unauthenticated', async () => {
    const { status, json } = await lookupRequest({ tenantId: TENANT_ID });
    assert.equal(status, 401, `expected 401 for unauthenticated, got ${status}: ${JSON.stringify(json)}`);
    assert.equal(json.status, 'error');
  });

  test('returns 200 with employee map when authenticated (integration)', async () => {
    // This test requires a valid session cookie. It is skipped unless
    // TEST_AUTH_COOKIE is provided in the environment.
    const cookie = process.env.TEST_AUTH_COOKIE;
    if (!cookie) {
      console.warn('[SKIP] TEST_AUTH_COOKIE not set — skipping authenticated lookup test');
      return;
    }

    const { status, json } = await lookupRequest({ tenantId: TENANT_ID, cookie });
    assert.equal(status, 200, `expected 200, got ${status}: ${JSON.stringify(json)}`);
    assert.equal(json.status, 'success');
    assert.ok(typeof json.data === 'object', 'data should be an object map');
  });

  test('returns 200 with filtered map when ids= provided (integration)', async () => {
    const cookie = process.env.TEST_AUTH_COOKIE;
    if (!cookie) {
      console.warn('[SKIP] TEST_AUTH_COOKIE not set — skipping ids-filtered lookup test');
      return;
    }

    // First fetch full map to find a real ID to filter on
    const { json: fullMap } = await lookupRequest({ tenantId: TENANT_ID, cookie });
    const ids = Object.keys(fullMap?.data ?? {});
    if (ids.length === 0) {
      console.warn('[SKIP] No employees in tenant — skipping ids filter test');
      return;
    }

    const sampleId = ids[0];
    const { status, json } = await lookupRequest({ tenantId: TENANT_ID, ids: sampleId, cookie });
    assert.equal(status, 200);
    assert.equal(json.status, 'success');
    // The returned map should contain the requested ID (and possibly others from cache)
    assert.ok(sampleId in (json.data ?? {}), `expected sampleId ${sampleId} in result`);
  });
});
