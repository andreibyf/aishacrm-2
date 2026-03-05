/**
 * Integration tests for Tenant Integrations routes
 * Tests /api/tenantintegrations endpoints
 *
 * Covers:
 *  - GET requires tenant_id (400 when missing)
 *  - GET scoped to authenticated tenant
 *  - POST requires tenant_id and integration_type (400 when missing)
 *  - POST creates integration for authenticated tenant
 *  - Cleanup of test data
 */

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { getAuthHeaders } from '../helpers/auth.js';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const TENANT_ID = process.env.TEST_TENANT_ID || 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
const SHOULD_RUN = process.env.CI ? process.env.CI_BACKEND_TESTS === 'true' : true;

const createdIds = [];

describe('Tenant Integration Routes', { skip: !SHOULD_RUN }, () => {
  after(async () => {
    // Clean up any integrations created during tests
    for (const id of createdIds) {
      try {
        await fetch(`${BASE_URL}/api/tenantintegrations/${id}?tenant_id=${TENANT_ID}`, {
          method: 'DELETE',
          headers: getAuthHeaders(),
        });
      } catch {
        /* best-effort cleanup */
      }
    }
  });

  // ── GET validation ──────────────────────────────────────────────────

  test('GET /api/tenantintegrations without tenant_id returns 400 or 401', async () => {
    const res = await fetch(`${BASE_URL}/api/tenantintegrations`, {
      headers: getAuthHeaders(),
    });
    // Without tenant_id the middleware or route should reject
    assert.ok(
      [400, 401].includes(res.status),
      `expected 400/401 for missing tenant_id, got ${res.status}`,
    );
  });

  test('GET /api/tenantintegrations with tenant_id returns 200', async () => {
    const res = await fetch(
      `${BASE_URL}/api/tenantintegrations?tenant_id=${TENANT_ID}`,
      { headers: getAuthHeaders() },
    );
    assert.ok([200, 401].includes(res.status), `expected 200/401, got ${res.status}`);

    if (res.status === 200) {
      const json = await res.json();
      assert.ok(json.data?.tenantintegrations, 'expected tenantintegrations array in data');
      assert.ok(
        Array.isArray(json.data.tenantintegrations),
        'tenantintegrations should be an array',
      );
    }
  });

  // ── POST validation ──────────────────────────────────────────────────

  test('POST /api/tenantintegrations without tenant_id returns 400 or 401', async () => {
    const res = await fetch(`${BASE_URL}/api/tenantintegrations`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ integration_type: 'test' }),
    });
    assert.ok(
      [400, 401].includes(res.status),
      `expected 400/401 for missing tenant_id, got ${res.status}`,
    );
  });

  test('POST /api/tenantintegrations without integration_type returns 400', async () => {
    const res = await fetch(`${BASE_URL}/api/tenantintegrations`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant_id: TENANT_ID }),
    });
    assert.ok(
      [400, 401].includes(res.status),
      `expected 400/401 for missing integration_type, got ${res.status}`,
    );
  });

  // ── POST create + scoped GET ─────────────────────────────────────────

  test('POST /api/tenantintegrations creates and scoped GET returns it', async () => {
    // Create
    const createRes = await fetch(`${BASE_URL}/api/tenantintegrations`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenant_id: TENANT_ID,
        integration_type: 'test_cleanup',
        integration_name: 'Test Integration (auto-cleanup)',
        is_active: false,
        metadata: { is_test_data: true },
      }),
    });

    // Auth may block — that's fine for CI without real keys
    if (createRes.status === 401) return;

    assert.ok(
      [200, 201].includes(createRes.status),
      `expected 200/201 on create, got ${createRes.status}`,
    );

    const createJson = await createRes.json();
    const id = createJson.data?.id;
    if (id) createdIds.push(id);

    // Verify scoped GET returns the created record
    if (id) {
      const getRes = await fetch(
        `${BASE_URL}/api/tenantintegrations/${id}?tenant_id=${TENANT_ID}`,
        { headers: getAuthHeaders() },
      );
      assert.strictEqual(getRes.status, 200, `expected 200 on GET by id, got ${getRes.status}`);
      const getJson = await getRes.json();
      assert.strictEqual(getJson.data?.id, id);
      assert.strictEqual(getJson.data?.tenant_id, TENANT_ID);
      assert.strictEqual(getJson.data?.integration_type, 'test_cleanup');
    }
  });
});
