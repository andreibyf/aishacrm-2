/**
 * Unit tests for metrics routes
 */

import { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert';

let app;
let server;
const port = 3107;

async function request(method, path) {
  const res = await fetch(`http://localhost:${port}${path}`, { method });
  return res;
}

describe('Metrics Routes', () => {
  before(async () => {
    const express = (await import('express')).default;
    const createMetricsRoutes = (await import('../../routes/metrics.js')).default;

    const pgPoolMock = {
      query: mock.fn(async (sql, _params) => {
        const text = String(sql).toLowerCase();
        if (text.includes('from performance_logs') && text.includes('select') && text.includes('id,')) {
          // logs query for /performance
          return { rows: [] };
        }
        if (text.includes('avg(duration_ms)') || text.includes('filter (where status_code')) {
          // aggregate metrics query
          return { rows: [{
            total_calls: 0,
            avg_response_time: 0,
            max_response_time: 0,
            min_response_time: 0,
            error_count: 0,
            server_error_count: 0,
            success_count: 0,
          }] };
        }
        if (text.startsWith('delete from performance_logs')) {
          // delete query
          return { rows: [{ id: '1' }] };
        }
        if (text.includes('unauthorized_count') || text.includes('rate_limit_hits') || text.includes('cors_error_count')) {
          // security metrics queries
          if (text.includes('unauthorized_count')) {
            return { rows: [{ unauthorized_count: 0, forbidden_count: 0, total_auth_failures: 0, recent_failures: [] }] };
          }
          if (text.includes('rate_limit_hits')) {
            return { rows: [{ rate_limit_hits: 0, recent_rate_limits: [] }] };
          }
          if (text.includes('cors_error_count')) {
            return { rows: [{ cors_error_count: 0 }] };
          }
        }
        if (text.includes('from apikeys')) {
          return { rows: [{ count: 0 }] };
        }
        return { rows: [] };
      })
    };

    app = express();
    app.use(express.json());
    app.use('/api/metrics', createMetricsRoutes(pgPoolMock));

    server = app.listen(port);
    await new Promise((r) => server.on('listening', r));
  });

  after(async () => {
    if (server) await new Promise((r) => server.close(r));
  });

  it('GET /usage returns success envelope', async () => {
    const res = await request('GET', '/api/metrics/usage');
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.status, 'success');
    assert.ok(json.data);
  });

  it('GET /performance returns structure with logs and metrics', async () => {
    const res = await request('GET', '/api/metrics/performance');
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.status, 'success');
    assert.ok(Array.isArray(json.data.logs));
    assert.ok(json.data.metrics);
    assert.ok(Number.isFinite(json.data.metrics.uptime));
  });

  it('DELETE /performance returns deleted_count', async () => {
    const res = await request('DELETE', '/api/metrics/performance');
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.status, 'success');
    assert.ok(json.data.deleted_count >= 0);
  });

  it('GET /security returns composed sections', async () => {
    const res = await request('GET', '/api/metrics/security');
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.status, 'success');
    assert.ok(json.data.authentication);
    assert.ok(json.data.rate_limiting);
    assert.ok(json.data.cors);
    assert.ok(json.data.api_keys);
    assert.ok(['healthy', 'warning'].includes(json.data.overall_status));
  });
});
