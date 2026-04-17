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

export async function createCheckoutSession({
  customer_id,
  amount_cents,
  currency,
  description,
  success_url,
  cancel_url,
  metadata = {},
}) {
  if (!success_url || !cancel_url) {
    throw new Error('createCheckoutSession: success_url and cancel_url required');
  }
  if (!amount_cents || amount_cents <= 0) {
    throw new Error('createCheckoutSession: amount_cents must be > 0');
  }

  const stripe = getStripeClient();
  const cfg = requirePlatformBillingConfig();

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

  const cfg = requirePlatformBillingConfig();
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
