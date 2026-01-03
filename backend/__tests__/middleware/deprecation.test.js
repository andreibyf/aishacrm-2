import { test, describe, mock } from 'node:test';
import assert from 'node:assert/strict';
import { deprecationMiddleware } from '../../middleware/deprecation.js';

/**
 * Unit tests for deprecation middleware logic
 * Tests the enforcement behavior without requiring a running backend
 */
describe('Deprecation Middleware Unit Tests', () => {
  
  describe('Request path detection', () => {
    test('should detect v1 API paths', () => {
      const v1Paths = [
        '/api/accounts',
        '/api/opportunities',
        '/api/contacts',
        '/api/leads/123',
        '/api/activities?tenant_id=abc',
      ];

      for (const path of v1Paths) {
        const req = { path };
        const res = {
          set: mock.fn(),
          status: mock.fn(() => ({ json: mock.fn() })),
        };
        const next = mock.fn();

        deprecationMiddleware(req, res, next);
        
        // Should either set headers or return 410, not just skip
        assert.ok(
          res.set.mock.calls.length > 0 || res.status.mock.calls.length > 0,
          `Should process v1 path: ${path}`
        );
      }
    });

    test('should skip v2 API paths', () => {
      const v2Paths = [
        '/api/v2/accounts',
        '/api/v2/opportunities',
        '/api/v2/contacts',
      ];

      for (const path of v2Paths) {
        const req = { path };
        const res = {
          set: mock.fn(),
          status: mock.fn(() => ({ json: mock.fn() })),
        };
        const next = mock.fn();

        deprecationMiddleware(req, res, next);
        
        // Should skip to next without processing
        assert.strictEqual(next.mock.calls.length, 1, `Should skip v2 path: ${path}`);
        assert.strictEqual(res.set.mock.calls.length, 0, 'Should not set headers for v2');
        assert.strictEqual(res.status.mock.calls.length, 0, 'Should not set status for v2');
      }
    });

    test('should skip non-API paths', () => {
      const nonApiPaths = [
        '/',
        '/health',
        '/login',
        '/api-docs',
      ];

      for (const path of nonApiPaths) {
        const req = { path };
        const res = {
          set: mock.fn(),
          status: mock.fn(),
        };
        const next = mock.fn();

        deprecationMiddleware(req, res, next);
        
        assert.strictEqual(next.mock.calls.length, 1, `Should skip: ${path}`);
      }
    });
  });

  describe('Before sunset date (current behavior)', () => {
    test('should add deprecation headers for v1 endpoints', () => {
      const req = { path: '/api/accounts' };
      const res = {
        set: mock.fn(),
        status: mock.fn(() => ({ json: mock.fn() })),
      };
      const next = mock.fn();

      // Current date is before sunset (2027-08-01)
      const now = new Date();
      const sunset = new Date('2027-08-01');
      
      if (now <= sunset) {
        deprecationMiddleware(req, res, next);
        
        // Should set deprecation headers
        const setCalls = res.set.mock.calls;
        const headers = Object.fromEntries(setCalls.map(call => [call.arguments[0], call.arguments[1]]));
        
        assert.strictEqual(headers['X-API-Version'], 'v1');
        assert.strictEqual(headers['X-API-Sunset-Date'], '2027-08-01');
        assert.ok(headers['X-Migration-Guide'], 'Should have migration guide');
        assert.ok(headers['Link']?.includes('/api/v2/accounts'), 'Should link to v2');
        assert.ok(headers['Warning']?.includes('deprecated'), 'Should have warning');
        
        // Should call next()
        assert.strictEqual(next.mock.calls.length, 1);
        
        // Should NOT return 410
        assert.strictEqual(res.status.mock.calls.length, 0);
      }
    });
  });

  describe('V2 endpoint mapping', () => {
    test('should correctly map v1 paths to v2', () => {
      const mappings = [
        ['/api/accounts', '/api/v2/accounts'],
        ['/api/opportunities', '/api/v2/opportunities'],
        ['/api/contacts/123', '/api/v2/contacts/123'],
        ['/api/leads?filter=active', '/api/v2/leads?filter=active'],
      ];

      for (const [v1Path, expectedV2Path] of mappings) {
        const req = { path: v1Path };
        const res = {
          set: mock.fn(),
          status: mock.fn(() => ({
            json: mock.fn((body) => {
              // Verify v2 endpoint in 410 response
              if (body.v2Endpoint) {
                assert.strictEqual(
                  body.v2Endpoint,
                  expectedV2Path,
                  `${v1Path} should map to ${expectedV2Path}`
                );
              }
              return body;
            }),
          })),
        };
        const next = mock.fn();

        deprecationMiddleware(req, res, next);
        
        // Check headers for v2 endpoint (before sunset)
        const linkHeader = res.set.mock.calls.find(call => call.arguments[0] === 'Link');
        if (linkHeader) {
          assert.ok(
            linkHeader.arguments[1].includes(expectedV2Path),
            `Link header should reference ${expectedV2Path}`
          );
        }
      }
    });
  });

  describe('Routes without v2 alternatives', () => {
    test('should not add full deprecation headers for non-migrated routes', () => {
      const nonMigratedPaths = [
        '/api/tenants',
        '/api/users',
        '/api/auth',
        '/api/system',
      ];

      for (const path of nonMigratedPaths) {
        const req = { path };
        const res = {
          set: mock.fn(),
          status: mock.fn(),
        };
        const next = mock.fn();

        deprecationMiddleware(req, res, next);
        
        // Should only set X-API-Version header, not full deprecation suite
        const setCalls = res.set.mock.calls;
        const headers = Object.fromEntries(setCalls.map(call => [call.arguments[0], call.arguments[1]]));
        
        assert.strictEqual(headers['X-API-Version'], 'v1', 'Should have version header');
        assert.strictEqual(headers['X-API-Sunset-Date'], undefined, 'Should not have sunset date');
        assert.strictEqual(headers['Link'], undefined, 'Should not have Link header');
        
        // Should call next()
        assert.strictEqual(next.mock.calls.length, 1);
      }
    });
  });
});

