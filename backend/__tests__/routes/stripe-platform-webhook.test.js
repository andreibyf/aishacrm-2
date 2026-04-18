/**
 * Integration tests for backend/routes/stripe-platform-webhook.js
 *
 * Uses createStripePlatformWebhookRouter({ getSupabaseClient, stripeAdapter })
 * to inject mocks. No module mutation — clean DI.
 */

import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { createBillingMock } from '../billing/_billingMock.js';

process.env.NODE_ENV = 'test';

let createStripePlatformWebhookRouter;
before(async () => {
  ({ createStripePlatformWebhookRouter } = await import('../../routes/stripe-platform-webhook.js'));
});

const TENANT = '33333333-3333-3333-3333-333333333333';

let mockClient;
let stubbedEvent;
let stubbedNormalized;
let shouldFailVerification = false;

const stripeAdapterStub = {
  verifyWebhookSignature: ({ signature }) => {
    if (shouldFailVerification) throw new Error('Invalid signature: test');
    if (!signature) throw new Error('verifyWebhookSignature: signature required');
    return { event: stubbedEvent };
  },
  normalizePaymentEvent: () => stubbedNormalized,
  // Interface completeness (unused in webhook handler)
  createCustomer: async () => ({ id: 'cus_stub' }),
  createCheckoutSession: async () => ({ id: 'cs_stub', url: 'https://stub' }),
  createPortalSession: async () => ({ url: 'https://stub' }),
};

function buildApp() {
  const app = express();
  const router = createStripePlatformWebhookRouter({
    getSupabaseClient: () => mockClient,
    stripeAdapter: stripeAdapterStub,
  });
  app.use('/api/webhooks', router);
  return app;
}

beforeEach(() => {
  process.env.STRIPE_PLATFORM_SECRET_KEY = 'sk_test_placeholder';
  process.env.STRIPE_PLATFORM_WEBHOOK_SECRET = 'whsec_placeholder';
  shouldFailVerification = false;
  stubbedEvent = null;
  stubbedNormalized = null;
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
    ],
    billing_accounts: [],
    tenant_subscriptions: [],
    invoices: [],
    invoice_line_items: [],
    payments: [],
    billing_events: [],
  });
});

describe('Signature verification', () => {
  it('returns 400 on invalid signature', async () => {
    shouldFailVerification = true;
    const res = await request(buildApp())
      .post('/api/webhooks/stripe-platform')
      .set('stripe-signature', 'bad_sig')
      .set('content-type', 'application/json')
      .send(Buffer.from('{}'));
    assert.equal(res.status, 400);
  });

  it('returns 400 when signature header missing', async () => {
    const res = await request(buildApp())
      .post('/api/webhooks/stripe-platform')
      .set('content-type', 'application/json')
      .send(Buffer.from('{}'));
    assert.equal(res.status, 400);
  });

  it('returns 503 when platform billing not configured', async () => {
    delete process.env.STRIPE_PLATFORM_SECRET_KEY;
    const res = await request(buildApp())
      .post('/api/webhooks/stripe-platform')
      .set('stripe-signature', 'sig')
      .set('content-type', 'application/json')
      .send(Buffer.from('{}'));
    assert.equal(res.status, 503);
  });
});

