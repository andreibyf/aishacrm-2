/**
 * Tests for uuidValidator - UUID validation and sanitization
 * Critical for preventing SQL injection and type errors
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  isValidUUID,
  sanitizeUuidInput,
  sanitizeUuidFilter,
  validateUuidParams,
  validateUuidQuery
} from '../../lib/uuidValidator.js';

describe('uuidValidator', () => {
  describe('isValidUUID()', () => {
    it('should return true for valid UUIDs', () => {
      const validUuids = [
        'a11dfb63-4b18-4eb8-872e-747af2e37c46',
        '550e8400-e29b-41d4-a716-446655440000',
        '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
        'A11DFB63-4B18-4EB8-872E-747AF2E37C46', // Uppercase
        '00000000-0000-0000-0000-000000000000'  // Nil UUID
      ];

      for (const uuid of validUuids) {
        assert.strictEqual(isValidUUID(uuid), true, `${uuid} should be valid`);
      }
    });

    it('should return false for invalid UUIDs', () => {
      const invalidUuids = [
        'not-a-uuid',
        'local-tenant-001',
        '12345',
        '',
        'a11dfb63-4b18-4eb8-872e-747af2e37c4', // Too short
        'a11dfb63-4b18-4eb8-872e-747af2e37c466', // Too long
        'g11dfb63-4b18-4eb8-872e-747af2e37c46', // Invalid character
        'a11dfb63_4b18_4eb8_872e_747af2e37c46', // Wrong separator
        '  a11dfb63-4b18-4eb8-872e-747af2e37c46  ' // Whitespace not allowed
      ];

      for (const invalid of invalidUuids) {
        assert.strictEqual(isValidUUID(invalid), false, `${invalid} should be invalid`);
      }
    });

    it('should return false for non-string inputs', () => {
      assert.strictEqual(isValidUUID(null), false);
      assert.strictEqual(isValidUUID(undefined), false);
      assert.strictEqual(isValidUUID(123), false);
      assert.strictEqual(isValidUUID({}), false);
      assert.strictEqual(isValidUUID([]), false);
    });
  });

  describe('sanitizeUuidInput()', () => {
    it('should return valid UUIDs unchanged', () => {
      const uuid = 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
      assert.strictEqual(sanitizeUuidInput(uuid), uuid);
    });

    it('should return null for null/undefined/empty with allowNull', () => {
      assert.strictEqual(sanitizeUuidInput(null), null);
      assert.strictEqual(sanitizeUuidInput(undefined), null);
      assert.strictEqual(sanitizeUuidInput(''), null);
    });

    it('should return undefined for null/undefined with allowNull:false', () => {
      assert.strictEqual(sanitizeUuidInput(null, { allowNull: false }), undefined);
      assert.strictEqual(sanitizeUuidInput(undefined, { allowNull: false }), undefined);
      assert.strictEqual(sanitizeUuidInput('', { allowNull: false }), undefined);
    });

    it('should convert system aliases to null', () => {
      assert.strictEqual(sanitizeUuidInput('system'), null);
      assert.strictEqual(sanitizeUuidInput('unknown'), null);
      assert.strictEqual(sanitizeUuidInput('anonymous'), null);
      assert.strictEqual(sanitizeUuidInput('SYSTEM'), null); // Case insensitive
    });

    it('should handle custom system aliases', () => {
      const options = { systemAliases: ['admin', 'root'] };
      assert.strictEqual(sanitizeUuidInput('admin', options), null);
      assert.strictEqual(sanitizeUuidInput('root', options), null);
      // 'system' is not a valid UUID, so it should still return null even if not in custom list
      assert.strictEqual(sanitizeUuidInput('system', options), null);
    });

    it('should return null for invalid UUIDs', () => {
      assert.strictEqual(sanitizeUuidInput('not-a-uuid'), null);
      assert.strictEqual(sanitizeUuidInput('local-tenant-001'), null);
      assert.strictEqual(sanitizeUuidInput('12345'), null);
    });
  });

  describe('sanitizeUuidFilter()', () => {
    const uuidColumns = ['tenant_id', 'user_id', 'account_id'];

    it('should sanitize UUID columns in simple filter', () => {
      const filter = {
        tenant_id: 'a11dfb63-4b18-4eb8-872e-747af2e37c46',
        user_id: 'invalid-uuid',
        name: 'test'
      };

      const result = sanitizeUuidFilter(filter, uuidColumns);

      assert.strictEqual(result.tenant_id, 'a11dfb63-4b18-4eb8-872e-747af2e37c46');
      assert.strictEqual(result.user_id, null);
      assert.strictEqual(result.name, 'test'); // Non-UUID column unchanged
    });

    it('should preserve operator objects', () => {
      const filter = {
        tenant_id: { $ne: null },
        name: { $regex: 'test', $options: 'i' }
      };

      const result = sanitizeUuidFilter(filter, uuidColumns);

      assert.deepStrictEqual(result.tenant_id, { $ne: null });
      assert.deepStrictEqual(result.name, { $regex: 'test', $options: 'i' });
    });

    it('should sanitize $or conditions recursively', () => {
      const filter = {
        $or: [
          { tenant_id: 'invalid-uuid' },
          { user_id: 'a11dfb63-4b18-4eb8-872e-747af2e37c46' }
        ]
      };

      const result = sanitizeUuidFilter(filter, uuidColumns);

      assert.strictEqual(result.$or[0].tenant_id, null);
      assert.strictEqual(result.$or[1].user_id, 'a11dfb63-4b18-4eb8-872e-747af2e37c46');
    });

    it('should sanitize $and conditions recursively', () => {
      const filter = {
        $and: [
          { tenant_id: 'a11dfb63-4b18-4eb8-872e-747af2e37c46' },
          { user_id: 'system' }
        ]
      };

      const result = sanitizeUuidFilter(filter, uuidColumns);

      assert.strictEqual(result.$and[0].tenant_id, 'a11dfb63-4b18-4eb8-872e-747af2e37c46');
      assert.strictEqual(result.$and[1].user_id, null);
    });

    it('should handle nested $or/$and combinations', () => {
      const filter = {
        $or: [
          {
            $and: [
              { tenant_id: 'invalid' },
              { user_id: 'a11dfb63-4b18-4eb8-872e-747af2e37c46' }
            ]
          },
          { account_id: 'system' }
        ]
      };

      const result = sanitizeUuidFilter(filter, uuidColumns);

      assert.strictEqual(result.$or[0].$and[0].tenant_id, null);
      assert.strictEqual(result.$or[0].$and[1].user_id, 'a11dfb63-4b18-4eb8-872e-747af2e37c46');
      assert.strictEqual(result.$or[1].account_id, null);
    });

    it('should return filter unchanged for non-object input', () => {
      assert.strictEqual(sanitizeUuidFilter(null, uuidColumns), null);
      assert.strictEqual(sanitizeUuidFilter(undefined, uuidColumns), undefined);
      assert.strictEqual(sanitizeUuidFilter('string', uuidColumns), 'string');
    });

    it('should create new object (not mutate original)', () => {
      const original = { tenant_id: 'invalid-uuid' };
      const result = sanitizeUuidFilter(original, uuidColumns);

      assert.notStrictEqual(result, original);
      assert.strictEqual(original.tenant_id, 'invalid-uuid'); // Original unchanged
      assert.strictEqual(result.tenant_id, null); // Result sanitized
    });
  });

  describe('validateUuidParams() middleware', () => {
    it('should pass for valid UUID params', () => {
      const middleware = validateUuidParams('id', 'tenant_id');
      const req = {
        params: {
          id: 'a11dfb63-4b18-4eb8-872e-747af2e37c46',
          tenant_id: '550e8400-e29b-41d4-a716-446655440000'
        }
      };
      const res = {
        status: () => ({ json: () => {} })
      };
      let nextCalled = false;
      const next = () => { nextCalled = true; };

      middleware(req, res, next);

      assert.strictEqual(nextCalled, true);
    });

    it('should return 400 for invalid UUID params', () => {
      const middleware = validateUuidParams('id');
      const req = {
        params: {
          id: 'invalid-uuid'
        }
      };

      let statusCode = null;
      let responseBody = null;

      const res = {
        status: (code) => {
          statusCode = code;
          return {
            json: (body) => {
              responseBody = body;
            }
          };
        }
      };

      const next = () => {};

      middleware(req, res, next);

      assert.strictEqual(statusCode, 400);
      assert.strictEqual(responseBody.error, 'Invalid UUID parameter');
      assert.ok(responseBody.details.length > 0);
      assert.ok(responseBody.details[0].includes('invalid-uuid'));
    });

    it('should validate multiple params and report all invalid ones', () => {
      const middleware = validateUuidParams('id', 'user_id', 'account_id');
      const req = {
        params: {
          id: 'invalid1',
          user_id: 'a11dfb63-4b18-4eb8-872e-747af2e37c46', // Valid
          account_id: 'invalid2'
        }
      };

      let responseBody = null;

      const res = {
        status: () => ({
          json: (body) => {
            responseBody = body;
          }
        })
      };

      const next = () => {};

      middleware(req, res, next);

      assert.strictEqual(responseBody.error, 'Invalid UUID parameter');
      assert.strictEqual(responseBody.details.length, 2);
      assert.ok(responseBody.details.some(d => d.includes('invalid1')));
      assert.ok(responseBody.details.some(d => d.includes('invalid2')));
    });
  });

  describe('validateUuidQuery() middleware', () => {
    it('should pass for valid UUID query params', () => {
      const middleware = validateUuidQuery('tenant_id', 'user_id');
      const req = {
        query: {
          tenant_id: 'a11dfb63-4b18-4eb8-872e-747af2e37c46',
          user_id: '550e8400-e29b-41d4-a716-446655440000'
        }
      };
      const res = {
        status: () => ({ json: () => {} })
      };
      let nextCalled = false;
      const next = () => { nextCalled = true; };

      middleware(req, res, next);

      assert.strictEqual(nextCalled, true);
    });

    it('should allow "null" string for query params', () => {
      const middleware = validateUuidQuery('tenant_id');
      const req = {
        query: {
          tenant_id: 'null' // Common in query strings
        }
      };
      const res = {
        status: () => ({ json: () => {} })
      };
      let nextCalled = false;
      const next = () => { nextCalled = true; };

      middleware(req, res, next);

      assert.strictEqual(nextCalled, true);
    });

    it('should return 400 for invalid UUID query params', () => {
      const middleware = validateUuidQuery('tenant_id');
      const req = {
        query: {
          tenant_id: 'local-tenant-001'
        }
      };

      let statusCode = null;
      let responseBody = null;

      const res = {
        status: (code) => {
          statusCode = code;
          return {
            json: (body) => {
              responseBody = body;
            }
          };
        }
      };

      const next = () => {};

      middleware(req, res, next);

      assert.strictEqual(statusCode, 400);
      assert.strictEqual(responseBody.error, 'Invalid UUID query parameter');
      assert.ok(responseBody.details.length > 0);
      assert.ok(responseBody.details[0].includes('local-tenant-001'));
    });
  });
});
