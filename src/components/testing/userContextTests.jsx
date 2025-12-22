/**
 * Test suite for UserContext and useUser hook
 * Validates:
 * - User normalization logic
 * - Schema consistency
 * - Context propagation
 * - Error handling
 */

import { assert } from './testUtils';
import { normalizeUser } from '../../utils/normalizeUser';

export const userContextTests = {
  name: 'User Context & Normalization',
  tests: [
    {
      name: 'normalizeUser should handle standard user object',
      fn: async () => {
        const input = {
          id: 'user-123',
          email: 'test@example.com',
          tenant_id: '6cb4c008-4847-426a-9a2e-918ad70e7b69',
          role: 'Admin',
          first_name: 'John',
          last_name: 'Doe'
        };

        const result = normalizeUser(input);

        assert.equal(result.id, 'user-123');
        assert.equal(result.email, 'test@example.com');
        assert.equal(result.tenant_id, '6cb4c008-4847-426a-9a2e-918ad70e7b69');
        assert.equal(result.role, 'admin'); // Should be lowercase
        assert.equal(result.first_name, 'John');
        assert.equal(result.last_name, 'Doe');
        assert.true(result.full_name && result.full_name.includes('John'));
      }
    },
    {
      name: 'normalizeUser should extract role from user_metadata',
      fn: async () => {
        const input = {
          id: 'user-123',
          email: 'test@example.com',
          user_metadata: {
            role: 'Manager'
          }
        };

        const result = normalizeUser(input);

        assert.equal(result.role, 'manager'); // Should be lowercase
        assert.equal(typeof result.is_superadmin, 'boolean');
      }
    },
    {
      name: 'normalizeUser should detect Superadmin role',
      fn: async () => {
        const testCases = [
          { role: 'Superadmin', expected: true },
          { role: 'superadmin', expected: true },
          { role: 'SUPERADMIN', expected: true },
          { role: 'Admin', expected: false },
          { role: 'Manager', expected: false }
        ];

        for (const testCase of testCases) {
          const result = normalizeUser({ 
            role: testCase.role, 
            email: 'test@test.com', 
            id: 'test' 
          });
          assert.equal(result.is_superadmin, testCase.expected);
        }
      }
    },
    {
      name: 'normalizeUser should handle missing tenant_id',
      fn: async () => {
        const input = {
          id: 'user-123',
          email: 'test@example.com',
          role: 'Admin'
        };

        const result = normalizeUser(input);

        assert.equal(result.tenant_id, null);
      }
    },
    {
      name: 'normalizeUser should handle null/undefined input gracefully',
      fn: async () => {
        const nullResult = normalizeUser(null);
        const undefinedResult = normalizeUser(undefined);

        assert.equal(nullResult, null);
        assert.equal(undefinedResult, null);
      }
    },
    {
      name: 'normalizeUser should preserve status and timestamps',
      fn: async () => {
        const input = {
          id: 'user-123',
          email: 'test@example.com',
          status: 'active',
          created_at: '2024-01-01',
          updated_at: '2024-01-02'
        };

        const result = normalizeUser(input);

        assert.equal(result.status, 'active');
        assert.equal(result.created_at, '2024-01-01');
        assert.equal(result.updated_at, '2024-01-02');
      }
    },
    {
      name: 'Canonical user fields are present and correctly typed',
      fn: async () => {
        const input = {
          id: 'user-123',
          email: 'test@example.com',
          tenant_id: '6cb4c008-4847-426a-9a2e-918ad70e7b69',
          role: 'Admin'
        };

        const result = normalizeUser(input);

        // Check required canonical fields exist
        const requiredFields = ['id', 'email', 'tenant_id', 'role', 'is_superadmin'];
        for (const field of requiredFields) {
          assert.true(field in result);
        }

        // Check types
        assert.equal(typeof result.id, 'string');
        assert.equal(typeof result.email, 'string');
        assert.equal(typeof result.role, 'string');
        assert.equal(typeof result.is_superadmin, 'boolean');
      }
    },
    {
      name: 'Role precedence: direct role > user_metadata.role',
      fn: async () => {
        // Test 1: Direct role takes precedence
        const test1 = normalizeUser({
          id: 'test',
          email: 'test@test.com',
          role: 'Admin',
          user_metadata: { role: 'Manager' }
        });
        assert.equal(test1.role, 'admin'); // Lowercase

        // Test 2: user_metadata.role when no direct role
        const test2 = normalizeUser({
          id: 'test',
          email: 'test@test.com',
          user_metadata: { role: 'Manager' }
        });
        assert.equal(test2.role, 'manager'); // Lowercase
      }
    }
  ]
};
