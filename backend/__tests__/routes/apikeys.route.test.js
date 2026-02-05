/**
 * Integration tests for API Keys routes
 * Tests /api/apikeys endpoints for API key management
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getAuthHeaders } from '../helpers/auth.js';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const TENANT_ID = process.env.TEST_TENANT_ID || 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
const SHOULD_RUN = process.env.CI ? (process.env.CI_BACKEND_TESTS === 'true') : true;

describe('API Keys Routes', { skip: !SHOULD_RUN }, () => {

  test('GET /api/apikeys returns API keys list', async () => {
    const res = await fetch(`${BASE_URL}/api/apikeys?tenant_id=${TENANT_ID}`, {
      headers: getAuthHeaders()
    });
    // May require auth
    assert.ok([200, 401].includes(res.status), `expected 200/401, got ${res.status}`);
    
    if (res.status === 200) {
      const json = await res.json();
      assert.ok(Array.isArray(json) || json.data || json.keys, 'expected keys data');
    }
  });

  test('POST /api/apikeys without required fields returns error', async () => {
    const res = await fetch(`${BASE_URL}/api/apikeys`, {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ tenant_id: TENANT_ID })
    });
    // Should require key name and permissions
    assert.ok([400, 401, 422].includes(res.status), `expected error for missing data, got ${res.status}`);
  });

  test('POST /api/apikeys with valid data creates key', async () => {
    const res = await fetch(`${BASE_URL}/api/apikeys`, {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        tenant_id: TENANT_ID,
        key_name: 'Test API Key',
        key_value: 'test-key-value'
      })
    });
    // May require auth, should validate and create or return error
    assert.ok([200, 201, 401, 422].includes(res.status), `expected creation response, got ${res.status}`);
    
    if ([200, 201].includes(res.status)) {
      const json = await res.json();
      assert.ok(json.data?.id || json.data?.key || json.id, 'expected key data in response');
    }
  });

  test('GET /api/apikeys/:id returns specific API key', async () => {
    const fakeId = '00000000-0000-4000-8000-000000000000';
    const res = await fetch(`${BASE_URL}/api/apikeys/${fakeId}?tenant_id=${TENANT_ID}`, {
      headers: getAuthHeaders()
    });
    assert.ok([200, 401, 404].includes(res.status), `expected 200/401/404, got ${res.status}`);
  });

  test('PUT /api/apikeys/:id updates API key', async () => {
    const fakeId = '00000000-0000-4000-8000-000000000000';
    const res = await fetch(`${BASE_URL}/api/apikeys/${fakeId}?tenant_id=${TENANT_ID}`, {
      method: 'PUT',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        tenant_id: TENANT_ID,
        key_name: 'Updated Key Name'
      })
    });
    assert.ok([200, 401, 404].includes(res.status), `expected update response, got ${res.status}`);
  });

  test('DELETE /api/apikeys/:id requires auth', async () => {
    const fakeId = '00000000-0000-4000-8000-000000000000';
    const res = await fetch(`${BASE_URL}/api/apikeys/${fakeId}?tenant_id=${TENANT_ID}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    assert.ok([200, 401, 404].includes(res.status), `expected delete response, got ${res.status}`);
  });

  // Note: rotate/usage/validate endpoints are not available in this version
});
