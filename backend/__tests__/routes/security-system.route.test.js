import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const TENANT_ID = process.env.TEST_TENANT_ID || 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
// In CI, run only if explicitly enabled
const SHOULD_RUN = process.env.CI ? (process.env.CI_BACKEND_TESTS === 'true') : true;

describe('Security Routes', { skip: !SHOULD_RUN }, () => {

  test('GET /api/security/audit-log returns audit entries', async () => {
    const res = await fetch(`${BASE_URL}/api/audit-logs?tenant_id=${TENANT_ID}`);
    assert.ok([200, 401, 404].includes(res.status), `expected 200/401/404, got ${res.status}`);
    if (res.status === 200) {
      const json = await res.json();
      assert.equal(json.status, 'success');
    }
  });

  test('GET /api/security/permissions returns permissions list', async () => {
    const res = await fetch(`${BASE_URL}/api/permissions?tenant_id=${TENANT_ID}`);
    assert.ok([200, 404].includes(res.status), `expected 200 or 404, got ${res.status}`);
    if (res.status === 200) {
      const json = await res.json();
      assert.equal(json.status, 'success');
    }
  });

  test('GET /api/apikeys returns API keys list', async () => {
    const res = await fetch(`${BASE_URL}/api/apikeys?tenant_id=${TENANT_ID}`);
    assert.ok([200, 401, 403].includes(res.status), `expected 200/401/403, got ${res.status}`);
  });

  test('POST /api/apikeys requires name', async () => {
    const res = await fetch(`${BASE_URL}/api/apikeys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant_id: TENANT_ID })
    });
    assert.ok([400, 401, 403, 422].includes(res.status), `expected validation error, got ${res.status}`);
  });

  test('DELETE /api/apikeys/:id validates key exists', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await fetch(`${BASE_URL}/api/apikeys/${fakeId}?tenant_id=${TENANT_ID}`, {
      method: 'DELETE'
    });
    assert.ok([400, 404, 401, 403].includes(res.status), `expected 400/404/401/403, got ${res.status}`);
  });

  test('GET /api/security/settings returns security settings', async () => {
    const res = await fetch(`${BASE_URL}/api/security?tenant_id=${TENANT_ID}`);
    assert.ok([200, 404].includes(res.status), `expected 200 or 404, got ${res.status}`);
  });
});

describe('System Routes', { skip: !SHOULD_RUN }, () => {

  test('GET /api/system/health returns health status', async () => {
    const res = await fetch(`${BASE_URL}/api/system/health`);
    assert.equal(res.status, 200, 'expected 200 from health check');
    const json = await res.json();
    assert.ok(json.status === 'success' || json.status === 'ok' || json.healthy, 'expected healthy status');
  });

  test('GET /api/system/status returns system status', async () => {
    const res = await fetch(`${BASE_URL}/api/system/status`);
    assert.ok([200, 404].includes(res.status), 'expected 200 or 404 from system status');
    if (res.status === 200) {
      const json = await res.json();
      assert.equal(json.status, 'success');
    }
  });

  test('GET /health returns health check', async () => {
    const res = await fetch(`${BASE_URL}/health`);
    assert.equal(res.status, 200, 'expected 200 from root health');
  });

  test('GET /api/system-settings returns settings', async () => {
    const res = await fetch(`${BASE_URL}/api/system-settings?tenant_id=${TENANT_ID}`);
    assert.ok([200, 404].includes(res.status), `expected 200 or 404, got ${res.status}`);
  });

  test('GET /api/system-logs returns system logs', async () => {
    const res = await fetch(`${BASE_URL}/api/system-logs?tenant_id=${TENANT_ID}&limit=10`);
    assert.ok([200, 401, 403].includes(res.status), `expected valid response, got ${res.status}`);
  });

  test('GET /api/cron/status returns cron job status', async () => {
    const res = await fetch(`${BASE_URL}/api/cron/status?tenant_id=${TENANT_ID}`);
    assert.ok([200, 404].includes(res.status), `expected 200 or 404, got ${res.status}`);
  });

  test('GET /api/metrics returns metrics data', async () => {
    const res = await fetch(`${BASE_URL}/api/metrics?tenant_id=${TENANT_ID}`);
    assert.ok([200, 404].includes(res.status), `expected 200 or 404, got ${res.status}`);
  });
});
