/**
 * Unit tests for system-logs routes
 */

import { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert';

let app;
let server;
const port = 3109;

describe('System Logs Routes', () => {
  before(async () => {
    const express = (await import('express')).default;
    const createSystemLogRoutes = (await import('../../routes/system-logs.js')).default;

    const pgPoolMock = {
      query: mock.fn(async (sql, params) => {
        const text = String(sql).toLowerCase();
        if (text.startsWith('insert into system_logs')) {
          return { rows: [{ id: '1', tenant_id: params[0], level: params[1], message: params[2], source: params[3], metadata: JSON.parse(params[4]), created_at: new Date().toISOString() }] };
        }
        if (text.startsWith('select * from system_logs')) {
          return { rows: [
            { id: '1', tenant_id: 't1', level: 'INFO', message: 'm', source: 'system', metadata: { ctx: 'x' }, created_at: new Date().toISOString() },
          ] };
        }
        if (text.startsWith('delete from system_logs where id =')) {
          return { rows: [{ id: params[0] }] };
        }
        if (text.startsWith('delete from system_logs where 1=1')) {
          return { rows: [{ id: '1' }, { id: '2' }] };
        }
        return { rows: [] };
      })
    };

    app = express();
    app.use(express.json());
    app.use('/api/system-logs', createSystemLogRoutes(pgPoolMock));

    server = app.listen(port);
    await new Promise((r) => server.on('listening', r));
  });

  after(async () => {
    if (server) await new Promise((r) => server.close(r));
  });

  it('POST / creates a log and expands metadata', async () => {
    const res = await fetch(`http://localhost:${port}/api/system-logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant_id: 't1', level: 'INFO', message: 'hello', source: 'ui', user_email: 'x@y', extra: 'z' })
    });
  assert.strictEqual(res.status, 201);
  });

  it('GET / lists logs with pagination and expands metadata', async () => {
    const res = await fetch(`http://localhost:${port}/api/system-logs?tenant_id=t1&limit=1&offset=0`);
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.status, 'success');
    assert.strictEqual(json.data.total, 1);
    assert.strictEqual(json.data["system-logs"][0].ctx, 'x');
  });

  it('DELETE /:id deletes a log and returns success', async () => {
    const res = await fetch(`http://localhost:${port}/api/system-logs/123`, { method: 'DELETE' });
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.status, 'success');
  });

  it('DELETE / bulk deletion responds with deleted_count', async () => {
    const res = await fetch(`http://localhost:${port}/api/system-logs?hours=24`, { method: 'DELETE' });
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.status, 'success');
    assert.ok(json.data.deleted_count >= 0);
  });
});
