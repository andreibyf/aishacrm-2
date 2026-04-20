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
    ({ pickSubscriptionUpdateEventType: pickFn } =
      await import('../../routes/stripe-platform-webhook.js'));
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

/**
 * customer.subscription.updated — PR #523 plan mapping
 *
 * Tests the planResolver wiring in handleSubscriptionUpdated that closes
 * the Phase 2 TODO: when a Stripe subscription's current Price ID changes
 * (e.g. via Customer Portal upgrade/downgrade), the local billing_plan_id
 * is updated to match and a PLAN_CHANGED event is emitted. Ambiguous or
 * unresolvable price IDs must NOT abort the webhook -- status sync runs
 * regardless.
 */
describe('customer.subscription.updated — plan mapping (PR #523)', () => {
  beforeEach(() => {
    // Seed billing_plans with realistic provider_price_id_base values so
    // the resolver can find them. Mirrors the structure migration 155
    // established in production.
    mockClient.db.billing_plans = [
      {
        id: 'p_starter',
        code: 'starter_monthly',
        name: 'Starter',
        amount_cents: 19900,
        currency: 'usd',
        billing_interval: 'month',
        is_active: true,
        provider_product_id: 'prod_starter',
        provider_price_id_base: 'price_starter_base',
        provider_price_id_seat: 'price_starter_seat',
        included_seats: 3,
        seat_unit_amount_cents: 4900,
        trial_days: 14,
      },
      {
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
      },
    ];
    // Seed the local subscription currently on Starter
    mockClient.db.tenant_subscriptions.push({
      id: 'sub_local_plan',
      tenant_id: TENANT,
      billing_plan_id: 'p_starter',
      status: 'active',
      provider_subscription_id: 'sub_stripe_plan',
      created_at: '2026-01-01',
    });
  });

  it('updates billing_plan_id and emits PLAN_CHANGED when portal changes the plan', async () => {
    stubbedEvent = {
      id: 'evt_plan_1',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_stripe_plan',
          status: 'active',
          cancel_at_period_end: false,
          items: {
            data: [{ price: { id: 'price_growth_base' } }],
          },
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
    // Local subscription row now points at the Growth plan
    const local = mockClient.db.tenant_subscriptions.find((s) => s.id === 'sub_local_plan');
    assert.equal(local.billing_plan_id, 'p_growth');
    // A dedicated plan.changed event was emitted (in addition to the
    // status event -- handler still fires status event even though status
    // didn't change, because plan did)
    const planChangedEvt = mockClient.db.billing_events.find(
      (e) => e.event_type === 'plan.changed',
    );
    assert.ok(planChangedEvt, 'plan.changed event must be logged');
    assert.equal(planChangedEvt.payload_json.new_plan_id, 'p_growth');
    assert.equal(planChangedEvt.payload_json.new_plan_code, 'growth_monthly');
    assert.equal(planChangedEvt.payload_json.previous_plan_id, 'p_starter');
    assert.equal(planChangedEvt.payload_json.stripe_price_id, 'price_growth_base');
  });

  it('does not change billing_plan_id when primary price is a SEAT (role!=base)', async () => {
    // Stripe may list seat price first in items.data depending on creation
    // order; a seat-role match must NOT promote nextPlanId because seat
    // prices are reusable across plans.
    stubbedEvent = {
      id: 'evt_plan_seat_role',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_stripe_plan',
          status: 'active',
          cancel_at_period_end: false,
          items: {
            // Starter's own seat price first -- matches role=seat, not base
            data: [{ price: { id: 'price_starter_seat' } }],
          },
        },
      },
    };
    stubbedNormalized = { tenant_id: TENANT, type: 'customer.subscription.updated' };

    await request(buildApp())
      .post('/api/webhooks/stripe-platform')
      .set('stripe-signature', 'sig')
      .set('content-type', 'application/json')
      .send(Buffer.from(JSON.stringify(stubbedEvent)));

    const local = mockClient.db.tenant_subscriptions.find((s) => s.id === 'sub_local_plan');
    assert.equal(local.billing_plan_id, 'p_starter', 'seat-role match must not change plan');
    assert.equal(
      mockClient.db.billing_events.filter((e) => e.event_type === 'plan.changed').length,
      0,
      'plan.changed event must NOT be emitted for seat-role matches',
    );
  });

  it('tolerates missing items.data[] (no plan mapping, status sync still runs)', async () => {
    stubbedEvent = {
      id: 'evt_plan_2',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_stripe_plan',
          status: 'past_due',
          cancel_at_period_end: false,
          // No items field at all -- older webhook shape, defensive test
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
    const local = mockClient.db.tenant_subscriptions.find((s) => s.id === 'sub_local_plan');
    // Status still synced
    assert.equal(local.status, 'past_due');
    // Plan unchanged
    assert.equal(local.billing_plan_id, 'p_starter');
    // No plan.changed event
    assert.equal(
      mockClient.db.billing_events.filter((e) => e.event_type === 'plan.changed').length,
      0,
    );
  });

  it('tolerates unknown price_id (no match, status sync still runs)', async () => {
    stubbedEvent = {
      id: 'evt_plan_3',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_stripe_plan',
          status: 'active',
          cancel_at_period_end: false,
          items: {
            data: [{ price: { id: 'price_unknown_xyz' } }],
          },
        },
      },
    };
    stubbedNormalized = { tenant_id: TENANT, type: 'customer.subscription.updated' };

    const res = await request(buildApp())
      .post('/api/webhooks/stripe-platform')
      .set('stripe-signature', 'sig')
      .set('content-type', 'application/json')
      .send(Buffer.from(JSON.stringify(stubbedEvent)));

    // Webhook still ack'd 200 even when price_id doesn't match any local plan
    assert.equal(res.status, 200);
    const local = mockClient.db.tenant_subscriptions.find((s) => s.id === 'sub_local_plan');
    assert.equal(local.billing_plan_id, 'p_starter', 'unknown price must not change plan');
  });

  it('tolerates CONFIGURATION_ERROR from resolver (ambiguous match) — status sync still runs', async () => {
    // Synthesize an ambiguous match: the SAME price ID exists as base on
    // one plan AND seat on another. The CHECK constraint in migration 155a
    // forbids new rows from doing this, but legacy/misconfigured data can.
    // Resolver throws CONFIGURATION_ERROR; webhook must catch and continue.
    mockClient.db.billing_plans.push({
      id: 'p_legacy',
      code: 'legacy_monthly',
      name: 'Legacy',
      amount_cents: 9900,
      currency: 'usd',
      billing_interval: 'month',
      is_active: true,
      provider_product_id: 'prod_legacy',
      // Deliberately reusing price_growth_base here simulates the bad state
      provider_price_id_base: 'price_ambiguous_xyz',
      provider_price_id_seat: null,
      included_seats: 2,
      seat_unit_amount_cents: null,
      trial_days: 0,
    });
    mockClient.db.billing_plans.push({
      id: 'p_collide',
      code: 'collide_monthly',
      name: 'Collide',
      amount_cents: 14900,
      currency: 'usd',
      billing_interval: 'month',
      is_active: true,
      provider_product_id: 'prod_collide',
      provider_price_id_base: 'price_collide_base',
      // Same price ID as p_legacy.provider_price_id_base -- ambiguous
      provider_price_id_seat: 'price_ambiguous_xyz',
      included_seats: 3,
      seat_unit_amount_cents: 4900,
      trial_days: 0,
    });

    stubbedEvent = {
      id: 'evt_plan_ambig',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_stripe_plan',
          status: 'past_due', // status DOES change, so handler can't early-return
          cancel_at_period_end: false,
          items: { data: [{ price: { id: 'price_ambiguous_xyz' } }] },
        },
      },
    };
    stubbedNormalized = { tenant_id: TENANT, type: 'customer.subscription.updated' };

    const res = await request(buildApp())
      .post('/api/webhooks/stripe-platform')
      .set('stripe-signature', 'sig')
      .set('content-type', 'application/json')
      .send(Buffer.from(JSON.stringify(stubbedEvent)));

    // Webhook returns 200 despite the CONFIGURATION_ERROR being thrown internally
    assert.equal(res.status, 200);
    const local = mockClient.db.tenant_subscriptions.find((s) => s.id === 'sub_local_plan');
    // Status synced
    assert.equal(local.status, 'past_due');
    // Plan unchanged (resolver refused to pick one when ambiguous)
    assert.equal(local.billing_plan_id, 'p_starter');
    // No plan.changed event
    assert.equal(
      mockClient.db.billing_events.filter((e) => e.event_type === 'plan.changed').length,
      0,
    );
  });

  it('no-op when neither status nor plan changed', async () => {
    stubbedEvent = {
      id: 'evt_plan_noop',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_stripe_plan',
          status: 'active', // same as local
          cancel_at_period_end: false,
          items: { data: [{ price: { id: 'price_starter_base' } }] }, // same plan
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
    const local = mockClient.db.tenant_subscriptions.find((s) => s.id === 'sub_local_plan');
    assert.equal(local.status, 'active');
    assert.equal(local.billing_plan_id, 'p_starter');
    // No events -- handler took the early-return path
    assert.equal(
      mockClient.db.billing_events.filter(
        (e) => e.payload_json?.provider_subscription_id === 'sub_stripe_plan',
      ).length,
      0,
    );
  });
});

