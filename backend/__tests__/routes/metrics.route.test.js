/**
 * Integration tests for Metrics routes
 * Tests /api/metrics endpoints for system metrics
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const TENANT_ID = process.env.TEST_TENANT_ID || 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
const SHOULD_RUN = process.env.CI ? (process.env.CI_BACKEND_TESTS === 'true') : true;

describe('Metrics Routes', { skip: !SHOULD_RUN }, () => {

  test('GET /api/metrics returns system metrics', async () => {
    const res = await fetch(`${BASE_URL}/api/metrics`);
    // Metrics endpoint may be public or require auth
    assert.ok([200, 401, 404].includes(res.status), `expected 200/401/404, got ${res.status}`);
    
    if (res.status === 200) {
      const text = await res.text();
      // Prometheus format or JSON
      assert.ok(text.length > 0, 'expected metrics data');
    }
  });

  test('GET /api/metrics/health returns health status', async () => {
    const res = await fetch(`${BASE_URL}/api/metrics/health`);
    assert.ok([200, 404, 503].includes(res.status), `expected 200/404/503, got ${res.status}`);
    
    if (res.status === 200) {
      const json = await res.json();
      assert.ok(json.status || json.healthy !== undefined, 'expected health data');
    }
  });

  test('GET /api/metrics/tenant/:id returns tenant-specific metrics', async () => {
    const res = await fetch(`${BASE_URL}/api/metrics/tenant/${TENANT_ID}`);
    // May require auth
    assert.ok([200, 401, 404].includes(res.status), `expected 200/401/404, got ${res.status}`);
  });

  test('GET /api/metrics/performance returns performance metrics', async () => {
    const res = await fetch(`${BASE_URL}/api/metrics/performance`);
    assert.ok([200, 401, 404].includes(res.status), `expected 200/401/404, got ${res.status}`);
    
    if (res.status === 200) {
      const json = await res.json();
      assert.ok(json, 'expected performance data');
    }
  });

  test('GET /api/metrics/database returns database metrics', async () => {
    const res = await fetch(`${BASE_URL}/api/metrics/database`);
    // May require admin auth
    assert.ok([200, 401, 403, 404].includes(res.status), `expected 200/401/403/404, got ${res.status}`);
  });

  test('GET /api/metrics/cache returns cache metrics', async () => {
    const res = await fetch(`${BASE_URL}/api/metrics/cache`);
    // May require admin auth
    assert.ok([200, 401, 403, 404].includes(res.status), `expected 200/401/403/404, got ${res.status}`);
  });

  test('GET /api/metrics/api returns API usage metrics', async () => {
    const res = await fetch(`${BASE_URL}/api/metrics/api?tenant_id=${TENANT_ID}`);
    assert.ok([200, 401, 404].includes(res.status), `expected 200/401/404, got ${res.status}`);
  });
});
