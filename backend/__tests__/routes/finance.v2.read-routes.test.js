import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import createFinanceV2Routes from '../../routes/finance.v2.js';
import createFinanceDomainService from '../../lib/finance/financeDomainService.js';
import {
  buildLedger,
  buildProfitAndLoss,
  buildBalanceSheet,
} from '../../lib/finance/accountingEngine.js';

// Read-only GET endpoints — Finance Read API Implementation Slice 1.
// Contracts frozen in docs/architecture/finance/finance-ui-slice-1-api-gaps-design.md §6.
const TENANT_ID = '00000000-0000-4000-8000-000000000011';
const OTHER_TENANT_ID = '00000000-0000-4000-8000-000000000099';

function buildApp({
  moduleEnabled = true,
  user = { id: 'user-1', role: 'admin', tenant_id: TENANT_ID, tenant_uuid: TENANT_ID },
  service = createFinanceDomainService(),
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
    }),
  );
  return { app, service };
}

// The `data.source` provenance block is identical across all eight endpoints (§5.7).
function assertSourceBlock(source) {
  assert.equal(source.mode, 'in_memory');
  assert.equal(typeof source.served_at, 'string');
  assert.ok(!Number.isNaN(Date.parse(source.served_at)));
  assert.equal(source.cursor_lag_ms, null);
  assert.ok('projection' in source);
}

describe('GET /api/v2/finance/accounts (COA Slice 1)', () => {
  test('returns the seeded baseline chart (8 system accounts)', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/v2/finance/accounts');
    assert.equal(res.status, 200);
    const accounts = res.body.data.accounts;
    assert.equal(accounts.length, 8);
    assert.ok(accounts.find((a) => a.account_code === '1000' && a.account_type === 'Cash'));
    assert.ok(accounts.every((a) => a.is_system === true));
  });

  test('surfaces an auto-created account after a journal draft with a new account name', async () => {
    const service = createFinanceDomainService();
    const { app } = buildApp({ service });
    await service.createJournalDraft({
      tenantId: TENANT_ID,
      actor: { id: 'u1', type: 'human' },
      payload: {
        lines: [
          {
            account_name: 'Consulting Fees',
            classification: 'Revenue',
            debit_cents: 0,
            credit_cents: 5000,
          },
          { account_name: 'Cash', classification: 'Asset', debit_cents: 5000, credit_cents: 0 },
        ],
      },
    });
    const res = await request(app).get('/api/v2/finance/accounts');
    assert.equal(res.status, 200);
    const created = res.body.data.accounts.find((a) => a.name === 'Consulting Fees');
    assert.ok(created);
    assert.equal(created.is_system, false);
    assert.equal(created.account_code, '4500');
  });
});

// ---------------------------------------------------------------------------
// Shared authorization matrix — every read endpoint runs the same 3-gate stack.
// ---------------------------------------------------------------------------
const READ_ENDPOINTS = [
  '/api/v2/finance/accounts',
  '/api/v2/finance/draft-invoices',
  '/api/v2/finance/journal-drafts',
  '/api/v2/finance/approvals',
  '/api/v2/finance/adapter-jobs',
  '/api/v2/finance/audit-events',
  '/api/v2/finance/adapters',
  '/api/v2/finance/evidence-packs',
];

describe('finance.v2 read endpoints — authorization matrix', () => {
  for (const path of READ_ENDPOINTS) {
    test(`${path} → 403 when Finance Ops module is disabled`, async () => {
      const { app } = buildApp({ moduleEnabled: false });
      const res = await request(app).get(path);
      assert.equal(res.status, 403);
      assert.match(res.body.message, /not enabled/i);
    });

    test(`${path} → 403 on tenant mismatch`, async () => {
      const { app } = buildApp();
      const res = await request(app).get(`${path}?tenant_id=${OTHER_TENANT_ID}`);
      assert.equal(res.status, 403);
      assert.match(res.body.message, /access denied/i);
    });

    test(`${path} → 200 success envelope when enabled`, async () => {
      const { app } = buildApp();
      const res = await request(app).get(path);
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'success');
      assertSourceBlock(res.body.data.source);
    });
  }
});

