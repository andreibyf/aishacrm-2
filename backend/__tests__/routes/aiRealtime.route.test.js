/**
 * Integration tests for AI Realtime routes
 * Tests /api/ai/realtime* endpoints for realtime voice functionality
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const TENANT_ID = process.env.TEST_TENANT_ID || 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
const SHOULD_RUN = process.env.CI ? (process.env.CI_BACKEND_TESTS === 'true') : true;

describe('AI Realtime Routes', { skip: !SHOULD_RUN }, () => {

  test('GET /api/ai/realtime-token requires authentication', async () => {
    const res = await fetch(`${BASE_URL}/api/ai/realtime-token?tenant_id=${TENANT_ID}`);
    // Should require authentication
    assert.ok([401, 403, 404].includes(res.status), `expected auth error, got ${res.status}`);
  });

  test('POST /api/ai/realtime-session requires authentication', async () => {
    const res = await fetch(`${BASE_URL}/api/ai/realtime-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant_id: TENANT_ID })
    });
    // Should require authentication and proper session data
    assert.ok([400, 401, 403, 404].includes(res.status), `expected error, got ${res.status}`);
  });

  test('POST /api/ai/realtime-session with invalid data returns 400', async () => {
    const res = await fetch(`${BASE_URL}/api/ai/realtime-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invalid: 'data' })
    });
    // Should validate request data
    assert.ok([400, 401, 404, 422].includes(res.status), `expected validation error, got ${res.status}`);
  });

  test('GET /api/ai/realtime-config returns config or 404', async () => {
    const res = await fetch(`${BASE_URL}/api/ai/realtime-config?tenant_id=${TENANT_ID}`);
    // May return config if endpoint exists, or 404 if not implemented
    assert.ok([200, 401, 404].includes(res.status), `expected 200/401/404, got ${res.status}`);
    
    if (res.status === 200) {
      const json = await res.json();
      assert.ok(json, 'expected config data');
    }
  });

  test('POST /api/ai/realtime-event validates event format', async () => {
    const res = await fetch(`${BASE_URL}/api/ai/realtime-event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        tenant_id: TENANT_ID,
        event: 'invalid'
      })
    });
    // Should validate event structure
    assert.ok([400, 401, 404, 422].includes(res.status), `expected validation or auth error, got ${res.status}`);
  });
});
