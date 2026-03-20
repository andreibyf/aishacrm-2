/**
 * Stripe Webhook Handler
 *
 * Endpoint: POST /api/webhooks/stripe
 *
 * Handles:
 *   - checkout.session.completed → create session_credits record
 *   - payment_intent.payment_failed → log failure
 *
 * Authentication: Stripe-Signature HMAC verification (raw body required).
 *
 * The Stripe webhook secret is stored per-tenant in tenant_integrations:
 *   integration_type = 'stripe', api_credentials.webhook_secret
 *
 * Checkout session metadata must include:
 *   { tenant_id, package_id, contact_id?, lead_id? }
 */

import express from 'express';
import Stripe from 'stripe';
import { getSupabaseClient } from '../lib/supabase-db.js';
import logger from '../lib/logger.js';

export const stripeWebhookRouter = express.Router();

// Raw body required for Stripe sig verification
stripeWebhookRouter.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  // Prefer req.rawBody (set by express.json verify callback in initMiddleware) over
  // req.body (express.raw buffer) — avoids issues when express.json() runs first globally
  const rawBody = req.rawBody || (Buffer.isBuffer(req.body) ? req.body : null);
  const sigHeader = req.headers['stripe-signature'];

  if (!rawBody) {
    return res.status(400).json({ error: 'Unable to read request body' });
  }
  if (!sigHeader) {
    return res.status(400).json({ error: 'Missing Stripe-Signature header' });
  }

  const supabase = getSupabaseClient();

  // Parse metadata tenant_id from the raw payload to find the right webhook secret
  let eventPayload;
  try {
    eventPayload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }

  const tenantId =
    eventPayload?.data?.object?.metadata?.tenant_id ||
    eventPayload?.data?.object?.client_reference_id;

  if (!tenantId) {
    logger.warn('[StripeWebhook] No tenant_id in event metadata — rejecting');
    return res.status(400).json({ error: 'tenant_id missing from checkout metadata' });
  }

  // Load Stripe integration for this tenant
  const { data: integrations, error: intErr } = await supabase
    .from('tenant_integrations')
    .select('api_credentials, config')
    .eq('tenant_id', tenantId)
    .eq('integration_type', 'stripe')
    .eq('is_active', true)
    .limit(5);

  if (intErr || !integrations?.length) {
    logger.warn('[StripeWebhook] No active Stripe integration for tenant', { tenantId });
    return res.status(400).json({ error: 'No active Stripe integration found for tenant' });
  }

  // Try each integration's webhook_secret until one verifies
  let event = null;

  for (const integration of integrations) {
    const webhookSecret = integration.api_credentials?.webhook_secret;
    const secretKey = integration.api_credentials?.secret_key;
    if (!webhookSecret || !secretKey) continue;

    try {
      const stripe = new Stripe(secretKey, { apiVersion: '2024-06-20' });
      event = stripe.webhooks.constructEvent(rawBody, sigHeader, webhookSecret);
      break;
    } catch {
      // wrong secret — try next
    }
  }

  if (!event) {
    logger.warn('[StripeWebhook] Signature verification failed for all integrations', { tenantId });
    return res.status(401).json({ error: 'Invalid Stripe signature' });
  }

  logger.info('[StripeWebhook] Event received', { type: event.type, tenantId });

  try {
    if (event.type === 'checkout.session.completed') {
      await handleCheckoutCompleted(supabase, event.data.object, tenantId);
    } else if (event.type === 'payment_intent.payment_failed') {
      const pi = event.data.object;
      logger.warn('[StripeWebhook] Payment failed', {
        tenantId,
        payment_intent: pi.id,
        error: pi.last_payment_error?.message,
      });
    }

    res.json({ received: true });
  } catch (err) {
    logger.error('[StripeWebhook] Handler error', { error: err.message, type: event.type });
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

async function handleCheckoutCompleted(supabase, session, tenantId) {
  const { package_id, contact_id, lead_id } = session.metadata || {};

  if (!package_id) {
    logger.warn('[StripeWebhook] checkout.session.completed missing package_id', {
      sessionId: session.id,
    });
    return;
  }

  // Fetch package details
  const { data: pkg, error: pkgErr } = await supabase
    .from('session_packages')
    .select('id, session_count, validity_days, is_active')
    .eq('id', package_id)
    .eq('tenant_id', tenantId)
    .single();

  if (pkgErr || !pkg) {
    throw new Error(`Package ${package_id} not found for tenant ${tenantId}`);
  }

  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + pkg.validity_days);

  const { error: insertErr } = await supabase.from('session_credits').insert([
    {
      tenant_id: tenantId,
      contact_id: contact_id || null,
      lead_id: lead_id || null,
      package_id,
      credits_purchased: pkg.session_count,
      credits_remaining: pkg.session_count,
      purchase_date: new Date().toISOString(),
      expiry_date: expiryDate.toISOString(),
      metadata: {
        payment_reference: session.payment_intent || session.id,
        purchased_via: 'stripe_checkout',
        stripe_session_id: session.id,
        amount_total: session.amount_total,
        currency: session.currency,
      },
    },
  ]);

  if (insertErr) throw new Error(`Failed to create session_credits: ${insertErr.message}`);

  logger.info('[StripeWebhook] Credits created', {
    tenantId,
    package_id,
    contact_id,
    lead_id,
    credits: pkg.session_count,
  });
}
