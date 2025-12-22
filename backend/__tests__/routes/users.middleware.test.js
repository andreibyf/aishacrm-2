/**
 * Tests for users.js - Section 2.1: Rate Limiting & Security Middleware
 * Integration tests for rate limiting behavior through HTTP endpoints
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'http';

// Import the actual routes (no mocking needed for integration test)
import createUserRoutes from '../../routes/users.js';

describe('users.js - Section 2.1: Rate Limiting & Security Middleware', () => {
  let server;
  let port;
  let baseUrl;

  beforeEach(async () => {
    // Set up environment variables for rate limiting
    process.env.ROUTE_RATE_WINDOW_MS = '500'; // 500ms for testing
    process.env.AUTH_RATE_LIMIT_MAX = '2';
    process.env.PASSWORD_RATE_LIMIT_MAX = '1';

    // Create express app
    const app = express();
    app.use(express.json());

    // Create router and mount it
    const router = createUserRoutes({}, {});
    app.use('/api/users', router);

    // Start server on random port
    server = createServer(app);
    await new Promise((resolve) => {
      server.listen(0, 'localhost', () => {
        port = server.address().port;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });
  });

  // Helper function to make requests
  async function makeRequest(method, path, options = {}) {
    const url = `${baseUrl}${path}`;
    const requestOptions = {
      method: method.toUpperCase(),
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': options.ip || '127.0.0.1',
        ...options.headers
      },
    };

    if (options.body) {
      requestOptions.body = JSON.stringify(options.body);
    }

    const response = await fetch(url, requestOptions);
    const responseBody = await response.text();
    let jsonBody;
    try {
      jsonBody = JSON.parse(responseBody);
    } catch {
      jsonBody = null;
    }

    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: jsonBody,
      text: responseBody
    };
  }

  test('should allow login requests within rate limit', async () => {
    const response = await makeRequest('POST', '/api/users/login', {
      body: { email: 'test@example.com', password: 'password123' }
    });

    // Should not be rate limited (may fail for other reasons but not 429)
    assert.notEqual(response.status, 429, 'Should not be rate limited');
  });

  test('should block login requests exceeding rate limit', async () => {
    // Make multiple requests rapidly to trigger rate limit
    const requests = [];
    for (let i = 0; i < 5; i++) {
      requests.push(makeRequest('POST', '/api/users/login', {
        body: { email: 'test@example.com', password: 'password123' },
        ip: '192.168.1.1'
      }));
    }

    const responses = await Promise.all(requests);

    // At least one response should be rate limited
    const rateLimitedResponses = responses.filter(r => r.status === 429);
    assert(rateLimitedResponses.length > 0, 'Should have at least one rate limited response');

    // Check rate limited response structure
    const rateLimitedResponse = rateLimitedResponses[0];
    assert(rateLimitedResponse.headers['retry-after'], 'Should have Retry-After header');
    assert.equal(rateLimitedResponse.body.status, 'error');
    assert.equal(rateLimitedResponse.body.message, 'Too Many Requests');
    assert.equal(rateLimitedResponse.body.code, 'RATE_LIMITED');
  });

  test('should track rate limits per IP address', async () => {
    const ip1 = '10.0.0.1';
    const ip2 = '10.0.0.2';

    // Make requests from IP1
    const ip1Requests = [];
    for (let i = 0; i < 3; i++) {
      ip1Requests.push(makeRequest('POST', '/api/users/login', {
        body: { email: 'test@example.com', password: 'password123' },
        ip: ip1
      }));
    }

    // Make requests from IP2
    const ip2Requests = [];
    for (let i = 0; i < 3; i++) {
      ip2Requests.push(makeRequest('POST', '/api/users/login', {
        body: { email: 'test@example.com', password: 'password123' },
        ip: ip2
      }));
    }

    const [ip1Responses, ip2Responses] = await Promise.all([
      Promise.all(ip1Requests),
      Promise.all(ip2Requests)
    ]);

    // Both IPs should get rate limited independently
    const ip1RateLimited = ip1Responses.filter(r => r.status === 429);
    const ip2RateLimited = ip2Responses.filter(r => r.status === 429);

    assert(ip1RateLimited.length > 0, 'IP1 should be rate limited');
    assert(ip2RateLimited.length > 0, 'IP2 should be rate limited');
  });

  test('should allow password reset requests within rate limit', async () => {
    const response = await makeRequest('POST', '/api/users/reset-password', {
      body: { email: 'test@example.com' }
    });

    // Should not be rate limited initially
    assert.notEqual(response.status, 429, 'Should not be rate limited');
  });

  test('should throttle excessive password reset requests', async () => {
    // Make multiple password reset requests for same email
    const requests = [];
    for (let i = 0; i < 3; i++) {
      requests.push(makeRequest('POST', '/api/users/reset-password', {
        body: { email: 'same@example.com' },
        ip: '127.0.0.1'
      }));
    }

    const responses = await Promise.all(requests);

    // Should get throttled (400 error with throttling message)
    const throttledResponses = responses.filter(r =>
      r.status === 400 && r.body?.message?.includes('Too many password reset attempts')
    );
    assert(throttledResponses.length > 0, 'Should have throttled responses');
  });

  test('should handle email normalization in throttling', async () => {
    // Test different email formats that should be treated as same
    const emails = ['TEST@EXAMPLE.COM', ' test@example.com ', 'Test@Example.Com'];

    const requests = emails.map(email =>
      makeRequest('POST', '/api/users/reset-password', {
        body: { email },
        ip: '127.0.0.1'
      })
    );

    const responses = await Promise.all(requests);

    // Should be treated as same email for throttling
    const throttledCount = responses.filter(r =>
      r.status === 400 && r.body?.message?.includes('Too many password reset attempts')
    ).length;
    assert(throttledCount > 0, 'Should throttle normalized emails');
  });

  test('should allow user creation within rate limit', async () => {
    const response = await makeRequest('POST', '/api/users', {
      body: {
        email: 'newuser@example.com',
        password: 'password123',
        first_name: 'John',
        last_name: 'Doe'
      }
    });

    // Should not be rate limited initially
    assert.notEqual(response.status, 429, 'Should not be rate limited');
  });

  test('should block excessive user creation requests', async () => {
    // Make multiple user creation requests
    const requests = [];
    for (let i = 0; i < 5; i++) {
      requests.push(makeRequest('POST', '/api/users', {
        body: {
          email: `user${i}@example.com`,
          password: 'password123',
          first_name: 'John',
          last_name: 'Doe'
        },
        ip: '127.0.0.1'
      }));
    }

    const responses = await Promise.all(requests);

    // Should get rate limited
    const rateLimitedResponses = responses.filter(r => r.status === 429);
    assert(rateLimitedResponses.length > 0, 'Should have rate limited responses');
  });

  test('should allow OPTIONS preflight requests', async () => {
    const response = await makeRequest('OPTIONS', '/api/users/login');

    // OPTIONS requests should always be allowed
    assert.equal(response.status, 200, 'OPTIONS should be allowed');
  });

  test('should allow requests after rate limit window expires', async () => {
    // Set very short window for testing
    process.env.ROUTE_RATE_WINDOW_MS = '100'; // 100ms

    // Trigger rate limit
    const triggerRequests = [];
    for (let i = 0; i < 5; i++) {
      triggerRequests.push(makeRequest('POST', '/api/users/login', {
        body: { email: 'test@example.com', password: 'password123' },
        ip: '127.0.0.1'
      }));
    }

    await Promise.all(triggerRequests);

    // Wait for window to expire
    await new Promise(resolve => setTimeout(resolve, 150));

    // Should allow new requests
    const response = await makeRequest('POST', '/api/users/login', {
      body: { email: 'test@example.com', password: 'password123' },
      ip: '127.0.0.1'
    });

    // Should not be rate limited anymore
    assert.notEqual(response.status, 429, 'Should allow requests after window expires');
  });
});

describe('users.js - Section 2.1: Rate Limiting & Security Middleware', () => {
  let server;
  let port;
  let baseUrl;

  beforeEach(async () => {
    // Set up environment variables for rate limiting
    process.env.ROUTE_RATE_WINDOW_MS = '500'; // 500ms for testing
    process.env.AUTH_RATE_LIMIT_MAX = '2';
    process.env.PASSWORD_RATE_LIMIT_MAX = '1';

    // Create express app
    const app = express();
    app.use(express.json());

    // Create router and mount it
    const router = createUserRoutes({}, {});
    app.use('/api/users', router);

    // Start server on random port
    server = createServer(app);
    await new Promise((resolve) => {
      server.listen(0, 'localhost', () => {
        port = server.address().port;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });
  });

  // Helper function to make requests
  async function makeRequest(method, path, options = {}) {
    const url = `${baseUrl}${path}`;
    const requestOptions = {
      method: method.toUpperCase(),
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': options.ip || '127.0.0.1',
        ...options.headers
      },
    };

    if (options.body) {
      requestOptions.body = JSON.stringify(options.body);
    }

    const response = await fetch(url, requestOptions);
    const responseBody = await response.text();
    let jsonBody;
    try {
      jsonBody = JSON.parse(responseBody);
    } catch {
      jsonBody = null;
    }

    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: jsonBody,
      text: responseBody
    };
  }

  test('should allow login requests within rate limit', async () => {
    const response = await makeRequest('POST', '/api/users/login', {
      body: { email: 'test@example.com', password: 'password123' }
    });

    // Should not be rate limited (may fail for other reasons but not 429)
    assert.notEqual(response.status, 429, 'Should not be rate limited');
  });

  test('should block login requests exceeding rate limit', async () => {
    // Make multiple requests rapidly to trigger rate limit
    const requests = [];
    for (let i = 0; i < 5; i++) {
      requests.push(makeRequest('POST', '/api/users/login', {
        body: { email: 'test@example.com', password: 'password123' },
        ip: '192.168.1.1'
      }));
    }

    const responses = await Promise.all(requests);

    // At least one response should be rate limited
    const rateLimitedResponses = responses.filter(r => r.status === 429);
    assert(rateLimitedResponses.length > 0, 'Should have at least one rate limited response');

    // Check rate limited response structure
    const rateLimitedResponse = rateLimitedResponses[0];
    assert(rateLimitedResponse.headers['retry-after'], 'Should have Retry-After header');
    assert.equal(rateLimitedResponse.body.status, 'error');
    assert.equal(rateLimitedResponse.body.message, 'Too Many Requests');
    assert.equal(rateLimitedResponse.body.code, 'RATE_LIMITED');
  });

  test('should track rate limits per IP address', async () => {
    const ip1 = '10.0.0.1';
    const ip2 = '10.0.0.2';

    // Make requests from IP1
    const ip1Requests = [];
    for (let i = 0; i < 3; i++) {
      ip1Requests.push(makeRequest('POST', '/api/users/login', {
        body: { email: 'test@example.com', password: 'password123' },
        ip: ip1
      }));
    }

    // Make requests from IP2
    const ip2Requests = [];
    for (let i = 0; i < 3; i++) {
      ip2Requests.push(makeRequest('POST', '/api/users/login', {
        body: { email: 'test@example.com', password: 'password123' },
        ip: ip2
      }));
    }

    const [ip1Responses, ip2Responses] = await Promise.all([
      Promise.all(ip1Requests),
      Promise.all(ip2Requests)
    ]);

    // Both IPs should get rate limited independently
    const ip1RateLimited = ip1Responses.filter(r => r.status === 429);
    const ip2RateLimited = ip2Responses.filter(r => r.status === 429);

    assert(ip1RateLimited.length > 0, 'IP1 should be rate limited');
    assert(ip2RateLimited.length > 0, 'IP2 should be rate limited');
  });

  test('should allow password reset requests within rate limit', async () => {
    const response = await makeRequest('POST', '/api/users/reset-password', {
      body: { email: 'test@example.com' }
    });

    // Should not be rate limited initially
    assert.notEqual(response.status, 429, 'Should not be rate limited');
  });

  test('should throttle excessive password reset requests', async () => {
    // Make multiple password reset requests for same email
    const requests = [];
    for (let i = 0; i < 3; i++) {
      requests.push(makeRequest('POST', '/api/users/reset-password', {
        body: { email: 'same@example.com' },
        ip: '127.0.0.1'
      }));
    }

    const responses = await Promise.all(requests);

    // Should get throttled (400 error with throttling message)
    const throttledResponses = responses.filter(r =>
      r.status === 400 && r.body?.message?.includes('Too many password reset attempts')
    );
    assert(throttledResponses.length > 0, 'Should have throttled responses');
  });

  test('should handle email normalization in throttling', async () => {
    // Test different email formats that should be treated as same
    const emails = ['TEST@EXAMPLE.COM', ' test@example.com ', 'Test@Example.Com'];

    const requests = emails.map(email =>
      makeRequest('POST', '/api/users/reset-password', {
        body: { email },
        ip: '127.0.0.1'
      })
    );

    const responses = await Promise.all(requests);

    // Should be treated as same email for throttling
    const throttledCount = responses.filter(r =>
      r.status === 400 && r.body?.message?.includes('Too many password reset attempts')
    ).length;
    assert(throttledCount > 0, 'Should throttle normalized emails');
  });

  test('should allow user creation within rate limit', async () => {
    const response = await makeRequest('POST', '/api/users', {
      body: {
        email: 'newuser@example.com',
        password: 'password123',
        first_name: 'John',
        last_name: 'Doe'
      }
    });

    // Should not be rate limited initially
    assert.notEqual(response.status, 429, 'Should not be rate limited');
  });

  test('should block excessive user creation requests', async () => {
    // Make multiple user creation requests
    const requests = [];
    for (let i = 0; i < 5; i++) {
      requests.push(makeRequest('POST', '/api/users', {
        body: {
          email: `user${i}@example.com`,
          password: 'password123',
          first_name: 'John',
          last_name: 'Doe'
        },
        ip: '127.0.0.1'
      }));
    }

    const responses = await Promise.all(requests);

    // Should get rate limited
    const rateLimitedResponses = responses.filter(r => r.status === 429);
    assert(rateLimitedResponses.length > 0, 'Should have rate limited responses');
  });

  test('should allow OPTIONS preflight requests', async () => {
    const response = await makeRequest('OPTIONS', '/api/users/login');

    // OPTIONS requests should always be allowed
    assert.equal(response.status, 200, 'OPTIONS should be allowed');
  });

  test('should allow requests after rate limit window expires', async () => {
    // Set very short window for testing
    process.env.ROUTE_RATE_WINDOW_MS = '100'; // 100ms

    // Trigger rate limit
    const triggerRequests = [];
    for (let i = 0; i < 5; i++) {
      triggerRequests.push(makeRequest('POST', '/api/users/login', {
        body: { email: 'test@example.com', password: 'password123' },
        ip: '127.0.0.1'
      }));
    }

    await Promise.all(triggerRequests);

    // Wait for window to expire
    await new Promise(resolve => setTimeout(resolve, 150));

    // Should allow new requests
    const response = await makeRequest('POST', '/api/users/login', {
      body: { email: 'test@example.com', password: 'password123' },
      ip: '127.0.0.1'
    });

    // Should not be rate limited anymore
    assert.notEqual(response.status, 429, 'Should allow requests after window expires');
  });
});