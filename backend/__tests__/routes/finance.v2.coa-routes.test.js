/**
 * finance.v2.coa-routes.test.js
 *
 * Editable Chart of Accounts manager — Phase 4 route tests (Tasks 12-14).
 * Design: docs/plans/2026-06-06-editable-coa-manager-design.md §3 (routes),
 * §5 (RBAC), §6 (structured error codes).
 *
 * The four COA-management routes mirror the POST/PATCH draft-invoices template
 * (runWrite → domain method → sendError) and are gated by:
 *   1. the existing tenant + finance-module middleware (unchanged),
 *   2. requireCoaManage — the RBAC gate (admin/superadmin fallback, see §5
 *      deviation note in the design doc + finance.v2.js comment),
 *   3. the domain-layer AI-actor block (defense in depth).
 *
 * Harness mirrors finance.v2.read-routes.test.js: a real domain service is
 * injected via opts.service so seeded accounts / posted entries are visible to
 * the route handlers, and req.user is set by a tiny middleware so buildActor /
 * the RBAC gate see the authenticated role.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import createFinanceV2Routes from '../../routes/finance.v2.js';
import createFinanceDomainService from '../../lib/finance/financeDomainService.js';

const TENANT_ID = '00000000-0000-4000-8000-000000000011';

// Default authenticated user is a tenant admin — clears the requireCoaManage
// fallback gate (admin/superadmin). Individual tests override `user` to prove
// the RBAC denial (an employee/user role) and the AI-actor block (ai_agent).
function buildApp({
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
      isFinanceModuleEnabled: async () => true,
    }),
  );
  return { app, service };
}

const VALID_CREATE = { name: 'Operating Account', classification: 'Asset', account_type: 'Bank' };

// Seed a manual (non-system) account via the domain service so PATCH/deactivate/
// reactivate tests have a real, editable target with a stable id.
async function seedManualAccount(service, payload = VALID_CREATE) {
  return service.createAccount({
    tenantId: TENANT_ID,
    actor: { id: 'seed', type: 'human' },
    payload,
  });
}

// Post a journal line against an account id so it acquires "posted history"
// (mirrors the domain-manager test's postLine helper).
function postLine(service, accountId, { id = `je_${accountId}`, debit = 1000, credit = 0 } = {}) {
  service.seedJournalEntry({
    id,
    tenant_id: TENANT_ID,
    status: 'posted',
    currency: 'usd',
    lines: [
      { account_id: accountId, account_name: 'X', classification: 'Asset', debit_cents: debit, credit_cents: credit },
    ],
  });
}

// ---------------------------------------------------------------------------
// POST /accounts (Task 12)
// ---------------------------------------------------------------------------
describe('POST /api/v2/finance/accounts', () => {
  test('happy path → 201 with the created account', async () => {
    const { app } = buildApp();
    const res = await request(app).post('/api/v2/finance/accounts').send(VALID_CREATE);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.status, 'success');
    const account = res.body.data;
    assert.equal(account.name, 'Operating Account');
    assert.equal(account.classification, 'Asset');
    assert.equal(account.account_type, 'Bank');
    assert.equal(account.is_system, false);
    assert.equal(account.is_active, true);
    assert.ok(account.id, 'account has an id');
  });

  test('an AI actor is blocked → 403 FINANCE_COA_AI_FORBIDDEN', async () => {
    // role 'ai_agent' makes buildActor stamp actor.type='ai_agent'; the RBAC
    // gate is intentionally permissive enough to let the request reach the
    // domain layer, where the governance default fail-closes the AI write.
    const { app } = buildApp({
      user: { id: 'bot', role: 'ai_agent', tenant_id: TENANT_ID, tenant_uuid: TENANT_ID, is_ai_agent: true },
    });
    const res = await request(app).post('/api/v2/finance/accounts').send(VALID_CREATE);
    assert.equal(res.status, 403, JSON.stringify(res.body));
    assert.equal(res.body.code, 'FINANCE_COA_AI_FORBIDDEN');
  });

  test('an invalid account_type → 400 FINANCE_COA_INVALID_ACCOUNT_TYPE', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post('/api/v2/finance/accounts')
      .send({ name: 'Bad Type', classification: 'Asset', account_type: 'Checking' });
    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.equal(res.body.code, 'FINANCE_COA_INVALID_ACCOUNT_TYPE');
  });

  test('a caller without the manage capability → 403 FINANCE_COA_FORBIDDEN', async () => {
    // A plain 'user'/'employee' role does not clear the admin/superadmin
    // fallback gate. This must be a clean RBAC denial BEFORE any domain write.
    const { app, service } = buildApp({
      user: { id: 'emp-1', role: 'user', tenant_id: TENANT_ID, tenant_uuid: TENANT_ID },
    });
    const res = await request(app).post('/api/v2/finance/accounts').send(VALID_CREATE);
    assert.equal(res.status, 403, JSON.stringify(res.body));
    assert.equal(res.body.code, 'FINANCE_COA_FORBIDDEN');
    // No account was created — the gate ran before the domain method.
    assert.ok(!service.listAccounts(TENANT_ID).some((a) => a.name === 'Operating Account'));
  });

  test('a manager role also lacks the manage capability → 403 FINANCE_COA_FORBIDDEN', async () => {
    // The fallback gate is admin/superadmin only (design §5). A manager — one
    // step below admin — must NOT clear it; proving the gate is not merely
    // "any privileged-sounding role".
    const { app } = buildApp({
      user: { id: 'mgr-1', role: 'manager', tenant_id: TENANT_ID, tenant_uuid: TENANT_ID },
    });
    const res = await request(app).post('/api/v2/finance/accounts').send(VALID_CREATE);
    assert.equal(res.status, 403, JSON.stringify(res.body));
    assert.equal(res.body.code, 'FINANCE_COA_FORBIDDEN');
  });
});

// ---------------------------------------------------------------------------
// PATCH /accounts/:id (Task 13)
// ---------------------------------------------------------------------------
describe('PATCH /api/v2/finance/accounts/:id', () => {
  test('happy path: a no-history account full edit → 200', async () => {
    const service = createFinanceDomainService();
    const acct = await seedManualAccount(service, {
      name: 'Misc Asset',
      classification: 'Asset',
      account_type: 'Asset',
    });
    const { app } = buildApp({ service });
    const res = await request(app)
      .patch(`/api/v2/finance/accounts/${acct.id}`)
      .send({ name: 'Renamed Asset', account_type: 'Cash' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.status, 'success');
    assert.equal(res.body.data.id, acct.id, 'identity preserved');
    assert.equal(res.body.data.name, 'Renamed Asset');
    assert.equal(res.body.data.account_type, 'Cash');
  });

  test('a posted-history classification change → 409 FINANCE_COA_FIELD_LOCKED_POSTED_HISTORY', async () => {
    const service = createFinanceDomainService();
    const acct = await seedManualAccount(service, {
      name: 'Has History',
      classification: 'Asset',
      account_type: 'Asset',
    });
    postLine(service, acct.id);
    const { app } = buildApp({ service });
    const res = await request(app)
      .patch(`/api/v2/finance/accounts/${acct.id}`)
      .send({ classification: 'Expense', account_type: 'Expense', reason: 'reclassify' });
    assert.equal(res.status, 409, JSON.stringify(res.body));
    assert.equal(res.body.code, 'FINANCE_COA_FIELD_LOCKED_POSTED_HISTORY');
  });

  test('editing a system account → 409 FINANCE_COA_SYSTEM_ACCOUNT_LOCKED', async () => {
    const service = createFinanceDomainService();
    // 'Cash' (1000) is a seeded system account.
    const cash = service.listAccounts(TENANT_ID).find((a) => a.account_code === '1000');
    assert.ok(cash && cash.is_system, 'Cash is a seeded system account');
    const { app } = buildApp({ service });
    const res = await request(app)
      .patch(`/api/v2/finance/accounts/${cash.id}`)
      .send({ name: 'My Cash' });
    assert.equal(res.status, 409, JSON.stringify(res.body));
    assert.equal(res.body.code, 'FINANCE_COA_SYSTEM_ACCOUNT_LOCKED');
  });

  test('a posted-history edit WITHOUT a reason → 400 FINANCE_COA_REASON_REQUIRED', async () => {
    const service = createFinanceDomainService();
    const acct = await seedManualAccount(service, {
      name: 'Needs Reason',
      classification: 'Asset',
      account_type: 'Asset',
    });
    postLine(service, acct.id);
    const { app } = buildApp({ service });
    const res = await request(app)
      .patch(`/api/v2/finance/accounts/${acct.id}`)
      .send({ name: 'Renamed No Reason' });
    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.equal(res.body.code, 'FINANCE_COA_REASON_REQUIRED');
  });

  test('a caller without the manage capability → 403 FINANCE_COA_FORBIDDEN', async () => {
    const service = createFinanceDomainService();
    const acct = await seedManualAccount(service, {
      name: 'Locked By RBAC',
      classification: 'Asset',
      account_type: 'Asset',
    });
    const { app } = buildApp({
      service,
      user: { id: 'emp-1', role: 'user', tenant_id: TENANT_ID, tenant_uuid: TENANT_ID },
    });
    const res = await request(app)
      .patch(`/api/v2/finance/accounts/${acct.id}`)
      .send({ name: 'Should Not Apply' });
    assert.equal(res.status, 403, JSON.stringify(res.body));
    assert.equal(res.body.code, 'FINANCE_COA_FORBIDDEN');
  });
});

// ---------------------------------------------------------------------------
// POST /accounts/:id/deactivate (Task 14)
// ---------------------------------------------------------------------------
describe('POST /api/v2/finance/accounts/:id/deactivate', () => {
  test('happy path: a zero-balance non-system account → 200, is_active false', async () => {
    const service = createFinanceDomainService();
    const acct = await seedManualAccount(service, {
      name: 'To Deactivate',
      classification: 'Asset',
      account_type: 'Asset',
    });
    const { app } = buildApp({ service });
    const res = await request(app)
      .post(`/api/v2/finance/accounts/${acct.id}/deactivate`)
      .send({ reason: 'no longer used' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.status, 'success');
    assert.equal(res.body.data.id, acct.id);
    assert.equal(res.body.data.is_active, false);
  });

  test('a nonzero posted balance → 409 FINANCE_COA_DEACTIVATE_NONZERO_BALANCE', async () => {
    const service = createFinanceDomainService();
    const acct = await seedManualAccount(service, {
      name: 'Has Balance',
      classification: 'Asset',
      account_type: 'Asset',
    });
    postLine(service, acct.id, { debit: 5000, credit: 0 });
    const { app } = buildApp({ service });
    const res = await request(app)
      .post(`/api/v2/finance/accounts/${acct.id}/deactivate`)
      .send({ reason: 'try anyway' });
    assert.equal(res.status, 409, JSON.stringify(res.body));
    assert.equal(res.body.code, 'FINANCE_COA_DEACTIVATE_NONZERO_BALANCE');
  });

  test('a caller without the manage capability → 403 FINANCE_COA_FORBIDDEN', async () => {
    const service = createFinanceDomainService();
    const acct = await seedManualAccount(service, {
      name: 'RBAC Deactivate',
      classification: 'Asset',
      account_type: 'Asset',
    });
    const { app } = buildApp({
      service,
      user: { id: 'emp-1', role: 'user', tenant_id: TENANT_ID, tenant_uuid: TENANT_ID },
    });
    const res = await request(app)
      .post(`/api/v2/finance/accounts/${acct.id}/deactivate`)
      .send({ reason: 'nope' });
    assert.equal(res.status, 403, JSON.stringify(res.body));
    assert.equal(res.body.code, 'FINANCE_COA_FORBIDDEN');
  });
});

// ---------------------------------------------------------------------------
// POST /accounts/:id/reactivate (Task 14)
// ---------------------------------------------------------------------------
describe('POST /api/v2/finance/accounts/:id/reactivate', () => {
  test('happy path: reactivating an inactive account → 200, is_active true, id preserved', async () => {
    const service = createFinanceDomainService();
    const acct = await seedManualAccount(service, {
      name: 'Toggle Me',
      classification: 'Asset',
      account_type: 'Asset',
    });
    await service.deactivateAccount({
      tenantId: TENANT_ID,
      actor: { id: 'seed', type: 'human' },
      accountId: acct.id,
      payload: { reason: 'temp off' },
    });
    const { app } = buildApp({ service });
    const res = await request(app)
      .post(`/api/v2/finance/accounts/${acct.id}/reactivate`)
      .send({ reason: 'needed again' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.status, 'success');
    assert.equal(res.body.data.id, acct.id, 'identity preserved');
    assert.equal(res.body.data.is_active, true);
  });

  test('reactivating an already-active account → 409 FINANCE_COA_NOT_INACTIVE', async () => {
    const service = createFinanceDomainService();
    const acct = await seedManualAccount(service, {
      name: 'Already Active',
      classification: 'Asset',
      account_type: 'Asset',
    });
    const { app } = buildApp({ service });
    const res = await request(app)
      .post(`/api/v2/finance/accounts/${acct.id}/reactivate`)
      .send({ reason: 'noop' });
    assert.equal(res.status, 409, JSON.stringify(res.body));
    assert.equal(res.body.code, 'FINANCE_COA_NOT_INACTIVE');
  });

  test('a caller without the manage capability → 403 FINANCE_COA_FORBIDDEN', async () => {
    const service = createFinanceDomainService();
    const acct = await seedManualAccount(service, {
      name: 'RBAC Reactivate',
      classification: 'Asset',
      account_type: 'Asset',
    });
    await service.deactivateAccount({
      tenantId: TENANT_ID,
      actor: { id: 'seed', type: 'human' },
      accountId: acct.id,
      payload: { reason: 'temp off' },
    });
    const { app } = buildApp({
      service,
      user: { id: 'emp-1', role: 'user', tenant_id: TENANT_ID, tenant_uuid: TENANT_ID },
    });
    const res = await request(app)
      .post(`/api/v2/finance/accounts/${acct.id}/reactivate`)
      .send({ reason: 'nope' });
    assert.equal(res.status, 403, JSON.stringify(res.body));
    assert.equal(res.body.code, 'FINANCE_COA_FORBIDDEN');
  });
});
