/**
 * Unit tests for MCP routes
 * Tests the health-proxy and run-proxy endpoints
 * 
 * Note: These tests require Supabase to be configured, so we focus on
 * endpoints that don't require database access (health checks, proxy routes)
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';

let app;
const testPort = 3110;
let server;

async function request(method, path, body) {
  const res = await fetch(`http://localhost:${testPort}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res;
}

describe('MCP Routes - Health Endpoints', () => {
  before(async () => {
    // Initialize Supabase client with mock values for routes that need it
    const { initSupabaseDB } = await import('../../lib/supabase-db.js');
    
    // Set mock environment variables - these need valid format but don't need to be real
    // Using clearly identifiable mock values that won't be confused with real tokens
    process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://test-mock-project.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-mock-service-role-key-for-unit-tests-only';
    
    try {
      initSupabaseDB(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    } catch (err) {
      // Only ignore "already initialized" errors, re-throw unexpected errors
      if (!err.message?.includes('already') && !err.message?.includes('initialized')) {
        throw err;
      }
    }
    
    const express = (await import('express')).default;
    const createMCPRoutes = (await import('../../routes/mcp.js')).default;

    app = express();
    app.use(express.json());
    app.use('/api/mcp', createMCPRoutes(null));

    server = app.listen(testPort);
    await new Promise((r) => server.on('listening', r));
  });

  after(async () => {
    if (server) await new Promise((r) => server.close(r));
  });

  it('GET /servers should return list of MCP servers', async () => {
    const res = await request('GET', '/api/mcp/servers');
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.status, 'success');
    assert.ok(Array.isArray(json.data.servers));
    // Should have at least CRM, Web, and LLM servers
    const serverIds = json.data.servers.map(s => s.id);
    assert.ok(serverIds.includes('crm'), 'Should have CRM server');
    assert.ok(serverIds.includes('web'), 'Should have Web server');
    assert.ok(serverIds.includes('llm'), 'Should have LLM server');
  });

  it('GET /resources should return empty resources list', async () => {
    const res = await request('GET', '/api/mcp/resources');
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.status, 'success');
    assert.ok(Array.isArray(json.data.resources));
  });

  it('GET /health-proxy should return proper response format with reachable status', async () => {
    const res = await request('GET', '/api/mcp/health-proxy');
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.status, 'success');
    assert.ok('reachable' in json.data, 'Should have reachable field');
    assert.ok('attempted' in json.data, 'Should have attempted count');
    // If not reachable, should have error message (expected when MCP server is not running)
    if (!json.data.reachable) {
      assert.ok('error' in json.data, 'Should have error when not reachable');
      assert.ok(json.data.error.includes('MCP server'), 'Error should mention MCP server');
      // Verify candidates are included for debugging
      assert.ok('candidates' in json.data, 'Should include candidates list for debugging');
      assert.ok(Array.isArray(json.data.candidates), 'Candidates should be an array');
    }
  });

  it('GET /github/health should return status (may indicate missing token)', async () => {
    const res = await request('GET', '/api/mcp/github/health');
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.status, 'success');
    assert.ok('configured' in json.data);
    assert.ok('healthy' in json.data);
  });

  it('POST /run-proxy should handle MCP server not running gracefully', async () => {
    const res = await request('POST', '/api/mcp/run-proxy', {
      requestId: 'test-request-1',
      actor: { id: 'test:user', type: 'user' },
      actions: [{
        id: 'action-1',
        verb: 'read',
        resource: { system: 'mock', kind: 'test' }
      }]
    });
    // Should return 502 if MCP server not running
    assert.ok([200, 502].includes(res.status), `Expected 200 or 502, got ${res.status}`);
    const json = await res.json();
    if (res.status === 502) {
      assert.strictEqual(json.status, 'error');
      assert.ok(json.message.includes('MCP server'), 'Error should mention MCP server');
    }
  });
});
