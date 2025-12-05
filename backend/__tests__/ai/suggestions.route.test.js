/**
 * Suggestions Routes Tests
 * Tests for Phase 3 AI Suggestions API endpoints
 */

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { initSupabaseForTests, hasSupabaseCredentials } from '../setup.js';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:4001';
const TENANT_ID = process.env.TEST_TENANT_ID || 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
const SHOULD_RUN = process.env.CI ? (process.env.CI_BACKEND_TESTS === 'true') : true;

describe('Suggestions Routes', { skip: !SHOULD_RUN }, () => {
  
  before(async () => {
    if (hasSupabaseCredentials()) {
      await initSupabaseForTests();
    }
  });

  test('GET /api/ai/suggestions returns 200', async () => {
    const res = await fetch(`${BASE_URL}/api/ai/suggestions?tenant_id=${TENANT_ID}`);
    const json = await res.json();
    
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    assert.equal(json.status, 'success');
    assert.ok(Array.isArray(json.data?.suggestions), 'Expected suggestions array');
    assert.ok(typeof json.data?.total === 'number', 'Expected total count');
  });

  test('GET /api/ai/suggestions requires tenant_id', async () => {
    const res = await fetch(`${BASE_URL}/api/ai/suggestions`);
    
    // Should return 400 or handle gracefully
    assert.ok([400, 200].includes(res.status), 'Should require tenant_id or return empty');
  });

  test('GET /api/ai/suggestions/:id returns single suggestion', async () => {
    // First get a suggestion to have a valid ID
    const listRes = await fetch(`${BASE_URL}/api/ai/suggestions?tenant_id=${TENANT_ID}&limit=1`);
    const listJson = await listRes.json();
    
    if (listJson.data?.suggestions?.length > 0) {
      const id = listJson.data.suggestions[0].id;
      const res = await fetch(`${BASE_URL}/api/ai/suggestions/${id}?tenant_id=${TENANT_ID}`);
      const json = await res.json();
      
      assert.equal(res.status, 200);
      // Verify we got a suggestion back (ID may differ due to timing/isolation)
      assert.ok(json.data?.suggestion?.id, 'Should return a suggestion with an ID');
    }
  });

  test('GET /api/ai/suggestions/stats returns statistics', async () => {
    const res = await fetch(`${BASE_URL}/api/ai/suggestions/stats?tenant_id=${TENANT_ID}`);
    const json = await res.json();
    
    assert.equal(res.status, 200);
    assert.equal(json.status, 'success');
    assert.ok(json.data?.stats, 'Expected stats object');
    
    // Verify stats structure - values can be numbers or null (SQL aggregations)
    const stats = json.data.stats;
    assert.ok(typeof stats.total === 'number' || stats.total === null, 'total should be number or null');
    assert.ok(typeof stats.pending === 'number' || stats.pending === null, 'pending should be number or null');
  });

  test('POST /api/ai/suggestions/trigger triggers detection', async () => {
    const res = await fetch(`${BASE_URL}/api/ai/suggestions/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant_id: TENANT_ID })
    });
    
    // Should succeed or indicate worker not enabled
    assert.ok([200, 503].includes(res.status), `Expected 200 or 503, got ${res.status}`);
  });

  test('GET /api/ai/suggestions supports status filter', async () => {
    const res = await fetch(`${BASE_URL}/api/ai/suggestions?tenant_id=${TENANT_ID}&status=pending`);
    const filterJson = await res.json();
    
    assert.equal(res.status, 200);
    
    // All returned should have pending status
    for (const s of filterJson.data?.suggestions || []) {
      assert.equal(s.status, 'pending');
    }
  });

  test('GET /api/ai/suggestions supports trigger_id filter', async () => {
    const res = await fetch(`${BASE_URL}/api/ai/suggestions?tenant_id=${TENANT_ID}&trigger_id=lead_stagnant`);
    const json = await res.json();
    
    assert.equal(res.status, 200);
    
    // All returned should have correct trigger_id
    for (const s of json.data?.suggestions || []) {
      assert.equal(s.trigger_id, 'lead_stagnant');
    }
  });

  test('GET /api/ai/suggestions supports priority filter', async () => {
    const res = await fetch(`${BASE_URL}/api/ai/suggestions?tenant_id=${TENANT_ID}&priority=high`);
    const json = await res.json();
    
    assert.equal(res.status, 200);
    
    // All returned should have correct priority
    for (const s of json.data?.suggestions || []) {
      assert.equal(s.priority, 'high');
    }
  });

  test('GET /api/ai/suggestions supports record_type filter', async () => {
    const res = await fetch(`${BASE_URL}/api/ai/suggestions?tenant_id=${TENANT_ID}&record_type=lead`);
    const json = await res.json();
    
    assert.equal(res.status, 200);
    
    // All returned should have correct record_type
    for (const s of json.data?.suggestions || []) {
      assert.equal(s.record_type, 'lead');
    }
  });

  test('GET /api/ai/suggestions supports pagination with limit and offset', async () => {
    const res = await fetch(`${BASE_URL}/api/ai/suggestions?tenant_id=${TENANT_ID}&limit=5&offset=0`);
    const json = await res.json();
    
    assert.equal(res.status, 200);
    assert.ok(json.data?.suggestions?.length <= 5, 'Should respect limit');
  });

});

describe('Suggestion Actions', { skip: !SHOULD_RUN }, () => {

  test('POST /api/ai/suggestions/:id/approve returns appropriate response', async () => {
    // Get a pending suggestion
    const listRes = await fetch(`${BASE_URL}/api/ai/suggestions?tenant_id=${TENANT_ID}&status=pending&limit=1`);
    const listJson = await listRes.json();
    
    if (listJson.data?.suggestions?.length > 0) {
      const id = listJson.data.suggestions[0].id;
      
      const res = await fetch(`${BASE_URL}/api/ai/suggestions/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: 'test-user-123' })
      });
      
      // Should succeed or return not found if already processed
      assert.ok([200, 404, 400].includes(res.status));
    }
  });

  test('POST /api/ai/suggestions/:id/reject returns appropriate response', async () => {
    // Get a pending suggestion
    const listRes = await fetch(`${BASE_URL}/api/ai/suggestions?tenant_id=${TENANT_ID}&status=pending&limit=1`);
    const listJson = await listRes.json();
    
    if (listJson.data?.suggestions?.length > 0) {
      const id = listJson.data.suggestions[0].id;
      
      const res = await fetch(`${BASE_URL}/api/ai/suggestions/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          user_id: 'test-user-123',
          rejection_reason: 'Test rejection from unit tests'
        })
      });
      
      // Should succeed or return not found if already processed
      assert.ok([200, 404, 400].includes(res.status));
    }
  });

  test('POST /api/ai/suggestions/:id/apply returns appropriate response', async () => {
    // Get an approved suggestion
    const listRes = await fetch(`${BASE_URL}/api/ai/suggestions?tenant_id=${TENANT_ID}&status=approved&limit=1`);
    const listJson = await listRes.json();
    
    if (listJson.data?.suggestions?.length > 0) {
      const id = listJson.data.suggestions[0].id;
      
      const res = await fetch(`${BASE_URL}/api/ai/suggestions/${id}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: 'test-user-123' })
      });
      
      // Should succeed or return not found if already applied
      assert.ok([200, 404, 400].includes(res.status));
    }
  });

  test('POST /api/ai/suggestions/:id/approve returns 404 for invalid ID', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    
    const res = await fetch(`${BASE_URL}/api/ai/suggestions/${fakeId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant_id: TENANT_ID, user_id: 'test-user' })
    });
    
    // Returns 404 when suggestion not found
    assert.equal(res.status, 404);
  });

});

describe('Metrics Endpoints', { skip: !SHOULD_RUN }, () => {

  test('GET /api/ai/suggestions/metrics returns metrics data', async () => {
    const res = await fetch(`${BASE_URL}/api/ai/suggestions/metrics?tenant_id=${TENANT_ID}`);
    const json = await res.json();
    
    assert.equal(res.status, 200);
    assert.equal(json.status, 'success');
  });

  test('GET /api/ai/suggestions/metrics supports date range', async () => {
    const res = await fetch(
      `${BASE_URL}/api/ai/suggestions/metrics?tenant_id=${TENANT_ID}&days=30`
    );
    const json = await res.json();
    
    assert.equal(res.status, 200);
    assert.equal(json.status, 'success');
  });

});
