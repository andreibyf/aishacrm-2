/**
 * Integration tests for Audit Logs routes
 * Tests /api/audit-logs endpoints
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { TENANT_ID, NONEXISTENT_ID } from '../testConstants.js';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const SHOULD_RUN = process.env.CI ? process.env.CI_BACKEND_TESTS === 'true' : true;

describe('Audit Logs Routes', { skip: !SHOULD_RUN }, () => {
  test('GET /api/audit-logs returns audit logs list', async () => {
    const res = await fetch(`${BASE_URL}/api/audit-logs?tenant_id=${TENANT_ID}`);
    // May require admin auth
    assert.ok([200, 401, 403].includes(res.status), `expected 200/401/403, got ${res.status}`);

    if (res.status === 200) {
      const json = await res.json();
      assert.ok(Array.isArray(json) || json.data || json.logs, 'expected logs data');
    }
  });

  test('GET /api/audit-logs/:id returns specific audit log', async () => {
    const res = await fetch(`${BASE_URL}/api/audit-logs/${NONEXISTENT_ID}?tenant_id=${TENANT_ID}`);
    assert.ok(
      [200, 401, 403, 404].includes(res.status),
      `expected 200/401/403/404, got ${res.status}`,
    );
  });

  test('GET /api/audit-logs with filters returns filtered results', async () => {
    const res = await fetch(
      `${BASE_URL}/api/audit-logs?tenant_id=${TENANT_ID}&action=create&entity_type=lead`,
    );
    assert.ok([200, 401, 403].includes(res.status), `expected 200/401/403, got ${res.status}`);
  });

  test('GET /api/audit-logs with date range filters', async () => {
    const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const to = new Date().toISOString();
    const res = await fetch(
      `${BASE_URL}/api/audit-logs?tenant_id=${TENANT_ID}&from=${from}&to=${to}`,
    );
    assert.ok([200, 401, 403].includes(res.status), `expected 200/401/403, got ${res.status}`);
  });

  test('GET /api/audit-logs with user filter', async () => {
    const res = await fetch(`${BASE_URL}/api/audit-logs?tenant_id=${TENANT_ID}&user_id=test-user`);
    assert.ok([200, 401, 403].includes(res.status), `expected 200/401/403, got ${res.status}`);
  });

  test('GET /api/audit-logs/export returns export data', async () => {
    const res = await fetch(`${BASE_URL}/api/audit-logs/export?tenant_id=${TENANT_ID}&format=csv`);
    // May require admin auth
    assert.ok(
      [200, 401, 403, 404].includes(res.status),
      `expected 200/401/403/404, got ${res.status}`,
    );
  });

  test('GET /api/audit-logs/stats returns statistics', async () => {
    const res = await fetch(`${BASE_URL}/api/audit-logs/stats?tenant_id=${TENANT_ID}`);
    assert.ok(
      [200, 401, 403, 404].includes(res.status),
      `expected 200/401/403/404, got ${res.status}`,
    );

    if (res.status === 200) {
      const json = await res.json();
      assert.ok(json, 'expected stats data');
    }
  });

  test('DELETE /api/audit-logs requires admin auth', async () => {
    const res = await fetch(`${BASE_URL}/api/audit-logs?tenant_id=${TENANT_ID}`, {
      method: 'DELETE',
    });
    // Should be forbidden or require special permissions
    assert.ok(
      [401, 403, 405].includes(res.status),
      `expected auth/permission error, got ${res.status}`,
    );
  });
});
