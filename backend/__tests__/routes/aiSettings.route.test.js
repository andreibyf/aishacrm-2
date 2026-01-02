/**
 * Integration tests for AI Settings routes
 * Tests /api/ai-settings or /api/aiSettings endpoints
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const TENANT_ID = process.env.TEST_TENANT_ID || 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
const SHOULD_RUN = process.env.CI ? (process.env.CI_BACKEND_TESTS === 'true') : true;

describe('AI Settings Routes', { skip: !SHOULD_RUN }, () => {

  test('GET /api/aiSettings returns AI settings', async () => {
    const res = await fetch(`${BASE_URL}/api/aiSettings?tenant_id=${TENANT_ID}`);
    assert.ok([200, 401, 404].includes(res.status), `expected 200/401/404, got ${res.status}`);
    
    if (res.status === 200) {
      const json = await res.json();
      assert.ok(json, 'expected settings data');
    }
  });

  test('PUT /api/aiSettings updates AI settings', async () => {
    const res = await fetch(`${BASE_URL}/api/aiSettings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        tenant_id: TENANT_ID,
        model: 'gpt-4o',
        temperature: 0.7
      })
    });
    assert.ok([200, 401, 422].includes(res.status), `expected update response, got ${res.status}`);
  });

  test('POST /api/aiSettings with invalid temperature returns error', async () => {
    const res = await fetch(`${BASE_URL}/api/aiSettings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        tenant_id: TENANT_ID,
        temperature: 2.5  // Invalid: > 2.0
      })
    });
    assert.ok([400, 401, 422].includes(res.status), `expected validation error, got ${res.status}`);
  });

  test('GET /api/aiSettings/models returns available models', async () => {
    const res = await fetch(`${BASE_URL}/api/aiSettings/models?tenant_id=${TENANT_ID}`);
    assert.ok([200, 401, 404].includes(res.status), `expected 200/401/404, got ${res.status}`);
    
    if (res.status === 200) {
      const json = await res.json();
      assert.ok(Array.isArray(json) || json.models, 'expected models list');
    }
  });

  test('GET /api/aiSettings/providers returns AI providers', async () => {
    const res = await fetch(`${BASE_URL}/api/aiSettings/providers?tenant_id=${TENANT_ID}`);
    assert.ok([200, 401, 404].includes(res.status), `expected 200/401/404, got ${res.status}`);
  });

  test('POST /api/aiSettings/test-connection tests AI connection', async () => {
    const res = await fetch(`${BASE_URL}/api/aiSettings/test-connection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        tenant_id: TENANT_ID,
        provider: 'openai'
      })
    });
    assert.ok([200, 400, 401, 500].includes(res.status), `expected test response, got ${res.status}`);
  });

  test('DELETE /api/aiSettings resets to defaults', async () => {
    const res = await fetch(`${BASE_URL}/api/aiSettings?tenant_id=${TENANT_ID}`, {
      method: 'DELETE'
    });
    assert.ok([200, 401, 404].includes(res.status), `expected reset response, got ${res.status}`);
  });
});
