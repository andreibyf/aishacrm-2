/**
 * Integration tests for backend/routes/billing-admin.js (superadmin console)
 * DI via opts.getSupabaseClient — no module mutation.
 */

import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { createBillingMock } from '../billing/_billingMock.js';

// Must set NODE_ENV before route module loads (middleware branches on it at request time).
process.env.NODE_ENV = 'test';

let createBillingAdminRoutes;
before(async () => {
  // Import route module AFTER NODE_ENV is set
  ({ default: createBillingAdminRoutes } = await import('../../routes/billing-admin.js'));
});

let mockClient;

const TENANT = '22222222-2222-2222-2222-222222222222';
const ADMIN = 'admin-user-1';

function buildApp(user) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = user;
    next();
  });
  app.use(
    '/api/billing-admin',
    createBillingAdminRoutes(null, { getSupabaseClient: () => mockClient }),
  );
  return app;
}

const superadmin = { id: ADMIN, role: 'superadmin', tenant_uuid: null };
const regularAdmin = { id: 'u2', role: 'admin', tenant_uuid: TENANT };

beforeEach(() => {
  mockClient = createBillingMock({
    tenant: [{ id: TENANT, name: 'Acme', billing_state: 'active' }],
    billing_plans: [
      {
        id: 'p1',
        code: 'starter_monthly',
        name: 'Starter',
        amount_cents: 4900,
        currency: 'usd',
        billing_interval: 'month',
        is_active: true,
      },
      {
        id: 'p2',
        code: 'growth_monthly',
        name: 'Growth',
        amount_cents: 14900,
        currency: 'usd',
        billing_interval: 'month',
        is_active: true,
      },
    ],
    billing_accounts: [],
    tenant_subscriptions: [],
    invoices: [],
    invoice_line_items: [],
    payments: [],
    billing_events: [],
  });
});

describe('Role gating', () => {
  it('rejects non-superadmin users', async () => {
    const res = await request(buildApp(regularAdmin)).get(`/api/billing-admin/tenants/${TENANT}`);
    assert.equal(res.status, 403);
  });

  it('rejects unauthenticated requests', async () => {
    const app = express();
    app.use(express.json());
    app.use(
      '/api/billing-admin',
      createBillingAdminRoutes(null, { getSupabaseClient: () => mockClient }),
    );
    const res = await request(app).get(`/api/billing-admin/tenants/${TENANT}`);
    assert.equal(res.status, 401);
  });

  it('allows superadmin', async () => {
    const res = await request(buildApp(superadmin)).get(`/api/billing-admin/tenants/${TENANT}`);
    assert.equal(res.status, 200);
  });
});

