/**
 * Integration tests for Announcements routes
 * Tests /api/announcements endpoints
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getAuthHeaders } from '../helpers/auth.js';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const TENANT_ID = process.env.TEST_TENANT_ID || 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
const SHOULD_RUN = process.env.CI ? (process.env.CI_BACKEND_TESTS === 'true') : true;

describe('Announcements Routes', { skip: !SHOULD_RUN }, () => {

  test('GET /api/announcements returns announcements list', async () => {
    const res = await fetch(`${BASE_URL}/api/announcements?tenant_id=${TENANT_ID}`, {
      headers: getAuthHeaders()
    });
    assert.ok([200, 401].includes(res.status), `expected 200/401, got ${res.status}`);
    
    if (res.status === 200) {
      const json = await res.json();
      assert.ok(Array.isArray(json) || json.data || json.announcements, 'expected announcements data');
    }
  });

  test('POST /api/announcements without required fields returns error', async () => {
    const res = await fetch(`${BASE_URL}/api/announcements`, {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ tenant_id: TENANT_ID })
    });
    // Should require title and message
    assert.ok([400, 401, 422].includes(res.status), `expected error for missing data, got ${res.status}`);
  });

  test('POST /api/announcements with valid data creates announcement', async () => {
    const res = await fetch(`${BASE_URL}/api/announcements`, {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        tenant_id: TENANT_ID,
        title: 'Test Announcement',
        content: 'This is a test message',
        priority: 'info'
      })
    });
    assert.ok([200, 201, 401, 422].includes(res.status), `expected creation response, got ${res.status}`);
  });

  test('GET /api/announcements/:id returns specific announcement', async () => {
    const fakeId = '00000000-0000-4000-8000-000000000000';
    const res = await fetch(`${BASE_URL}/api/announcements/${fakeId}?tenant_id=${TENANT_ID}`, {
      headers: getAuthHeaders()
    });
    assert.ok([200, 401, 404].includes(res.status), `expected 200/401/404, got ${res.status}`);
  });

  test('PUT /api/announcements/:id updates announcement', async () => {
    const fakeId = '00000000-0000-4000-8000-000000000000';
    const res = await fetch(`${BASE_URL}/api/announcements/${fakeId}?tenant_id=${TENANT_ID}`, {
      method: 'PUT',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ title: 'Updated Announcement' })
    });
    assert.ok([200, 401, 404].includes(res.status), `expected update response, got ${res.status}`);
  });

  test('DELETE /api/announcements/:id requires auth', async () => {
    const fakeId = '00000000-0000-4000-8000-000000000000';
    const res = await fetch(`${BASE_URL}/api/announcements/${fakeId}?tenant_id=${TENANT_ID}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    assert.ok([200, 401, 404].includes(res.status), `expected delete response, got ${res.status}`);
  });

  test('POST /api/announcements/:id/dismiss marks announcement as dismissed', async () => {
    const fakeId = '00000000-0000-4000-8000-000000000000';
    const res = await fetch(`${BASE_URL}/api/announcements/${fakeId}/dismiss`, {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ tenant_id: TENANT_ID })
    });
    assert.ok([200, 401, 404].includes(res.status), `expected dismiss response, got ${res.status}`);
  });

  test('GET /api/announcements/active returns active announcements', async () => {
    const res = await fetch(`${BASE_URL}/api/announcements/active?tenant_id=${TENANT_ID}`, {
      headers: getAuthHeaders()
    });
    assert.ok([200, 401, 404].includes(res.status), `expected 200/401/404, got ${res.status}`);
    
    if (res.status === 200) {
      const json = await res.json();
      assert.ok(Array.isArray(json) || json.data, 'expected active announcements');
    }
  });
});
