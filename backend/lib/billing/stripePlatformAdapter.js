/**
 * Platform Billing -- Stripe Platform Adapter
 *
 * Implements the payment provider interface using AiSHA's PLATFORM
 * Stripe account (STRIPE_PLATFORM_SECRET_KEY). Distinct from the
 * Cal.com tenant-level Stripe adapter that reads from tenant_integrations.
 *
 * This adapter is stateless -- it instantiates a Stripe client per call
 * using the platform key from Doppler. Caching the client is safe but
 * not necessary for correctness.
 */

import Stripe from 'stripe';
import { requirePlatformBillingConfig } from './config.js';
import logger from '../logger.js';

function getStripeClient() {
  const cfg = requirePlatformBillingConfig();
  return new Stripe(cfg.stripeSecretKey, { apiVersion: cfg.stripeApiVersion });
}

export async function createCustomer({ billing_email, company_name, metadata = {} }) {
  const stripe = getStripeClient();
  const customer = await stripe.customers.create({
    email: billing_email || undefined,
    name: company_name || undefined,
    metadata,
  });
  return { id: customer.id };
}

/**
 * Create a Stripe Checkout Session for platform billing.
 *
 * Two input shapes supported (pick one):
 *
 *   A) line_items + mode (preferred for subscription checkouts):
 *      createCheckoutSession({
 *        customer_id, line_items: [{ price, quantity }, ...],
 *        mode: 'subscription', trial_period_days, success_url, cancel_url, metadata
 *      })
 *
 *   B) amount_cents (legacy one-time payment shape, retained for back-compat):
 *      createCheckoutSession({
 *        customer_id, amount_cents, currency, description,
 *        success_url, cancel_url, metadata
 *      })
 *
 * If `line_items` is provided it wins. `trial_period_days` only applies to
 * `mode: 'subscription'`.
 */
export async function createCheckoutSession({
  customer_id,
  // Shape A (preferred)
  line_items,
  mode,
  trial_period_days,
  // Shape B (legacy)
  amount_cents,
  currency,
  description,
  // Common
  success_url,
  cancel_url,
  metadata = {},
}) {
  if (!success_url || !cancel_url) {
    throw new Error('createCheckoutSession: success_url and cancel_url required');
  }

  // ---------- INPUT VALIDATION (runs before any SDK/env access) ----------
  // Validation must NOT require the Stripe client or platform config to be
  // available -- otherwise on a misconfigured server (no STRIPE_PLATFORM_*
  // env), a genuinely bad request surfaces as "STRIPE not configured" and
  // masks the real caller error. Also makes this function unit-testable
  // without stubbing Stripe.
  const hasLineItems = Array.isArray(line_items) && line_items.length > 0;
  if (hasLineItems) {
    const resolvedMode = mode || 'subscription';
    if (resolvedMode !== 'subscription' && resolvedMode !== 'payment') {
      throw new Error(
        `createCheckoutSession: unsupported mode '${resolvedMode}' (expected subscription|payment)`,
      );
    }
    for (const item of line_items) {
      if (!item || typeof item.price !== 'string' || !item.price) {
        throw new Error('createCheckoutSession: each line_item requires a price id');
      }
      if (item.quantity !== undefined && (!Number.isInteger(item.quantity) || item.quantity < 0)) {
        throw new Error('createCheckoutSession: line_item quantity must be a non-negative integer');
      }
    }
  } else if (!amount_cents || amount_cents <= 0) {
    throw new Error('createCheckoutSession: provide either line_items[] or amount_cents > 0');
  }

  // ---------- SDK CALL (validation passed) ----------
  const stripe = getStripeClient();
  const cfg = requirePlatformBillingConfig();

  // Shape A: real Stripe Prices passed directly.
  if (hasLineItems) {
    const resolvedMode = mode || 'subscription';
    const params = {
      mode: resolvedMode,
      payment_method_types: ['card'],
      customer: customer_id || undefined,
      line_items,
      metadata,
      success_url,
      cancel_url,
    };
    if (resolvedMode === 'subscription' && trial_period_days > 0) {
      params.subscription_data = {
        trial_period_days: Number(trial_period_days),
        metadata,
      };
    }

    const session = await stripe.checkout.sessions.create(params);
    return { id: session.id, url: session.url };
  }

  // Shape B: legacy ad-hoc amount_cents path. Retained so existing callers
  // (e.g. manual invoice collection) keep working. Validation of
  // amount_cents > 0 already happened up front.
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    customer: customer_id || undefined,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: currency || cfg.defaultCurrency,
          unit_amount: amount_cents,
          product_data: {
            name: description || 'AiSHA Platform Billing',
          },
        },
      },
    ],
    metadata,
    success_url,
    cancel_url,
  });

  return { id: session.id, url: session.url };
}

export async function createPortalSession({ customer_id, return_url }) {
  if (!customer_id) throw new Error('createPortalSession: customer_id required');
  if (!return_url) throw new Error('createPortalSession: return_url required');

  const stripe = getStripeClient();
  const session = await stripe.billingPortal.sessions.create({
    customer: customer_id,
    return_url,
  });
  return { url: session.url };
}

/**
 * Verify Stripe webhook signature against the PLATFORM webhook secret.
 * Throws on invalid signature.
 */
export function verifyWebhookSignature({ rawBody, signature }) {
  if (!rawBody) throw new Error('verifyWebhookSignature: rawBody required');
  if (!signature) throw new Error('verifyWebhookSignature: signature required');

  const cfg = requirePlatformBillingConfig({ requireWebhookSecret: true });
  const stripe = new Stripe(cfg.stripeSecretKey, { apiVersion: cfg.stripeApiVersion });

  try {
    const event = stripe.webhooks.constructEvent(rawBody, signature, cfg.stripeWebhookSecret);
    return { event };
  } catch (err) {
    logger.warn({ err: err.message }, '[StripePlatformAdapter] Signature verification failed');
    throw new Error(`Invalid platform webhook signature: ${err.message}`);
  }
}

/**
 * Normalize a Stripe event into the provider-agnostic shape.
 * Returns null for unhandled event types.
 */
export function normalizePaymentEvent(event) {
  if (!event || !event.type) return null;
  const obj = event.data?.object || {};

  const base = {
    type: event.type,
    tenant_id: obj.metadata?.tenant_id || obj.client_reference_id || null,
    amount_cents: obj.amount_total ?? obj.amount ?? null,
    currency: obj.currency || null,
    payment_intent_id: obj.payment_intent || (obj.object === 'payment_intent' ? obj.id : null),
    charge_id: obj.latest_charge || (obj.object === 'charge' ? obj.id : null),
    metadata: obj.metadata || {},
    raw_object_id: obj.id,
  };

  return base;
}

export default {
  createCustomer,
  createCheckoutSession,
  createPortalSession,
  verifyWebhookSignature,
  normalizePaymentEvent,
};
