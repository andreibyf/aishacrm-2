/**
 * Unit tests for testing routes
 * Tests /api/testing endpoints including ping, suites, trigger-e2e, and workflow-status
 */

import { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert';

// Mock environment variables for tests
process.env.GITHUB_TOKEN = 'test-token-123';
process.env.GITHUB_REPO_OWNER = 'test-owner';
process.env.GITHUB_REPO_NAME = 'test-repo';
process.env.GITHUB_WORKFLOW_FILE = 'test-workflow.yml';

let app;

// Helper to make requests to the app
async function makeRequest(method, path, body = null) {
  // Simple fetch-based request helper for testing
  const url = `http://localhost:${testPort}${path}`;
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) {
    options.body = JSON.stringify(body);
  }
  return fetch(url, options);
}

const testPort = 3099;
let server;

before(async () => {
  // Import after env vars are set
  const express = (await import('express')).default;
  const createTestingRoutes = (await import('../../routes/testing.js')).default;
  
  app = express();
  app.use(express.json());
  app.use('/api/testing', createTestingRoutes(null)); // null pgPool for these tests
  
  server = app.listen(testPort);
  await new Promise((resolve) => server.on('listening', resolve));
});

after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

describe('Testing Routes', () => {
  describe('GET /api/testing/ping', () => {
    it('should return pong with timestamp', async () => {
      const res = await makeRequest('GET', '/api/testing/ping');
      assert.strictEqual(res.status, 200);
      
      const data = await res.json();
      assert.strictEqual(data.status, 'success');
      assert.strictEqual(data.data.message, 'pong');
      assert.ok(data.data.timestamp);
    });
  });

  describe('GET /api/testing/suites', () => {
    it('should return available test suites', async () => {
      const res = await makeRequest('GET', '/api/testing/suites');
      assert.strictEqual(res.status, 200);
      
      const data = await res.json();
      assert.strictEqual(data.status, 'success');
      assert.ok(Array.isArray(data.data.suites));
      assert.ok(data.data.suites.length > 0);
      
      // Check suite structure
      const firstSuite = data.data.suites[0];
      assert.ok(firstSuite.id);
      assert.ok(firstSuite.name);
      assert.ok(firstSuite.description);
    });
  });

  describe('POST /api/testing/trigger-e2e', () => {
    it('should dispatch workflow with valid suite', async () => {
      // Mock fetch for GitHub API
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock.fn(async (url, options) => {
        if (url.includes('api.github.com')) {
          return {
            ok: true,
            status: 204,
            text: async () => '',
          };
        }
        return originalFetch(url, options);
      });

      const res = await makeRequest('POST', '/api/testing/trigger-e2e', {
        suite: 'metrics',
        ref: 'main',
      });
      
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.status, 'success');
      assert.strictEqual(data.data.suite, 'metrics');
      assert.strictEqual(data.data.ref, 'main');
      assert.ok(data.data.html_url);
      assert.ok(data.data.dispatched_at);

      // Restore original fetch
      globalThis.fetch = originalFetch;
    });

    it('should handle GitHub API errors', async () => {
      // Mock fetch to return 404
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock.fn(async (url, options) => {
        if (url.includes('api.github.com')) {
          return {
            ok: false,
            status: 404,
            statusText: 'Not Found',
            json: async () => ({ message: 'Workflow not found' }),
            text: async () => 'Workflow not found',
          };
        }
        return originalFetch(url, options);
      });

      const res = await makeRequest('POST', '/api/testing/trigger-e2e', {
        suite: 'metrics',
      });
      
      // Verify the response
      assert.strictEqual(res.status, 404);
      
      // Check if response is JSON
      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const data = await res.json();
        assert.strictEqual(data.status, 'error');
        assert.ok(data.message.includes('404'));
      } else {
        // If not JSON, just verify it's an error response
        const text = await res.text();
        assert.ok(text.length > 0, 'Response should have content');
      }

      globalThis.fetch = originalFetch;
    });
  });

  describe('GET /api/testing/workflow-status', () => {
    it('should return workflow runs from GitHub', async () => {
      // Mock GitHub API response
      const mockRuns = [
        {
          id: 123456,
          status: 'completed',
          conclusion: 'success',
          html_url: 'https://github.com/test/repo/actions/runs/123456',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          head_branch: 'main',
          head_sha: 'abc123',
          run_number: 1,
        },
        {
          id: 123455,
          status: 'completed',
          conclusion: 'failure',
          html_url: 'https://github.com/test/repo/actions/runs/123455',
          created_at: new Date(Date.now() - 3600000).toISOString(),
          updated_at: new Date(Date.now() - 3600000).toISOString(),
          head_branch: 'main',
          head_sha: 'def456',
          run_number: 2,
        },
      ];

      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock.fn(async (url) => {
        if (url.includes('api.github.com')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ workflow_runs: mockRuns }),
          };
        }
        return originalFetch(url);
      });

      const res = await makeRequest('GET', '/api/testing/workflow-status?ref=main&per_page=5');
      assert.strictEqual(res.status, 200);
      
      const data = await res.json();
      assert.strictEqual(data.status, 'success');
      assert.ok(Array.isArray(data.data.runs));
      assert.strictEqual(data.data.total, 2);
      assert.ok(data.data.latest);
      assert.strictEqual(data.data.latest.id, 123456);

      globalThis.fetch = originalFetch;
    });

    it('should filter runs by created_after', async () => {
      const now = Date.now();
      const mockRuns = [
        {
          id: 123456,
          status: 'completed',
          conclusion: 'success',
          html_url: 'https://github.com/test/repo/actions/runs/123456',
          created_at: new Date(now).toISOString(),
          updated_at: new Date(now).toISOString(),
          head_branch: 'main',
          head_sha: 'abc123',
          run_number: 1,
        },
        {
          id: 123455,
          status: 'completed',
          conclusion: 'failure',
          html_url: 'https://github.com/test/repo/actions/runs/123455',
          created_at: new Date(now - 7200000).toISOString(), // 2 hours ago
          updated_at: new Date(now - 7200000).toISOString(),
          head_branch: 'main',
          head_sha: 'def456',
          run_number: 2,
        },
      ];

      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock.fn(async (url) => {
        if (url.includes('api.github.com')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ workflow_runs: mockRuns }),
          };
        }
        return originalFetch(url);
      });

      const cutoff = new Date(now - 3600000).toISOString(); // 1 hour ago
      const res = await makeRequest('GET', `/api/testing/workflow-status?ref=main&created_after=${encodeURIComponent(cutoff)}`);
      assert.strictEqual(res.status, 200);
      
      const data = await res.json();
      assert.strictEqual(data.status, 'success');
      assert.strictEqual(data.data.total, 1); // Only the recent run
      assert.strictEqual(data.data.latest.id, 123456);

      globalThis.fetch = originalFetch;
    });

    it('should return error when GITHUB_TOKEN is missing', async () => {
      // Temporarily remove token
      const token = process.env.GITHUB_TOKEN;
      delete process.env.GITHUB_TOKEN;

      const res = await makeRequest('GET', '/api/testing/workflow-status?ref=main');
        assert.ok([404, 503].includes(res.status)); // Accept 404 or 503 when token is missing
      
      const data = await res.json();
      assert.strictEqual(data.status, 'unavailable');
      assert.ok(data.message.includes('GitHub'));

      // Restore token
      process.env.GITHUB_TOKEN = token;
    });
  });
});