describe('GET /tenants/:tenantId summary', () => {
  it('returns tenant, account, subscription, and invoices', async () => {
    mockClient.db.tenant_subscriptions = [
      {
        id: 's1',
        tenant_id: TENANT,
        billing_plan_id: 'p1',
        status: 'active',
        created_at: '2026-01-01',
      },
    ];
    mockClient.db.invoices = [
      {
        id: 'inv1',
        tenant_id: TENANT,
        status: 'open',
        total_cents: 4900,
        issue_date: '2026-01-01',
      },
    ];
    const res = await request(buildApp(superadmin)).get(`/api/billing-admin/tenants/${TENANT}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.tenant.id, TENANT);
    assert.equal(res.body.data.subscription.id, 's1');
    assert.equal(res.body.data.recent_invoices.length, 1);
  });

  it('returns 404 for non-existent tenant', async () => {
    const res = await request(buildApp(superadmin)).get(
      '/api/billing-admin/tenants/00000000-0000-0000-0000-000000000000',
    );
    assert.equal(res.status, 404);
  });
});

describe('Subscription management', () => {
  it('POST assigns a plan', async () => {
    const res = await request(buildApp(superadmin))
      .post(`/api/billing-admin/tenants/${TENANT}/subscription`)
      .send({ plan_code: 'starter_monthly' });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.status, 'active');
    assert.equal(res.body.data.billing_plan_id, 'p1');
  });

  it('POST rejects duplicate assignment', async () => {
    await request(buildApp(superadmin))
      .post(`/api/billing-admin/tenants/${TENANT}/subscription`)
      .send({ plan_code: 'starter_monthly' });
    const res = await request(buildApp(superadmin))
      .post(`/api/billing-admin/tenants/${TENANT}/subscription`)
      .send({ plan_code: 'growth_monthly' });
    assert.equal(res.status, 409); // PR #517: CONFLICT is the correct code
    assert.match(res.body.message, /already has/);
  });

  it('PUT changes plan', async () => {
    await request(buildApp(superadmin))
      .post(`/api/billing-admin/tenants/${TENANT}/subscription`)
      .send({ plan_code: 'starter_monthly' });
    const res = await request(buildApp(superadmin))
      .put(`/api/billing-admin/tenants/${TENANT}/subscription`)
      .send({ plan_code: 'growth_monthly' });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.billing_plan_id, 'p2');
  });

  it('DELETE cancels subscription', async () => {
    await request(buildApp(superadmin))
      .post(`/api/billing-admin/tenants/${TENANT}/subscription`)
      .send({ plan_code: 'starter_monthly' });
    const res = await request(buildApp(superadmin))
      .delete(`/api/billing-admin/tenants/${TENANT}/subscription`)
      .send({ reason: 'customer request' });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, 'canceled');
  });
});

describe('Exemption management', () => {
  it('POST sets exemption with reason + actor', async () => {
    const res = await request(buildApp(superadmin))
      .post(`/api/billing-admin/tenants/${TENANT}/exemption`)
      .send({ reason: 'Strategic partner' });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.account.billing_exempt, true);
    assert.equal(res.body.data.account.exempt_set_by, ADMIN);
    assert.equal(mockClient.db.tenant[0].billing_state, 'billing_exempt');
  });

  it('POST rejects missing reason', async () => {
    const res = await request(buildApp(superadmin))
      .post(`/api/billing-admin/tenants/${TENANT}/exemption`)
      .send({});
    assert.equal(res.status, 400);
  });

  it('DELETE removes exemption', async () => {
    await request(buildApp(superadmin))
      .post(`/api/billing-admin/tenants/${TENANT}/exemption`)
      .send({ reason: 'comp' });
    const res = await request(buildApp(superadmin)).delete(
      `/api/billing-admin/tenants/${TENANT}/exemption`,
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.data.account.billing_exempt, false);
  });

  it('DELETE rejects when tenant not exempt', async () => {
    const res = await request(buildApp(superadmin)).delete(
      `/api/billing-admin/tenants/${TENANT}/exemption`,
    );
    assert.equal(res.status, 400);
    assert.match(res.body.message, /not currently exempt/);
  });
});

describe('Invoice management', () => {
  it('POST creates draft invoice', async () => {
    const res = await request(buildApp(superadmin))
      .post(`/api/billing-admin/tenants/${TENANT}/invoices`)
      .send({
        line_items: [
          {
            item_type: 'subscription',
            description: 'Starter',
            quantity: 1,
            unit_price_cents: 4900,
          },
        ],
      });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.invoice.status, 'draft');
    assert.equal(res.body.data.invoice.total_cents, 4900);
  });

  it('POST returns 409 when tenant is exempt', async () => {
    await request(buildApp(superadmin))
      .post(`/api/billing-admin/tenants/${TENANT}/exemption`)
      .send({ reason: 'comp' });
    const res = await request(buildApp(superadmin))
      .post(`/api/billing-admin/tenants/${TENANT}/invoices`)
      .send({
        line_items: [
          { item_type: 'subscription', description: 'x', quantity: 1, unit_price_cents: 100 },
        ],
      });
    assert.equal(res.status, 409); // PR #517: EXEMPT -> 409 Conflict
    assert.match(res.body.message, /exempt/);
  });

  it('POST /invoices/:id/issue moves draft to open', async () => {
    const createRes = await request(buildApp(superadmin))
      .post(`/api/billing-admin/tenants/${TENANT}/invoices`)
      .send({
        line_items: [
          { item_type: 'subscription', description: 'x', quantity: 1, unit_price_cents: 100 },
        ],
      });
    const invoiceId = createRes.body.data.invoice.id;
    const res = await request(buildApp(superadmin)).post(
      `/api/billing-admin/invoices/${invoiceId}/issue`,
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, 'open');
  });

  it('POST /invoices/:id/mark-paid records manual payment', async () => {
    const createRes = await request(buildApp(superadmin))
      .post(`/api/billing-admin/tenants/${TENANT}/invoices`)
      .send({
        line_items: [
          { item_type: 'subscription', description: 'x', quantity: 1, unit_price_cents: 4900 },
        ],
      });
    const invoiceId = createRes.body.data.invoice.id;
    await request(buildApp(superadmin)).post(`/api/billing-admin/invoices/${invoiceId}/issue`);
    const res = await request(buildApp(superadmin))
      .post(`/api/billing-admin/invoices/${invoiceId}/mark-paid`)
      .send({ amount_cents: 4900, payment_method_type: 'wire' });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.invoice.status, 'paid');
  });

  it('POST /invoices/:id/void voids draft', async () => {
    const createRes = await request(buildApp(superadmin))
      .post(`/api/billing-admin/tenants/${TENANT}/invoices`)
      .send({
        line_items: [
          { item_type: 'subscription', description: 'x', quantity: 1, unit_price_cents: 100 },
        ],
      });
    const invoiceId = createRes.body.data.invoice.id;
    const res = await request(buildApp(superadmin))
      .post(`/api/billing-admin/invoices/${invoiceId}/void`)
      .send({ reason: 'duplicate' });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, 'void');
  });
});

describe('GET /tenants/:tenantId/events audit trail', () => {
  it('returns billing events for tenant', async () => {
    await request(buildApp(superadmin))
      .post(`/api/billing-admin/tenants/${TENANT}/subscription`)
      .send({ plan_code: 'starter_monthly' });
    const res = await request(buildApp(superadmin)).get(
      `/api/billing-admin/tenants/${TENANT}/events`,
    );
    assert.equal(res.status, 200);
    assert.ok(res.body.data.length > 0);
    const types = res.body.data.map((e) => e.event_type);
    assert.ok(types.includes('plan.assigned'));
  });
});

describe('GET /tenants/:tenantId -- unknown tenant (PR #517 issue 1)', () => {
  it('returns 404 for unknown tenant (not 500)', async () => {
    const UNKNOWN = '99999999-9999-9999-9999-999999999999';
    const res = await request(buildApp(superadmin)).get(`/api/billing-admin/tenants/${UNKNOWN}`);
    assert.equal(res.status, 404);
    assert.equal(res.body.status, 'error');
    assert.match(res.body.message, /Tenant not found/);
    // No billing_accounts row should have been created for the unknown tenant
    const created = mockClient.db.billing_accounts.find((a) => a.tenant_id === UNKNOWN);
    assert.equal(created, undefined, 'billing_accounts must not be created for unknown tenant');
  });

  it('returns 200 with billing summary when tenant exists', async () => {
    const res = await request(buildApp(superadmin)).get(`/api/billing-admin/tenants/${TENANT}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'success');
    assert.equal(res.body.data.tenant.id, TENANT);
    assert.ok(res.body.data.billing_account);
  });
});

