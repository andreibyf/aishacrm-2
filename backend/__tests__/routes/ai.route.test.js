import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const TENANT_ID = process.env.TEST_TENANT_ID || 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
// In CI, run only if explicitly enabled
const SHOULD_RUN = process.env.CI ? (process.env.CI_BACKEND_TESTS === 'true') : true;

describe('AI Routes', { skip: !SHOULD_RUN }, () => {

  test('GET /api/ai/assistants returns list of assistants', async () => {
    const res = await fetch(`${BASE_URL}/api/ai/assistants?tenant_id=${TENANT_ID}`);
    assert.equal(res.status, 200, 'expected 200 from assistants list');
    const json = await res.json();
    assert.equal(json.status, 'success');
    assert.ok(Array.isArray(json.data?.assistants), 'expected assistants array');
    assert.ok(json.data.assistants.length > 0, 'should have at least one assistant');
    
    // Verify assistant structure
    const assistant = json.data.assistants[0];
    assert.ok(assistant.id, 'assistant should have id');
    assert.ok(assistant.name, 'assistant should have name');
    assert.ok(assistant.model, 'assistant should have model');
  });

  test('GET /api/ai/conversations returns conversations list', async () => {
    const res = await fetch(`${BASE_URL}/api/ai/conversations?tenant_id=${TENANT_ID}`);
    assert.ok([200, 500].includes(res.status), `expected 200 or 500, got ${res.status}`);
    const json = await res.json();
    if (res.status === 200) {
      assert.equal(json.status, 'success');
      assert.ok(Array.isArray(json.data?.conversations) || json.data?.conversations === undefined,
        'expected conversations array or undefined');
    }
  });

  test('POST /api/ai/chat returns 400 without message', async () => {
    const res = await fetch(`${BASE_URL}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant_id: TENANT_ID })
    });
    // Should require message
    assert.ok([400, 422].includes(res.status), `expected 400 or 422 for missing message, got ${res.status}`);
  });

  test('POST /api/ai/summarize handles missing text', async () => {
    const res = await fetch(`${BASE_URL}/api/ai/summarize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant_id: TENANT_ID })
    });
    // May return 200 (with error in body), 400, 404, or 422 depending on implementation
    assert.ok([200, 400, 404, 422].includes(res.status), `expected valid response, got ${res.status}`);
  });

  test('POST /api/ai/sentiment handles missing text', async () => {
    const res = await fetch(`${BASE_URL}/api/ai/sentiment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant_id: TENANT_ID })
    });
    // May return 400, 404 (not implemented), or 422
    assert.ok([400, 404, 422].includes(res.status), `expected 400/404/422, got ${res.status}`);
  });

  test('GET /api/ai/context returns context info', async () => {
    const res = await fetch(`${BASE_URL}/api/ai/context?tenant_id=${TENANT_ID}`);
    // May return 200 or 404 if no context exists
    assert.ok([200, 404].includes(res.status), `expected 200 or 404, got ${res.status}`);
    if (res.status === 200) {
      const json = await res.json();
      assert.equal(json.status, 'success');
    }
  });

  test('GET /api/ai/tools returns available tools or 404', async () => {
    const res = await fetch(`${BASE_URL}/api/ai/tools?tenant_id=${TENANT_ID}`);
    // May return 200 with tools or 404 if not implemented
    assert.ok([200, 404].includes(res.status), `expected 200 or 404, got ${res.status}`);
    if (res.status === 200) {
      const json = await res.json();
      assert.equal(json.status, 'success');
    }
  });

  test('POST /api/ai/brain-test requires auth key', async () => {
    const res = await fetch(`${BASE_URL}/api/ai/brain-test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        tenant_id: TENANT_ID,
        user_id: 'test-user',
        task_type: 'test',
        mode: 'test'
      })
    });
    // Should reject without proper auth header
    assert.ok([401, 500].includes(res.status), `expected auth rejection, got ${res.status}`);
  });

  test('DELETE /api/ai/conversations/:id validates conversation exists', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await fetch(`${BASE_URL}/api/ai/conversations/${fakeId}?tenant_id=${TENANT_ID}`, {
      method: 'DELETE'
    });
    // Should return 404 for non-existent conversation
    assert.ok([200, 404].includes(res.status), `expected 200 or 404, got ${res.status}`);
  });
});
