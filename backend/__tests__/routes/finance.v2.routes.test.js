import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import createFinanceV2Routes from '../../routes/finance.v2.js';
import createFinanceDomainService from '../../lib/finance/financeDomainService.js';

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

describe('finance.v2 routes', () => {
  test('GET /runtime/status returns mock runtime status', async () => {
    const service = createFinanceDomainService();
    service.createDraftInvoice({
      tenantId: TENANT_ID,
      actor: { id: 'user-1', type: 'human' },
      payload: { customer_id: 'CUST-100', subtotal_cents: 250000, total_cents: 250000 },
    });
    const { app } = buildApp({ service });

    const res = await request(app).get('/api/v2/finance/runtime/status');

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'success');
    assert.equal(res.body.data.tenant_id, TENANT_ID);
    assert.equal(res.body.data.runtime.mode, 'mock_read_only');
    assert.equal(res.body.data.runtime.persistence, 'in_memory');
    assert.equal(res.body.data.runtime.provider_sync, 'disabled');
    assert.equal(res.body.data.counts.invoices, 1);
    assert.equal(res.body.data.counts.audit_events, 1);
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
});
