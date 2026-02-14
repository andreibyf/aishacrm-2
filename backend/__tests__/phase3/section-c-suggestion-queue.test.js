/**
 * Phase 3 Verification - Section C: Suggestion Queue
 * 
 * Tests for:
 * - C1: Database table validity (ai_suggestions schema)
 * - C2: API verification (CRUD, tenant isolation)
 */

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { initSupabaseForTests, hasSupabaseCredentials } from '../setup.js';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const TENANT_ID = process.env.TEST_TENANT_ID || 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
const SHOULD_RUN = process.env.CI ? (process.env.CI_BACKEND_TESTS === 'true') : true;

// Required fields in ai_suggestions table per Phase 3 spec
// Fields: id, tenant_id, trigger_id, action (JSONB), reasoning, confidence, status, timestamps, apply_result (JSONB)

describe('Section C: Suggestion Queue Verification', { skip: !SHOULD_RUN }, () => {

  before(async () => {
    if (hasSupabaseCredentials()) {
      await initSupabaseForTests();
    }
  });

  describe('C1: Database Table Validity', () => {

    test('ai_suggestions table exists and is accessible', async () => {
      const res = await fetch(`${BASE_URL}/api/ai/suggestions?tenant_id=${TENANT_ID}&limit=1`);
      
      // Should get 200, not 500 (table missing) or 404
      assert.equal(res.status, 200, 'Should be able to query ai_suggestions');
      
      const json = await res.json();
      assert.equal(json.status, 'success', 'Query should succeed');
    });

    test('Suggestions list returns expected structure', async () => {
      const res = await fetch(`${BASE_URL}/api/ai/suggestions?tenant_id=${TENANT_ID}&limit=5`);
      const json = await res.json();
      
      assert.equal(res.status, 200);
      assert.ok(json.data, 'Response should have data');
      assert.ok(Array.isArray(json.data.suggestions), 'Should return suggestions array');
      assert.ok(typeof json.data.total === 'number', 'Should return total count');
    });

    test('API response format matches frontend contract', async () => {
      // CRITICAL: This test documents the exact response format that frontend expects
      // Frontend code: data.data?.suggestions || data.suggestions || []
      const res = await fetch(`${BASE_URL}/api/ai/suggestions?tenant_id=${TENANT_ID}&status=pending&limit=5`);
      const json = await res.json();
      
      assert.equal(res.status, 200);
      
      // Verify the exact structure frontend expects
      assert.equal(json.status, 'success', 'Response must have status: success');
      assert.ok(json.data !== undefined, 'Response must have data property');
      assert.ok(Array.isArray(json.data.suggestions), 'data.suggestions must be an array');
      
      // Verify suggestions array is directly accessible (not nested further)
      const suggestions = json.data.suggestions;
      assert.ok(Array.isArray(suggestions), 'suggestions must be an array for .map() to work');
      
      // If suggestions exist, verify their structure
      if (suggestions.length > 0) {
        const suggestion = suggestions[0];
        assert.ok(suggestion.id, 'Suggestion must have id');
        assert.ok(suggestion.tenant_id, 'Suggestion must have tenant_id');
        assert.ok(suggestion.action, 'Suggestion must have action');
      }
    });

    test('Stats endpoint returns aggregated data', async () => {
      const res = await fetch(`${BASE_URL}/api/ai/suggestions/stats?tenant_id=${TENANT_ID}`);
      const json = await res.json();
      
      assert.equal(res.status, 200);
      assert.ok(json.data?.stats, 'Should return stats object');
      
      const stats = json.data.stats;
      // Stats can be numbers or null (SQL aggregation returns null for empty sets)
      assert.ok(typeof stats.total === 'number' || stats.total === null, 'Stats should have total');
      assert.ok(typeof stats.pending === 'number' || stats.pending === null, 'Stats should have pending count');
    });

  });

  describe('C2: API Verification', () => {

    test('GET /api/ai/suggestions requires tenant_id', async () => {
      const res = await fetch(`${BASE_URL}/api/ai/suggestions`);
      
      // Should return 400 for missing tenant_id
      assert.equal(res.status, 400, 'Should require tenant_id');
    });

    test('GET /api/ai/suggestions/:id returns single suggestion or 404', async () => {
      // First get a list to find an ID
      const listRes = await fetch(`${BASE_URL}/api/ai/suggestions?tenant_id=${TENANT_ID}&limit=1`);
      const listJson = await listRes.json();
      
      if (listJson.data?.suggestions?.length > 0) {
        const id = listJson.data.suggestions[0].id;
        const res = await fetch(`${BASE_URL}/api/ai/suggestions/${id}?tenant_id=${TENANT_ID}`);
        
        assert.equal(res.status, 200);
        const json = await res.json();
        assert.ok(json.data?.suggestion, 'Should return suggestion object');
      } else {
        // No suggestions exist - test with fake ID
        const fakeId = '00000000-0000-0000-0000-000000000000';
        const res = await fetch(`${BASE_URL}/api/ai/suggestions/${fakeId}?tenant_id=${TENANT_ID}`);
        
        assert.equal(res.status, 404, 'Non-existent suggestion should return 404');
      }
    });

    test('POST /api/ai/suggestions/:id/approve requires tenant_id', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await fetch(`${BASE_URL}/api/ai/suggestions/${fakeId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      
      assert.equal(res.status, 400, 'Should require tenant_id');
    });

    test('POST /api/ai/suggestions/:id/reject requires tenant_id', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await fetch(`${BASE_URL}/api/ai/suggestions/${fakeId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      
      assert.equal(res.status, 400, 'Should require tenant_id');
    });

    test('Tenant isolation - cross-tenant access blocked', async () => {
      const FAKE_TENANT = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
      
      const res = await fetch(`${BASE_URL}/api/ai/suggestions?tenant_id=${FAKE_TENANT}`);
      
      // Should return 404 (tenant not found) or empty results
      assert.ok(
        res.status === 404 || res.status === 200,
        'Should handle unknown tenant gracefully'
      );
      
      if (res.status === 200) {
        const json = await res.json();
        // Either error or empty results
        assert.ok(
          json.status === 'error' || json.data?.suggestions?.length === 0,
          'Unknown tenant should get empty results or error'
        );
      }
    });

    test('Suggestions list supports filtering by status', async () => {
      const statuses = ['pending', 'approved', 'rejected', 'applied'];
      
      for (const status of statuses) {
        const res = await fetch(`${BASE_URL}/api/ai/suggestions?tenant_id=${TENANT_ID}&status=${status}&limit=5`);
        const json = await res.json();
        
        assert.equal(res.status, 200, `Status filter ${status} should work`);
        
        // All returned suggestions should have the filtered status
        for (const suggestion of json.data?.suggestions || []) {
          assert.equal(suggestion.status, status, `All suggestions should have status ${status}`);
        }
      }
    });

    test('Suggestions list supports pagination', async () => {
      const res = await fetch(`${BASE_URL}/api/ai/suggestions?tenant_id=${TENANT_ID}&limit=2&offset=0`);
      const json = await res.json();
      
      assert.equal(res.status, 200);
      assert.ok(json.data?.suggestions?.length <= 2, 'Should respect limit');
      assert.ok(typeof json.data?.offset === 'number', 'Should return offset');
    });

  });

});

// Export for aggregation
export const sectionId = 'C';
export const sectionName = 'Suggestion Queue';