describe('checkout.session.completed', () => {
  beforeEach(() => {
    // Pre-create invoice and empty subscription — simulates tenant-initiated checkout
    mockClient.db.invoices.push({
      id: 'inv_1',
      tenant_id: TENANT,
      status: 'open',
      total_cents: 4900,
      amount_paid_cents: 0,
      balance_due_cents: 4900,
      currency: 'usd',
      created_at: '2026-01-01',
    });
  });

  it('records payment + assigns plan when plan_code in metadata', async () => {
    stubbedEvent = {
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_1',
          payment_intent: 'pi_1',
          amount_total: 4900,
          metadata: { tenant_id: TENANT, plan_code: 'starter_monthly' },
        },
      },
    };
    stubbedNormalized = { tenant_id: TENANT, type: 'checkout.session.completed' };

    const res = await request(buildApp())
      .post('/api/webhooks/stripe-platform')
      .set('stripe-signature', 'good_sig')
      .set('content-type', 'application/json')
      .send(Buffer.from(JSON.stringify(stubbedEvent)));

    assert.equal(res.status, 200);
    assert.equal(mockClient.db.payments.length, 1);
    assert.equal(mockClient.db.payments[0].provider_payment_intent_id, 'pi_1');
    assert.equal(mockClient.db.tenant_subscriptions.length, 1);
    assert.equal(mockClient.db.tenant_subscriptions[0].status, 'active');
  });

  it('is idempotent on retry (same payment_intent)', async () => {
    stubbedEvent = {
      id: 'evt_2',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_2',
          payment_intent: 'pi_idempotent',
          amount_total: 4900,
          metadata: { tenant_id: TENANT },
        },
      },
    };
    stubbedNormalized = { tenant_id: TENANT, type: 'checkout.session.completed' };

    await request(buildApp())
      .post('/api/webhooks/stripe-platform')
      .set('stripe-signature', 'sig')
      .set('content-type', 'application/json')
      .send(Buffer.from(JSON.stringify(stubbedEvent)));

    await request(buildApp())
      .post('/api/webhooks/stripe-platform')
      .set('stripe-signature', 'sig')
      .set('content-type', 'application/json')
      .send(Buffer.from(JSON.stringify(stubbedEvent)));

    assert.equal(mockClient.db.payments.length, 1, 'retry must not duplicate payment');
  });

  it('skips plan assignment when tenant already has active subscription', async () => {
    mockClient.db.tenant_subscriptions.push({
      id: 's_existing',
      tenant_id: TENANT,
      billing_plan_id: 'p1',
      status: 'active',
      created_at: '2026-01-01',
    });
    stubbedEvent = {
      id: 'evt_3',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_3',
          payment_intent: 'pi_3',
          amount_total: 4900,
          metadata: { tenant_id: TENANT, plan_code: 'starter_monthly' },
        },
      },
    };
    stubbedNormalized = { tenant_id: TENANT, type: 'checkout.session.completed' };

    const res = await request(buildApp())
      .post('/api/webhooks/stripe-platform')
      .set('stripe-signature', 'sig')
      .set('content-type', 'application/json')
      .send(Buffer.from(JSON.stringify(stubbedEvent)));

    assert.equal(res.status, 200);
    assert.equal(mockClient.db.tenant_subscriptions.length, 1, 'must not assign second plan');
  });

  it('handles missing tenant_id gracefully (logs but does not error)', async () => {
    stubbedEvent = {
      id: 'evt_4',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_4', metadata: {} } },
    };
    stubbedNormalized = { tenant_id: null, type: 'checkout.session.completed' };

    const res = await request(buildApp())
      .post('/api/webhooks/stripe-platform')
      .set('stripe-signature', 'sig')
      .set('content-type', 'application/json')
      .send(Buffer.from(JSON.stringify(stubbedEvent)));

    assert.equal(res.status, 200);
    assert.equal(mockClient.db.payments.length, 0);
  });
});

describe('payment_intent.succeeded', () => {
  it('records payment against most recent open invoice', async () => {
    mockClient.db.invoices.push({
      id: 'inv_x',
      tenant_id: TENANT,
      status: 'open',
      total_cents: 14900,
      amount_paid_cents: 0,
      balance_due_cents: 14900,
      currency: 'usd',
      created_at: '2026-02-01',
    });
    stubbedEvent = {
      id: 'evt_5',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_renewal',
          amount: 14900,
          latest_charge: 'ch_1',
          metadata: { tenant_id: TENANT },
        },
      },
    };
    stubbedNormalized = { tenant_id: TENANT, type: 'payment_intent.succeeded' };

    const res = await request(buildApp())
      .post('/api/webhooks/stripe-platform')
      .set('stripe-signature', 'sig')
      .set('content-type', 'application/json')
      .send(Buffer.from(JSON.stringify(stubbedEvent)));

    assert.equal(res.status, 200);
    assert.equal(mockClient.db.payments.length, 1);
    assert.equal(mockClient.db.payments[0].invoice_id, 'inv_x');
  });
});

describe('payment_intent.payment_failed', () => {
  it('emits PAYMENT_FAILED event', async () => {
    stubbedEvent = {
      id: 'evt_6',
      type: 'payment_intent.payment_failed',
      data: {
        object: {
          id: 'pi_fail',
          amount: 4900,
          metadata: { tenant_id: TENANT },
          last_payment_error: { code: 'card_declined', message: 'Declined' },
        },
      },
    };
    stubbedNormalized = { tenant_id: TENANT, type: 'payment_intent.payment_failed' };

    const res = await request(buildApp())
      .post('/api/webhooks/stripe-platform')
      .set('stripe-signature', 'sig')
      .set('content-type', 'application/json')
      .send(Buffer.from(JSON.stringify(stubbedEvent)));

    assert.equal(res.status, 200);
    const failEvent = mockClient.db.billing_events.find((e) => e.event_type === 'payment.failed');
    assert.ok(failEvent, 'payment.failed event must be logged');
    assert.equal(failEvent.payload_json.failure_code, 'card_declined');
  });
});

