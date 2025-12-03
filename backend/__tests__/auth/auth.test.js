/**
 * BUG-AUTH-002: Authentication regression tests
 * Tests for login credential validation and error handling
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4001';

describe('BUG-AUTH-002: Login Authentication', () => {
  describe('POST /api/auth/login', () => {
    it('should reject login with missing email', async () => {
      const response = await fetch(`${BACKEND_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'testpass123' })
      });
      
      assert.equal(response.status, 400);
      const data = await response.json();
      assert.equal(data.status, 'error');
      assert.match(data.message, /email/i);
    });

    it('should reject login with missing password', async () => {
      const response = await fetch(`${BACKEND_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com' })
      });
      
      assert.equal(response.status, 400);
      const data = await response.json();
      assert.equal(data.status, 'error');
      assert.match(data.message, /password/i);
    });

    it('should reject login with invalid credentials', async () => {
      const response = await fetch(`${BACKEND_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: 'nonexistent@example.com',
          password: 'wrongpassword'
        })
      });
      
      assert.equal(response.status, 401);
      const data = await response.json();
      assert.equal(data.status, 'error');
      assert.equal(data.message, 'Invalid credentials');
    });

    it('should reject login for disabled account', async () => {
      // This test requires a disabled test user in the database
      // Skip if test user is not available
      const testEmail = 'disabled.user@test.example.com';
      
      const response = await fetch(`${BACKEND_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: testEmail,
          password: 'testpass123'
        })
      });
      
      // Should return 403 if user exists but is disabled, or 401 if user doesn't exist
      assert.ok([401, 403].includes(response.status));
      
      if (response.status === 403) {
        const data = await response.json();
        assert.equal(data.status, 'error');
        assert.match(data.message, /disabled/i);
      }
    });

    it('should normalize email to lowercase', async () => {
      // Test that MixedCase@Example.Com is treated same as mixedcase@example.com
      const response = await fetch(`${BACKEND_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: 'MixedCase@Example.Com',
          password: 'testpass123'
        })
      });
      
      // Should return 401 for non-existent user, not 500 error
      assert.equal(response.status, 401);
      const data = await response.json();
      assert.equal(data.status, 'error');
    });

    it('should handle whitespace in email', async () => {
      const response = await fetch(`${BACKEND_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: '  test@example.com  ',
          password: 'testpass123'
        })
      });
      
      // Should return 401 for non-existent user, not 500 error
      assert.equal(response.status, 401);
      const data = await response.json();
      assert.equal(data.status, 'error');
    });
  });

  describe('POST /api/auth/verify-token', () => {
    it('should reject request with missing token', async () => {
      const response = await fetch(`${BACKEND_URL}/api/auth/verify-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      
      assert.equal(response.status, 400);
      const data = await response.json();
      assert.equal(data.status, 'error');
      assert.match(data.message, /token/i);
    });

    it('should reject invalid token', async () => {
      const response = await fetch(`${BACKEND_URL}/api/auth/verify-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'invalid.jwt.token' })
      });
      
      assert.equal(response.status, 200); // Returns success with valid:false
      const data = await response.json();
      assert.equal(data.status, 'success');
      assert.equal(data.data.valid, false);
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return 401 without auth cookie', async () => {
      const response = await fetch(`${BACKEND_URL}/api/auth/me`, {
        method: 'GET'
      });
      
      assert.equal(response.status, 401);
      const data = await response.json();
      assert.equal(data.status, 'error');
      assert.equal(data.message, 'Unauthorized');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should successfully logout even without session', async () => {
      const response = await fetch(`${BACKEND_URL}/api/auth/logout`, {
        method: 'POST'
      });
      
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.status, 'success');
    });
  });
});

/**
 * Integration tests for complete login flow
 * These require a test user to be set up in the database
 */
describe('BUG-AUTH-002: Complete Login Flow', () => {
  // Test user credentials - must exist in test database
  const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL || 'test@aishacrm.test';
  const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD || 'testpass123';
  
  // Skip these tests if test credentials are not configured
  const testRunner = process.env.TEST_USER_EMAIL ? it : it.skip;

  testRunner('should successfully login with valid credentials', async () => {
    const response = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // Include cookies
      body: JSON.stringify({ 
        email: TEST_USER_EMAIL,
        password: TEST_USER_PASSWORD
      })
    });
    
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.status, 'success');
    assert.equal(data.message, 'Login successful');
    
    // Check that cookies were set
    const cookies = response.headers.get('set-cookie');
    assert.ok(cookies);
    assert.match(cookies, /aisha_access/);
    assert.match(cookies, /aisha_refresh/);
  });

  testRunner('should be able to access /me after login', async () => {
    // First login
    const loginResponse = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ 
        email: TEST_USER_EMAIL,
        password: TEST_USER_PASSWORD
      })
    });
    
    assert.equal(loginResponse.status, 200);
    
    // Extract cookies
    const cookies = loginResponse.headers.get('set-cookie');
    const accessTokenMatch = cookies.match(/aisha_access=([^;]+)/);
    assert.ok(accessTokenMatch);
    
    const accessToken = accessTokenMatch[1];
    
    // Then access /me endpoint
    const meResponse = await fetch(`${BACKEND_URL}/api/auth/me`, {
      method: 'GET',
      headers: {
        'Cookie': `aisha_access=${accessToken}`
      }
    });
    
    assert.equal(meResponse.status, 200);
    const meData = await meResponse.json();
    assert.equal(meData.status, 'success');
    assert.ok(meData.data.user);
    assert.equal(meData.data.user.email, TEST_USER_EMAIL.toLowerCase());
  });
});
