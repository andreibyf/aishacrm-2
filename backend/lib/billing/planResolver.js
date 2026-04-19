/**
 * Platform Billing -- Plan Resolver
 *
 * Pure lookup and calculation helpers for billing plans. No side effects,
 * no event logging, no state mutation. Used by:
 *   - Checkout / session creation (resolves plan_code -> Stripe line items)
 *   - Webhook handlers (resolves Stripe price_id -> billing_plans row)
 *   - Tier display in the UI
 *
 * All functions are idempotent and safe to call repeatedly.
 */

import { BillingError, BILLING_ERROR_CODES } from './errors.js';

/**
 * Fields returned by plan lookups. Keep in sync with billing_plans columns.
 * @typedef {object} BillingPlan
 * @property {string} id
 * @property {string} code
 * @property {string} name
 * @property {string} description
 * @property {string} billing_interval
 * @property {number} amount_cents
 * @property {string} currency
 * @property {boolean} is_active
 * @property {object} features_json
 * @property {object} module_entitlements_json
 * @property {number|null} seat_limit
 * @property {object} usage_rules_json
 * @property {string|null} provider_product_id
 * @property {string|null} provider_price_id_base
 * @property {string|null} provider_price_id_seat
 * @property {number} included_seats
 * @property {number|null} seat_unit_amount_cents
 * @property {number} trial_days
 */

const PLAN_COLUMNS =
  'id, code, name, description, billing_interval, amount_cents, currency, ' +
  'is_active, features_json, module_entitlements_json, seat_limit, usage_rules_json, ' +
  'provider_product_id, provider_price_id_base, provider_price_id_seat, ' +
  'included_seats, seat_unit_amount_cents, trial_days';

/**
 * Resolve a billing plan by its code (e.g. 'starter_monthly').
 * Returns null if not found. Throws BillingError(INVALID_INPUT) if code missing.
 *
 * @param {object} supabase - Supabase client
 * @param {string} code
 * @param {object} [options]
 * @param {boolean} [options.activeOnly=true] - If true, only returns is_active=true plans
 * @returns {Promise<BillingPlan|null>}
 */
export async function resolvePlanByCode(supabase, code, options = {}) {
  const { activeOnly = true } = options;

  if (!code || typeof code !== 'string') {
    throw new BillingError('resolvePlanByCode: code required', {
      statusCode: 400,
      code: BILLING_ERROR_CODES.INVALID_INPUT,
    });
  }

  let query = supabase.from('billing_plans').select(PLAN_COLUMNS).eq('code', code);
  if (activeOnly) query = query.eq('is_active', true);

  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`resolvePlanByCode: ${error.message}`);
  return data ?? null;
}

/**
 * Resolve a plan from a Stripe Price ID. Also returns which role the price
 * plays on that plan ('base' or 'seat').
 *
 * Used by webhook handlers: invoice.paid line items reference a price_id,
 * and we need to find the owning plan to update tenant_subscriptions.
 *
 * @param {object} supabase
 * @param {string} providerPriceId - Stripe Price ID (price_...)
 * @returns {Promise<{plan: BillingPlan, role: 'base'|'seat'}|null>}
 */
export async function resolvePlanByProviderPriceId(supabase, providerPriceId) {
  if (!providerPriceId || typeof providerPriceId !== 'string') {
    throw new BillingError('resolvePlanByProviderPriceId: providerPriceId required', {
      statusCode: 400,
      code: BILLING_ERROR_CODES.INVALID_INPUT,
    });
  }

  // Query each column separately. Both provider_price_id_base and
  // provider_price_id_seat have unique indexes, so at most one row matches
  // across both columns. Two queries is clearer than .or() and avoids the
  // string-injection risk of putting priceId into a filter expression.
  const [{ data: baseHit, error: baseErr }, { data: seatHit, error: seatErr }] = await Promise.all([
    supabase
      .from('billing_plans')
      .select(PLAN_COLUMNS)
      .eq('provider_price_id_base', providerPriceId)
      .maybeSingle(),
    supabase
      .from('billing_plans')
      .select(PLAN_COLUMNS)
      .eq('provider_price_id_seat', providerPriceId)
      .maybeSingle(),
  ]);

  if (baseErr) throw new Error(`resolvePlanByProviderPriceId: ${baseErr.message}`);
  if (seatErr) throw new Error(`resolvePlanByProviderPriceId: ${seatErr.message}`);

  // Ambiguous match: the same Stripe price ID resolves to both a base-role
  // row AND a seat-role row (on the same or different plans). The per-column
  // unique indexes in Migration 155 prevent duplicates WITHIN each column but
  // not ACROSS both columns. Fail fast rather than silently choosing base.
  if (baseHit && seatHit) {
    throw new BillingError(
      `resolvePlanByProviderPriceId: ambiguous match for ${providerPriceId} ` +
        `(matches provider_price_id_base on plan ${baseHit.code} and ` +
        `provider_price_id_seat on plan ${seatHit.code})`,
      { statusCode: 500, code: BILLING_ERROR_CODES.CONFIGURATION_ERROR },
    );
  }

  if (baseHit) return { plan: baseHit, role: 'base' };
  if (seatHit) return { plan: seatHit, role: 'seat' };
  return null;
}