// ---------------------------------------------------------------------------
// GET /draft-invoices (§6.1)
// ---------------------------------------------------------------------------
describe('GET /api/v2/finance/draft-invoices', () => {
  async function seedDraft(service, { customerId = 'CUST-1', total = 250000 } = {}) {
    return service.createDraftInvoice({
      tenantId: TENANT_ID,
      actor: { id: 'user-1', type: 'human' },
      payload: { customer_id: customerId, subtotal_cents: total, total_cents: total },
    });
  }

  test('empty tenant → 200 with empty array and total 0', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/v2/finance/draft-invoices');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.invoices, []);
    assert.equal(res.body.data.total, 0);
  });

  test('returns draft invoices with the §6.1 shape and field mapping', async () => {
    const service = createFinanceDomainService();
    await seedDraft(service, { customerId: 'CUST-7', total: 175000 });
    const { app } = buildApp({ service });

    const res = await request(app).get('/api/v2/finance/draft-invoices');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.total, 1);
    const row = res.body.data.invoices[0];
    assert.deepEqual(Object.keys(row).sort(), [
      'amount_cents',
      'created_at',
      'currency',
      'customer_id',
      'customer_name',
      'id',
      'status',
      'updated_at',
    ]);
    assert.equal(row.status, 'draft');
    assert.equal(row.customer_id, 'CUST-7');
    assert.equal(row.amount_cents, 175000); // amount_cents <- total_cents
    assert.equal(row.customer_name, null); // not stored in-memory
    assert.equal(typeof row.updated_at, 'string');
  });

  test('excludes non-draft invoices', async () => {
    const service = createFinanceDomainService();
    service.seedInvoice({
      id: 'invoice_posted',
      tenant_id: TENANT_ID,
      status: 'sent',
      total_cents: 999,
      created_at: new Date().toISOString(),
    });
    await seedDraft(service);
    const { app } = buildApp({ service });
    const res = await request(app).get('/api/v2/finance/draft-invoices');
    assert.equal(res.body.data.total, 1);
    assert.equal(res.body.data.invoices[0].status, 'draft');
  });

  test('tenant isolation: other tenant rows never appear', async () => {
    const service = createFinanceDomainService();
    service.seedInvoice({
      id: 'invoice_other',
      tenant_id: OTHER_TENANT_ID,
      status: 'draft',
      total_cents: 500,
      created_at: new Date().toISOString(),
    });
    const { app } = buildApp({ service });
    const res = await request(app).get('/api/v2/finance/draft-invoices');
    assert.equal(res.body.data.total, 0);
  });

  test('pagination clamps out-of-range limit/offset instead of 400', async () => {
    const { app } = buildApp();
    const tooBig = await request(app).get('/api/v2/finance/draft-invoices?limit=9999');
    assert.equal(tooBig.status, 200);
    const negative = await request(app).get('/api/v2/finance/draft-invoices?limit=-5&offset=-1');
    assert.equal(negative.status, 200);
    const garbage = await request(app).get('/api/v2/finance/draft-invoices?limit=abc');
    assert.equal(garbage.status, 200);
  });
});

