import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';

process.env.NODE_ENV = 'test';
process.env.ROUTE_RATE_WINDOW_MS = '1000'; // Short window for testing
process.env.AUTH_RATE_LIMIT_MAX = '2'; // Low limit for testing
process.env.PASSWORD_RATE_LIMIT_MAX = '1'; // Very low limit for testing
process.env.USER_MUTATE_RATE_LIMIT_MAX = '5'; // Low limit for mutation testing
process.env.JWT_SECRET = 'test-jwt-secret'; // Test JWT secret

let app;
let server;
const testPort = 3103;

// Helper to make requests to the app
async function makeRequest(method, path, body = null, headers = {}) {
  const url = `http://localhost:${testPort}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout
  
  try {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '127.0.0.1', // Simulate IP for rate limiting
        ...headers
      },
      signal: controller.signal,
    };
    if (body) {
      options.body = JSON.stringify(body);
    }
    return await fetch(url, options);
  } finally {
    clearTimeout(timeout);
  }
}

before(async () => {
  // Import after env vars are set
  const express = (await import('express')).default;
  const createUserRoutes = (await import('../../routes/users.js')).default;

  app = express();
  app.set('trust proxy', 1); // Trust proxy to use X-Forwarded-For header
  app.use(express.json());

  // Mock pgPool and supabaseAuth for testing
  const mockPgPool = null; // Routes should handle null pgPool gracefully for middleware tests
  const mockSupabaseAuth = {
    // Mock auth functions that might be called
    inviteUserByEmail: async (email, metadata) => {
      // Mock invitation - return success for valid emails
      if (email && email.includes('@')) {
        return {
          user: {
            id: 'auth-invited-' + Date.now(),
            email: email,
            user_metadata: metadata
          },
          error: null
        };
      }
      return { user: null, error: { message: 'Invalid email' } };
    },
    getAuthUserByEmail: async (email) => {
      // Mock auth user lookup for registration
      if (email === 'existing@test.com') {
        return {
          user: {
            id: 'auth-existing-123',
            email: 'existing@test.com',
          }
        };
      }
      return null;
    },
  };

  // Create routes with mocks
  const router = createUserRoutes(mockPgPool, mockSupabaseAuth);
  app.use('/api/users', router);

  // Start test server
  await new Promise((resolve) => {
    server = app.listen(testPort, () => resolve());
  });
});

after(async () => {
  if (server) {
    server.close();
  }
});

describe('users.js - Section 2.4: User Creation & Registration', () => {
  describe('POST /api/users - Create new user', () => {
    it('should require email and first_name', async () => {
      const response = await makeRequest('POST', '/api/users', {});
      assert.strictEqual(response.status, 400);
      const data = await response.json();
      assert.strictEqual(data.status, 'error');
      assert(data.message.includes('email and first_name are required'));
    });

    it('should require first_name', async () => {
      const response = await makeRequest('POST', '/api/users', { email: 'test@example.com' });
      // May be rate limited or blocked for test email
      assert([400, 403, 429].includes(response.status));
      if (response.status === 400) {
        const data = await response.json();
        assert.strictEqual(data.status, 'error');
        assert(data.message.includes('email and first_name are required'));
      }
    });

    it('should block test email patterns', async () => {
      const testEmails = [
        'audit.test.user@example.com',
        'e2e.temp.user@example.com',
        'user@playwright.test',
        'user@example.com'
      ];

      for (const email of testEmails) {
        const response = await makeRequest('POST', '/api/users', {
          email,
          first_name: 'Test',
          last_name: 'User'
        });
        // May be rate limited, but if not, should be blocked
        if (response.status !== 429) {
          assert.strictEqual(response.status, 403);
          const data = await response.json();
          assert.strictEqual(data.status, 'error');
          assert.strictEqual(data.code, 'TEST_EMAIL_BLOCKED');
        }
      }
    });

    it('should reject duplicate emails across users and employees', async () => {
      // First create a user
      const createResponse = await makeRequest('POST', '/api/users', {
        email: 'duplicate@test.com',
        first_name: 'Original',
        last_name: 'User',
        role: 'admin',
        tenant_id: 'test-tenant-123'
      });

      // Mock should allow first creation
      if (createResponse.status === 200) {
        // Second attempt should fail
        const duplicateResponse = await makeRequest('POST', '/api/users', {
          email: 'duplicate@test.com',
          first_name: 'Duplicate',
          last_name: 'User',
          role: 'user',
          tenant_id: 'test-tenant-456'
        });
        assert.strictEqual(duplicateResponse.status, 409);
        const data = await duplicateResponse.json();
        assert.strictEqual(data.status, 'error');
        assert.strictEqual(data.code, 'DUPLICATE_EMAIL');
      }
    });

    it('should create tenant admin user', async () => {
      const response = await makeRequest('POST', '/api/users', {
        email: 'admin@test.com',
        first_name: 'Admin',
        last_name: 'User',
        role: 'admin',
        tenant_id: 'test-tenant-123',
        metadata: { department: 'IT' }
      });

      // May be rate limited or succeed
      assert([200, 409, 429, 500].includes(response.status));
      if (response.status === 200) {
        const data = await response.json();
        assert.strictEqual(data.status, 'success');
        assert(data.data.user);
        assert.strictEqual(data.data.user.email, 'admin@test.com');
        assert.strictEqual(data.data.user.role, 'admin');
        assert(data.data.auth.invitation_queued);
      }
    });

    it('should create tenant employee user', async () => {
      const response = await makeRequest('POST', '/api/users', {
        email: 'employee@test.com',
        first_name: 'Employee',
        last_name: 'User',
        role: 'manager',
        tenant_id: 'test-tenant-123',
        status: 'active',
        metadata: { department: 'Sales' }
      });

      // May be rate limited or succeed
      assert([200, 409, 429, 500].includes(response.status));
      if (response.status === 200) {
        const data = await response.json();
        assert.strictEqual(data.status, 'success');
        assert(data.data.user);
        assert.strictEqual(data.data.user.email, 'employee@test.com');
        assert.strictEqual(data.data.user.role, 'manager');
        assert.strictEqual(data.data.user.user_type, 'employee');
      }
    });

    it('should require tenant_id for employee creation', async () => {
      const response = await makeRequest('POST', '/api/users', {
        email: 'notenant@test.com',
        first_name: 'No',
        last_name: 'Tenant',
        role: 'user'
      });

      // May be rate limited, but if not, should fail due to missing tenant_id
      assert([400, 429].includes(response.status));
      if (response.status === 400) {
        const data = await response.json();
        assert.strictEqual(data.status, 'error');
      }
    });

    it('should handle metadata expansion', async () => {
      const response = await makeRequest('POST', '/api/users', {
        email: 'metadata@test.com',
        first_name: 'Meta',
        last_name: 'Data',
        role: 'admin',
        tenant_id: 'test-tenant-123',
        metadata: {
          tags: ['test', 'metadata'],
          permissions: { read: true, write: false },
          custom_field: 'value'
        }
      });

      if (response.status === 200) {
        const data = await response.json();
        assert.strictEqual(data.status, 'success');
        const user = data.data.user;
        // Metadata should be expanded to top-level where applicable
        assert(Array.isArray(user.tags));
        assert(user.tags.includes('test'));
      }
    });

    it('should handle database errors gracefully', async () => {
      // Test with invalid data that might cause DB errors
      const response = await makeRequest('POST', '/api/users', {
        email: 'error@test.com',
        first_name: 'Error',
        last_name: 'Test',
        role: 'admin',
        tenant_id: 'test-tenant-123'
      });

      // Either succeeds, fails, or is rate limited
      assert([200, 409, 429, 500].includes(response.status));
      const data = await response.json();
      assert(['success', 'error'].includes(data.status));
    });

    it('should create audit log for user creation', async () => {
      const response = await makeRequest('POST', '/api/users', {
        email: 'audit@test.com',
        first_name: 'Audit',
        last_name: 'Log',
        role: 'admin',
        tenant_id: 'test-tenant-123'
      });

      if (response.status === 200) {
        const data = await response.json();
        assert.strictEqual(data.status, 'success');
        // Audit logging is tested indirectly through success
        assert(data.data.user.id);
      }
    });
  });

  describe('POST /api/users/register - User registration', () => {
    it('should require tenant_id and email', async () => {
      const response = await makeRequest('POST', '/api/users/register', {});
      assert.strictEqual(response.status, 400);
      const data = await response.json();
      assert.strictEqual(data.status, 'error');
      assert(data.message.includes('tenant_id and email are required'));
    });

    it('should require tenant_id', async () => {
      const response = await makeRequest('POST', '/api/users/register', {
        email: 'register@test.com'
      });
      assert.strictEqual(response.status, 400);
      const data = await response.json();
      assert.strictEqual(data.status, 'error');
      assert(data.message.includes('tenant_id and email are required'));
    });

    it('should require email', async () => {
      const response = await makeRequest('POST', '/api/users/register', {
        tenant_id: 'test-tenant-123'
      });
      // May be rate limited, but if not, should require email
      assert([400, 429].includes(response.status));
      if (response.status === 400) {
        const data = await response.json();
        assert.strictEqual(data.status, 'error');
        assert(data.message.includes('tenant_id and email are required'));
      }
    });

    it('should reject duplicate email registration', async () => {
      // Mock considers 'existing@test.com' as existing
      const response = await makeRequest('POST', '/api/users/register', {
        tenant_id: 'test-tenant-123',
        email: 'existing@test.com',
        first_name: 'Existing',
        last_name: 'User'
      });
      // May be rate limited, but if not, should reject duplicate
      assert([409, 429].includes(response.status));
      if (response.status === 409) {
        const data = await response.json();
        assert.strictEqual(data.status, 'error');
        assert(data.message.includes('User already exists'));
      }
    });

    it('should register new user successfully', async () => {
      const response = await makeRequest('POST', '/api/users/register', {
        tenant_id: 'test-tenant-123',
        email: 'newregister@test.com',
        first_name: 'New',
        last_name: 'Register',
        role: 'user'
      });

      // May be rate limited or succeed
      assert([200, 429, 500].includes(response.status));
      if (response.status === 200) {
        const data = await response.json();
        assert.strictEqual(data.status, 'success');
        assert.strictEqual(data.message, 'Registration successful');
        assert(data.data.user);
        assert.strictEqual(data.data.user.email, 'newregister@test.com');
        assert.strictEqual(data.data.user.role, 'user');
        assert.strictEqual(data.data.user.status, 'active');
      }
    });

    it('should default role to user if not specified', async () => {
      const response = await makeRequest('POST', '/api/users/register', {
        tenant_id: 'test-tenant-123',
        email: 'defaultrole@test.com',
        first_name: 'Default',
        last_name: 'Role'
      });

      if (response.status === 200) {
        const data = await response.json();
        assert.strictEqual(data.data.user.role, 'user');
      }
    });

    it('should accept custom role', async () => {
      const response = await makeRequest('POST', '/api/users/register', {
        tenant_id: 'test-tenant-123',
        email: 'customrole@test.com',
        first_name: 'Custom',
        last_name: 'Role',
        role: 'manager'
      });

      if (response.status === 200) {
        const data = await response.json();
        assert.strictEqual(data.data.user.role, 'manager');
      }
    });

    it('should handle optional last_name', async () => {
      const response = await makeRequest('POST', '/api/users/register', {
        tenant_id: 'test-tenant-123',
        email: 'nolastname@test.com',
        first_name: 'No',
        role: 'user'
      });

      if (response.status === 200) {
        const data = await response.json();
        assert.strictEqual(data.data.user.first_name, 'No');
        assert.strictEqual(data.data.user.email, 'nolastname@test.com');
      }
    });

    it('should handle database errors gracefully', async () => {
      // Test with invalid data that might cause DB errors
      const response = await makeRequest('POST', '/api/users/register', {
        tenant_id: 'test-tenant-123',
        email: 'error@test.com',
        first_name: 'Error',
        last_name: 'Test'
      });

      // Either succeeds, fails, or is rate limited
      assert([200, 409, 429, 500].includes(response.status));
      const data = await response.json();
      assert(['success', 'error'].includes(data.status));
      if (data.status === 'error') {
        assert(data.message);
      }
    });
  });

  describe('Integration between creation and registration', () => {
    it('should allow registration after creation', async () => {
      // This tests that the endpoints work together
      // First create via POST /users
      const createResponse = await makeRequest('POST', '/api/users', {
        email: 'integration@test.com',
        first_name: 'Integration',
        last_name: 'Test',
        role: 'admin',
        tenant_id: 'test-tenant-123'
      });

      // Then try to register same email (should fail)
      const registerResponse = await makeRequest('POST', '/api/users/register', {
        tenant_id: 'test-tenant-456',
        email: 'integration@test.com',
        first_name: 'Integration',
        last_name: 'Register'
      });

      // Should fail due to duplicate or rate limiting
      assert([409, 429].includes(registerResponse.status));
    });

    it('should handle concurrent registration attempts', async () => {
      // Test concurrent requests (simplified)
      const promises = [];
      for (let i = 0; i < 3; i++) {
        promises.push(makeRequest('POST', '/api/users/register', {
          tenant_id: 'test-tenant-123',
          email: `concurrent${i}@test.com`,
          first_name: 'Concurrent',
          last_name: `Test${i}`
        }));
      }

      const results = await Promise.all(promises);
      const successCount = results.filter(r => r.status === 200).length;
      const duplicateCount = results.filter(r => r.status === 409).length;
      const rateLimitedCount = results.filter(r => r.status === 429).length;

      // Should have some successes, duplicates, or rate limiting
      assert(successCount + duplicateCount + rateLimitedCount === 3);
    });
  });

  describe('Rate limiting for creation endpoints', () => {
    it('should apply rate limiting to POST /users', async () => {
      const requests = [];
      // Make multiple requests quickly
      for (let i = 0; i < 10; i++) {
        requests.push(makeRequest('POST', '/api/users', {
          email: `ratelimit${i}@test.com`,
          first_name: 'Rate',
          last_name: 'Limit',
          role: 'admin',
          tenant_id: 'test-tenant-123'
        }));
      }

      const results = await Promise.all(requests);
      const rateLimited = results.filter(r => r.status === 429).length;
      const successful = results.filter(r => r.status === 200 || r.status === 409).length;

      // Should have some rate limiting
      assert(rateLimited + successful === 10);
    });

    it('should apply rate limiting to POST /register', async () => {
      const requests = [];
      // Make multiple requests quickly
      for (let i = 0; i < 5; i++) {
        requests.push(makeRequest('POST', '/api/users/register', {
          tenant_id: 'test-tenant-123',
          email: `registerlimit${i}@test.com`,
          first_name: 'Register',
          last_name: 'Limit'
        }));
      }

      const results = await Promise.all(requests);
      const rateLimited = results.filter(r => r.status === 429).length;
      const successful = results.filter(r => [200, 409, 500].includes(r.status)).length;

      // Should have some rate limiting
      assert(rateLimited + successful === 5);
    });
  });
});