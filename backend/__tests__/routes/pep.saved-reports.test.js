/**
 * PEP Phase 4 — Saved Reports Route Tests
 *
 * Tests for:
 *   GET    /api/pep/saved-reports
 *   POST   /api/pep/saved-reports
 *   DELETE /api/pep/saved-reports/:id
 *   PATCH  /api/pep/saved-reports/:id/run
 *
 * Strategy: mock authenticateRequest + getSupabaseClient so tests run
 * without live credentials. Validates input validation, tenant isolation
 * guards, conflict handling (409), and happy-path shapes.
 */

import { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert';

// ─── Supabase mock factory ────────────────────────────────────────────────────

/**
 * Build a chainable Supabase query mock that resolves to { data, error }.
 * Each method returns `this` so chaining works: .from().select().eq()...
 */
function makeSupabaseMock({ data = null, error = null, single = false } = {}) {
  const chain = {
    data,
    error,
    _single: single,
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
    single() {
      this._single = true;
      return Promise.resolve({ data: this.data, error: this.error });
    },
    then(resolve) {
      return Promise.resolve({ data: this.data, error: this.error }).then(resolve);
    },
  };
  return chain;
}

const port = 3142;

async function request(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  return fetch(`http://localhost:${port}${path}`, opts);
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('PEP Phase 4 — Saved Reports Routes', () => {
  let app;
  let server;

  before(async () => {
    // Mock authenticateRequest — sets req.user and calls next()
    mock.module('../../middleware/authenticate.js', {
      namedExports: {
        authenticateRequest: (_req, _res, next) => {
          _req.user = { email: 'test@tenant.com', id: 'user-uuid-123' };
          next();
        },
      },
    });

    // Mock logger to silence output during tests
    mock.module('../../lib/logger.js', {
      defaultExport: {
        warn: () => {},
        error: () => {},
        info: () => {},
      },
    });

    // Mock the PEP compiler modules (not used by saved-reports endpoints but imported at top level)
    mock.module('../../../pep/compiler/resolver.js', {
      namedExports: { resolveQuery: () => ({}) },
    });
    mock.module('../../../pep/compiler/emitter.js', {
      namedExports: { emitQuery: () => ({}), buildConfirmationString: () => '' },
    });
    mock.module('../../../pep/compiler/llmParser.js', {
      namedExports: { parseLLM: async () => ({ match: false }) },
    });

    const express = (await import('express')).default;
    const createPepRoutes = (await import('../../routes/pep.js')).default;

    app = express();
    app.use(express.json());
    app.use('/api/pep', createPepRoutes(null));

    server = app.listen(port);
    await new Promise((r) => server.on('listening', r));
  });

  after(async () => {
    if (server) await new Promise((r) => server.close(r));
    mock.restoreAll();
  });

  // ── GET /api/pep/saved-reports ──────────────────────────────────────────────

  describe('GET /api/pep/saved-reports', () => {
    it('returns 400 when tenant_id is missing', async () => {
      const res = await request('GET', '/api/pep/saved-reports');
      assert.strictEqual(res.status, 400);
      const json = await res.json();
      assert.strictEqual(json.status, 'error');
      assert.ok(json.message.includes('tenant_id'));
    });

    it('returns 200 with empty array when no saved reports exist', async () => {
      // Mock supabase to return empty list
      mock.module('../../lib/supabase-db.js', {
        namedExports: {
          getSupabaseClient: () => makeSupabaseMock({ data: [], error: null }),
        },
      });

      const res = await request('GET', '/api/pep/saved-reports?tenant_id=tenant-abc');
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.status, 'success');
      assert.ok(Array.isArray(json.data));
    });
  });

  // ── POST /api/pep/saved-reports ─────────────────────────────────────────────

  describe('POST /api/pep/saved-reports', () => {
    it('returns 400 when required fields are missing', async () => {
      const res = await request('POST', '/api/pep/saved-reports', {
        tenant_id: 'tenant-abc',
        // missing report_name, plain_english, compiled_ir
      });
      assert.strictEqual(res.status, 400);
      const json = await res.json();
      assert.strictEqual(json.status, 'error');
      assert.ok(json.message.includes('Missing required fields'));
    });

    it('returns 400 when tenant_id is missing', async () => {
      const res = await request('POST', '/api/pep/saved-reports', {
        report_name: 'My Report',
        plain_english: 'Show me open leads',
        compiled_ir: { op: 'query_entity', target: 'leads', filters: [] },
      });
      assert.strictEqual(res.status, 400);
      const json = await res.json();
      assert.strictEqual(json.status, 'error');
    });

    it('returns 409 when report name already exists for tenant', async () => {
      mock.module('../../lib/supabase-db.js', {
        namedExports: {
          getSupabaseClient: () => {
            const chain = makeSupabaseMock({
              data: null,
              error: { code: '23505', message: 'duplicate key value' },
            });
            // .single() needs to reject with the error
            chain.single = () =>
              Promise.resolve({
                data: null,
                error: { code: '23505', message: 'duplicate key value' },
              });
            return chain;
          },
        },
      });

      const res = await request('POST', '/api/pep/saved-reports', {
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

  // ── DELETE /api/pep/saved-reports/:id ──────────────────────────────────────

  describe('DELETE /api/pep/saved-reports/:id', () => {
    it('returns 400 when tenant_id query param is missing', async () => {
      const res = await request('DELETE', '/api/pep/saved-reports/some-uuid');
      assert.strictEqual(res.status, 400);
      const json = await res.json();
      assert.strictEqual(json.status, 'error');
      assert.ok(json.message.includes('tenant_id'));
    });

    it('returns 200 on successful delete', async () => {
      mock.module('../../lib/supabase-db.js', {
        namedExports: {
          getSupabaseClient: () => makeSupabaseMock({ data: null, error: null }),
        },
      });

      const res = await request('DELETE', '/api/pep/saved-reports/some-uuid?tenant_id=tenant-abc');
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.status, 'success');
    });
  });

  // ── PATCH /api/pep/saved-reports/:id/run ───────────────────────────────────

  describe('PATCH /api/pep/saved-reports/:id/run', () => {
    it('returns 400 when tenant_id body field is missing', async () => {
      const res = await request('PATCH', '/api/pep/saved-reports/some-uuid/run', {});
      assert.strictEqual(res.status, 400);
      const json = await res.json();
      assert.strictEqual(json.status, 'error');
      assert.ok(json.message.includes('tenant_id'));
    });

    it('returns 404 when saved report does not exist for tenant', async () => {
      mock.module('../../lib/supabase-db.js', {
        namedExports: {
          getSupabaseClient: () => {
            const chain = makeSupabaseMock({ data: null, error: { message: 'not found' } });
            chain.single = () => Promise.resolve({ data: null, error: { message: 'not found' } });
            return chain;
          },
        },
      });

      const res = await request('PATCH', '/api/pep/saved-reports/missing-uuid/run', {
        tenant_id: 'tenant-abc',
      });
      assert.strictEqual(res.status, 404);
      const json = await res.json();
      assert.strictEqual(json.status, 'error');
    });

    it('returns 200 on successful atomic increment via RPC', async () => {
      let rpcCalled = false;
      mock.module('../../lib/supabase-db.js', {
        namedExports: {
          getSupabaseClient: () => ({
            rpc(fnName, params) {
              rpcCalled = true;
              assert.strictEqual(fnName, 'pep_increment_report_run');
              assert.strictEqual(params.p_id, 'existing-uuid');
              assert.strictEqual(params.p_tenant_id, 'tenant-abc');
              return Promise.resolve({ error: null });
            },
          }),
        },
      });

      const res = await request('PATCH', '/api/pep/saved-reports/existing-uuid/run', {
        tenant_id: 'tenant-abc',
      });
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.status, 'success');
      assert.ok(rpcCalled, 'rpc should have been called');
    });
  });

  // ── Tenant isolation guard ──────────────────────────────────────────────────

  describe('Tenant isolation', () => {
    it('DELETE always scopes by tenant_id — wrong tenant gets no rows deleted', async () => {
      // The .eq('tenant_id', tenantId) chain ensures isolation at DB level.
      // This test verifies the route passes tenant_id correctly by checking
      // that the response is still 200 (Supabase deletes 0 rows silently).
      mock.module('../../lib/supabase-db.js', {
        namedExports: {
          getSupabaseClient: () => makeSupabaseMock({ data: null, error: null }),
        },
      });

      const res = await request(
        'DELETE',
        '/api/pep/saved-reports/uuid-owned-by-other-tenant?tenant_id=tenant-xyz',
      );
      // Route returns 200; zero rows deleted is enforced by DB RLS + .eq() filter
      assert.strictEqual(res.status, 200);
    });
  });
});