// ---------------------------------------------------------------------------
// GET /journal-drafts (§6.2)
// ---------------------------------------------------------------------------
describe('GET /api/v2/finance/journal-drafts', () => {
  test('empty tenant → 200 empty', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/v2/finance/journal-drafts');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.journal_drafts, []);
    assert.equal(res.body.data.total, 0);
  });

  test('returns only draft and pending_approval entries, mapped to §6.2 shape', async () => {
    const service = createFinanceDomainService();
    // draft
    await service.createJournalDraft({
      tenantId: TENANT_ID,
      actor: { id: 'user-1', type: 'human' },
      payload: {
        lines: [
          { account_name: 'Cash', classification: 'Asset', debit_cents: 1000, credit_cents: 0 },
          {
            account_name: 'Revenue',
            classification: 'Revenue',
            debit_cents: 0,
            credit_cents: 1000,
          },
        ],
      },
    });
    // pending_approval (high-value simulate)
    await service.simulateDealWon({
      tenantId: TENANT_ID,
      actor: { id: 'user-1', type: 'human' },
      payload: { amount_cents: 250000, currency: 'usd' },
    });
    // posted — must be excluded
    service.seedJournalEntry({
      id: 'journal_posted',
      tenant_id: TENANT_ID,
      status: 'posted',
      currency: 'usd',
      lines: [{ account_name: 'Cash', classification: 'Asset', debit_cents: 5, credit_cents: 0 }],
    });
    const { app } = buildApp({ service });

    const res = await request(app).get('/api/v2/finance/journal-drafts');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.total, 2);
    const statuses = res.body.data.journal_drafts.map((r) => r.status).sort();
    assert.deepEqual(statuses, ['draft', 'pending_approval']);
    const row = res.body.data.journal_drafts[0];
    assert.deepEqual(Object.keys(row).sort(), [
      'account_code',
      'aggregate_id',
      'amount_cents',
      'created_at',
      'currency',
      'id',
      'status',
    ]);
    assert.equal(row.aggregate_id, row.id); // aggregate_id <- id
    // COA Slice 1: account_code now surfaces the entry's resolved line codes
    // (was a hardcoded null placeholder). The draft's lines resolve to seeded
    // accounts, so at least one 4-digit code is present.
    assert.match(row.account_code, /\d{4}/);
  });

  test('every journal-draft row is also visible via /journal-entries (subset invariant)', async () => {
    const service = createFinanceDomainService();
    await service.createJournalDraft({
      tenantId: TENANT_ID,
      actor: { id: 'user-1', type: 'human' },
      payload: {
        lines: [
          { account_name: 'Cash', classification: 'Asset', debit_cents: 1000, credit_cents: 0 },
          {
            account_name: 'Revenue',
            classification: 'Revenue',
            debit_cents: 0,
            credit_cents: 1000,
          },
        ],
      },
    });
    const { app } = buildApp({ service });
    const drafts = (await request(app).get('/api/v2/finance/journal-drafts')).body.data
      .journal_drafts;
    const entries = (await request(app).get('/api/v2/finance/journal-entries')).body.data
      .journal_entries;
    const entryIds = new Set(entries.map((e) => e.id));
    for (const d of drafts) assert.ok(entryIds.has(d.id));
  });
});

// ---------------------------------------------------------------------------
// GET /approvals (§6.3)
// ---------------------------------------------------------------------------
describe('GET /api/v2/finance/approvals', () => {
  test('empty tenant → 200 empty', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/v2/finance/approvals');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.approvals, []);
    assert.equal(res.body.data.total, 0);
  });

  test('defaults to pending; ?status=all returns every status; §6.3 shape', async () => {
    const service = createFinanceDomainService();
    await service.simulateDealWon({
      tenantId: TENANT_ID,
      actor: { id: 'user-1', type: 'human' },
      payload: { amount_cents: 250000, currency: 'usd' },
    });
    service.seedApproval({
      id: 'approval_done',
      tenant_id: TENANT_ID,
      target_type: 'journal_entry',
      target_id: 'journal_x',
      status: 'approved',
      requested_by: 'user-1',
      requested_at: new Date().toISOString(),
      approved_by: 'user-2',
      approved_at: new Date().toISOString(),
    });
    const { app } = buildApp({ service });

    const pending = await request(app).get('/api/v2/finance/approvals');
    assert.equal(pending.body.data.total, 1);
    assert.equal(pending.body.data.approvals[0].status, 'pending');

    const all = await request(app).get('/api/v2/finance/approvals?status=all');
    assert.equal(all.body.data.total, 2);

    const row = all.body.data.approvals.find((a) => a.status === 'approved');
    assert.equal(row.subject_type, 'journal_entry'); // subject_type <- target_type
    assert.equal(row.subject_id, 'journal_x'); // subject_id <- target_id
    assert.equal(row.decided_by, 'user-2'); // decided_by <- approved_by
    assert.equal(typeof row.decided_at, 'string');
  });

  test('?status=rejected preserves decided_by/decided_at from rejected_* fields', async () => {
    const service = createFinanceDomainService();
    const decidedAt = new Date().toISOString();
    service.seedApproval({
      id: 'approval_rejected',
      tenant_id: TENANT_ID,
      target_type: 'journal_entry',
      target_id: 'journal_r',
      status: 'rejected',
      requested_by: 'user-1',
      requested_at: new Date().toISOString(),
      rejected_by: 'user-9',
      rejected_at: decidedAt,
    });
    const { app } = buildApp({ service });

    const res = await request(app).get('/api/v2/finance/approvals?status=rejected');
    assert.equal(res.body.data.total, 1);
    const row = res.body.data.approvals[0];
    assert.equal(row.status, 'rejected');
    assert.equal(row.decided_by, 'user-9'); // decided_by <- rejected_by (not dropped)
    assert.equal(row.decided_at, decidedAt); // decided_at <- rejected_at
  });
});