describe('Domain separation from Cal.com webhook', () => {
  it('only handles platform events — Cal.com session purchases unaffected', async () => {
    // Simulate a Cal.com style metadata (package_id instead of plan_code)
    stubbedEvent = {
      id: 'evt_calcom',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_calcom',
          payment_intent: 'pi_calcom',
          amount_total: 5000,
          metadata: { tenant_id: TENANT, package_id: 'pkg_1' }, // no plan_code
        },
      },
    };
    stubbedNormalized = { tenant_id: TENANT, type: 'checkout.session.completed' };

    const res = await request(buildApp())
      .post('/api/webhooks/stripe-platform')
      .set('stripe-signature', 'sig')
      .set('content-type', 'application/json')
      .send(Buffer.from(JSON.stringify(stubbedEvent)));

    assert.equal(res.status, 200);
    // No plan assigned since plan_code missing
    assert.equal(mockClient.db.tenant_subscriptions.length, 0);
    // No session credits tables touched by this handler
    assert.equal(mockClient.db.session_credits, undefined);
  });
});

describe('customer.subscription.updated', () => {
  beforeEach(() => {
    mockClient.db.tenant_subscriptions.push({
      id: 'sub_local_1',
      tenant_id: TENANT,
      billing_plan_id: 'p1',
      status: 'active',
      provider_subscription_id: 'sub_stripe_1',
      created_at: '2026-01-01',
    });
  });

  it('syncs active → past_due when Stripe status flips', async () => {
    stubbedEvent = {
      id: 'evt_sub_upd_1',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_stripe_1',
          status: 'past_due',
          cancel_at_period_end: false,
        },
      },
    };
    stubbedNormalized = { tenant_id: TENANT, type: 'customer.subscription.updated' };

    const res = await request(buildApp())
      .post('/api/webhooks/stripe-platform')
      .set('stripe-signature', 'sig')
      .set('content-type', 'application/json')
      .send(Buffer.from(JSON.stringify(stubbedEvent)));

    assert.equal(res.status, 200);
    const local = mockClient.db.tenant_subscriptions.find((s) => s.id === 'sub_local_1');
    assert.equal(local.status, 'past_due');
    const evt = mockClient.db.billing_events.find(
      (e) => e.payload_json?.provider_subscription_id === 'sub_stripe_1',
    );
    assert.ok(evt, 'billing_event must be logged');
  });

  it('syncs unpaid → suspended', async () => {
    stubbedEvent = {
      id: 'evt_sub_upd_2',
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_stripe_1', status: 'unpaid', cancel_at_period_end: false } },
    };
    stubbedNormalized = { tenant_id: TENANT, type: 'customer.subscription.updated' };

    await request(buildApp())
      .post('/api/webhooks/stripe-platform')
      .set('stripe-signature', 'sig')
      .set('content-type', 'application/json')
      .send(Buffer.from(JSON.stringify(stubbedEvent)));

    const local = mockClient.db.tenant_subscriptions.find((s) => s.id === 'sub_local_1');
    assert.equal(local.status, 'suspended');
  });

  it('syncs canceled with canceled_at timestamp', async () => {
    stubbedEvent = {
      id: 'evt_sub_upd_3',
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_stripe_1', status: 'canceled', cancel_at_period_end: false } },
    };
    stubbedNormalized = { tenant_id: TENANT, type: 'customer.subscription.updated' };

    await request(buildApp())
      .post('/api/webhooks/stripe-platform')
      .set('stripe-signature', 'sig')
      .set('content-type', 'application/json')
      .send(Buffer.from(JSON.stringify(stubbedEvent)));

    const local = mockClient.db.tenant_subscriptions.find((s) => s.id === 'sub_local_1');
    assert.equal(local.status, 'canceled');
    assert.ok(local.canceled_at);
  });

  it('is a no-op when status unchanged and no cancel_at_period_end', async () => {
    const eventsBefore = mockClient.db.billing_events.length;
    stubbedEvent = {
      id: 'evt_sub_upd_4',
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_stripe_1', status: 'active', cancel_at_period_end: false } },
    };
    stubbedNormalized = { tenant_id: TENANT, type: 'customer.subscription.updated' };

    const res = await request(buildApp())
      .post('/api/webhooks/stripe-platform')
      .set('stripe-signature', 'sig')
      .set('content-type', 'application/json')
      .send(Buffer.from(JSON.stringify(stubbedEvent)));

    assert.equal(res.status, 200);
    assert.equal(mockClient.db.billing_events.length, eventsBefore, 'no new event emitted');
  });

  it('handles unknown provider_subscription_id gracefully', async () => {
    stubbedEvent = {
      id: 'evt_sub_upd_5',
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_stripe_UNKNOWN', status: 'canceled' } },
    };
    stubbedNormalized = { tenant_id: null, type: 'customer.subscription.updated' };

    const res = await request(buildApp())
      .post('/api/webhooks/stripe-platform')
      .set('stripe-signature', 'sig')
      .set('content-type', 'application/json')
      .send(Buffer.from(JSON.stringify(stubbedEvent)));

    assert.equal(res.status, 200);
    // Original row untouched
    assert.equal(mockClient.db.tenant_subscriptions[0].status, 'active');
  });
});

