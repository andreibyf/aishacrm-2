/**
 * Unit tests for system routes
 */

import { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert';

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

  it('GET /status should report server running and db disconnected', async () => {
    const res = await request('GET', '/api/system/status');
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.status, 'success');
    assert.strictEqual(json.data.server, 'running');
    assert.strictEqual(json.data.database, 'disconnected');
    assert.ok(json.data.timestamp);
  });

  it('GET /runtime should return non-secret diagnostics', async () => {
    const res = await request('GET', '/api/system/runtime');
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.status, 'success');
    assert.ok(json.data.node.version);
    assert.strictEqual(json.data.database.configured, false);
  });
});

describe('System Routes - logs with mocked pgPool', () => {
  let server2;
  const port2 = 3102;

  before(async () => {
    const express = (await import('express')).default;
    const createSystemRoutes = (await import('../../routes/system.js')).default;

    const pgPoolMock = {
      query: mock.fn(async (sql, params) => {
        // return a small set of fake rows
        return { rows: [
          { id: '1', tenant_id: params[0], level: 'info', source: 'system', message: 'ok', created_at: new Date().toISOString() },
        ]};
      }),
    };

    app = express();
    app.use(express.json());
    app.use('/api/system', createSystemRoutes(pgPoolMock));

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
    const url = `http://localhost:${port2}/api/system/logs?tenant_id=test-tenant&limit=1`;
    const res = await fetch(url);
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.status, 'success');
    assert.ok(Array.isArray(json.data));
    assert.strictEqual(json.data.length, 1);
    assert.strictEqual(json.data[0].tenant_id, 'test-tenant');
  });
});
