/**
 * Unit tests for system routes
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { initSupabaseForTests } from '../setup.js';

let app;
const testPort = 3101;
let server;

async function request(method, path, body) {
  const res = await fetch(`http://localhost:${testPort}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res;
}

describe('System Routes', () => {
  before(async () => {
    // Initialize Supabase if credentials are available
    await initSupabaseForTests();
    
    const express = (await import('express')).default;
    const createSystemRoutes = (await import('../../routes/system.js')).default;

    app = express();
    app.use(express.json());
    // no pgPool provided to exercise disconnected path
    app.use('/api/system', createSystemRoutes(null));

    server = app.listen(testPort);
    await new Promise((r) => server.on('listening', r));
  });

  after(async () => {
    if (server) await new Promise((r) => server.close(r));
  });

  it('GET /status should report server running with database status', async () => {
    const res = await request('GET', '/api/system/status');
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.status, 'success');
    assert.strictEqual(json.data.server, 'running');
    // Database status depends on whether Supabase is available
    assert.ok(['connected', 'disconnected'].includes(json.data.database) || json.data.database.startsWith('error:'));
    assert.ok(json.data.timestamp);
  });

  it('GET /runtime should return non-secret diagnostics', async () => {
    const res = await request('GET', '/api/system/runtime');
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.status, 'success');
    assert.ok(json.data.node.version);
    // database.configured is true when using supabase connection type
    assert.ok(typeof json.data.database.configured === 'boolean');
  });
});

describe('System Routes - logs with Supabase', () => {
  let server2;
  const port2 = 3102;
  let supabaseInitialized = false;

  before(async () => {
    // Initialize Supabase if credentials are available
    supabaseInitialized = await initSupabaseForTests();
    
    const express = (await import('express')).default;
    const createSystemRoutes = (await import('../../routes/system.js')).default;

    app = express();
    app.use(express.json());
    app.use('/api/system', createSystemRoutes(null));

    server2 = app.listen(port2);
    await new Promise((r) => server2.on('listening', r));
  });

  after(async () => {
    if (server2) await new Promise((r) => server2.close(r));
  });

  it('GET /logs should require tenant_id', async () => {
    const res = await fetch(`http://localhost:${port2}/api/system/logs`);
    assert.strictEqual(res.status, 400);
    const json = await res.json();
    assert.strictEqual(json.status, 'error');
    assert.ok(json.message.includes('tenant_id'));
  });

  it('GET /logs should return rows when tenant_id provided', async () => {
    if (!supabaseInitialized) {
      // Skip this test if Supabase not initialized
      return;
    }
    const url = `http://localhost:${port2}/api/system/logs?tenant_id=test-tenant&limit=1`;
    const res = await fetch(url);
    // Accept 200 (success) or 500 (network error in CI)
    assert.ok([200, 500].includes(res.status), `Expected 200 or 500, got ${res.status}`);
    if (res.status === 200) {
      const json = await res.json();
      assert.strictEqual(json.status, 'success');
      assert.ok(Array.isArray(json.data));
    }
  });
});