describe('customer.subscription.deleted', () => {
  beforeEach(() => {
    mockClient.db.tenant_subscriptions.push({
      id: 'sub_local_2',
      tenant_id: TENANT,
      billing_plan_id: 'p1',
      status: 'active',
      provider_subscription_id: 'sub_stripe_2',
      created_at: '2026-01-01',
    });
  });

  it('cancels local subscription and emits SUBSCRIPTION_CANCELED', async () => {
    stubbedEvent = {
      id: 'evt_sub_del_1',
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_stripe_2' } },
    };
    stubbedNormalized = { tenant_id: TENANT, type: 'customer.subscription.deleted' };

    const res = await request(buildApp())
      .post('/api/webhooks/stripe-platform')
      .set('stripe-signature', 'sig')
      .set('content-type', 'application/json')
      .send(Buffer.from(JSON.stringify(stubbedEvent)));

    assert.equal(res.status, 200);
    const local = mockClient.db.tenant_subscriptions.find((s) => s.id === 'sub_local_2');
    assert.equal(local.status, 'canceled');
    assert.ok(local.canceled_at);
    const evt = mockClient.db.billing_events.find(
      (e) =>
        e.event_type === 'subscription.canceled' &&
        e.payload_json?.reason === 'stripe_subscription_deleted',
    );
    assert.ok(evt, 'SUBSCRIPTION_CANCELED event with reason must be logged');
  });

  it('is idempotent on retry (already-canceled local)', async () => {
    mockClient.db.tenant_subscriptions[0].status = 'canceled';
    const eventsBefore = mockClient.db.billing_events.length;
    stubbedEvent = {
      id: 'evt_sub_del_2',
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_stripe_2' } },
    };
    stubbedNormalized = { tenant_id: TENANT, type: 'customer.subscription.deleted' };

    const res = await request(buildApp())
      .post('/api/webhooks/stripe-platform')
      .set('stripe-signature', 'sig')
      .set('content-type', 'application/json')
      .send(Buffer.from(JSON.stringify(stubbedEvent)));

    assert.equal(res.status, 200);
    assert.equal(
      mockClient.db.billing_events.length,
      eventsBefore,
      'no new event emitted on idempotent delete',
    );
  });

  it('handles unknown provider_subscription_id gracefully', async () => {
    stubbedEvent = {
      id: 'evt_sub_del_3',
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_stripe_UNKNOWN' } },
    };
    stubbedNormalized = { tenant_id: null, type: 'customer.subscription.deleted' };

    const res = await request(buildApp())
      .post('/api/webhooks/stripe-platform')
      .set('stripe-signature', 'sig')
      .set('content-type', 'application/json')
      .send(Buffer.from(JSON.stringify(stubbedEvent)));

    assert.equal(res.status, 200);
    assert.equal(mockClient.db.tenant_subscriptions[0].status, 'active');
  });
});

describe('Webhook preflight: missing webhook secret (PR #517 issue 7)', () => {
  it('returns 503 when STRIPE_PLATFORM_WEBHOOK_SECRET is missing (not 400)', async () => {
    process.env.STRIPE_PLATFORM_SECRET_KEY = 'sk_test_placeholder';
    delete process.env.STRIPE_PLATFORM_WEBHOOK_SECRET;
    // Previously: verifyWebhookSignature would throw on missing secret and
    // the catch mapped it to 400 "Invalid signature" — misleading operators.
    // Fixed: explicit preflight returns 503 misconfiguration.
    const res = await request(buildApp())
      .post('/api/webhooks/stripe-platform')
      .set('stripe-signature', 'sig')
      .set('content-type', 'application/json')
      .send(Buffer.from('{}'));
    assert.equal(res.status, 503);
    assert.match(res.body.error, /webhook secret not configured/i);
  });
});

