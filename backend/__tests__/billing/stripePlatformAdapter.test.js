/**
 * Unit tests for backend/lib/billing/stripePlatformAdapter.js
 *
 * Focused on pure-logic surfaces:
 *   - normalizePaymentEvent() shape transformation
 *   - interface conformance (exports match provider contract)
 *
 * Calls that actually invoke Stripe (createCustomer, createCheckoutSession,
 * verifyWebhookSignature) are tested via integration tests in PR 3.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as adapter from '../../lib/billing/stripePlatformAdapter.js';
import { assertProviderInterface } from '../../lib/billing/paymentProvider.js';

describe('stripePlatformAdapter -- interface conformance', () => {
  it('implements the full payment provider interface', () => {
    assert.doesNotThrow(() => assertProviderInterface(adapter));
  });
});

describe('stripePlatformAdapter -- normalizePaymentEvent', () => {
  it('returns null for empty or malformed event', () => {
    assert.equal(adapter.normalizePaymentEvent(null), null);
    assert.equal(adapter.normalizePaymentEvent({}), null);
    assert.equal(adapter.normalizePaymentEvent({ type: '' }), null);
  });

  it('extracts tenant_id from metadata', () => {
    const event = {
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_123',
          metadata: { tenant_id: 'tenant-abc' },
          amount_total: 4900,
          currency: 'usd',
          payment_intent: 'pi_456',
        },
      },
    };
    const normalized = adapter.normalizePaymentEvent(event);
    assert.equal(normalized.type, 'checkout.session.completed');
    assert.equal(normalized.tenant_id, 'tenant-abc');
    assert.equal(normalized.amount_cents, 4900);
    assert.equal(normalized.currency, 'usd');
    assert.equal(normalized.payment_intent_id, 'pi_456');
  });

  it('falls back to client_reference_id when metadata.tenant_id missing', () => {
    const event = {
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_1', client_reference_id: 'tenant-xyz' } },
    };
    const normalized = adapter.normalizePaymentEvent(event);
    assert.equal(normalized.tenant_id, 'tenant-xyz');
  });

  it('handles payment_intent.succeeded events (top-level intent id)', () => {
    const event = {
      type: 'payment_intent.succeeded',
      data: {
        object: {
          object: 'payment_intent',
          id: 'pi_789',
          amount: 2500,
          currency: 'usd',
          metadata: { tenant_id: 't1' },
          latest_charge: 'ch_111',
        },
      },
    };
    const normalized = adapter.normalizePaymentEvent(event);
    assert.equal(normalized.payment_intent_id, 'pi_789');
    assert.equal(normalized.charge_id, 'ch_111');
    assert.equal(normalized.amount_cents, 2500);
  });

  it('handles charge events (top-level charge id)', () => {
    const event = {
      type: 'charge.succeeded',
      data: {
        object: {
          object: 'charge',
          id: 'ch_222',
          amount: 10000,
          currency: 'usd',
          metadata: {},
        },
      },
    };
    const normalized = adapter.normalizePaymentEvent(event);
    assert.equal(normalized.charge_id, 'ch_222');
    assert.equal(normalized.payment_intent_id, null);
  });

  it('returns null tenant_id if neither metadata nor client_reference_id is set', () => {
    const event = {
      type: 'payment_intent.payment_failed',
      data: { object: { id: 'pi_1', metadata: {} } },
    };
    const normalized = adapter.normalizePaymentEvent(event);
    assert.equal(normalized.tenant_id, null);
  });

  it('preserves raw_object_id for webhook correlation', () => {
    const event = {
      type: 'whatever',
      data: { object: { id: 'obj_xyz', metadata: {} } },
    };
    const normalized = adapter.normalizePaymentEvent(event);
    assert.equal(normalized.raw_object_id, 'obj_xyz');
  });
});

describe('stripePlatformAdapter -- createCheckoutSession input validation', () => {
  // These tests target the input-validation branches that run BEFORE any
  // Stripe SDK call. We do NOT mock Stripe here -- we expect validation to
  // throw synchronously (well, from async fn: reject) before the adapter
  // would call into the SDK. This keeps the tests hermetic and fast while
  // still covering the Shape A / Shape B branch logic added in this PR.

  it('rejects when success_url or cancel_url missing (both shapes)', async () => {
    await assert.rejects(
      () =>
        adapter.createCheckoutSession({
          customer_id: 'cus_1',
          line_items: [{ price: 'price_1', quantity: 1 }],
          mode: 'subscription',
          cancel_url: 'https://c',
        }),
      /success_url and cancel_url required/,
    );
    await assert.rejects(
      () =>
        adapter.createCheckoutSession({
          customer_id: 'cus_1',
          amount_cents: 4900,
          success_url: 'https://s',
        }),
      /success_url and cancel_url required/,
    );
  });

  it('rejects when neither line_items[] nor amount_cents provided', async () => {
    await assert.rejects(
      () =>
        adapter.createCheckoutSession({
          customer_id: 'cus_1',
          success_url: 'https://s',
          cancel_url: 'https://c',
        }),
      /provide either line_items\[\] or amount_cents > 0/,
    );
  });

  it('rejects amount_cents <= 0 when falling back to Shape B', async () => {
    await assert.rejects(
      () =>
        adapter.createCheckoutSession({
          customer_id: 'cus_1',
          amount_cents: 0,
          success_url: 'https://s',
          cancel_url: 'https://c',
        }),
      /provide either line_items\[\] or amount_cents > 0/,
    );
  });

  it('rejects empty line_items array (falls through to Shape B validation)', async () => {
    // line_items=[] is not "provided" for Shape A purposes; Shape B kicks in
    // and fails on missing amount_cents. This is intentional and documents
    // the fallback behavior.
    await assert.rejects(
      () =>
        adapter.createCheckoutSession({
          customer_id: 'cus_1',
          line_items: [],
          success_url: 'https://s',
          cancel_url: 'https://c',
        }),
      /provide either line_items\[\] or amount_cents > 0/,
    );
  });

  it('rejects unsupported mode in Shape A', async () => {
    await assert.rejects(
      () =>
        adapter.createCheckoutSession({
          customer_id: 'cus_1',
          line_items: [{ price: 'price_1', quantity: 1 }],
          mode: 'setup',
          success_url: 'https://s',
          cancel_url: 'https://c',
        }),
      /unsupported mode 'setup'/,
    );
  });

  it('rejects line_item missing a price id', async () => {
    await assert.rejects(
      () =>
        adapter.createCheckoutSession({
          customer_id: 'cus_1',
          line_items: [{ quantity: 1 }],
          mode: 'subscription',
          success_url: 'https://s',
          cancel_url: 'https://c',
        }),
      /each line_item requires a price id/,
    );
  });

  it('rejects line_item with empty-string price id', async () => {
    await assert.rejects(
      () =>
        adapter.createCheckoutSession({
          customer_id: 'cus_1',
          line_items: [{ price: '', quantity: 1 }],
          mode: 'subscription',
          success_url: 'https://s',
          cancel_url: 'https://c',
        }),
      /each line_item requires a price id/,
    );
  });

  it('rejects non-integer, negative, or zero line_item quantity', async () => {
    // Stripe Checkout rejects quantity=0 at the API level; we reject earlier
    // for a clearer error. Non-integer and negative are also rejected.
    for (const badQty of [1.5, -1, 0]) {
      await assert.rejects(
        () =>
          adapter.createCheckoutSession({
            customer_id: 'cus_1',
            line_items: [{ price: 'price_1', quantity: badQty }],
            mode: 'subscription',
            success_url: 'https://s',
            cancel_url: 'https://c',
          }),
        /quantity must be a positive integer/,
        `quantity=${badQty} must be rejected`,
      );
    }
  });

  it('rejects non-integer or negative trial_period_days', async () => {
    for (const badTrial of [7.5, -1, '14']) {
      await assert.rejects(
        () =>
          adapter.createCheckoutSession({
            customer_id: 'cus_1',
            line_items: [{ price: 'price_1', quantity: 1 }],
            mode: 'subscription',
            trial_period_days: badTrial,
            success_url: 'https://s',
            cancel_url: 'https://c',
          }),
        /trial_period_days must be a non-negative integer/,
        `trial_period_days=${JSON.stringify(badTrial)} must be rejected`,
      );
    }
  });

  it('accepts trial_period_days=0 (validation passes, no trial applied)', async () => {
    // 0 passes validation; the SDK-call branch only attaches subscription_data
    // when trial > 0. Failure will come from requirePlatformBillingConfig()
    // since no Stripe key is in env -- we only assert trial validation itself
    // did NOT reject.
    await assert.rejects(
      () =>
        adapter.createCheckoutSession({
          customer_id: 'cus_1',
          line_items: [{ price: 'price_1', quantity: 1 }],
          mode: 'subscription',
          trial_period_days: 0,
          success_url: 'https://s',
          cancel_url: 'https://c',
        }),
      (err) => {
        assert.doesNotMatch(err.message, /trial_period_days/);
        return true;
      },
    );
  });

  it('accepts line_item with omitted quantity (Stripe defaults to 1)', async () => {
    // Should NOT throw from our validation -- it's only rejected if the
    // user explicitly sends a bad quantity. Will ultimately fail at the
    // requirePlatformBillingConfig() step since no Stripe key is in env,
    // but that's past the validation branch we care about here.
    await assert.rejects(
      () =>
        adapter.createCheckoutSession({
          customer_id: 'cus_1',
          line_items: [{ price: 'price_1' }],
          mode: 'subscription',
          success_url: 'https://s',
          cancel_url: 'https://c',
        }),
      // Any error OTHER than our validation messages means validation passed.
      (err) => {
        assert.doesNotMatch(err.message, /quantity must be/);
        assert.doesNotMatch(err.message, /each line_item requires/);
        return true;
      },
    );
  });
});
