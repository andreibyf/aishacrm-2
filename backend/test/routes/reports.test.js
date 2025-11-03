/**
 * Unit tests for reports routes
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';

let app;
let server;
const port = 3108;

async function request(method, path) {
  const res = await fetch(`http://localhost:${port}${path}`, { method });
  return res;
}

describe('Reports Routes', () => {
  before(async () => {
    const express = (await import('express')).default;
    const createReportRoutes = (await import('../../routes/reports.js')).default;

    app = express();
    app.use(express.json());
    app.use('/api/reports', createReportRoutes(null));

    server = app.listen(port);
    await new Promise((r) => server.on('listening', r));
  });

  after(async () => {
    if (server) await new Promise((r) => server.close(r));
  });

  it('GET /dashboard-bundle returns success bundle', async () => {
    const res = await request('GET', '/api/reports/dashboard-bundle?tenant_id=t1');
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.status, 'success');
    assert.ok(json.data.stats);
  });

  it('GET /dashboard-stats requires tenant_id when no db pool', async () => {
    const res = await request('GET', '/api/reports/dashboard-stats');
    assert.strictEqual(res.status, 400);
    const json = await res.json();
    assert.strictEqual(json.status, 'error');
  });
});