describe('checkout.session.completed assignPlan error propagation (PR #517 issue 3)', () => {
  it('re-throws non-race assignPlan errors -> 500 so Stripe retries', async () => {
    // Set up: NO matching plan so assignPlan will throw an INACTIVE_PLAN
    // BillingError (message: plan "ghost_plan" not found or inactive).
    // Previously the catch swallowed this as "race" and returned 200.
    stubbedEvent = {
      id: 'evt_ck_err_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_err',
          metadata: { tenant_id: TENANT, plan_code: 'ghost_plan' },
          subscription: 'sub_x',
          payment_intent: null,
          amount_total: 0,
        },
      },
    };
    stubbedNormalized = { tenant_id: TENANT, type: 'checkout.session.completed' };

    const res = await request(buildApp())
      .post('/api/webhooks/stripe-platform')
      .set('stripe-signature', 'sig')
      .set('content-type', 'application/json')
      .send(Buffer.from(JSON.stringify(stubbedEvent)));

    assert.equal(res.status, 500);
    assert.match(res.body.error, /not found or inactive/);
    // No subscription should have been silently "recorded"
    assert.equal(mockClient.db.tenant_subscriptions.length, 0);
  });

  it('swallows race error when tenant already has an active subscription', async () => {
    // Seed an existing active subscription for the tenant
    mockClient.db.tenant_subscriptions.push({
      id: 'sub_existing',
      tenant_id: TENANT,
      billing_plan_id: 'p1',
      status: 'active',
      provider_subscription_id: null,
      created_at: '2026-01-01',
    });
    // Seed an open invoice so the payment recording path has something to attach to
    mockClient.db.invoices.push({
      id: 'inv_race',
      tenant_id: TENANT,
      status: 'open',
      total_cents: 4900,
      amount_paid_cents: 0,
      balance_due_cents: 4900,
      currency: 'usd',
      created_at: '2026-01-01',
    });

    stubbedEvent = {
      id: 'evt_ck_race_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_race',
          metadata: { tenant_id: TENANT, plan_code: 'starter_monthly' },
          subscription: 'sub_new',
          payment_intent: 'pi_race',
          amount_total: 4900,
        },
      },
    };
    stubbedNormalized = { tenant_id: TENANT, type: 'checkout.session.completed' };

    // The webhook checks existingActive first, so it won't even call
    // assignPlan. This test confirms the happy "already has subscription"
    // path still returns 200 and records payment.
    const res = await request(buildApp())
      .post('/api/webhooks/stripe-platform')
      .set('stripe-signature', 'sig')
      .set('content-type', 'application/json')
      .send(Buffer.from(JSON.stringify(stubbedEvent)));

    assert.equal(res.status, 200);
    const payment = mockClient.db.payments.find((p) => p.provider_payment_intent_id === 'pi_race');
    assert.ok(payment, 'payment must be recorded despite existing subscription');
  });
});

