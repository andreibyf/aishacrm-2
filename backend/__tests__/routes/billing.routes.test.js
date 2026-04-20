/**
 * Integration tests for backend/routes/billing.js (tenant portal)
 *
 * Uses supertest + an in-process express app wired to the billing mock
 * via DI (opts.getSupabaseClient) — no module mutation required.
 */

import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { createBillingMock } from '../billing/_billingMock.js';

// Must set NODE_ENV before route module loads (middleware branches on it at request time).
process.env.NODE_ENV = 'test';

let createBillingRoutes;
before(async () => {
  // Import route module AFTER NODE_ENV is set
  ({ default: createBillingRoutes } = await import('../../routes/billing.js'));
});

let mockClient;

const TENANT = '11111111-1111-1111-1111-111111111111';

function buildApp(user) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = user;
    next();
  });
  app.use('/api/billing', createBillingRoutes(null, { getSupabaseClient: () => mockClient }));
  return app;
}

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
    billing_events: [],
  });
});

describe('GET /api/billing/plans', () => {
  it('returns active plans ordered by price', async () => {
    const user = { id: 'u1', role: 'admin', tenant_uuid: TENANT, tenant_id: TENANT };
    const res = await request(buildApp(user))
      .get('/api/billing/plans')
      .query({ tenant_id: TENANT });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'success');
    assert.equal(res.body.data.length, 2);
    assert.equal(res.body.data[0].code, 'starter_monthly');
    assert.equal(res.body.data[1].code, 'growth_monthly');
  });

  it('requires authentication', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/billing', createBillingRoutes(null, { getSupabaseClient: () => mockClient }));
    const res = await request(app).get('/api/billing/plans');
    assert.equal(res.status, 401);
  });
});

describe('GET /api/billing/account', () => {
  it('creates empty account on first access', async () => {
    const user = { id: 'u1', role: 'admin', tenant_uuid: TENANT, tenant_id: TENANT };
    const res = await request(buildApp(user))
      .get('/api/billing/account')
      .query({ tenant_id: TENANT });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.tenant_id, TENANT);
    assert.equal(mockClient.db.billing_accounts.length, 1);
  });
});

describe('PUT /api/billing/account', () => {
  it('updates allowed fields', async () => {
    const user = { id: 'u1', role: 'admin', tenant_uuid: TENANT, tenant_id: TENANT };
    const res = await request(buildApp(user))
      .put('/api/billing/account')
      .send({ tenant_id: TENANT, billing_email: 'finance@acme.com', company_name: 'Acme Inc' });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.billing_email, 'finance@acme.com');
  });

  it('returns 400 when trying to modify billing_exempt', async () => {
    const user = { id: 'u1', role: 'admin', tenant_uuid: TENANT, tenant_id: TENANT };
    const res = await request(buildApp(user))
      .put('/api/billing/account')
      .send({ tenant_id: TENANT, billing_exempt: true });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /setExemption/);
  });
});

describe('GET /api/billing/subscription', () => {
  it('returns null when no subscription exists', async () => {
    const user = { id: 'u1', role: 'admin', tenant_uuid: TENANT, tenant_id: TENANT };
    const res = await request(buildApp(user))
      .get('/api/billing/subscription')
      .query({ tenant_id: TENANT });
    assert.equal(res.status, 200);
    assert.equal(res.body.data, null);
  });

  it('returns active subscription', async () => {
    mockClient.db.tenant_subscriptions = [
      {
        id: 's1',
        tenant_id: TENANT,
        billing_plan_id: 'p1',
        status: 'active',
        created_at: '2026-01-01',
      },
    ];
    const user = { id: 'u1', role: 'admin', tenant_uuid: TENANT, tenant_id: TENANT };
    const res = await request(buildApp(user))
      .get('/api/billing/subscription')
      .query({ tenant_id: TENANT });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.id, 's1');
  });
});

describe('GET /api/billing/invoices', () => {
  it('returns empty list when no invoices', async () => {
    const user = { id: 'u1', role: 'admin', tenant_uuid: TENANT, tenant_id: TENANT };
    const res = await request(buildApp(user))
      .get('/api/billing/invoices')
      .query({ tenant_id: TENANT });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data, []);
  });

  it('returns tenant invoices only', async () => {
    mockClient.db.invoices = [
      {
        id: 'inv1',
        tenant_id: TENANT,
        status: 'open',
        total_cents: 4900,
        issue_date: '2026-01-01',
      },
      {
        id: 'inv2',
        tenant_id: 'other-tenant',
        status: 'open',
        total_cents: 9900,
        issue_date: '2026-01-02',
      },
    ];
    const user = { id: 'u1', role: 'admin', tenant_uuid: TENANT, tenant_id: TENANT };
    const res = await request(buildApp(user))
      .get('/api/billing/invoices')
      .query({ tenant_id: TENANT });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].id, 'inv1');
  });
});