// ---------------------------------------------------------------------------
// GET /adapter-jobs (§6.4)
// ---------------------------------------------------------------------------
describe('GET /api/v2/finance/adapter-jobs', () => {
  test('empty tenant → 200 empty', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/v2/finance/adapter-jobs');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.adapter_jobs, []);
    assert.equal(res.body.data.total, 0);
  });

  test('returns adapter jobs with the canonical status enum and §6.4 shape', async () => {
    const service = createFinanceDomainService();
    // simulateDealWon creates a draft adapter job
    await service.simulateDealWon({
      tenantId: TENANT_ID,
      actor: { id: 'user-1', type: 'human' },
      payload: { amount_cents: 250000, currency: 'usd' },
    });
    service.seedAdapterJob({
      id: 'adapter_job_running',
      tenant_id: TENANT_ID,
      status: 'running',
      provider: 'erpnext',
      aggregate_type: 'journal_entry',
      aggregate_id: 'journal_x',
      operation: 'push_draft',
      mode: 'draft_only',
      created_at: new Date().toISOString(),
    });
    const { app } = buildApp({ service });

    const res = await request(app).get('/api/v2/finance/adapter-jobs');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.total, 2);
    const row = res.body.data.adapter_jobs.find((j) => j.id === 'adapter_job_running');
    assert.deepEqual(Object.keys(row).sort(), [
      'attempts',
      'created_at',
      'id',
      'last_error',
      'next_attempt_at',
      'operation',
      'status',
    ]);
    assert.equal(row.status, 'running');
    assert.equal(row.attempts, 0);
    assert.equal(row.next_attempt_at, null);
    assert.equal(row.last_error, null);
  });

  test('?status filter narrows to one status', async () => {
    const service = createFinanceDomainService();
    service.seedAdapterJob({
      id: 'adapter_job_d',
      tenant_id: TENANT_ID,
      status: 'draft',
      operation: 'push_draft',
      created_at: new Date().toISOString(),
    });
    service.seedAdapterJob({
      id: 'adapter_job_f',
      tenant_id: TENANT_ID,
      status: 'failed',
      operation: 'push_draft',
      created_at: new Date().toISOString(),
    });
    const { app } = buildApp({ service });
    const failed = await request(app).get('/api/v2/finance/adapter-jobs?status=failed');
    assert.equal(failed.body.data.total, 1);
    assert.equal(failed.body.data.adapter_jobs[0].status, 'failed');
  });
});

