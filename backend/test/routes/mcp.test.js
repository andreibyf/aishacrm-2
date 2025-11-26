/**
 * Unit tests for MCP routes
 * Tests /api/mcp endpoints including run-proxy fallback for Wikipedia search
 * 
 * Note: These tests require Supabase initialization for full route support.
 * For CI environments without database access, we mock the Supabase client.
 * 
 * Tests that require external network access (Wikipedia API) are marked as skipped
 * in sandboxed environments without internet access.
 */

import { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert';

// Set up environment variables before importing modules
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key';

// Well-known Wikipedia page IDs for testing
// See: https://en.wikipedia.org/wiki/Wikipedia:Unique_article_identification
const WIKIPEDIA_AI_PAGE_ID = '21721040'; // Artificial intelligence article

let app;
const testPort = 3098;
let server;
let hasInternetAccess = false;

// Helper to make requests to the app
async function makeRequest(method, path, body = null) {
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

// Check if we have internet access (to Wikipedia API)
async function checkInternetAccess() {
  try {
    const resp = await fetch('https://en.wikipedia.org/w/api.php?action=query&meta=siteinfo&format=json', {
      signal: AbortSignal.timeout(3000)
    });
    return resp.ok;
  } catch {
    return false;
  }
}

before(async () => {
  // Check internet access
  hasInternetAccess = await checkInternetAccess();
  console.log(`Internet access to Wikipedia: ${hasInternetAccess ? 'available' : 'unavailable'}`);

  // Initialize Supabase
  const supabaseDb = await import('../../lib/supabase-db.js');
  try {
    supabaseDb.initSupabaseDB(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  } catch (e) {
    // Already initialized or mock failure - continue
  }

  const express = (await import('express')).default;
  const createMCPRoutes = (await import('../../routes/mcp.js')).default;
  
  app = express();
  app.use(express.json());
  app.use('/api/mcp', createMCPRoutes(null));
  
  server = app.listen(testPort);
  await new Promise((resolve) => server.on('listening', resolve));
});

after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

describe('MCP Routes', async () => {
  describe('POST /api/mcp/run-proxy - Web Adapter Fallback', async () => {
    it('should handle Wikipedia search fallback (returns success with internet, error without)', async () => {
      const envelope = {
        requestId: `test-${Date.now()}`,
        actor: { id: 'user:test', type: 'user' },
        createdAt: new Date().toISOString(),
        actions: [{
          id: 'action-1',
          verb: 'search',
          actor: { id: 'user:test', type: 'user' },
          resource: { system: 'web', kind: 'wikipedia-search' },
          payload: { q: 'artificial intelligence' }
        }]
      };

      const resp = await makeRequest('POST', '/api/mcp/run-proxy', envelope);
      const json = await resp.json();

      // Should return 200 with fallback mechanism (even if Wikipedia is unreachable)
      assert.strictEqual(resp.status, 200, `Expected 200, got ${resp.status}: ${JSON.stringify(json)}`);
      assert.strictEqual(json.status, 'success', 'Response status should be success');
      assert.ok(json.data, 'Response should have data');
      assert.ok(Array.isArray(json.data.results), 'Results should be an array');
      assert.ok(json.data.results.length > 0, 'Should have at least one result');
      
      // Verify fallback was used
      assert.strictEqual(json.data.base, 'inline-fallback', 'Should indicate fallback was used');
      
      const firstResult = json.data.results[0];
      if (hasInternetAccess) {
        assert.strictEqual(firstResult.status, 'success', 'First result status should be success with internet');
        assert.ok(Array.isArray(firstResult.data), 'First result data should be an array');
      } else {
        // Without internet, we expect an error result
        assert.strictEqual(firstResult.status, 'error', 'First result status should be error without internet');
        assert.ok(firstResult.errorCode, 'Should have an error code');
      }
    });

    it('should handle Wikipedia page fetch fallback (returns success with internet, error without)', async () => {
      const envelope = {
        requestId: `test-${Date.now()}`,
        actor: { id: 'user:test', type: 'user' },
        createdAt: new Date().toISOString(),
        actions: [{
          id: 'action-1',
          verb: 'read',
          actor: { id: 'user:test', type: 'user' },
          resource: { system: 'web', kind: 'wikipedia-page' },
          payload: { pageid: WIKIPEDIA_AI_PAGE_ID } // Artificial intelligence page
        }]
      };

      const resp = await makeRequest('POST', '/api/mcp/run-proxy', envelope);
      const json = await resp.json();

      assert.strictEqual(resp.status, 200, `Expected 200, got ${resp.status}: ${JSON.stringify(json)}`);
      assert.strictEqual(json.status, 'success', 'Response status should be success');
      assert.ok(json.data, 'Response should have data');
      assert.ok(Array.isArray(json.data.results), 'Results should be an array');
      
      const firstResult = json.data.results[0];
      if (hasInternetAccess) {
        assert.strictEqual(firstResult.status, 'success', 'First result status should be success with internet');
        assert.ok(firstResult.data, 'First result should have data');
      } else {
        assert.strictEqual(firstResult.status, 'error', 'First result status should be error without internet');
      }
    });

    it('should return error for missing query parameter in Wikipedia search', async () => {
      const envelope = {
        requestId: `test-${Date.now()}`,
        actor: { id: 'user:test', type: 'user' },
        createdAt: new Date().toISOString(),
        actions: [{
          id: 'action-1',
          verb: 'search',
          actor: { id: 'user:test', type: 'user' },
          resource: { system: 'web', kind: 'wikipedia-search' },
          payload: {} // Missing 'q' parameter
        }]
      };

      const resp = await makeRequest('POST', '/api/mcp/run-proxy', envelope);
      const json = await resp.json();

      assert.strictEqual(resp.status, 200, `Expected 200, got ${resp.status}: ${JSON.stringify(json)}`);
      assert.ok(json.data, 'Response should have data');
      assert.ok(Array.isArray(json.data.results), 'Results should be an array');
      
      const firstResult = json.data.results[0];
      assert.strictEqual(firstResult.status, 'error', 'First result status should be error');
      assert.strictEqual(firstResult.errorCode, 'MISSING_QUERY', 'Error code should be MISSING_QUERY');
    });

    it('should return error for missing pageid parameter in Wikipedia page fetch', async () => {
      const envelope = {
        requestId: `test-${Date.now()}`,
        actor: { id: 'user:test', type: 'user' },
        createdAt: new Date().toISOString(),
        actions: [{
          id: 'action-1',
          verb: 'read',
          actor: { id: 'user:test', type: 'user' },
          resource: { system: 'web', kind: 'wikipedia-page' },
          payload: {} // Missing 'pageid' parameter
        }]
      };

      const resp = await makeRequest('POST', '/api/mcp/run-proxy', envelope);
      const json = await resp.json();

      assert.strictEqual(resp.status, 200, `Expected 200, got ${resp.status}: ${JSON.stringify(json)}`);
      assert.ok(json.data, 'Response should have data');
      assert.ok(Array.isArray(json.data.results), 'Results should be an array');
      
      const firstResult = json.data.results[0];
      assert.strictEqual(firstResult.status, 'error', 'First result status should be error');
      assert.strictEqual(firstResult.errorCode, 'MISSING_PAGEID', 'Error code should be MISSING_PAGEID');
    });

    it('should return 502 for non-web adapters when MCP server is unreachable', async () => {
      const envelope = {
        requestId: `test-${Date.now()}`,
        actor: { id: 'user:test', type: 'user' },
        createdAt: new Date().toISOString(),
        actions: [{
          id: 'action-1',
          verb: 'search',
          actor: { id: 'user:test', type: 'user' },
          resource: { system: 'github', kind: 'repos' },
          payload: { per_page: 5 }
        }]
      };

      const resp = await makeRequest('POST', '/api/mcp/run-proxy', envelope);
      const json = await resp.json();

      // Should fail with 502 since GitHub adapter has no fallback
      assert.strictEqual(resp.status, 502, `Expected 502, got ${resp.status}`);
      assert.strictEqual(json.status, 'error', 'Response status should be error');
      assert.ok(json.message.includes('MCP run-proxy failed'), 'Error message should mention run-proxy failed');
    });
  });

  describe('GET /api/mcp/servers', async () => {
    it('should return list of available MCP servers', async () => {
      const resp = await makeRequest('GET', '/api/mcp/servers');
      const json = await resp.json();

      assert.strictEqual(resp.status, 200, `Expected 200, got ${resp.status}`);
      assert.strictEqual(json.status, 'success', 'Response status should be success');
      assert.ok(json.data, 'Response should have data');
      assert.ok(Array.isArray(json.data.servers), 'Servers should be an array');
      
      // Should include web research MCP
      const webServer = json.data.servers.find(s => s.id === 'web');
      assert.ok(webServer, 'Should include web research MCP server');
      assert.ok(webServer.capabilities.includes('web.search_wikipedia'), 'Web server should have search_wikipedia capability');
    });
  });

  describe('POST /api/mcp/execute-tool - Web Tools', async () => {
    it('should handle web.search_wikipedia tool directly (success with internet, error without)', async () => {
      const resp = await makeRequest('POST', '/api/mcp/execute-tool', {
        server_id: 'web',
        tool_name: 'web.search_wikipedia',
        parameters: { q: 'machine learning' }
      });
      const json = await resp.json();

      if (hasInternetAccess) {
        assert.strictEqual(resp.status, 200, `Expected 200, got ${resp.status}: ${JSON.stringify(json)}`);
        assert.strictEqual(json.status, 'success', 'Response status should be success');
        assert.ok(Array.isArray(json.data), 'Data should be an array of search results');
      } else {
        // Without internet access, we expect a 500 error
        assert.strictEqual(resp.status, 500, `Expected 500 without internet, got ${resp.status}`);
        assert.strictEqual(json.status, 'error', 'Response status should be error');
      }
    });

    it('should handle web.get_wikipedia_page tool directly (success with internet, error without)', async () => {
      const resp = await makeRequest('POST', '/api/mcp/execute-tool', {
        server_id: 'web',
        tool_name: 'web.get_wikipedia_page',
        parameters: { pageid: WIKIPEDIA_AI_PAGE_ID }
      });
      const json = await resp.json();

      if (hasInternetAccess) {
        assert.strictEqual(resp.status, 200, `Expected 200, got ${resp.status}: ${JSON.stringify(json)}`);
        assert.strictEqual(json.status, 'success', 'Response status should be success');
        assert.ok(json.data, 'Data should contain page information');
      } else {
        // Without internet access, we expect a 500 error
        assert.strictEqual(resp.status, 500, `Expected 500 without internet, got ${resp.status}`);
        assert.strictEqual(json.status, 'error', 'Response status should be error');
      }
    });
  });
});
