import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getAuthHeaders } from '../helpers/auth.js';
import { TENANT_ID, NONEXISTENT_ID } from '../testConstants.js';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3001';

async function isBackendReachable() {
  try {
    const res = await fetch(`${BASE_URL}/api/system/health`);
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

const SHOULD_RUN =
  (process.env.CI ? process.env.CI_BACKEND_TESTS === 'true' : true) && (await isBackendReachable());

describe('AI Chat Draft Email Route', { skip: !SHOULD_RUN }, () => {
  test('POST /api/ai/chat-draft-email validates required fields', async () => {
    const res = await fetch(`${BASE_URL}/api/ai/chat-draft-email`, {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tenant_id: TENANT_ID,
      }),
    });

    assert.notEqual(res.status, 404, 'route should be mounted');
    assert.ok(
      [400, 401, 403].includes(res.status),
      `expected validation/auth rejection, got ${res.status}`,
    );

    if (res.status === 400) {
      const json = await res.json();
      assert.equal(json.status, 'error');
      assert.equal(json.message, 'entity_type, entity_id, and prompt are required');
    }
  });

  test('POST /api/ai/chat-draft-email rejects unsupported entity types', async () => {
    const res = await fetch(`${BASE_URL}/api/ai/chat-draft-email`, {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tenant_id: TENANT_ID,
        entity_type: 'task',
        entity_id: NONEXISTENT_ID,
        prompt: 'Draft a follow-up email.',
      }),
    });

    assert.notEqual(res.status, 404, 'route should be mounted');
    assert.ok(
      [400, 401, 403].includes(res.status),
      `expected unsupported-entity/auth rejection, got ${res.status}`,
    );

    if (res.status === 400) {
      const json = await res.json();
      assert.equal(json.status, 'error');
      assert.equal(json.message, 'Unsupported entity_type for chat-driven email drafting');
    }
  });
});