// ---------------------------------------------------------------------------
// GET /audit-events (§6.5) — cursor paginated
// ---------------------------------------------------------------------------
describe('GET /api/v2/finance/audit-events', () => {
  async function seedEvents(service, n) {
    for (let i = 0; i < n; i++) {
      await service.createDraftInvoice({
        tenantId: TENANT_ID,
        actor: { id: 'user-1', type: 'human' },
        payload: { customer_id: `CUST-${i}`, subtotal_cents: 100, total_cents: 100 },
      });
    }
  }

  test('empty tenant → 200 with empty events and null next_cursor', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/v2/finance/audit-events');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.events, []);
    assert.equal(res.body.data.next_cursor, null);
  });

  test('events carry §6.5 shape, newest first', async () => {
    const service = createFinanceDomainService();
    await seedEvents(service, 2);
    const { app } = buildApp({ service });
    const res = await request(app).get('/api/v2/finance/audit-events');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.events.length, 2);
    const row = res.body.data.events[0];
    assert.ok('event_type' in row);
    assert.ok('occurred_at' in row); // occurred_at <- created_at
    assert.ok('actor' in row); // actor <- actor_id
  });

  test('cursor round-trips across two pages then ends', async () => {
    const service = createFinanceDomainService();
    await seedEvents(service, 3);
    const { app } = buildApp({ service });
    const page1 = await request(app).get('/api/v2/finance/audit-events?limit=2');
    assert.equal(page1.body.data.events.length, 2);
    assert.ok(page1.body.data.next_cursor);
    const page2 = await request(app).get(
      `/api/v2/finance/audit-events?limit=2&cursor=${encodeURIComponent(page1.body.data.next_cursor)}`,
    );
    assert.equal(page2.body.data.events.length, 1);
    assert.equal(page2.body.data.next_cursor, null);
    // No overlap between pages.
    const ids1 = new Set(page1.body.data.events.map((e) => e.id));
    for (const e of page2.body.data.events) assert.ok(!ids1.has(e.id));
  });

  test('malformed cursor → 400 PAGINATION_INVALID', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/v2/finance/audit-events?cursor=not-a-real-cursor');
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'PAGINATION_INVALID');
  });

  test('cross-tenant cursor reuse → 400 PAGINATION_INVALID', async () => {
    const service = createFinanceDomainService();
    await seedEvents(service, 2);
    const { app } = buildApp({ service });
    const page1 = await request(app).get('/api/v2/finance/audit-events?limit=1');
    const foreignCursor = Buffer.from(
      JSON.stringify({ tenant_id: OTHER_TENANT_ID, created_at: new Date().toISOString(), id: 'x' }),
    ).toString('base64url');
    const res = await request(app).get(
      `/api/v2/finance/audit-events?cursor=${encodeURIComponent(foreignCursor)}`,
    );
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'PAGINATION_INVALID');
    assert.ok(page1.body.data); // sanity
  });
});

