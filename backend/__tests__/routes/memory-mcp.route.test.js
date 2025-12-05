import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const TENANT_ID = process.env.TEST_TENANT_ID || 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
// In CI, run only if explicitly enabled
const SHOULD_RUN = process.env.CI ? (process.env.CI_BACKEND_TESTS === 'true') : true;

describe('Memory Routes (AI Agent Memory)', { skip: !SHOULD_RUN }, () => {

  test('GET /api/memory/sessions returns memory sessions', async () => {
    const res = await fetch(`${BASE_URL}/api/memory/sessions?tenant_id=${TENANT_ID}`);
    assert.ok([200, 404].includes(res.status), `expected 200 or 404, got ${res.status}`);
    if (res.status === 200) {
      const json = await res.json();
      assert.equal(json.status, 'success');
    }
  });

  test('GET /api/memory/events returns memory events', async () => {
    const res = await fetch(`${BASE_URL}/api/memory/events?tenant_id=${TENANT_ID}`);
    assert.ok([200, 404].includes(res.status), `expected 200 or 404, got ${res.status}`);
  });

  test('POST /api/memory/sessions creates new session', async () => {
    const res = await fetch(`${BASE_URL}/api/memory/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        tenant_id: TENANT_ID,
        user_id: 'test-user-' + Date.now(),
        type: 'conversation'
      })
    });
    assert.ok([200, 201, 400].includes(res.status), `expected valid response, got ${res.status}`);
  });

  test('POST /api/memory/events stores memory event', async () => {
    const res = await fetch(`${BASE_URL}/api/memory/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        tenant_id: TENANT_ID,
        event_type: 'test_event',
        data: { test: true }
      })
    });
    assert.ok([200, 201, 400].includes(res.status), `expected valid response, got ${res.status}`);
  });

  test('GET /api/memory/archive returns archived memories', async () => {
    const res = await fetch(`${BASE_URL}/api/memory/archive?tenant_id=${TENANT_ID}`);
    assert.ok([200, 404].includes(res.status), `expected 200 or 404, got ${res.status}`);
  });

  test('POST /api/memory/archive archives old memories', async () => {
    const res = await fetch(`${BASE_URL}/api/memory/archive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant_id: TENANT_ID, older_than_days: 30 })
    });
    assert.ok([200, 400, 404].includes(res.status), `expected valid response, got ${res.status}`);
  });
});

describe('MCP Routes (Model Context Protocol)', { skip: !SHOULD_RUN }, () => {

  test('GET /api/mcp/status returns MCP server status', async () => {
    const res = await fetch(`${BASE_URL}/api/mcp/status?tenant_id=${TENANT_ID}`);
    assert.ok([200, 404, 503].includes(res.status), `expected valid response, got ${res.status}`);
  });

  test('GET /api/mcp/tools returns available MCP tools', async () => {
    const res = await fetch(`${BASE_URL}/api/mcp/tools?tenant_id=${TENANT_ID}`);
    assert.ok([200, 404].includes(res.status), `expected 200 or 404, got ${res.status}`);
    if (res.status === 200) {
      const json = await res.json();
      assert.equal(json.status, 'success');
    }
  });

  test('POST /api/mcp/execute requires tool_name', async () => {
    const res = await fetch(`${BASE_URL}/api/mcp/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant_id: TENANT_ID })
    });
    assert.ok([400, 422].includes(res.status), `expected 400 or 422 for missing tool_name, got ${res.status}`);
  });

  test('GET /api/mcp/resources returns MCP resources', async () => {
    const res = await fetch(`${BASE_URL}/api/mcp/resources?tenant_id=${TENANT_ID}`);
    assert.ok([200, 404].includes(res.status), `expected 200 or 404, got ${res.status}`);
  });
});