/**
 * Mock sunset enforcement tests
 * These test what will happen after August 2027
 */
describe('Deprecation Middleware - After Sunset Simulation', () => {
  
  test('should return 410 Gone with correct error structure', () => {
    // Simulate a request after sunset date
    const req = { path: '/api/accounts' };
    let jsonResponse = null;
    
    const res = {
      set: mock.fn(),
      status: mock.fn((statusCode) => ({
        json: mock.fn((body) => {
          jsonResponse = body;
          return body;
        }),
      })),
    };
    const next = mock.fn();

    // Mock Date to be after sunset
    const originalDate = global.Date;
    global.Date = class extends originalDate {
      constructor(...args) {
        if (args.length === 0) {
          // Return a date after sunset
          return new originalDate('2027-09-01');
        }
        return new originalDate(...args);
      }
      static now() {
        return new originalDate('2027-09-01').getTime();
      }
    };

    try {
      deprecationMiddleware(req, res, next);
      
      // Should return 410
      assert.strictEqual(res.status.mock.calls[0]?.arguments[0], 410);
      
      // Check response structure
      assert.ok(jsonResponse, 'Should have JSON response');
      assert.strictEqual(jsonResponse.status, 'error');
      assert.strictEqual(jsonResponse.code, 'API_VERSION_SUNSET');
      assert.ok(jsonResponse.message?.includes('retired'), 'Should explain retirement');
      assert.ok(jsonResponse.migrationGuide, 'Should include migration guide');
      assert.strictEqual(jsonResponse.v2Endpoint, '/api/v2/accounts');
      assert.strictEqual(jsonResponse.sunsetDate, '2027-08-01');
      
      // Should NOT call next()
      assert.strictEqual(next.mock.calls.length, 0);
    } finally {
      // Restore original Date
      global.Date = originalDate;
    }
  });

  test('should include all required fields in 410 response', () => {
    const req = { path: '/api/opportunities' };
    let jsonResponse = null;
    
    const res = {
      set: mock.fn(),
      status: mock.fn(() => ({
        json: mock.fn((body) => {
          jsonResponse = body;
          return body;
        }),
      })),
    };
    const next = mock.fn();

    // Mock Date to be after sunset
    const originalDate = global.Date;
    global.Date = class extends originalDate {
      constructor(...args) {
        if (args.length === 0) {
          return new originalDate('2027-09-01');
        }
        return new originalDate(...args);
      }
    };

    try {
      deprecationMiddleware(req, res, next);
      
      // Verify all required fields
      const requiredFields = ['status', 'code', 'message', 'migrationGuide', 'v2Endpoint', 'sunsetDate'];
      for (const field of requiredFields) {
        assert.ok(jsonResponse?.[field], `Should include ${field}`);
      }
      
      // Verify types
      assert.strictEqual(typeof jsonResponse.status, 'string');
      assert.strictEqual(typeof jsonResponse.code, 'string');
      assert.strictEqual(typeof jsonResponse.message, 'string');
      assert.strictEqual(typeof jsonResponse.migrationGuide, 'string');
      assert.strictEqual(typeof jsonResponse.v2Endpoint, 'string');
      assert.strictEqual(typeof jsonResponse.sunsetDate, 'string');
    } finally {
      global.Date = originalDate;
    }
  });
});
