import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getAuthHeaders } from '../helpers/auth.js';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const TENANT_ID = process.env.TEST_TENANT_ID || 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
const SHOULD_RUN = process.env.CI ? (process.env.CI_BACKEND_TESTS === 'true') : true;

// Helper to check if we're before or after sunset date
function isAfterSunset() {
  const sunsetDate = new Date('2027-08-01');
  const now = new Date();
  return now > sunsetDate;
}

/**
 * V1 API Deprecation Enforcement Tests
 * 
 * Tests the behavior of v1 endpoints:
 * - Before sunset: Returns data with deprecation headers
 * - After sunset: Returns 410 Gone with migration instructions
 */
describe('V1 API Deprecation Enforcement', { skip: !SHOULD_RUN }, () => {
  
  const v1ToV2Map = {
    '/api/opportunities': '/api/v2/opportunities',
    '/api/activities': '/api/v2/activities',
    '/api/contacts': '/api/v2/contacts',
    '/api/accounts': '/api/v2/accounts',
    '/api/leads': '/api/v2/leads',
    '/api/reports': '/api/v2/reports',
    '/api/workflows': '/api/v2/workflows',
    '/api/documents': '/api/v2/documents',
  };

  describe('Before Sunset Date (current behavior)', () => {
    test('v1 endpoints should include deprecation headers', { skip: isAfterSunset() }, async () => {
      const res = await fetch(`${BASE_URL}/api/accounts?tenant_id=${TENANT_ID}`, {
        headers: getAuthHeaders()
      });
      
      // Should get successful response
      assert.ok(res.ok, 'v1 endpoint should still work before sunset');
      
      // Should have deprecation headers
      assert.strictEqual(res.headers.get('X-API-Version'), 'v1');
      assert.strictEqual(res.headers.get('X-API-Sunset-Date'), '2027-08-01');
      assert.ok(res.headers.get('X-Migration-Guide'), 'Should have migration guide URL');
      assert.ok(res.headers.get('Link')?.includes('/api/v2/accounts'), 'Should link to v2 endpoint');
      assert.ok(res.headers.get('Warning')?.includes('deprecated'), 'Should have warning header');
    });

    test('v2 endpoints should not have deprecation headers', { skip: isAfterSunset() }, async () => {
      const res = await fetch(`${BASE_URL}/api/v2/accounts?tenant_id=${TENANT_ID}`, {
        headers: getAuthHeaders()
      });
      
      // Should get successful response
      assert.ok(res.ok, 'v2 endpoint should work');
      
      // Should NOT have deprecation headers
      assert.strictEqual(res.headers.get('X-API-Version'), null);
      assert.strictEqual(res.headers.get('X-API-Sunset-Date'), null);
    });
  });

  describe('After Sunset Date (enforcement behavior)', () => {
    test('v1 endpoints should return 410 Gone', { skip: !isAfterSunset() }, async () => {
      const res = await fetch(`${BASE_URL}/api/accounts?tenant_id=${TENANT_ID}`, {
        headers: getAuthHeaders()
      });
      
      // Should return 410 Gone
      assert.strictEqual(res.status, 410, 'v1 endpoint should return 410 Gone after sunset');
      
      const json = await res.json();
      
      // Check error response structure
      assert.strictEqual(json.status, 'error');
      assert.strictEqual(json.code, 'API_VERSION_SUNSET');
      assert.ok(json.message?.includes('retired'), 'Should explain v1 is retired');
      assert.ok(json.migrationGuide, 'Should include migration guide URL');
      assert.strictEqual(json.v2Endpoint, '/api/v2/accounts', 'Should include v2 endpoint');
      assert.strictEqual(json.sunsetDate, '2027-08-01', 'Should include sunset date');
    });

    test('all v1 endpoints with v2 alternatives should return 410', { skip: !isAfterSunset() }, async () => {
      for (const [v1Path, v2Path] of Object.entries(v1ToV2Map)) {
        const res = await fetch(`${BASE_URL}${v1Path}?tenant_id=${TENANT_ID}`, {
          headers: getAuthHeaders()
        });
        
        assert.strictEqual(res.status, 410, `${v1Path} should return 410 Gone`);
        
        const json = await res.json();
        assert.strictEqual(json.code, 'API_VERSION_SUNSET');
        assert.strictEqual(json.v2Endpoint, v2Path, `Should suggest ${v2Path}`);
      }
    });

    test('v2 endpoints should continue working normally', { skip: !isAfterSunset() }, async () => {
      const res = await fetch(`${BASE_URL}/api/v2/accounts?tenant_id=${TENANT_ID}`, {
        headers: getAuthHeaders()
      });
      
      // Should get successful response (200 or 304)
      assert.ok(res.ok || res.status === 304, 'v2 endpoint should work after sunset');
      
      // Should not return 410
      assert.notStrictEqual(res.status, 410, 'v2 should not be affected by sunset');
    });

    test('v1 endpoints without v2 alternatives should still work', { skip: !isAfterSunset() }, async () => {
      // Endpoints like /api/health, /api/tenants don't have v2 versions
      // They should continue working
      const res = await fetch(`${BASE_URL}/api/health`);
      
      assert.ok(res.ok, 'endpoints without v2 alternatives should continue working');
      assert.notStrictEqual(res.status, 410);
    });
  });

  describe('Error Response Format', () => {
    test('410 response should have all required fields', { skip: !isAfterSunset() }, async () => {
      const res = await fetch(`${BASE_URL}/api/opportunities?tenant_id=${TENANT_ID}`, {
        headers: getAuthHeaders()
      });
      
      if (res.status === 410) {
        const json = await res.json();
        
        // Verify all required fields
        const requiredFields = ['status', 'code', 'message', 'migrationGuide', 'v2Endpoint', 'sunsetDate'];
        for (const field of requiredFields) {
          assert.ok(json[field], `Response should include ${field}`);
        }
        
        // Verify field types
        assert.strictEqual(typeof json.status, 'string');
        assert.strictEqual(typeof json.code, 'string');
        assert.strictEqual(typeof json.message, 'string');
        assert.strictEqual(typeof json.migrationGuide, 'string');
        assert.strictEqual(typeof json.v2Endpoint, 'string');
        assert.strictEqual(typeof json.sunsetDate, 'string');
        
        // Verify URLs are valid
        assert.ok(json.migrationGuide.startsWith('http'), 'Migration guide should be a URL');
        assert.ok(json.v2Endpoint.startsWith('/api/v2/'), 'v2 endpoint should be a path');
      }
    });
  });

  describe('Endpoint Path Mapping', () => {
    test('nested v1 paths should map to nested v2 paths', { skip: !isAfterSunset() }, async () => {
      // Test that /api/accounts/123 maps to /api/v2/accounts/123
      const accountId = 'test-id-123';
      const res = await fetch(`${BASE_URL}/api/accounts/${accountId}?tenant_id=${TENANT_ID}`, {
        headers: getAuthHeaders()
      });
      
      if (res.status === 410) {
        const json = await res.json();
        assert.strictEqual(json.v2Endpoint, `/api/v2/accounts/${accountId}`, 
          'Should preserve path structure when mapping to v2');
      }
    });
  });
});