describe('GET /api/billing/invoices/:id', () => {
  it('returns invoice with line items', async () => {
    mockClient.db.invoices = [{ id: 'inv1', tenant_id: TENANT, status: 'open', total_cents: 4900 }];
    mockClient.db.invoice_line_items = [
      {
        id: 'li1',
        invoice_id: 'inv1',
        item_type: 'subscription',
        amount_cents: 4900,
        created_at: '2026-01-01',
      },
    ];
    const user = { id: 'u1', role: 'admin', tenant_uuid: TENANT, tenant_id: TENANT };
    const res = await request(buildApp(user))
      .get('/api/billing/invoices/inv1')
      .query({ tenant_id: TENANT });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.invoice.id, 'inv1');
    assert.equal(res.body.data.line_items.length, 1);
  });

  it('returns 404 for non-existent invoice', async () => {
    const user = { id: 'u1', role: 'admin', tenant_uuid: TENANT, tenant_id: TENANT };
    const res = await request(buildApp(user))
      .get('/api/billing/invoices/nope')
      .query({ tenant_id: TENANT });
    assert.equal(res.status, 404);
  });

  it('returns 404 for invoice belonging to another tenant (isolation)', async () => {
    mockClient.db.invoices = [{ id: 'inv1', tenant_id: 'other-tenant', status: 'open' }];
    const user = { id: 'u1', role: 'admin', tenant_uuid: TENANT, tenant_id: TENANT };
    const res = await request(buildApp(user))
      .get('/api/billing/invoices/inv1')
      .query({ tenant_id: TENANT });
    assert.equal(res.status, 404);
  });
});

describe('POST /api/billing/checkout-session — platform config guard', () => {
  it('returns 503 when platform billing not configured', async () => {
    const original = process.env.STRIPE_PLATFORM_SECRET_KEY;
    delete process.env.STRIPE_PLATFORM_SECRET_KEY;
    try {
      const user = { id: 'u1', role: 'admin', tenant_uuid: TENANT, tenant_id: TENANT };
      const res = await request(buildApp(user)).post('/api/billing/checkout-session').send({
        tenant_id: TENANT,
        plan_code: 'starter_monthly',
        success_url: 'https://app.aishacrm.com/success',
        cancel_url: 'https://app.aishacrm.com/cancel',
      });
      assert.equal(res.status, 503);
      assert.match(res.body.message, /not configured/);
    } finally {
      if (original) process.env.STRIPE_PLATFORM_SECRET_KEY = original;
    }
  });

  it('returns 400 when plan_code missing', async () => {
    process.env.STRIPE_PLATFORM_SECRET_KEY = 'sk_test_placeholder';
    process.env.STRIPE_PLATFORM_WEBHOOK_SECRET = 'whsec_placeholder';
    const user = { id: 'u1', role: 'admin', tenant_uuid: TENANT, tenant_id: TENANT };
    const res = await request(buildApp(user))
      .post('/api/billing/checkout-session')
      .send({ tenant_id: TENANT, success_url: 'x', cancel_url: 'y' });
    assert.equal(res.status, 400);
  });

  it('returns 409 when tenant is billing-exempt', async () => {
    process.env.STRIPE_PLATFORM_SECRET_KEY = 'sk_test_placeholder';
    process.env.STRIPE_PLATFORM_WEBHOOK_SECRET = 'whsec_placeholder';
    mockClient.db.billing_accounts = [
      {
        id: 'ba1',
        tenant_id: TENANT,
        billing_exempt: true,
        exempt_reason: 'comp',
        exempt_set_by: 'admin',
        exempt_set_at: '2026-01-01',
      },
    ];
    const user = { id: 'u1', role: 'admin', tenant_uuid: TENANT, tenant_id: TENANT };
    const res = await request(buildApp(user)).post('/api/billing/checkout-session').send({
      tenant_id: TENANT,
      plan_code: 'starter_monthly',
      success_url: 'https://x',
      cancel_url: 'https://y',
    });
    assert.equal(res.status, 409);
    assert.match(res.body.message, /exempt/);
  });
});

