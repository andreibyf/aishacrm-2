import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import createFinanceV2Routes, { applyFinanceDataModeChange } from '../../routes/finance.v2.js';
import createFinanceDomainService from '../../lib/finance/financeDomainService.js';

const NOOP_LOGGER = { warn: () => {}, info: () => {}, error: () => {}, debug: () => {} };

const TENANT_ID = '00000000-0000-4000-8000-000000000011';
const OTHER_TENANT_ID = '00000000-0000-4000-8000-000000000099';

function buildApp({
  moduleEnabled = true,
  user = { id: 'user-1', role: 'admin', tenant_id: TENANT_ID, tenant_uuid: TENANT_ID },
  service = createFinanceDomainService(),
  dataMode = 'test',
  setFinanceDataMode,
  getTestDataCount,
} = {}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (user) req.user = { ...user };
    next();
  });
  app.use(
    '/api/v2/finance',
    createFinanceV2Routes(null, {
      service,
      isFinanceModuleEnabled: async () => moduleEnabled,
      getFinanceDataMode: async () => dataMode,
      ...(setFinanceDataMode ? { setFinanceDataMode } : {}),
      ...(getTestDataCount ? { getTestDataCount } : {}),
    }),
  );
  return { app, service };
}

describe('finance.v2 routes', () => {
  test('GET /runtime/status reports the tenant Test/Live data mode', async () => {
    const service = createFinanceDomainService();
    await service.createDraftInvoice({
      tenantId: TENANT_ID,
      actor: { id: 'user-1', type: 'human' },
      payload: { customer_id: 'CUST-100', subtotal_cents: 250000, total_cents: 250000 },
    });
    const { app } = buildApp({ service });

    const res = await request(app).get('/api/v2/finance/runtime/status');

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'success');
    assert.equal(res.body.data.tenant_id, TENANT_ID);
    // `runtime.mode` is now the authoritative data mode (was the `mock_read_only`
    // placeholder); the engine is reported separately via `runtime.persistence`.
    assert.equal(res.body.data.runtime.mode, 'test');
    assert.equal(res.body.data.runtime.data_mode, 'test');
    assert.equal(res.body.data.runtime.persistence, 'in_memory');
    assert.equal(res.body.data.runtime.provider_sync, 'disabled');
    assert.equal(res.body.data.counts.invoices, 1);
    assert.equal(res.body.data.counts.audit_events, 1);
    // Slice 6d: the in-memory path has no durable test partition → 0.
    assert.equal(res.body.data.test_data_count, 0);
  });

  test('GET /runtime/status reports live when the tenant data mode is live', async () => {
    const { app } = buildApp({ dataMode: 'live' });
    const res = await request(app).get('/api/v2/finance/runtime/status');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.runtime.mode, 'live');
    assert.equal(res.body.data.runtime.data_mode, 'live');
  });

  test('GET /runtime/status surfaces the dormant test_data_count from the injected counter', async () => {
    let calledTenant = null;
    let calledIsTest = null;
    const { app } = buildApp({
      dataMode: 'live',
      getTestDataCount: async ({ tenantId, isTestData }) => {
        calledTenant = tenantId;
        calledIsTest = isTestData;
        return 7;
      },
    });
    const res = await request(app).get('/api/v2/finance/runtime/status');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.test_data_count, 7);
    assert.equal(calledTenant, TENANT_ID);
    assert.equal(calledIsTest, true);
  });

  test('GET /runtime/status fails safe to test_data_count=0 when the counter throws', async () => {
    const { app } = buildApp({
      getTestDataCount: async () => {
        throw new Error('count blew up');
      },
    });
    const res = await request(app).get('/api/v2/finance/runtime/status');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.test_data_count, 0);
  });

  // The superadmin SUCCESS path requires passing validateTenantAccess's
  // superadmin-write tenant resolution (a Supabase canonical-tenant lookup), so
  // it's covered by an integration test rather than here; the persist logic
  // (valid/invalid mode, not-enabled) is unit-tested in financeDataMode.test.js.
  // This route test pins the superadmin GATE: a non-superadmin is forbidden and
  // the setter is never reached.
  test('PUT /settings/data-mode forbids non-superadmins (and never calls the setter)', async () => {
    let called = false;
    const { app } = buildApp({
      user: { id: 'a', role: 'admin', tenant_id: TENANT_ID, tenant_uuid: TENANT_ID },
      setFinanceDataMode: async () => {
        called = true;
        return 'live';
      },
    });
    const res = await request(app).put('/api/v2/finance/settings/data-mode').send({ mode: 'live' });
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'FINANCE_DATA_MODE_FORBIDDEN');
    assert.equal(called, false);
  });

  test('module gate blocks access when Finance Ops is disabled', async () => {
    const { app } = buildApp({ moduleEnabled: false });
    const res = await request(app).get('/api/v2/finance/journal-entries');

    assert.equal(res.status, 403);
    assert.match(res.body.message, /not enabled/i);
  });

  test('tenant mismatch returns 403', async () => {
    const { app } = buildApp();
    const res = await request(app).get(
      '/api/v2/finance/journal-entries?tenant_id=' + OTHER_TENANT_ID,
    );

    assert.equal(res.status, 403);
    assert.match(res.body.message, /access denied/i);
  });

  // Phase 4-1 §9 row 10: the route lift must NOT expand the mutating surface.
  test('route surface exposes exactly the 6 finance-data mutations + the settings endpoint (no expansion)', () => {
    const router = createFinanceV2Routes(null, { isFinanceModuleEnabled: async () => true });
    const mutating = [];
    for (const layer of router.stack) {
      if (!layer.route) continue;
      const methods = Object.keys(layer.route.methods).filter((m) => m !== 'get' && m !== '_all');
      if (methods.length) mutating.push(`${methods.join(',').toUpperCase()} ${layer.route.path}`);
    }
    // The superadmin Test/Live data-mode setter is a config mutation, not a
    // finance-DATA write — allowed, and excluded from the §9 row-10 count of
    // exactly-6 data mutations.
    const dataMutations = mutating.filter((m) => m !== 'PUT /settings/data-mode');
    assert.equal(
      dataMutations.length,
      6,
      `expected 6 finance-data mutations, got: ${dataMutations.join(' | ')}`,
    );
    assert.ok(
      mutating.includes('PUT /settings/data-mode'),
      'the superadmin data-mode settings endpoint must be present',
    );
  });

  test('POST /journal-drafts rejects unbalanced journals', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post('/api/v2/finance/journal-drafts')
      .send({
        lines: [
          { account_name: 'Cash', classification: 'Asset', debit_cents: 1000, credit_cents: 0 },
          { account_name: 'Revenue', classification: 'Revenue', debit_cents: 0, credit_cents: 900 },
        ],
      });

    assert.equal(res.status, 400);
    assert.match(res.body.message, /unbalanced/i);
  });

  test('POST /simulate/deal-won returns approval-required', async () => {
    const { app } = buildApp();
    const res = await request(app).post('/api/v2/finance/simulate/deal-won').send({
      amount_cents: 250000,
      currency: 'usd',
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.data.approval_required, true);
    assert.equal(res.body.data.journal_entry.status, 'pending_approval');
    assert.equal(res.body.data.adapter_job.status, 'draft');
    assert.ok(res.body.data.approval.id);
  });

  test('POST /journal-entries/:id/reverse returns a new reversal record', async () => {
    const service = createFinanceDomainService();
    service.seedJournalEntry({
      id: 'posted-1',
      tenant_id: TENANT_ID,
      status: 'posted',
      currency: 'usd',
      lines: [
        { account_name: 'Cash', classification: 'Asset', debit_cents: 3000, credit_cents: 0 },
        { account_name: 'Revenue', classification: 'Revenue', debit_cents: 0, credit_cents: 3000 },
      ],
    });

    const { app } = buildApp({ service });
    const res = await request(app)
      .post('/api/v2/finance/journal-entries/posted-1/reverse')
      .send({ memo: 'Reverse incorrect post' });

    assert.equal(res.status, 201);
    assert.equal(res.body.data.original_entry_id, 'posted-1');
    assert.equal(res.body.data.reversal_entry.reversal_of, 'posted-1');
    assert.equal(service.listJournalEntries(TENANT_ID).length, 2);
  });

  // Regression: actor_type in req.body must never override authenticated session identity.
  // buildActor in finance.v2.js now reads only req.user. This test verifies the fix holds.
  test('AI agent body-spoofing actor_type:human is still treated as ai_agent', async () => {
    const aiUser = {
      id: 'ai-agent-1',
      role: 'ai_agent',
      tenant_id: TENANT_ID,
      tenant_uuid: TENANT_ID,
    };
    const service = createFinanceDomainService();
    const { app } = buildApp({ user: aiUser, service });

    const res = await request(app)
      .post('/api/v2/finance/journal-drafts')
      .send({
        actor_type: 'human',
        actor_id: 'human-impersonator',
        lines: [
          { account_name: 'Cash', classification: 'Asset', debit_cents: 500, credit_cents: 0 },
          { account_name: 'Revenue', classification: 'Revenue', debit_cents: 0, credit_cents: 500 },
        ],
      });

    assert.equal(res.status, 201);
    const journalEntry = res.body.data.journal_entry;

    // ai_generated must be true — session role is ai_agent, body value is ignored.
    assert.equal(journalEntry.ai_generated, true);

    // created_by must be the authenticated user id, not the body-supplied actor_id.
    assert.equal(journalEntry.created_by, 'ai-agent-1');
  });

  test('POST /approvals/:id/approve blocks AI user even if body says actor_type: human', async () => {
    const service = createFinanceDomainService();
    const humanUser = {
      id: 'human-user-1',
      role: 'admin',
      tenant_id: TENANT_ID,
      tenant_uuid: TENANT_ID,
    };
    const aiUser = {
      id: 'ai-agent-2',
      role: 'ai_agent',
      tenant_id: TENANT_ID,
      tenant_uuid: TENANT_ID,
    };

    const { app: humanApp } = buildApp({ user: humanUser, service });
    const createRes = await request(humanApp).post('/api/v2/finance/simulate/deal-won').send({
      amount_cents: 250000,
      currency: 'usd',
    });

    assert.equal(createRes.status, 201);
    const approvalId = createRes.body.data.approval.id;

    const { app: aiApp } = buildApp({ user: aiUser, service });
    const res = await request(aiApp)
      .post(`/api/v2/finance/approvals/${approvalId}/approve`)
      .send({ actor_type: 'human' });

    assert.equal(res.status, 403);
    assert.match(res.body.message, /cannot approve|blocked/i);
  });

  describe('event-store DI selection', () => {
    // Spy pgPool that records every query() call and returns shaped rows so the
    // pg event store's INSERT … RETURNING * path completes without a real DB.
    function buildSpyPool() {
      const calls = [];
      return {
        calls,
        query: async (text, values) => {
          calls.push({ text, values });
          // Mirror enough of the inserted row for the store to freeze and return.
          if (/^insert into finance\.audit_events/i.test(text)) {
            const [id, tenant_id, event_type] = values;
            return { rows: [{ id, tenant_id, event_type }] };
          }
          return { rows: [] };
        },
      };
    }

    function buildAppWithPool({ pool, persistent }) {
      const previous = process.env.ENABLE_FINANCE_PERSISTENT_EVENTS;
      if (persistent) {
        process.env.ENABLE_FINANCE_PERSISTENT_EVENTS = 'true';
      } else {
        delete process.env.ENABLE_FINANCE_PERSISTENT_EVENTS;
      }
      const app = express();
      app.use(express.json());
      app.use((req, _res, next) => {
        req.user = { id: 'user-1', role: 'admin', tenant_id: TENANT_ID, tenant_uuid: TENANT_ID };
        next();
      });
      app.use(
        '/api/v2/finance',
        createFinanceV2Routes(pool, {
          isFinanceModuleEnabled: async () => true,
        }),
      );
      return {
        app,
        restoreEnv: () => {
          if (previous === undefined) delete process.env.ENABLE_FINANCE_PERSISTENT_EVENTS;
          else process.env.ENABLE_FINANCE_PERSISTENT_EVENTS = previous;
        },
      };
    }

    test('defaults to in-memory event store when ENABLE_FINANCE_PERSISTENT_EVENTS is unset', async () => {
      const pool = buildSpyPool();
      const { app, restoreEnv } = buildAppWithPool({ pool, persistent: false });
      try {
        const res = await request(app)
          .post('/api/v2/finance/draft-invoices')
          .send({ customer_id: 'CUST-A', subtotal_cents: 100, total_cents: 100 });

        assert.equal(res.status, 201);
        // No pool interaction — the in-memory event store handled the append.
        assert.equal(pool.calls.length, 0);
      } finally {
        restoreEnv();
      }
    });

    // Phase 4-1 Task 8 — ACTIVATION: persistent mode is now wired end-to-end.
    // The boot guard is removed; with a Postgres pool present (so the
    // projection-backed reads + persistent write runner have a way to reach
    // Postgres), ENABLE_FINANCE_PERSISTENT_EVENTS=true MOUNTS without throwing.
    // The durable read/write behaviour is exercised in
    // finance.v2.persistentWrites.test.js with injected in-memory doubles.
    test('mounts when ENABLE_FINANCE_PERSISTENT_EVENTS=true and a pool is present', () => {
      const pool = buildSpyPool();
      const previous = process.env.ENABLE_FINANCE_PERSISTENT_EVENTS;
      process.env.ENABLE_FINANCE_PERSISTENT_EVENTS = 'true';
      try {
        assert.doesNotThrow(() =>
          createFinanceV2Routes(pool, { isFinanceModuleEnabled: async () => true }),
        );
      } finally {
        if (previous === undefined) delete process.env.ENABLE_FINANCE_PERSISTENT_EVENTS;
        else process.env.ENABLE_FINANCE_PERSISTENT_EVENTS = previous;
      }
    });

    // Loud-on-misconfig (§5): persistent-events without a pool also refuses to
    // mount — the fail-closed posture the prior guard provided, now structural.
    test('refuses to mount when ENABLE_FINANCE_PERSISTENT_EVENTS=true (no pool)', () => {
      const previous = process.env.ENABLE_FINANCE_PERSISTENT_EVENTS;
      process.env.ENABLE_FINANCE_PERSISTENT_EVENTS = 'true';
      try {
        assert.throws(
          () => createFinanceV2Routes(null, { isFinanceModuleEnabled: async () => true }),
          /ENABLE_FINANCE_PERSISTENT_EVENTS/i,
        );
      } finally {
        if (previous === undefined) delete process.env.ENABLE_FINANCE_PERSISTENT_EVENTS;
        else process.env.ENABLE_FINANCE_PERSISTENT_EVENTS = previous;
      }
    });
  });

  test('human user can approve approval generated by simulate/deal-won', async () => {
    const service = createFinanceDomainService();
    const humanUser = {
      id: 'human-user-2',
      role: 'admin',
      tenant_id: TENANT_ID,
      tenant_uuid: TENANT_ID,
    };
    const { app } = buildApp({ user: humanUser, service });

    const createRes = await request(app).post('/api/v2/finance/simulate/deal-won').send({
      amount_cents: 150000,
      currency: 'usd',
    });

    assert.equal(createRes.status, 201);
    const approvalId = createRes.body.data.approval.id;

    const approveRes = await request(app)
      .post(`/api/v2/finance/approvals/${approvalId}/approve`)
      .send({ actor_type: 'ai_agent' });

    assert.equal(approveRes.status, 200);
    assert.equal(approveRes.body.status, 'success');
    assert.equal(approveRes.body.data.approval.id, approvalId);
    assert.equal(approveRes.body.data.approval.status, 'approved');
    assert.equal(approveRes.body.data.approval.approved_by, 'human-user-2');
  });

  // ── slice 6b-2: applyFinanceDataModeChange orchestration (no Express/DB) ─────
  describe('applyFinanceDataModeChange', () => {
    test('persists THEN rebuilds (persistent mode), threading isTestData=true for test', async () => {
      const order = [];
      const setFinanceDataMode = async ({ mode }) => {
        order.push('persist');
        return mode;
      };
      let rebuildArgs = null;
      const rebuildFinanceProjections = async (args) => {
        order.push('rebuild');
        rebuildArgs = args;
      };

      const eventStore = { name: 'es' };
      const storeProvider = { name: 'sp' };
      const result = await applyFinanceDataModeChange({
        tenantId: TENANT_ID,
        mode: 'test',
        persistent: true,
        setFinanceDataMode,
        rebuildFinanceProjections,
        eventStore,
        storeProvider,
        logger: NOOP_LOGGER,
      });

      assert.equal(result, 'test');
      assert.deepEqual(order, ['persist', 'rebuild']);
      assert.equal(rebuildArgs.tenantId, TENANT_ID);
      assert.equal(rebuildArgs.isTestData, true);
      assert.equal(rebuildArgs.eventStore, eventStore);
      assert.equal(rebuildArgs.storeProvider, storeProvider);
    });

    test('live mode threads isTestData=false', async () => {
      let rebuildArgs = null;
      const result = await applyFinanceDataModeChange({
        tenantId: TENANT_ID,
        mode: 'live',
        persistent: true,
        setFinanceDataMode: async ({ mode }) => mode,
        rebuildFinanceProjections: async (args) => {
          rebuildArgs = args;
        },
        eventStore: {},
        storeProvider: {},
        logger: NOOP_LOGGER,
      });
      assert.equal(result, 'live');
      assert.equal(rebuildArgs.isTestData, false);
    });

    test('in-memory mode (persistent=false) persists but SKIPS the rebuild', async () => {
      let rebuilt = false;
      const result = await applyFinanceDataModeChange({
        tenantId: TENANT_ID,
        mode: 'live',
        persistent: false,
        setFinanceDataMode: async ({ mode }) => mode,
        rebuildFinanceProjections: async () => {
          rebuilt = true;
        },
        eventStore: {},
        storeProvider: {},
        logger: NOOP_LOGGER,
      });
      assert.equal(result, 'live');
      assert.equal(rebuilt, false);
    });

    test('skips rebuild when stores are absent even if persistent', async () => {
      let rebuilt = false;
      await applyFinanceDataModeChange({
        tenantId: TENANT_ID,
        mode: 'test',
        persistent: true,
        setFinanceDataMode: async ({ mode }) => mode,
        rebuildFinanceProjections: async () => {
          rebuilt = true;
        },
        eventStore: null,
        storeProvider: null,
        logger: NOOP_LOGGER,
      });
      assert.equal(rebuilt, false);
    });

    test('rebuild error FAILS LOUD — reverts the mode and throws (no silent success) [Codex P2]', async () => {
      const errors = [];
      const setCalls = [];
      await assert.rejects(
        applyFinanceDataModeChange({
          tenantId: TENANT_ID,
          mode: 'live',
          persistent: true,
          // pre-switch mode, used for the rollback
          getFinanceDataMode: async () => 'test',
          setFinanceDataMode: async ({ mode }) => {
            setCalls.push(mode);
            return mode;
          },
          rebuildFinanceProjections: async () => {
            throw new Error('rebuild kaboom');
          },
          eventStore: {},
          storeProvider: {},
          logger: { ...NOOP_LOGGER, error: (...a) => errors.push(a) },
        }),
        (err) => err.code === 'FINANCE_MODE_SWITCH_REBUILD_FAILED' && err.statusCode === 503,
      );
      // Persisted 'live' first, then reverted to the pre-switch 'test'.
      assert.deepEqual(setCalls, ['live', 'test']);
      assert.ok(errors.length >= 1, 'rebuild failure is logged at error level');
    });

    test('rebuild error without a resolvable previous mode still throws (no revert, but loud)', async () => {
      const setCalls = [];
      await assert.rejects(
        applyFinanceDataModeChange({
          tenantId: TENANT_ID,
          mode: 'live',
          persistent: true,
          // no getFinanceDataMode injected → cannot roll back, but must NOT swallow
          setFinanceDataMode: async ({ mode }) => {
            setCalls.push(mode);
            return mode;
          },
          rebuildFinanceProjections: async () => {
            throw new Error('rebuild kaboom');
          },
          eventStore: {},
          storeProvider: {},
          logger: { ...NOOP_LOGGER, error: () => {} },
        }),
        (err) => err.code === 'FINANCE_MODE_SWITCH_REBUILD_FAILED',
      );
      assert.deepEqual(setCalls, ['live'], 'no revert when previous mode is unknown');
    });
  });
});