// ---------------------------------------------------------------------------
// GET /adapters (§6.7) — read-only declarative metadata registry
// ---------------------------------------------------------------------------
describe('GET /api/v2/finance/adapters', () => {
  const ERP_ENV = [
    'FINANCE_ERPNEXT_BASE_URL',
    'FINANCE_ERPNEXT_API_KEY',
    'FINANCE_ERPNEXT_API_SECRET',
  ];

  // Run `fn` with the ERPNext credential env vars set to `values` (or cleared
  // when values is null), restoring the prior values afterwards. The route's
  // adapter status must track the SAME config signal the worker uses to decide
  // whether to register the ERPNext adapter (financeAdapterWorker.js:484).
  async function withErpEnv(values, fn) {
    const previous = ERP_ENV.map((k) => [k, process.env[k]]);
    for (const k of ERP_ENV) {
      if (values) process.env[k] = values[k];
      else delete process.env[k];
    }
    try {
      return await fn();
    } finally {
      for (const [k, v] of previous) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  }

  test('reports status=not_registered when ERPNext credentials are not configured', async () => {
    await withErpEnv(null, async () => {
      const { app } = buildApp();
      const res = await request(app).get('/api/v2/finance/adapters');
      assert.equal(res.status, 200);
      const erp = res.body.data.adapters.find((a) => a.name === 'erpnext_sandbox');
      assert.ok(erp, 'erpnext_sandbox adapter present');
      assert.equal(erp.kind, 'sandbox');
      assert.equal(erp.mode, 'draft_only');
      assert.equal(erp.provider_writes_enabled, false);
      assert.equal(erp.production_allowed, false);
      // Honest: the worker boots with an empty registry when creds are absent,
      // so the status must NOT claim 'registered'.
      assert.equal(erp.status, 'not_registered');
      assert.equal(erp.config_summary.credentials_resolved, false);
      // Honest capability set — push_final is unsupported, not advertised.
      assert.ok(erp.capabilities.includes('push_draft'));
      assert.ok(!erp.capabilities.includes('push_final'));
      assert.ok(erp.unsupported.includes('push_final'));
    });
  });

  test('reports status=registered + credentials_resolved when creds + sandbox base URL are configured', async () => {
    await withErpEnv(
      {
        FINANCE_ERPNEXT_BASE_URL: 'http://localhost:8080',
        FINANCE_ERPNEXT_API_KEY: 'key',
        FINANCE_ERPNEXT_API_SECRET: 'secret',
      },
      async () => {
        const { app } = buildApp();
        const res = await request(app).get('/api/v2/finance/adapters');
        const erp = res.body.data.adapters.find((a) => a.name === 'erpnext_sandbox');
        assert.equal(erp.status, 'registered');
        assert.equal(erp.config_summary.credentials_resolved, true);
        assert.equal(erp.provider_writes_enabled, false); // still default-closed
      },
    );
  });

  test('does NOT claim registered when creds are present but the base URL is non-sandbox', async () => {
    // Mirrors the worker: createErpnextSandboxAdapter() throws on a
    // production-looking URL (erpnextSandboxAdapter.js:162) and the worker
    // continues with an empty registry, so the route must not say 'registered'.
    await withErpEnv(
      {
        FINANCE_ERPNEXT_BASE_URL: 'https://erp.production.example.com',
        FINANCE_ERPNEXT_API_KEY: 'key',
        FINANCE_ERPNEXT_API_SECRET: 'secret',
      },
      async () => {
        const { app } = buildApp();
        const res = await request(app).get('/api/v2/finance/adapters');
        const erp = res.body.data.adapters.find((a) => a.name === 'erpnext_sandbox');
        assert.notEqual(erp.status, 'registered');
        assert.equal(erp.status, 'configuration_invalid');
        // Credentials ARE present (just not usable against a non-sandbox URL).
        assert.equal(erp.config_summary.credentials_resolved, true);
      },
    );
  });

  test('exposes no credentials and no write/execution surface', async () => {
    await withErpEnv(
      {
        FINANCE_ERPNEXT_BASE_URL: 'http://localhost:8080',
        FINANCE_ERPNEXT_API_KEY: 'super-secret-key',
        FINANCE_ERPNEXT_API_SECRET: 'super-secret-secret',
      },
      async () => {
        const { app } = buildApp();
        const res = await request(app).get('/api/v2/finance/adapters');
        const json = JSON.stringify(res.body);
        // No credential VALUES leak, even when configured.
        assert.ok(!/super-secret-key|super-secret-secret/.test(json));
        assert.ok(!/api_key|api_secret|password|token/i.test(json));
        const erp = res.body.data.adapters.find((a) => a.name === 'erpnext_sandbox');
        // No field implies a runnable provider-write path.
        assert.ok(!('write_capabilities' in erp) || erp.write_capabilities.length === 0);
      },
    );
  });
});

// ---------------------------------------------------------------------------
// GET /evidence-packs (§6.8 FIXED) — on-demand single-pack build
// ---------------------------------------------------------------------------
describe('GET /api/v2/finance/evidence-packs', () => {
  test('empty scope → 200 with honest empty pack (artifact_count 0, no list/total)', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/v2/finance/evidence-packs');
    assert.equal(res.status, 200);
    assert.ok(res.body.data.pack);
    assert.equal(res.body.data.pack.artifact_count, 0);
    assert.ok(!('total' in res.body.data));
    assert.ok(!('evidence_packs' in res.body.data));
  });

  test('builds a pack on demand with §6.8 metadata + integrity hashes', async () => {
    const service = createFinanceDomainService();
    await service.createDraftInvoice({
      tenantId: TENANT_ID,
      actor: { id: 'user-1', type: 'human' },
      payload: { customer_id: 'CUST-1', subtotal_cents: 100, total_cents: 100 },
    });
    const { app } = buildApp({ service });
    const res = await request(app).get('/api/v2/finance/evidence-packs');
    assert.equal(res.status, 200);
    const pack = res.body.data.pack;
    assert.deepEqual(Object.keys(pack).sort(), [
      'artifact_count',
      'generated_at',
      'integrity',
      'pack_id',
      'scope',
      'summary',
    ]);
    assert.ok(pack.artifact_count >= 1);
    assert.ok(pack.integrity.pack_hash);
    assert.ok(pack.integrity.events_hash);
    assert.ok(pack.integrity.approvals_hash);
  });
});