describe('POST /api/billing/portal-session', () => {
  it('returns 409 when no Stripe customer on file', async () => {
    process.env.STRIPE_PLATFORM_SECRET_KEY = 'sk_test_placeholder';
    process.env.STRIPE_PLATFORM_WEBHOOK_SECRET = 'whsec_placeholder';
    const user = { id: 'u1', role: 'admin', tenant_uuid: TENANT, tenant_id: TENANT };
    const res = await request(buildApp(user))
      .post('/api/billing/portal-session')
      .send({ tenant_id: TENANT, return_url: 'https://app.aishacrm.com/billing' });
    assert.equal(res.status, 409);
    assert.match(res.body.message, /No Stripe customer/);
  });
});

describe('resolveTenantId slug/UUID canonicalisation (PR #517 issue 2)', () => {
  // After validateTenantAccess resolves the tenant, req.tenant is
  //   { id: <uuid>, tenant_id: <slug>, name: <string> }.
  // This test injects req.tenant directly to verify resolveTenantId
  // accepts requests whose body/query carries the slug form, not just UUID.

  const SLUG = 'acme-corp';

  function buildAppWithCanonicalTenant(user, canonical) {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = user;
      req.tenant = canonical;
      next();
    });
    app.use('/api/billing', createBillingRoutes(null, { getSupabaseClient: () => mockClient }));
    return app;
  }

  it('accepts slug in body when middleware has resolved UUID in req.tenant.id', async () => {
    const user = { id: 'u1', role: 'admin', tenant_uuid: TENANT, tenant_id: SLUG };
    const app = buildAppWithCanonicalTenant(user, { id: TENANT, tenant_id: SLUG, name: 'Acme' });

    // Previously: body.tenant_id=SLUG !== req.tenant.id=UUID -> 400 mismatch
    // Now: resolveTenantId accepts either UUID or slug -> 200
    const res = await request(app).get('/api/billing/account').query({ tenant_id: SLUG });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'success');
    // Downstream DB was queried with canonical UUID, not slug
    const account = mockClient.db.billing_accounts.find((a) => a.tenant_id === TENANT);
    assert.ok(account, 'billing_account must be created under canonical UUID');
  });

  it('accepts UUID in body when middleware has resolved UUID in req.tenant.id', async () => {
    const user = { id: 'u1', role: 'admin', tenant_uuid: TENANT, tenant_id: SLUG };
    const app = buildAppWithCanonicalTenant(user, { id: TENANT, tenant_id: SLUG, name: 'Acme' });
    const res = await request(app).get('/api/billing/account').query({ tenant_id: TENANT });
    assert.equal(res.status, 200);
  });

  it('still returns 400 mismatch when body tenant_id is a DIFFERENT tenant', async () => {
    const user = { id: 'u1', role: 'admin', tenant_uuid: TENANT, tenant_id: SLUG };
    const app = buildAppWithCanonicalTenant(user, { id: TENANT, tenant_id: SLUG, name: 'Acme' });
    const res = await request(app)
      .get('/api/billing/account')
      .query({ tenant_id: 'different-slug' });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /tenant_id mismatch/);
  });

  it('returns 400 tenant_id required when superadmin has no tenant selected', async () => {
    // Superadmins are the only role that can reach resolveTenantId without
    // validateTenantAccess having populated req.tenant, because the middleware
    // only auto-injects tenant_id for non-superadmin roles and 403s admins
    // without a tenant_uuid.
    const superadmin = { id: 'sa', role: 'superadmin', tenant_uuid: null, tenant_id: null };
    const res = await request(buildApp(superadmin)).get('/api/billing/account');
    assert.equal(res.status, 400);
    assert.match(res.body.message, /tenant_id is required/);
  });
});

/**
 * POST /api/billing/checkout-session — planResolver wiring (PR #523)
 *
 * Verifies that the checkout-session route now uses planResolver.buildStripeLineItems
 * and passes trial_period_days to the Stripe adapter. Uses a stubbed stripeAdapter
 * injected via opts.stripeAdapter to avoid hitting real Stripe.
 */