/**
 * List all active billing plans, ordered by amount_cents ascending.
 * Used to render pricing pages.
 *
 * @param {object} supabase
 * @returns {Promise<BillingPlan[]>}
 */
export async function listActivePlans(supabase) {
  const { data, error } = await supabase
    .from('billing_plans')
    .select(PLAN_COLUMNS)
    .eq('is_active', true)
    .order('amount_cents', { ascending: true });

  if (error) throw new Error(`listActivePlans: ${error.message}`);
  return data ?? [];
}

/**
 * Compute the extra-seat quantity that should be billed for a given plan
 * and requested total seat count.
 *
 * Rules:
 *   - requestedSeats <= included_seats -> 0 extra seats billed
 *   - requestedSeats > included_seats  -> (requestedSeats - included_seats) extra seats
 *   - Plan does NOT sell extra seats (seat_unit_amount_cents is null
 *     AND provider_price_id_seat is null) -> throw BillingError
 *   - requestedSeats < 0 -> throw BillingError
 *   - requestedSeats > seat_limit (when set) -> throw BillingError
 *
 * @param {BillingPlan} plan
 * @param {number} requestedSeats - total users the tenant wants (not "extra")
 * @returns {number} quantity to set on the per-seat Stripe line item
 */
export function calculateExtraSeatQuantity(plan, requestedSeats) {
  if (!plan || typeof plan !== 'object') {
    throw new BillingError('calculateExtraSeatQuantity: plan required', {
      statusCode: 400,
      code: BILLING_ERROR_CODES.INVALID_INPUT,
    });
  }
  if (!Number.isInteger(requestedSeats) || requestedSeats < 0) {
    throw new BillingError(
      `calculateExtraSeatQuantity: requestedSeats must be a non-negative integer (got ${requestedSeats})`,
      { statusCode: 400, code: BILLING_ERROR_CODES.INVALID_INPUT },
    );
  }

  if (plan.seat_limit != null && requestedSeats > plan.seat_limit) {
    throw new BillingError(
      `Plan ${plan.code} has a seat_limit of ${plan.seat_limit}, requested ${requestedSeats}`,
      { statusCode: 400, code: BILLING_ERROR_CODES.INVALID_INPUT },
    );
  }

  const included = plan.included_seats ?? 0;
  if (requestedSeats <= included) return 0;

  const supportsExtraSeats =
    plan.seat_unit_amount_cents != null && plan.provider_price_id_seat != null;
  if (!supportsExtraSeats) {
    throw new BillingError(
      `Plan ${plan.code} does not support additional seats beyond ${included}`,
      { statusCode: 400, code: BILLING_ERROR_CODES.INVALID_INPUT },
    );
  }

  return requestedSeats - included;
}

/**
 * Build the Stripe Checkout / Subscription line items for a plan + seat count.
 *
 * Returns an array shaped for Stripe's `line_items` parameter:
 *   [{ price: <base_price_id>, quantity: 1 }, { price: <seat_price_id>, quantity: N }]
 *
 * If requestedSeats <= included_seats, only the base line is returned.
 *
 * @param {BillingPlan} plan
 * @param {number} requestedSeats
 * @returns {Array<{price: string, quantity: number}>}
 */
export function buildStripeLineItems(plan, requestedSeats) {
  if (!plan?.provider_price_id_base) {
    // Server misconfiguration -- a plan row exists in billing_plans but is
    // missing the Stripe price ID needed to create a checkout session.
    // Distinct from INVALID_INPUT (client error) so route handlers can
    // respond with 500 + "contact support" rather than a 400 validation
    // error that implies the caller passed bad input.
    throw new BillingError(
      `Plan ${plan?.code ?? '(unknown)'} is missing provider_price_id_base -- cannot build Stripe line items`,
      { statusCode: 500, code: BILLING_ERROR_CODES.CONFIGURATION_ERROR },
    );
  }

  const extraSeats = calculateExtraSeatQuantity(plan, requestedSeats);
  const lines = [{ price: plan.provider_price_id_base, quantity: 1 }];
  if (extraSeats > 0) {
    lines.push({ price: plan.provider_price_id_seat, quantity: extraSeats });
  }
  return lines;
}

/**
 * Compute the monthly total (in cents) for a plan + requested seat count.
 * Useful for UI previews; the authoritative total is whatever Stripe invoices.
 *
 * @param {BillingPlan} plan
 * @param {number} requestedSeats
 * @returns {number} total cents per billing interval
 */
export function computeMonthlyTotalCents(plan, requestedSeats) {
  const extraSeats = calculateExtraSeatQuantity(plan, requestedSeats);
  const seatCents = extraSeats * (plan.seat_unit_amount_cents ?? 0);
  return (plan.amount_cents ?? 0) + seatCents;
}

export default {
  resolvePlanByCode,
  resolvePlanByProviderPriceId,
  listActivePlans,
  calculateExtraSeatQuantity,
  buildStripeLineItems,
  computeMonthlyTotalCents,
};