describe('BillingError code surfacing in responses (PR #517 issue 4)', () => {
  it('POST subscription twice -> 409 CONFLICT with code in body', async () => {
    await request(buildApp(superadmin))
      .post(`/api/billing-admin/tenants/${TENANT}/subscription`)
      .send({ plan_code: 'starter_monthly' });

    const res = await request(buildApp(superadmin))
      .post(`/api/billing-admin/tenants/${TENANT}/subscription`)
      .send({ plan_code: 'growth_monthly' });

    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'CONFLICT');
    assert.match(res.body.message, /already has an active subscription/);
  });

  it('POST invoice on billing-exempt tenant -> 409 EXEMPT', async () => {
    // Mark tenant billing-exempt
    await request(buildApp(superadmin))
      .post(`/api/billing-admin/tenants/${TENANT}/exemption`)
      .send({ reason: 'pilot account' });

    const res = await request(buildApp(superadmin))
      .post(`/api/billing-admin/tenants/${TENANT}/invoices`)
      .send({
        line_items: [
          { item_type: 'subscription', description: 'x', quantity: 1, unit_price_cents: 100 },
        ],
      });

    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'EXEMPT');
  });

  it('POST subscription with missing plan_code -> 400 INVALID_INPUT', async () => {
    const res = await request(buildApp(superadmin))
      .post(`/api/billing-admin/tenants/${TENANT}/subscription`)
      .send({});
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'INVALID_INPUT');
  });

  it('POST void on missing invoice -> 404 NOT_FOUND', async () => {
    const res = await request(buildApp(superadmin))
      .post(`/api/billing-admin/invoices/00000000-0000-0000-0000-000000000000/void`)
      .send({ reason: 'test' });
    assert.equal(res.status, 404);
    assert.equal(res.body.code, 'NOT_FOUND');
  });
});