describe('POST /api/billing/checkout-session — planResolver wiring', () => {
  const PLAN_WITH_SEATS = {
    id: 'p_growth',
    code: 'growth_monthly',
    name: 'Growth',
    amount_cents: 29700,
    currency: 'usd',
    billing_interval: 'month',
    is_active: true,
    provider_product_id: 'prod_growth',
    provider_price_id_base: 'price_growth_base',
    provider_price_id_seat: 'price_growth_seat',
    included_seats: 5,
    seat_unit_amount_cents: 4900,
    trial_days: 14,
  };
  const PLAN_NO_SEATS = {
    id: 'p_solo',
    code: 'solo_monthly',
    name: 'Solo',
    amount_cents: 4900,
    currency: 'usd',
    billing_interval: 'month',
    is_active: true,
    provider_product_id: 'prod_solo',
    provider_price_id_base: 'price_solo_base',
    provider_price_id_seat: null,
    included_seats: 1,
    seat_unit_amount_cents: null,
    trial_days: 0,
  };
  const PLAN_MISCONFIGURED = {
    id: 'p_broken',
    code: 'broken_monthly',
    name: 'Broken',
    amount_cents: 9900,
    currency: 'usd',
    billing_interval: 'month',
    is_active: true,
    // No provider_price_id_base -- triggers CONFIGURATION_ERROR in
    // planResolver.buildStripeLineItems
    provider_product_id: null,
    provider_price_id_base: null,
    provider_price_id_seat: null,
    included_seats: 3,
    seat_unit_amount_cents: null,
    trial_days: 0,
  };

  // Tracks the arguments passed to the stubbed Stripe adapter so we can
  // assert we called it with the right shape. Reset per-test in beforeEach.
  let createCheckoutSessionCalls;
  let stripeAdapterStub;

  beforeEach(() => {
    createCheckoutSessionCalls = [];
    stripeAdapterStub = {
      createCustomer: async ({ metadata }) => ({ id: `cus_${metadata?.tenant_id || 'x'}` }),
      createCheckoutSession: async (args) => {
        createCheckoutSessionCalls.push(args);
        return { id: 'cs_stub', url: 'https://stripe.test/checkout/cs_stub' };
      },
      createPortalSession: async () => ({ url: 'https://stripe.test/portal' }),
      verifyWebhookSignature: () => ({ event: {} }),
      normalizePaymentEvent: () => null,
    };

    mockClient = createBillingMock({
      tenant: [{ id: TENANT, name: 'Acme', billing_state: 'active' }],
      billing_plans: [PLAN_WITH_SEATS, PLAN_NO_SEATS, PLAN_MISCONFIGURED],
      billing_accounts: [],
      tenant_subscriptions: [],
      invoices: [],
      invoice_line_items: [],
      billing_events: [],
    });

    // Platform billing config must be "configured" so the route gets past the
    // 503 guard. Easiest: set the env vars the config module reads.
    process.env.STRIPE_PLATFORM_SECRET_KEY = 'sk_test_stub';
    process.env.STRIPE_PLATFORM_WEBHOOK_SECRET = 'whsec_stub';
  });

  function buildAppWithAdapter(user) {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = user;
      next();
    });
    app.use(
      '/api/billing',
      createBillingRoutes(null, {
        getSupabaseClient: () => mockClient,
        stripeAdapter: stripeAdapterStub,
      }),
    );
    return app;
  }

  it('builds Stripe line_items from plan price IDs (no extra seats)', async () => {
    const user = { id: 'u1', role: 'admin', tenant_uuid: TENANT, tenant_id: TENANT };
    const res = await request(buildAppWithAdapter(user))
      .post('/api/billing/checkout-session')
      .query({ tenant_id: TENANT })
      .send({
        tenant_id: TENANT,
        plan_code: 'growth_monthly',
        success_url: 'https://app.test/success',
        cancel_url: 'https://app.test/cancel',
      });

    assert.equal(res.status, 200, `expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.status, 'success');
    assert.equal(res.body.data.url, 'https://stripe.test/checkout/cs_stub');

    // Exactly one createCheckoutSession call, shape A
    assert.equal(createCheckoutSessionCalls.length, 1);
    const call = createCheckoutSessionCalls[0];
    assert.equal(call.mode, 'subscription');
    assert.equal(call.trial_period_days, 14);
    assert.deepEqual(call.line_items, [{ price: 'price_growth_base', quantity: 1 }]);
    assert.equal(call.metadata.plan_code, 'growth_monthly');
    assert.equal(call.metadata.seats, '0');
  });

  it('adds a seat line item when seats > included_seats', async () => {
    const user = { id: 'u1', role: 'admin', tenant_uuid: TENANT, tenant_id: TENANT };
    const res = await request(buildAppWithAdapter(user))
      .post('/api/billing/checkout-session')
      .query({ tenant_id: TENANT })
      .send({
        tenant_id: TENANT,
        plan_code: 'growth_monthly',
        seats: 8, // 3 extra beyond included_seats=5
        success_url: 'https://app.test/success',
        cancel_url: 'https://app.test/cancel',
      });

    assert.equal(res.status, 200);
    assert.equal(createCheckoutSessionCalls.length, 1);
    const call = createCheckoutSessionCalls[0];
    assert.deepEqual(call.line_items, [
      { price: 'price_growth_base', quantity: 1 },
      { price: 'price_growth_seat', quantity: 3 },
    ]);
    assert.equal(call.metadata.seats, '8');
  });

  it('omits seat line item when requested seats <= included_seats', async () => {
    const user = { id: 'u1', role: 'admin', tenant_uuid: TENANT, tenant_id: TENANT };
    const res = await request(buildAppWithAdapter(user))
      .post('/api/billing/checkout-session')
      .query({ tenant_id: TENANT })
      .send({
        tenant_id: TENANT,
        plan_code: 'growth_monthly',
        seats: 3, // less than included_seats=5
        success_url: 'https://app.test/success',
        cancel_url: 'https://app.test/cancel',
      });

    assert.equal(res.status, 200);
    const call = createCheckoutSessionCalls[0];
    assert.equal(call.line_items.length, 1);
    assert.equal(call.line_items[0].price, 'price_growth_base');
  });

  it('omits trial_period_days when plan.trial_days is 0 (still valid)', async () => {
    const user = { id: 'u1', role: 'admin', tenant_uuid: TENANT, tenant_id: TENANT };
    const res = await request(buildAppWithAdapter(user))
      .post('/api/billing/checkout-session')
      .query({ tenant_id: TENANT })
      .send({
        tenant_id: TENANT,
        plan_code: 'solo_monthly',
        success_url: 'https://app.test/success',
        cancel_url: 'https://app.test/cancel',
      });

    assert.equal(res.status, 200);
    const call = createCheckoutSessionCalls[0];
    assert.equal(call.trial_period_days, 0);
    // Solo plan has no seat price id -- line_items should contain only base
    assert.deepEqual(call.line_items, [{ price: 'price_solo_base', quantity: 1 }]);
  });

  it('returns 400 when seats is not a non-negative integer', async () => {
    const user = { id: 'u1', role: 'admin', tenant_uuid: TENANT, tenant_id: TENANT };
    for (const bad of [-1, 1.5, 'three', {}]) {
      const res = await request(buildAppWithAdapter(user))
        .post('/api/billing/checkout-session')
        .query({ tenant_id: TENANT })
        .send({
          tenant_id: TENANT,
          plan_code: 'growth_monthly',
          seats: bad,
          success_url: 'https://app.test/success',
          cancel_url: 'https://app.test/cancel',
        });
      assert.equal(res.status, 400, `seats=${JSON.stringify(bad)} must return 400`);
      assert.match(res.body.message, /seats must be a non-negative integer/);
    }
    // Stripe adapter should NEVER be called when validation fails
    assert.equal(createCheckoutSessionCalls.length, 0);
  });

  it('returns 500 CONFIGURATION_ERROR when plan is missing provider_price_id_base', async () => {
    const user = { id: 'u1', role: 'admin', tenant_uuid: TENANT, tenant_id: TENANT };
    const res = await request(buildAppWithAdapter(user))
      .post('/api/billing/checkout-session')
      .query({ tenant_id: TENANT })
      .send({
        tenant_id: TENANT,
        plan_code: 'broken_monthly',
        success_url: 'https://app.test/success',
        cancel_url: 'https://app.test/cancel',
      });

    assert.equal(res.status, 500);
    assert.equal(res.body.status, 'error');
    assert.equal(res.body.code, 'CONFIGURATION_ERROR');
    assert.match(res.body.message, /provider_price_id_base/);
    // Stripe adapter never called -- we failed before reaching it
    assert.equal(createCheckoutSessionCalls.length, 0);
  });

  it('returns 404 when plan_code is not found or inactive', async () => {
    const user = { id: 'u1', role: 'admin', tenant_uuid: TENANT, tenant_id: TENANT };
    const res = await request(buildAppWithAdapter(user))
      .post('/api/billing/checkout-session')
      .query({ tenant_id: TENANT })
      .send({
        tenant_id: TENANT,
        plan_code: 'does_not_exist',
        success_url: 'https://app.test/success',
        cancel_url: 'https://app.test/cancel',
      });

    assert.equal(res.status, 404);
    assert.match(res.body.message, /Plan not found/);
    assert.equal(createCheckoutSessionCalls.length, 0);
  });
});