// ---------------------------------------------------------------------------
// Read endpoints must not mutate state.
// ---------------------------------------------------------------------------
describe('finance.v2 read endpoints — no mutation', () => {
  test('GET requests do not change event count or bucket sizes', async () => {
    const service = createFinanceDomainService();
    await service.simulateDealWon({
      tenantId: TENANT_ID,
      actor: { id: 'user-1', type: 'human' },
      payload: { amount_cents: 250000, currency: 'usd' },
    });
    const before = (await service.getState(TENANT_ID)).auditEvents.length;
    const { app } = buildApp({ service });
    for (const path of READ_ENDPOINTS) {
      await request(app).get(path);
    }
    const after = (await service.getState(TENANT_ID)).auditEvents.length;
    assert.equal(after, before);
  });
});

// ---------------------------------------------------------------------------
// Phase 4-1 Task 4 — the four service-backed list reads are served via the
// read ADAPTER (not `service.list*` directly), so they stay durable when
// persistent mode lands. A spy readAdapterFactory proves the source indirection
// AND that the handler's filtering/mapping/envelope are unchanged downstream.
// ---------------------------------------------------------------------------
describe('finance.v2 list reads — served via the read adapter', () => {
  function buildSpyApp() {
    const calls = {
      listInvoices: [],
      listJournalEntries: [],
      listApprovals: [],
      listAdapterJobs: [],
    };
    const canned = {
      invoices: [
        {
          id: 'inv_1',
          status: 'draft',
          customer_id: 'CUST-9',
          currency: 'usd',
          total_cents: 4242,
          created_at: '2026-01-01T00:00:00.000Z',
        },
        { id: 'inv_2', status: 'sent', total_cents: 1 }, // filtered out (not draft)
      ],
      journalEntries: [
        {
          id: 'je_1',
          status: 'draft',
          currency: 'usd',
          lines: [{ debit_cents: 700, credit_cents: 0 }],
          created_at: '2026-01-02T00:00:00.000Z',
        },
        { id: 'je_2', status: 'posted', lines: [{ debit_cents: 5, credit_cents: 0 }] }, // filtered out
      ],
      approvals: [
        {
          id: 'ap_1',
          status: 'pending',
          target_type: 'journal_entry',
          target_id: 'je_1',
          requested_by: 'user-1',
          requested_at: '2026-01-03T00:00:00.000Z',
        },
      ],
      adapterJobs: [
        {
          id: 'job_1',
          status: 'running',
          operation: 'push_draft',
          created_at: '2026-01-04T00:00:00.000Z',
        },
      ],
    };
    const readAdapterFactory = () => ({
      async listInvoices(tenantId) {
        calls.listInvoices.push(tenantId);
        return canned.invoices;
      },
      async listJournalEntries(tenantId) {
        calls.listJournalEntries.push(tenantId);
        return canned.journalEntries;
      },
      async listApprovals(tenantId) {
        calls.listApprovals.push(tenantId);
        return canned.approvals;
      },
      async listAdapterJobs(tenantId) {
        calls.listAdapterJobs.push(tenantId);
        return canned.adapterJobs;
      },
    });
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { id: 'user-1', role: 'admin', tenant_id: TENANT_ID, tenant_uuid: TENANT_ID };
      next();
    });
    app.use(
      '/api/v2/finance',
      createFinanceV2Routes(null, {
        readAdapterFactory,
        isFinanceModuleEnabled: async () => true,
      }),
    );
    return { app, calls };
  }

  test('GET /draft-invoices reads from readAdapter.listInvoices and preserves mapping', async () => {
    const { app, calls } = buildSpyApp();
    const res = await request(app).get('/api/v2/finance/draft-invoices');
    assert.equal(res.status, 200);
    assert.deepEqual(calls.listInvoices, [TENANT_ID]);
    assert.equal(res.body.data.total, 1); // non-draft filtered out
    const row = res.body.data.invoices[0];
    assert.equal(row.id, 'inv_1');
    assert.equal(row.amount_cents, 4242); // amount_cents <- total_cents
    assert.equal(row.customer_name, null);
    assert.equal(res.body.data.source.projection, 'invoices');
  });

  test('GET /journal-drafts reads from readAdapter.listJournalEntries and preserves mapping', async () => {
    const { app, calls } = buildSpyApp();
    const res = await request(app).get('/api/v2/finance/journal-drafts');
    assert.equal(res.status, 200);
    assert.deepEqual(calls.listJournalEntries, [TENANT_ID]);
    assert.equal(res.body.data.total, 1); // posted filtered out
    const row = res.body.data.journal_drafts[0];
    assert.equal(row.aggregate_id, 'je_1'); // aggregate_id <- id
    assert.equal(row.amount_cents, 700); // sum(debit_cents)
    assert.equal(res.body.data.source.projection, 'journal_entries');
  });

  test('GET /approvals reads from readAdapter.listApprovals and preserves mapping', async () => {
    const { app, calls } = buildSpyApp();
    const res = await request(app).get('/api/v2/finance/approvals');
    assert.equal(res.status, 200);
    assert.deepEqual(calls.listApprovals, [TENANT_ID]);
    assert.equal(res.body.data.total, 1);
    const row = res.body.data.approvals[0];
    assert.equal(row.subject_type, 'journal_entry'); // subject_type <- target_type
    assert.equal(row.subject_id, 'je_1'); // subject_id <- target_id
    assert.equal(res.body.data.source.projection, 'approval_queue');
  });

  test('GET /adapter-jobs reads from readAdapter.listAdapterJobs and preserves mapping', async () => {
    const { app, calls } = buildSpyApp();
    const res = await request(app).get('/api/v2/finance/adapter-jobs');
    assert.equal(res.status, 200);
    assert.deepEqual(calls.listAdapterJobs, [TENANT_ID]);
    assert.equal(res.body.data.total, 1);
    const row = res.body.data.adapter_jobs[0];
    assert.equal(row.operation, 'push_draft');
    assert.equal(row.attempts, 0);
    assert.equal(res.body.data.source.projection, 'adapter_jobs');
  });
});

