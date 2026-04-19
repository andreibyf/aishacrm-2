/**
 * Unit tests for backend/lib/billing/planResolver.js
 *
 * Covers:
 *   - resolvePlanByCode: hit / miss / inactive exclusion / validation
 *   - resolvePlanByProviderPriceId: base match / seat match / miss / validation
 *   - listActivePlans: ordering, active-only filter
 *   - calculateExtraSeatQuantity: all branches (at/below/above included,
 *     seat_limit enforcement, no-extra-seats plan rejection, bad input)
 *   - buildStripeLineItems: base-only vs base+seat
 *   - computeMonthlyTotalCents: flat + per-seat math
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createBillingMock } from './_billingMock.js';
import {
  resolvePlanByCode,
  resolvePlanByProviderPriceId,
  listActivePlans,
  calculateExtraSeatQuantity,
  buildStripeLineItems,
  computeMonthlyTotalCents,
} from '../../lib/billing/planResolver.js';
import { BillingError } from '../../lib/billing/errors.js';

const STARTER = {
  id: 'plan-starter',
  code: 'starter_monthly',
  name: 'Starter',
  description: 'Entry tier',
  billing_interval: 'month',
  amount_cents: 19900,
  currency: 'usd',
  is_active: true,
  features_json: {},
  module_entitlements_json: {},
  seat_limit: null,
  usage_rules_json: {},
  provider_product_id: 'prod_starter',
  provider_price_id_base: 'price_starter_base',
  provider_price_id_seat: 'price_starter_seat',
  included_seats: 3,
  seat_unit_amount_cents: 4900,
  trial_days: 14,
};

const GROWTH = {
  ...STARTER,
  id: 'plan-growth',
  code: 'growth_monthly',
  name: 'Growth',
  amount_cents: 29700,
  provider_product_id: 'prod_growth',
  provider_price_id_base: 'price_growth_base',
  provider_price_id_seat: 'price_growth_seat',
  included_seats: 5,
};

const RETIRED = {
  ...STARTER,
  id: 'plan-retired',
  code: 'legacy_monthly',
  name: 'Legacy',
  amount_cents: 9900,
  is_active: false,
  provider_product_id: 'prod_legacy',
  provider_price_id_base: 'price_legacy_base',
  provider_price_id_seat: 'price_legacy_seat',
};

const NO_SEATS_PLAN = {
  ...STARTER,
  id: 'plan-no-seats',
  code: 'solo_monthly',
  included_seats: 1,
  seat_unit_amount_cents: null,
  provider_price_id_seat: null,
  provider_product_id: 'prod_solo',
  provider_price_id_base: 'price_solo_base',
};

function fresh() {
  return createBillingMock({
    billing_plans: [STARTER, GROWTH, RETIRED, NO_SEATS_PLAN],
  });
}

describe('resolvePlanByCode', () => {
  it('returns the active plan matching the code', async () => {
    const supa = fresh();
    const plan = await resolvePlanByCode(supa, 'starter_monthly');
    assert.equal(plan?.code, 'starter_monthly');
    assert.equal(plan.included_seats, 3);
    assert.equal(plan.provider_price_id_base, 'price_starter_base');
  });

  it('returns null for unknown code', async () => {
    const supa = fresh();
    const plan = await resolvePlanByCode(supa, 'does_not_exist');
    assert.equal(plan, null);
  });

  it('excludes inactive plans by default', async () => {
    const supa = fresh();
    const plan = await resolvePlanByCode(supa, 'legacy_monthly');
    assert.equal(plan, null);
  });

  it('includes inactive plans when activeOnly=false', async () => {
    const supa = fresh();
    const plan = await resolvePlanByCode(supa, 'legacy_monthly', { activeOnly: false });
    assert.equal(plan?.code, 'legacy_monthly');
    assert.equal(plan.is_active, false);
  });

  it('throws BillingError when code is missing or wrong type', async () => {
    const supa = fresh();
    await assert.rejects(() => resolvePlanByCode(supa, null), BillingError);
    await assert.rejects(() => resolvePlanByCode(supa, ''), BillingError);
    await assert.rejects(() => resolvePlanByCode(supa, 42), BillingError);
  });
});

describe('resolvePlanByProviderPriceId', () => {
  it('resolves a base Stripe price ID with role=base', async () => {
    const supa = fresh();
    const hit = await resolvePlanByProviderPriceId(supa, 'price_starter_base');
    assert.equal(hit?.role, 'base');
    assert.equal(hit.plan.code, 'starter_monthly');
  });

  it('resolves a seat Stripe price ID with role=seat', async () => {
    const supa = fresh();
    const hit = await resolvePlanByProviderPriceId(supa, 'price_growth_seat');
    assert.equal(hit?.role, 'seat');
    assert.equal(hit.plan.code, 'growth_monthly');
  });

  it('returns null for unknown price ID', async () => {
    const supa = fresh();
    const hit = await resolvePlanByProviderPriceId(supa, 'price_nonexistent');
    assert.equal(hit, null);
  });

  it('does not confuse base and seat price IDs across plans', async () => {
    const supa = fresh();
    // Growth base should not match when we ask for starter base
    const a = await resolvePlanByProviderPriceId(supa, 'price_growth_base');
    assert.equal(a.plan.code, 'growth_monthly');
    assert.equal(a.role, 'base');
    const b = await resolvePlanByProviderPriceId(supa, 'price_starter_seat');
    assert.equal(b.plan.code, 'starter_monthly');
    assert.equal(b.role, 'seat');
  });

  it('throws BillingError when priceId is missing or wrong type', async () => {
    const supa = fresh();
    await assert.rejects(() => resolvePlanByProviderPriceId(supa, null), BillingError);
    await assert.rejects(() => resolvePlanByProviderPriceId(supa, ''), BillingError);
    await assert.rejects(() => resolvePlanByProviderPriceId(supa, 42), BillingError);
  });
});

describe('listActivePlans', () => {
  it('returns only active plans, ordered by amount_cents ascending', async () => {
    const supa = fresh();
    const plans = await listActivePlans(supa);
    const codes = plans.map((p) => p.code);
    // All three active plans should appear; retired should not
    assert.ok(codes.includes('starter_monthly'));
    assert.ok(codes.includes('growth_monthly'));
    assert.ok(codes.includes('solo_monthly'));
    assert.ok(!codes.includes('legacy_monthly'));
    // Ordering: amount_cents ascending
    const amounts = plans.map((p) => p.amount_cents);
    const sorted = [...amounts].sort((a, b) => a - b);
    assert.deepEqual(amounts, sorted);
  });

  it('returns empty array when no active plans exist', async () => {
    const supa = createBillingMock({ billing_plans: [RETIRED] });
    const plans = await listActivePlans(supa);
    assert.deepEqual(plans, []);
  });
});

describe('calculateExtraSeatQuantity', () => {
  it('returns 0 when requestedSeats == included_seats', () => {
    assert.equal(calculateExtraSeatQuantity(STARTER, 3), 0);
  });

  it('returns 0 when requestedSeats < included_seats', () => {
    assert.equal(calculateExtraSeatQuantity(STARTER, 1), 0);
  });

  it('returns 0 when requestedSeats is 0', () => {
    assert.equal(calculateExtraSeatQuantity(STARTER, 0), 0);
  });

  it('returns (requested - included) when requestedSeats > included', () => {
    assert.equal(calculateExtraSeatQuantity(STARTER, 5), 2);
    assert.equal(calculateExtraSeatQuantity(STARTER, 10), 7);
    assert.equal(calculateExtraSeatQuantity(GROWTH, 12), 7);
  });

  it('rejects requestedSeats > seat_limit when seat_limit set', () => {
    const capped = { ...STARTER, seat_limit: 10 };
    assert.equal(calculateExtraSeatQuantity(capped, 10), 7);
    assert.throws(() => calculateExtraSeatQuantity(capped, 11), BillingError);
  });

  it('rejects plans that do not support extra seats', () => {
    // Requesting exactly included_seats works
    assert.equal(calculateExtraSeatQuantity(NO_SEATS_PLAN, 1), 0);
    // Requesting beyond included throws
    assert.throws(() => calculateExtraSeatQuantity(NO_SEATS_PLAN, 2), BillingError);
  });

  it('rejects negative or non-integer requestedSeats', () => {
    assert.throws(() => calculateExtraSeatQuantity(STARTER, -1), BillingError);
    assert.throws(() => calculateExtraSeatQuantity(STARTER, 1.5), BillingError);
    assert.throws(() => calculateExtraSeatQuantity(STARTER, '5'), BillingError);
    assert.throws(() => calculateExtraSeatQuantity(STARTER, NaN), BillingError);
  });

  it('rejects missing plan', () => {
    assert.throws(() => calculateExtraSeatQuantity(null, 5), BillingError);
    assert.throws(() => calculateExtraSeatQuantity(undefined, 5), BillingError);
  });
});

describe('buildStripeLineItems', () => {
  it('returns base-only line when requestedSeats <= included_seats', () => {
    const lines = buildStripeLineItems(STARTER, 2);
    assert.deepEqual(lines, [{ price: 'price_starter_base', quantity: 1 }]);
  });

  it('returns base + seat lines when requestedSeats > included_seats', () => {
    const lines = buildStripeLineItems(STARTER, 5);
    assert.deepEqual(lines, [
      { price: 'price_starter_base', quantity: 1 },
      { price: 'price_starter_seat', quantity: 2 },
    ]);
  });

  it('throws when plan is missing provider_price_id_base', () => {
    const broken = { ...STARTER, provider_price_id_base: null };
    assert.throws(() => buildStripeLineItems(broken, 1), BillingError);
  });

  it('propagates seat-quantity errors from calculateExtraSeatQuantity', () => {
    assert.throws(() => buildStripeLineItems(STARTER, -1), BillingError);
    assert.throws(() => buildStripeLineItems(NO_SEATS_PLAN, 5), BillingError);
  });
});

describe('computeMonthlyTotalCents', () => {
  it('returns base amount when no extra seats', () => {
    assert.equal(computeMonthlyTotalCents(STARTER, 3), 19900);
    assert.equal(computeMonthlyTotalCents(STARTER, 1), 19900);
  });

  it('returns base + (extra seats * seat price) when requestedSeats > included', () => {
    // STARTER: base $199, 3 included, $49/extra seat
    // 5 seats = $199 + 2 * $49 = $297 (19900 + 2*4900 = 29700)
    assert.equal(computeMonthlyTotalCents(STARTER, 5), 29700);
    // 10 seats = $199 + 7 * $49 = $542 (19900 + 7*4900 = 54200)
    assert.equal(computeMonthlyTotalCents(STARTER, 10), 54200);
    // GROWTH: base $297, 5 included, $49/extra seat
    // 12 seats = $297 + 7 * $49 = $640 (29700 + 7*4900 = 64000)
    assert.equal(computeMonthlyTotalCents(GROWTH, 12), 64000);
  });

  it('throws when the plan does not support extra seats and requested > included', () => {
    assert.throws(() => computeMonthlyTotalCents(NO_SEATS_PLAN, 5), BillingError);
  });
});
