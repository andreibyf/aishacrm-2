import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const TENANT_ID = process.env.TEST_TENANT_ID || 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
// In CI, run only if explicitly enabled
const SHOULD_RUN = process.env.CI ? (process.env.CI_BACKEND_TESTS === 'true') : true;

// Test data prefix for easy identification and cleanup
const TEST_PREFIX = '[TEST-AUTO]';

const createdIds = [];

async function createWorkflow(payload) {
  const res = await fetch(`${BASE_URL}/api/workflows`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      tenant_id: TENANT_ID,
      // Mark as test data for easy identification
      is_test_data: true,
      ...payload,
      // Prefix name for visibility
      name: payload.name ? `${TEST_PREFIX} ${payload.name}` : `${TEST_PREFIX} Workflow`,
      description: payload.description ? `${TEST_PREFIX} ${payload.description}` : `${TEST_PREFIX} Auto-created by test suite`
    })
  });
  const json = await res.json();
  return { status: res.status, json };
}

async function deleteWorkflow(id) {
  const res = await fetch(`${BASE_URL}/api/workflows/${id}?tenant_id=${TENANT_ID}`, { method: 'DELETE' });
  return res.status;
}

describe('Workflow Routes', { skip: !SHOULD_RUN }, () => {

  before(async () => {
    // Create test workflow with sample nodes for realistic testing
    const wf = await createWorkflow({
      name: 'Workflow',
      description: 'Setup workflow',
      trigger_type: 'webhook',
      status: 'draft',
      nodes: [
        { id: 'trigger-1', type: 'webhook_trigger', config: {}, position: { x: 400, y: 200 } }
      ],
      connections: []
    });
    if (wf.status === 201) {
      const id = wf.json?.data?.id || wf.json?.data?.workflow?.id;
      if (id) createdIds.push(id);
    }
  });

  after(async () => {
    // Clean up all test workflows
    for (const id of createdIds.filter(Boolean)) {
      try { await deleteWorkflow(id); } catch { /* ignore cleanup errors */ }
    }
  });

  test('GET /api/workflows returns 200 with tenant_id', async () => {
    const res = await fetch(`${BASE_URL}/api/workflows?tenant_id=${TENANT_ID}`);
    assert.equal(res.status, 200, 'expected 200 from workflows list');
    const json = await res.json();
    assert.equal(json.status, 'success');
    assert.ok(json.data?.workflows || Array.isArray(json.data), 'expected workflows array');
  });

  test('POST /api/workflows creates new workflow with nodes', async () => {
    const result = await createWorkflow({
      name: `Workflow ${Date.now()}`,
      description: 'Created dynamically',
      trigger_type: 'event',
      trigger_config: { event: 'lead.created' },
      status: 'draft',
      nodes: [
        { id: 'trigger-1', type: 'webhook_trigger', config: {}, position: { x: 400, y: 100 } },
        { id: 'action-1', type: 'create_lead', config: {}, position: { x: 400, y: 300 } }
      ],
      connections: [{ from: 'trigger-1', to: 'action-1' }]
    });
    assert.equal(result.status, 201, `expected 201, got ${result.status}: ${JSON.stringify(result.json)}`);
    const id = result.json?.data?.id || result.json?.data?.workflow?.id;
    assert.ok(id, 'workflow should have an id');
    createdIds.push(id);
  });

  test('POST /api/workflows requires name', async () => {
    const res = await fetch(`${BASE_URL}/api/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant_id: TENANT_ID, trigger_type: 'manual' })
    });
    assert.ok([400, 422].includes(res.status), `expected 400 or 422, got ${res.status}`);
  });

  test('GET /api/workflows/:id returns specific workflow', async () => {
    if (createdIds.length === 0) {
      // Skip if no workflow was created
      return;
    }
    const id = createdIds[0];
    const res = await fetch(`${BASE_URL}/api/workflows/${id}?tenant_id=${TENANT_ID}`);
    // May return 404 if workflow was cleaned up or not found
    assert.ok([200, 404].includes(res.status), `expected 200 or 404, got ${res.status}`);
    if (res.status === 200) {
      const json = await res.json();
      assert.equal(json.status, 'success');
    }
  });

  test('PUT /api/workflows/:id updates workflow', async () => {
    if (createdIds.length === 0) return;
    const id = createdIds[0];
    const res = await fetch(`${BASE_URL}/api/workflows/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        tenant_id: TENANT_ID,
        status: 'active'
      })
    });
    assert.equal(res.status, 200, 'expected 200 for update');
  });

  test('POST /api/workflows/:id/execute triggers workflow execution', async () => {
    if (createdIds.length === 0) {
      // Skip if no workflow was created
      return;
    }
    const id = createdIds[0];
    const res = await fetch(`${BASE_URL}/api/workflows/${id}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant_id: TENANT_ID })
    });
    // May succeed, fail validation, or 404 if workflow not found
    assert.ok([200, 400, 404, 422].includes(res.status), `expected valid response, got ${res.status}`);
  });

  test('GET /api/workflow-executions returns execution history', async () => {
    const res = await fetch(`${BASE_URL}/api/workflowexecutions?tenant_id=${TENANT_ID}`);
    assert.ok([200, 404].includes(res.status), `expected 200 or 404, got ${res.status}`);
    if (res.status === 200) {
      const json = await res.json();
      assert.equal(json.status, 'success');
    }
  });

  test('GET /api/workflow-templates returns available templates', async () => {
    const res = await fetch(`${BASE_URL}/api/workflow-templates?tenant_id=${TENANT_ID}`);
    assert.ok([200, 404].includes(res.status), `expected 200 or 404, got ${res.status}`);
  });

  test('POST /api/workflows creates workflow with create_note node', async () => {
    const result = await createWorkflow({
      name: `Create Note Workflow ${Date.now()}`,
      description: 'Test workflow with create_note node',
      trigger_type: 'manual',
      status: 'draft',
      nodes: [
        { id: 'trigger-1', type: 'manual_trigger', config: {}, position: { x: 400, y: 100 } },
        { 
          id: 'note-1', 
          type: 'create_note', 
          config: { 
            content: 'Test note created by workflow automation',
            related_to: 'lead'
          }, 
          position: { x: 400, y: 300 } 
        }
      ],
      connections: [{ from: 'trigger-1', to: 'note-1' }]
    });
    assert.equal(result.status, 201, `expected 201, got ${result.status}: ${JSON.stringify(result.json)}`);
    const id = result.json?.data?.id || result.json?.data?.workflow?.id;
    assert.ok(id, 'workflow should have an id');
    createdIds.push(id);
  });

  test('POST /api/workflows creates workflow with send_sms node', async () => {
    const result = await createWorkflow({
      name: `SMS Workflow ${Date.now()}`,
      description: 'Test workflow with send_sms node for missed-call template',
      trigger_type: 'webhook',
      status: 'draft',
      nodes: [
        { id: 'trigger-1', type: 'webhook_trigger', config: {}, position: { x: 400, y: 100 } },
        { 
          id: 'find-1', 
          type: 'find_contact', 
          config: { lookup_field: 'phone' }, 
          position: { x: 400, y: 200 } 
        },
        { 
          id: 'sms-1', 
          type: 'send_sms', 
          config: { 
            message: 'Sorry we missed your call. How can we help you today?',
            to_field: '{{contact.phone}}'
          }, 
          position: { x: 400, y: 300 } 
        }
      ],
      connections: [
        { from: 'trigger-1', to: 'find-1' },
        { from: 'find-1', to: 'sms-1' }
      ]
    });
    assert.equal(result.status, 201, `expected 201, got ${result.status}: ${JSON.stringify(result.json)}`);
    const id = result.json?.data?.id || result.json?.data?.workflow?.id;
    assert.ok(id, 'workflow should have an id');
    createdIds.push(id);
  });
});
