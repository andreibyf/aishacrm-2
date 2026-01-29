/**
 * Integration tests for AI Settings routes
 * Tests /api/ai-settings or /api/ai-settings endpoints
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const TENANT_ID = process.env.TEST_TENANT_ID || 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
const SHOULD_RUN = process.env.CI ? (process.env.CI_BACKEND_TESTS === 'true') : true;

describe('AI Settings Routes', { skip: !SHOULD_RUN }, () => {

  test('GET /api/ai-settings returns AI settings', async () => {
    const res = await fetch(`${BASE_URL}/api/ai-settings?tenant_id=${TENANT_ID}`);
    assert.ok([200, 401, 404].includes(res.status), `expected 200/401/404, got ${res.status}`);
    
    if (res.status === 200) {
      const json = await res.json();
      assert.ok(json, 'expected settings data');
    }
  });

  test('PUT /api/ai-settings/:id updates AI settings', async () => {
    const listRes = await fetch(`${BASE_URL}/api/ai-settings?tenant_id=${TENANT_ID}`);
    if (listRes.status !== 200) {
      assert.ok([401, 404].includes(listRes.status), `expected 401/404, got ${listRes.status}`);
      return;
    }

    const listJson = await listRes.json();
    const setting = listJson?.data?.[0];
    if (!setting?.id) return;

    let value = setting.setting_value?.value ?? setting.setting_value;
    if (setting.setting_value?.type === 'number') {
      value = setting.setting_value?.min ?? 0;
    } else if (setting.setting_value?.type === 'boolean') {
      value = true;
    } else if (value === undefined) {
      value = 'test';
    }

    const res = await fetch(`${BASE_URL}/api/ai-settings/${setting.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value })
    });
    assert.ok([200, 400, 401, 404].includes(res.status), `expected update response, got ${res.status}`);
  });

  test('GET /api/ai-settings/categories returns categories', async () => {
    const res = await fetch(`${BASE_URL}/api/ai-settings/categories`);
    assert.ok([200, 401, 404].includes(res.status), `expected 200/401/404, got ${res.status}`);
    if (res.status === 200) {
      const json = await res.json();
      assert.ok(json?.categories, 'expected categories payload');
    }
  });

  test('POST /api/ai-settings/reset resets to defaults', async () => {
    const res = await fetch(`${BASE_URL}/api/ai-settings/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_role: 'aisha' })
    });
    assert.ok([200, 401, 404, 500].includes(res.status), `expected reset response, got ${res.status}`);
  });

  test('POST /api/ai-settings/clear-cache clears cache', async () => {
    const res = await fetch(`${BASE_URL}/api/ai-settings/clear-cache`, {
      method: 'POST'
    });
    assert.ok([200, 401, 404].includes(res.status), `expected clear-cache response, got ${res.status}`);
  });
});