// ---------------------------------------------------------------------------
// Beta integrity slice — the financial-statement routes must return exactly
// what the accounting engine computes (no recompute / shape drift between the
// engine source of truth and the GET pass-through routes).
// ---------------------------------------------------------------------------
describe('finance.v2 ledger/P&L/balance-sheet — engine parity', () => {
  const line = (classification, account_name, debit_cents, credit_cents) => ({
    classification,
    account_name,
    debit_cents,
    credit_cents,
  });
  const entry = (status, lines) => ({ tenant_id: TENANT_ID, status, lines });
  const FIXTURE = [
    entry('posted', [line('Asset', 'Cash', 500000, 0), line('Equity', 'Owner Capital', 0, 500000)]),
    entry('posted', [line('Asset', 'Cash', 200000, 0), line('Revenue', 'Sales', 0, 200000)]),
    entry('posted', [line('Expense', 'Rent', 80000, 0), line('Asset', 'Cash', 0, 80000)]),
    entry('draft', [line('Asset', 'Cash', 999999, 0), line('Revenue', 'Sales', 0, 999999)]),
  ];
  function seeded() {
    const service = createFinanceDomainService();
    FIXTURE.forEach((e) => service.seedJournalEntry(e));
    return service;
  }

  test('GET /ledger equals buildLedger', async () => {
    const { app } = buildApp({ service: seeded() });
    const res = await request(app).get('/api/v2/finance/ledger');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data, buildLedger(FIXTURE));
  });

  test('GET /profit-loss equals buildProfitAndLoss', async () => {
    const { app } = buildApp({ service: seeded() });
    const res = await request(app).get('/api/v2/finance/profit-loss');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data, buildProfitAndLoss(FIXTURE));
  });

  test('GET /balance-sheet equals buildBalanceSheet (is_balanced=false)', async () => {
    const { app } = buildApp({ service: seeded() });
    const res = await request(app).get('/api/v2/finance/balance-sheet');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.totals.is_balanced, false);
    assert.deepEqual(res.body.data, buildBalanceSheet(FIXTURE));
  });
});