describe('customer.subscription.updated event type (PR #517 issue 5)', () => {
  beforeEach(() => {
    mockClient.db.tenant_subscriptions.push({
      id: 'sub_evt_1',
      tenant_id: TENANT,
      billing_plan_id: 'p1',
      status: 'active',
      provider_subscription_id: 'sub_stripe_evt_1',
      created_at: '2026-01-01',
    });
  });

  it('emits SUBSCRIPTION_STATUS_CHANGED (not RENEWED) on active -> past_due', async () => {
    stubbedEvent = {
      id: 'evt_status_1',
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_stripe_evt_1', status: 'past_due', cancel_at_period_end: false } },
    };
    stubbedNormalized = { tenant_id: TENANT, type: 'customer.subscription.updated' };

    await request(buildApp())
      .post('/api/webhooks/stripe-platform')
      .set('stripe-signature', 'sig')
      .set('content-type', 'application/json')
      .send(Buffer.from(JSON.stringify(stubbedEvent)));

    const evt = mockClient.db.billing_events.find(
      (e) => e.payload_json?.provider_subscription_id === 'sub_stripe_evt_1',
    );
    assert.ok(evt);
    assert.equal(evt.event_type, 'subscription.status_changed');
    assert.notEqual(evt.event_type, 'subscription.renewed');
  });

  it('emits SUBSCRIPTION_STATUS_CHANGED on active -> suspended (unpaid)', async () => {
    stubbedEvent = {
      id: 'evt_status_2',
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_stripe_evt_1', status: 'unpaid', cancel_at_period_end: false } },
    };
    stubbedNormalized = { tenant_id: TENANT, type: 'customer.subscription.updated' };

    await request(buildApp())
      .post('/api/webhooks/stripe-platform')
      .set('stripe-signature', 'sig')
      .set('content-type', 'application/json')
      .send(Buffer.from(JSON.stringify(stubbedEvent)));

    const evt = mockClient.db.billing_events.find(
      (e) => e.payload_json?.provider_subscription_id === 'sub_stripe_evt_1',
    );
    assert.equal(evt.event_type, 'subscription.status_changed');
  });

  it('emits SUBSCRIPTION_RENEWED on past_due -> active (recovery)', async () => {
    // Seed local row as past_due first
    mockClient.db.tenant_subscriptions[mockClient.db.tenant_subscriptions.length - 1].status =
      'past_due';

    stubbedEvent = {
      id: 'evt_status_3',
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_stripe_evt_1', status: 'active', cancel_at_period_end: false } },
    };
    stubbedNormalized = { tenant_id: TENANT, type: 'customer.subscription.updated' };

    await request(buildApp())
      .post('/api/webhooks/stripe-platform')
      .set('stripe-signature', 'sig')
      .set('content-type', 'application/json')
      .send(Buffer.from(JSON.stringify(stubbedEvent)));

    const evt = mockClient.db.billing_events.find(
      (e) => e.payload_json?.provider_subscription_id === 'sub_stripe_evt_1',
    );
    assert.equal(evt.event_type, 'subscription.renewed');
  });

  it('emits SUBSCRIPTION_CANCELED on any -> canceled', async () => {
    stubbedEvent = {
      id: 'evt_status_4',
      type: 'customer.subscription.updated',
      data: { object: { id: 'sub_stripe_evt_1', status: 'canceled', cancel_at_period_end: false } },
    };
    stubbedNormalized = { tenant_id: TENANT, type: 'customer.subscription.updated' };

    await request(buildApp())
      .post('/api/webhooks/stripe-platform')
      .set('stripe-signature', 'sig')
      .set('content-type', 'application/json')
      .send(Buffer.from(JSON.stringify(stubbedEvent)));

    const evt = mockClient.db.billing_events.find(
      (e) => e.payload_json?.provider_subscription_id === 'sub_stripe_evt_1',
    );
    assert.equal(evt.event_type, 'subscription.canceled');
  });
});

describe('pickSubscriptionUpdateEventType helper (unit, PR #517 issue 5)', () => {
  let pickFn;
  before(async () => {
    ({ pickSubscriptionUpdateEventType: pickFn } = await import(
      '../../routes/stripe-platform-webhook.js'
    ));
  });

  it('canceled always wins', () => {
    assert.equal(pickFn({ previous: 'active', next: 'canceled' }), 'subscription.canceled');
    assert.equal(pickFn({ previous: 'past_due', next: 'canceled' }), 'subscription.canceled');
    assert.equal(pickFn({ previous: 'suspended', next: 'canceled' }), 'subscription.canceled');
  });

  it('non-active -> active = renewed', () => {
    assert.equal(pickFn({ previous: 'past_due', next: 'active' }), 'subscription.renewed');
    assert.equal(pickFn({ previous: 'suspended', next: 'active' }), 'subscription.renewed');
    assert.equal(pickFn({ previous: 'draft', next: 'active' }), 'subscription.renewed');
  });

  it('active -> active is status_changed (same-state update, e.g. cancel_at_period_end flip)', () => {
    assert.equal(pickFn({ previous: 'active', next: 'active' }), 'subscription.status_changed');
  });

  it('active -> past_due / suspended = status_changed', () => {
    assert.equal(pickFn({ previous: 'active', next: 'past_due' }), 'subscription.status_changed');
    assert.equal(pickFn({ previous: 'active', next: 'suspended' }), 'subscription.status_changed');
  });

  it('past_due -> suspended = status_changed', () => {
    assert.equal(
      pickFn({ previous: 'past_due', next: 'suspended' }),
      'subscription.status_changed',
    );
  });
});