/**
 * customer.subscription.updated — PR #524 review: items.data ordering
 *
 * Regression test for the bug Codex+Copilot flagged: Stripe does not
 * guarantee ordering of items.data[], so a subscription with both a base
 * AND a seat line item can have the seat listed first. The old code
 * inspected only items.data[0], so seat-first ordering would miss the
 * base match and skip plan mapping entirely.
 */
describe('customer.subscription.updated — items.data ordering (PR #524)', () => {
  beforeEach(() => {
    mockClient.db.billing_plans = [
      {
        id: 'p_starter',
        code: 'starter_monthly',
        name: 'Starter',
        amount_cents: 19900,
        currency: 'usd',
        billing_interval: 'month',
        is_active: true,
        provider_product_id: 'prod_starter',
        provider_price_id_base: 'price_starter_base',
        provider_price_id_seat: 'price_starter_seat',
        included_seats: 3,
        seat_unit_amount_cents: 4900,
        trial_days: 14,
      },
      {
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
      },
    ];
    mockClient.db.tenant_subscriptions.push({
      id: 'sub_local_order',
      tenant_id: TENANT,
      billing_plan_id: 'p_starter',
      status: 'active',
      provider_subscription_id: 'sub_stripe_order',
      created_at: '2026-01-01',
    });
  });

  it('resolves plan when SEAT line is items.data[0] and base is items.data[1]', async () => {
    // The regression scenario: Stripe puts the Growth SEAT price first,
    // Growth BASE second. Old code stopped at index 0, missed the base,
    // and never changed billing_plan_id. New code scans all items and
    // picks the base-role match.
    stubbedEvent = {
      id: 'evt_order_1',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_stripe_order',
          status: 'active',
          cancel_at_period_end: false,
          items: {
            data: [
              { price: { id: 'price_growth_seat' } }, // seat first
              { price: { id: 'price_growth_base' } }, // base second
            ],
          },
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
    const local = mockClient.db.tenant_subscriptions.find((s) => s.id === 'sub_local_order');
    assert.equal(
      local.billing_plan_id,
      'p_growth',
      'base match at index 1 must still promote the plan',
    );
    const planChangedEvt = mockClient.db.billing_events.find(
      (e) => e.event_type === 'plan.changed',
    );
    assert.ok(planChangedEvt, 'plan.changed event must be emitted when base is found past index 0');
    assert.equal(planChangedEvt.payload_json.stripe_price_id, 'price_growth_base');
    assert.equal(planChangedEvt.payload_json.new_plan_code, 'growth_monthly');
  });

  it('prefers base match over earlier seat match even when both resolve', async () => {
    // Another ordering check: Starter seat first (belongs to current plan,
    // would resolve to role=seat), then Growth base. We must still promote
    // to Growth, not stay on Starter just because seat-role matched first.
    stubbedEvent = {
      id: 'evt_order_2',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_stripe_order',
          status: 'active',
          cancel_at_period_end: false,
          items: {
            data: [
              { price: { id: 'price_starter_seat' } }, // resolves role=seat on Starter
              { price: { id: 'price_growth_base' } }, // resolves role=base on Growth
            ],
          },
        },
      },
    };
    stubbedNormalized = { tenant_id: TENANT, type: 'customer.subscription.updated' };

    await request(buildApp())
      .post('/api/webhooks/stripe-platform')
      .set('stripe-signature', 'sig')
      .set('content-type', 'application/json')
      .send(Buffer.from(JSON.stringify(stubbedEvent)));

    const local = mockClient.db.tenant_subscriptions.find((s) => s.id === 'sub_local_order');
    assert.equal(local.billing_plan_id, 'p_growth', 'base match must win over earlier seat match');
  });

  it('falls back to seat-only audit when no base item is present at all', async () => {
    // Pure seat-only line items -- unlikely in practice but defensible.
    // Must NOT change billing_plan_id (seat prices are reusable), but
    // should record the resolved seat match in the audit payload.
    stubbedEvent = {
      id: 'evt_order_3',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_stripe_order',
          status: 'past_due', // status DOES change, so handler writes
          cancel_at_period_end: false,
          items: {
            data: [{ price: { id: 'price_growth_seat' } }],
          },
        },
      },
    };
    stubbedNormalized = { tenant_id: TENANT, type: 'customer.subscription.updated' };

    await request(buildApp())
      .post('/api/webhooks/stripe-platform')
      .set('stripe-signature', 'sig')
      .set('content-type', 'application/json')
      .send(Buffer.from(JSON.stringify(stubbedEvent)));

    const local = mockClient.db.tenant_subscriptions.find((s) => s.id === 'sub_local_order');
    assert.equal(local.billing_plan_id, 'p_starter', 'seat-only match must not change plan');
    assert.equal(
      mockClient.db.billing_events.filter((e) => e.event_type === 'plan.changed').length,
      0,
    );
    // The status-change event payload should still carry the seat-resolved
    // audit so operators can see which price id Stripe is billing.
    const statusEvt = mockClient.db.billing_events.find(
      (e) => e.payload_json?.provider_subscription_id === 'sub_stripe_order',
    );
    assert.equal(statusEvt.payload_json.stripe_price_id, 'price_growth_seat');
    assert.equal(statusEvt.payload_json.resolved_plan_role, 'seat');
  });
});
