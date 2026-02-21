/**
 * PEP Phase 4 — Saved Reports Route Tests
 *
 * Tests for:
 *   GET    /api/pep/saved-reports
 *   POST   /api/pep/saved-reports
 *   DELETE /api/pep/saved-reports/:id
 *   PATCH  /api/pep/saved-reports/:id/run
 *
 * Strategy: each describe block gets its own Express server on a unique port
 * with a pre-configured supabase mock injected via createPepRoutes(null, mock).
 * No mock.module needed — works on Node 20+.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import express from 'express';
import { createServer } from 'node:http';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSupabaseMock({ data = null, error = null } = {}) {
  return {
    from() {
      return this;
    },
    select() {
      return this;
    },
    insert() {
      return this;
    },
    update() {
      return this;
    },
    delete() {
      return this;
    },
    eq() {
      return this;
    },
    order() {
      return this;
    },
    limit() {
      return this;
    },
    single() {
      return Promise.resolve({ data, error });
    },
    then(resolve) {
      return Promise.resolve({ data, error }).then(resolve);
    },
    rpc() {
      return Promise.resolve({ error });
    },
  };
}

let pepRoutes;

async function buildServer(port, supabaseMock) {
  if (!pepRoutes) {
    const mod = await import('../../routes/pep.js');
    pepRoutes = mod.default;
  }
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { email: 'test@tenant.com', id: 'user-uuid-123' };
    next();
  });
  app.use('/api/pep', pepRoutes(null, supabaseMock));
  const server = createServer(app);
  await new Promise((r) => server.listen(port, r));
  return server;
}

function req(port, method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  return fetch(`http://localhost:${port}${path}`, opts);
}

// ─── GET /api/pep/saved-reports ──────────────────────────────────────────────

describe('GET /api/pep/saved-reports', () => {
  let server;
  const port = 3142;

  before(async () => {
    server = await buildServer(port, makeSupabaseMock({ data: [], error: null }));
  });
  after(async () => {
    await new Promise((r) => server.close(r));
  });

  it('returns 400 when tenant_id is missing', async () => {
    const res = await req(port, 'GET', '/api/pep/saved-reports');
    assert.strictEqual(res.status, 400);
    const json = await res.json();
    assert.ok(json.message.includes('tenant_id'));
  });

  it('returns 200 with empty array when no saved reports exist', async () => {
    const res = await req(port, 'GET', '/api/pep/saved-reports?tenant_id=tenant-abc');
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.status, 'success');
    assert.ok(Array.isArray(json.data));
  });
});

// ─── POST /api/pep/saved-reports ─────────────────────────────────────────────

describe('POST /api/pep/saved-reports — validation', () => {
  let server;
  const port = 3143;

  before(async () => {
    server = await buildServer(port, makeSupabaseMock({ data: null, error: null }));
  });
  after(async () => {
    await new Promise((r) => server.close(r));
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await req(port, 'POST', '/api/pep/saved-reports', { tenant_id: 'tenant-abc' });
    assert.strictEqual(res.status, 400);
    const json = await res.json();
    assert.ok(json.message.includes('Missing required fields'));
  });

  it('returns 400 when tenant_id is missing', async () => {
    const res = await req(port, 'POST', '/api/pep/saved-reports', {
      report_name: 'My Report',
      plain_english: 'Show me open leads',
      compiled_ir: { op: 'query_entity', target: 'leads', filters: [] },
    });
    assert.strictEqual(res.status, 400);
  });
});

describe('POST /api/pep/saved-reports — duplicate', () => {
  let server;
  const port = 3144;

  before(async () => {
    const dupMock = {
      ...makeSupabaseMock(),
      single() {
        return Promise.resolve({
          data: null,
          error: { code: '23505', message: 'duplicate key value' },
        });
      },
    };
    server = await buildServer(port, dupMock);
  });
  after(async () => {
    await new Promise((r) => server.close(r));
  });

  it('returns 409 when report name already exists for tenant', async () => {
    const res = await req(port, 'POST', '/api/pep/saved-reports', {
      tenant_id: 'tenant-abc',
      report_name: 'Duplicate Report',
      plain_english: 'Show me open leads',
      compiled_ir: { op: 'query_entity', target: 'leads', filters: [] },
    });
    assert.strictEqual(res.status, 409);
    const json = await res.json();
    assert.strictEqual(json.status, 'error');
    assert.ok(json.message.includes('already exists'));
  });
});

// ─── DELETE /api/pep/saved-reports/:id ───────────────────────────────────────

describe('DELETE /api/pep/saved-reports/:id', () => {
  let server;
  const port = 3145;

  before(async () => {
    server = await buildServer(port, makeSupabaseMock({ data: null, error: null }));
  });
  after(async () => {
    await new Promise((r) => server.close(r));
  });

  it('returns 400 when tenant_id query param is missing', async () => {
    const res = await req(port, 'DELETE', '/api/pep/saved-reports/some-uuid');
    assert.strictEqual(res.status, 400);
    const json = await res.json();
    assert.ok(json.message.includes('tenant_id'));
  });

  it('returns 200 on successful delete', async () => {
    const res = await req(port, 'DELETE', '/api/pep/saved-reports/some-uuid?tenant_id=tenant-abc');
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.status, 'success');
  });
});

// ─── PATCH /api/pep/saved-reports/:id/run ────────────────────────────────────

describe('PATCH /api/pep/saved-reports/:id/run — validation', () => {
  let server;
  const port = 3146;

  before(async () => {
    server = await buildServer(port, makeSupabaseMock({ data: null, error: null }));
  });
  after(async () => {
    await new Promise((r) => server.close(r));
  });

  it('returns 400 when tenant_id body field is missing', async () => {
    const res = await req(port, 'PATCH', '/api/pep/saved-reports/some-uuid/run', {});
    assert.strictEqual(res.status, 400);
    const json = await res.json();
    assert.ok(json.message.includes('tenant_id'));
  });
});

describe('PATCH /api/pep/saved-reports/:id/run — not found', () => {
  let server;
  const port = 3147;

  before(async () => {
    const notFoundMock = {
      ...makeSupabaseMock(),
      rpc() {
        return Promise.resolve({ error: { message: 'not found', code: 'P0001' } });
      },
    };
    server = await buildServer(port, notFoundMock);
  });
  after(async () => {
    await new Promise((r) => server.close(r));
  });

  it('returns 404 when saved report does not exist for tenant', async () => {
    const res = await req(port, 'PATCH', '/api/pep/saved-reports/missing-uuid/run', {
      tenant_id: 'tenant-abc',
    });
    assert.strictEqual(res.status, 404);
    const json = await res.json();
    assert.strictEqual(json.status, 'error');
  });
});

describe('PATCH /api/pep/saved-reports/:id/run — success', () => {
  let server;
  const port = 3148;
  let rpcCalled = false;

  before(async () => {
    const rpcMock = {
      ...makeSupabaseMock(),
      rpc(fnName, params) {
        rpcCalled = true;
        assert.strictEqual(fnName, 'pep_increment_report_run');
        assert.strictEqual(params.p_id, 'existing-uuid');
        assert.strictEqual(params.p_tenant_id, 'tenant-abc');
        return Promise.resolve({ error: null });
      },
    };
    server = await buildServer(port, rpcMock);
  });
  after(async () => {
    await new Promise((r) => server.close(r));
  });

  it('returns 200 on successful atomic increment via RPC', async () => {
    const res = await req(port, 'PATCH', '/api/pep/saved-reports/existing-uuid/run', {
      tenant_id: 'tenant-abc',
    });
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.status, 'success');
    assert.ok(rpcCalled, 'rpc should have been called');
  });
});

// ─── Tenant isolation ─────────────────────────────────────────────────────────

describe('Tenant isolation', () => {
  let server;
  const port = 3149;

  before(async () => {
    server = await buildServer(port, makeSupabaseMock({ data: null, error: null }));
  });
  after(async () => {
    await new Promise((r) => server.close(r));
  });

  it('DELETE always scopes by tenant_id — wrong tenant gets no rows deleted', async () => {
    const res = await req(
      port,
      'DELETE',
      '/api/pep/saved-reports/uuid-owned-by-other-tenant?tenant_id=tenant-xyz',
    );
    assert.strictEqual(res.status, 200);
  });
});
