/**
 * Stripe Platform Webhook Handler
 *
 * Receives webhook events from AiSHA's PLATFORM Stripe account.
 * Separate from the Cal.com tenant Stripe webhook (stripe-webhook.js).
 *
 * Path: POST /api/webhooks/stripe-platform
 * Auth: Stripe-Signature header verified against STRIPE_PLATFORM_WEBHOOK_SECRET
 * Body: raw (not parsed JSON) — express.raw middleware applied at router level
 *
 * Idempotency: payments.provider_payment_intent_id has a unique index and
 * recordPayment() short-circuits on duplicates, so retried webhooks are safe.
 *
 * CSRF exemption: added in backend/startup/initMiddleware.js webhookPaths array.
 *
 * Events handled:
 *   - checkout.session.completed        → plan assignment + payment recording
 *   - payment_intent.succeeded          → payment recording (renewals)
 *   - payment_intent.payment_failed     → log PAYMENT_FAILED event
 *   - customer.subscription.updated     → sync plan status changes (portal-driven)
 *   - customer.subscription.deleted     → sync cancellations (portal-driven)
 *
 * Factory pattern: createStripePlatformWebhookRouter({ getSupabaseClient, stripeAdapter })
 * allows tests to inject mocks. Default export is a pre-built router using real
 * dependencies (for production mount).
 */

import express from 'express';
import logger from '../lib/logger.js';
import { getSupabaseClient as defaultGetSupabaseClient } from '../lib/supabase-db.js';
import * as defaultStripeAdapter from '../lib/billing/stripePlatformAdapter.js';
import { recordPayment } from '../lib/billing/invoiceService.js';
import { assignPlan } from '../lib/billing/subscriptionService.js';
import { logBillingEvent, BILLING_EVENTS } from '../lib/billing/billingEventLogger.js';
import { syncTenantBillingState } from '../lib/billing/billingStateMachine.js';
import { getPlatformBillingConfig } from '../lib/billing/config.js';

export function createStripePlatformWebhookRouter(opts = {}) {
  const getClient = opts.getSupabaseClient || defaultGetSupabaseClient;
  const stripeAdapter = opts.stripeAdapter || defaultStripeAdapter;

  const router = express.Router();

  router.post(
    '/stripe-platform',
    express.raw({ type: 'application/json', limit: '1mb' }),
    async (req, res) => {
      const signature = req.headers['stripe-signature'];

      if (!getPlatformBillingConfig().isConfigured) {
        logger.warn('[StripePlatformWebhook] Received event but platform billing not configured');
        return res.status(503).json({ error: 'Platform billing not configured' });
      }

      // Prefer req.rawBody (set by express.json verify callback in initMiddleware) over
      // req.body (express.raw buffer) — avoids issues when express.json() runs first globally
      // and has already parsed the body into a JS object.
      const rawBody = req.rawBody || (Buffer.isBuffer(req.body) ? req.body : null);
      if (!rawBody) {
        logger.warn('[StripePlatformWebhook] No raw body available for signature verification');
        return res.status(400).json({ error: 'Unable to read request body' });
      }

      let event;
      try {
        const verified = stripeAdapter.verifyWebhookSignature({
          rawBody,
          signature,
        });
        event = verified.event;
      } catch (err) {
        logger.warn('[StripePlatformWebhook] Signature verification failed', {
          error: err.message,
        });
        return res.status(400).json({ error: 'Invalid signature' });
      }

      const supabase = getClient();
      const normalized = stripeAdapter.normalizePaymentEvent(event);

      logger.info('[StripePlatformWebhook] Event received', {
        type: event.type,
        tenant_id: normalized?.tenant_id,
        event_id: event.id,
      });

      try {
        await routeEvent(supabase, event, normalized, req.headers['x-request-id']);
        res.json({ received: true });
      } catch (err) {
        logger.error('[StripePlatformWebhook] Handler error', {
          event_type: event.type,
          event_id: event.id,
          error: err.message,
        });
        res.status(500).json({ error: err.message });
      }
    },
  );

  return router;
}

/**
 * Route a Stripe event to the appropriate billing service call.
 * Each case is idempotent at the service layer.
 */
async function routeEvent(supabase, event, normalized, requestId) {
  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(supabase, event, normalized, requestId);
      break;

    case 'payment_intent.succeeded':
      await handlePaymentSucceeded(supabase, event, normalized, requestId);
      break;

    case 'payment_intent.payment_failed':
      await handlePaymentFailed(supabase, event, normalized, requestId);
      break;

    case 'customer.subscription.updated':
      await handleSubscriptionUpdated(supabase, event, requestId);
      break;

    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(supabase, event, requestId);
      break;

    default:
      logger.debug('[StripePlatformWebhook] Unhandled event type', { type: event.type });
      break;
  }
}

/**
 * checkout.session.completed — triggered after successful Checkout purchase.
 * If metadata.plan_code is present and tenant has no active subscription,
 * assign it. If payment_intent is present, record the payment.
 */
async function handleCheckoutCompleted(supabase, event, normalized, requestId) {
  const session = event.data.object;
  const tenantId = normalized?.tenant_id;
  const planCode = session.metadata?.plan_code;

  if (!tenantId) {
    logger.warn('[StripePlatformWebhook] checkout.session.completed missing tenant_id', {
      session_id: session.id,
    });
    return;
  }

  // Assign plan only if metadata.plan_code provided AND tenant doesn't already have one
  if (planCode) {
    const { data: existingActive } = await supabase
      .from('tenant_subscriptions')
      .select('id')
      .eq('tenant_id', tenantId)
      .neq('status', 'canceled')
      .limit(1)
      .maybeSingle();

    if (!existingActive) {
      try {
        await assignPlan(supabase, {
          tenant_id: tenantId,
          plan_code: planCode,
          provider_subscription_id: session.subscription || null,
          request_id: requestId,
        });
      } catch (err) {
        // Race: someone else assigned; log and continue to payment recording
        logger.warn('[StripePlatformWebhook] assignPlan failed (may be race)', {
          error: err.message,
          tenant_id: tenantId,
          plan_code: planCode,
        });
      }
    }
  }

  // Record payment if present. Find most recent open invoice for this tenant.
  if (session.payment_intent && session.amount_total) {
    const { data: invoice } = await supabase
      .from('invoices')
      .select('id')
      .eq('tenant_id', tenantId)
      .in('status', ['open', 'draft'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (invoice) {
      await recordPayment(supabase, {
        invoice_id: invoice.id,
        amount_cents: session.amount_total,
        provider_payment_intent_id: session.payment_intent,
        source: 'webhook',
        request_id: requestId,
      });
    } else {
      logger.info('[StripePlatformWebhook] Checkout completed with no matching invoice', {
        tenant_id: tenantId,
        session_id: session.id,
        amount: session.amount_total,
      });
    }
  }
}

/**
 * payment_intent.succeeded — covers subscription renewals and retries.
 * Uses metadata.tenant_id + invoice_id lookup to find target invoice.
 */
async function handlePaymentSucceeded(supabase, event, normalized, requestId) {
  const intent = event.data.object;
  const tenantId = normalized?.tenant_id;
  if (!tenantId) {
    logger.warn('[StripePlatformWebhook] payment_intent.succeeded missing tenant_id', {
      intent_id: intent.id,
    });
    return;
  }

  // Prefer metadata.invoice_id if set; otherwise most recent open invoice
  let invoiceId = intent.metadata?.invoice_id || null;
  if (!invoiceId) {
    const { data: invoice } = await supabase
      .from('invoices')
      .select('id')
      .eq('tenant_id', tenantId)
      .in('status', ['open', 'draft'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    invoiceId = invoice?.id || null;
  }

  if (!invoiceId) {
    logger.info('[StripePlatformWebhook] payment_intent.succeeded: no invoice to attach', {
      tenant_id: tenantId,
      intent_id: intent.id,
    });
    return;
  }

  await recordPayment(supabase, {
    invoice_id: invoiceId,
    amount_cents: intent.amount,
    provider_payment_intent_id: intent.id,
    provider_charge_id: intent.latest_charge || null,
    source: 'webhook',
    request_id: requestId,
  });
}

/**
 * payment_intent.payment_failed — log event, emit PAYMENT_FAILED.
 * Does NOT transition tenant state directly — dunning worker (Phase 2) owns that.
 */
async function handlePaymentFailed(supabase, event, normalized, _requestId) {
  const intent = event.data.object;
  const tenantId = normalized?.tenant_id;
  if (!tenantId) return;

  await logBillingEvent(supabase, {
    tenant_id: tenantId,
    event_type: BILLING_EVENTS.PAYMENT_FAILED,
    source: 'webhook',
    payload: {
      payment_intent_id: intent.id,
      amount_cents: intent.amount,
      failure_code: intent.last_payment_error?.code || null,
      failure_message: intent.last_payment_error?.message || null,
    },
  });
}

/**
 * customer.subscription.updated — fires when a tenant changes their plan via
 * the Stripe Customer Portal, or when Stripe-side status flips (active →
 * past_due, etc.). We locate the local subscription row by
 * provider_subscription_id and sync its status.
 *
 * Plan changes made IN the portal are not mapped to our plan_code here —
 * that's deferred to the dunning worker (Phase 2), which will cross-reference
 * Stripe price IDs to billing_plans.code.
 */
async function handleSubscriptionUpdated(supabase, event, requestId) {
  const stripeSub = event.data.object;
  const providerSubId = stripeSub.id;
  const stripeStatus = stripeSub.status;
  const cancelAtPeriodEnd = stripeSub.cancel_at_period_end === true;

  if (!providerSubId) {
    logger.warn('[StripePlatformWebhook] customer.subscription.updated missing subscription id');
    return;
  }

  const { data: localSub, error: selErr } = await supabase
    .from('tenant_subscriptions')
    .select('id, tenant_id, status, billing_plan_id')
    .eq('provider_subscription_id', providerSubId)
    .maybeSingle();

  if (selErr) throw new Error(`subscription.updated lookup: ${selErr.message}`);
  if (!localSub) {
    logger.info(
      '[StripePlatformWebhook] subscription.updated for unknown provider_subscription_id',
      {
        provider_subscription_id: providerSubId,
      },
    );
    return;
  }

  // Map Stripe statuses (active/past_due/unpaid/canceled/trialing/paused/incomplete)
  // to our statuses (draft/active/past_due/suspended/canceled).
  let nextStatus = localSub.status;
  if (stripeStatus === 'active' || stripeStatus === 'trialing') nextStatus = 'active';
  else if (stripeStatus === 'past_due') nextStatus = 'past_due';
  else if (stripeStatus === 'unpaid' || stripeStatus === 'paused') nextStatus = 'suspended';
  else if (stripeStatus === 'canceled') nextStatus = 'canceled';
  // incomplete / incomplete_expired = pre-activation, leave row alone

  if (nextStatus === localSub.status && !cancelAtPeriodEnd) {
    logger.debug('[StripePlatformWebhook] subscription.updated no-op (status unchanged)', {
      tenant_id: localSub.tenant_id,
      status: stripeStatus,
    });
    return;
  }

  const patch = { status: nextStatus };
  if (nextStatus === 'canceled') patch.canceled_at = new Date().toISOString();

  const { error: updErr } = await supabase
    .from('tenant_subscriptions')
    .update(patch)
    .eq('id', localSub.id);
  if (updErr) throw new Error(`subscription.updated update: ${updErr.message}`);

  await logBillingEvent(supabase, {
    tenant_id: localSub.tenant_id,
    event_type:
      nextStatus === 'canceled'
        ? BILLING_EVENTS.SUBSCRIPTION_CANCELED
        : BILLING_EVENTS.SUBSCRIPTION_RENEWED,
    source: 'webhook',
    payload: {
      subscription_id: localSub.id,
      provider_subscription_id: providerSubId,
      stripe_status: stripeStatus,
      cancel_at_period_end: cancelAtPeriodEnd,
      previous_status: localSub.status,
      new_status: nextStatus,
    },
    request_id: requestId,
  });

  await syncTenantBillingState(supabase, localSub.tenant_id);

  logger.info('[StripePlatformWebhook] Synced subscription from Stripe update', {
    tenant_id: localSub.tenant_id,
    from: localSub.status,
    to: nextStatus,
  });
}

/**
 * customer.subscription.deleted — fires when subscription is canceled
 * (immediately via portal, or at period end after scheduled cancel).
 * Idempotent: if already canceled locally, no-op.
 */
async function handleSubscriptionDeleted(supabase, event, requestId) {
  const stripeSub = event.data.object;
  const providerSubId = stripeSub.id;

  if (!providerSubId) {
    logger.warn('[StripePlatformWebhook] customer.subscription.deleted missing subscription id');
    return;
  }

  const { data: localSub, error: selErr } = await supabase
    .from('tenant_subscriptions')
    .select('id, tenant_id, status')
    .eq('provider_subscription_id', providerSubId)
    .maybeSingle();

  if (selErr) throw new Error(`subscription.deleted lookup: ${selErr.message}`);
  if (!localSub) {
    logger.info(
      '[StripePlatformWebhook] subscription.deleted for unknown provider_subscription_id',
      {
        provider_subscription_id: providerSubId,
      },
    );
    return;
  }

  if (localSub.status === 'canceled') {
    logger.debug('[StripePlatformWebhook] subscription.deleted already canceled (idempotent)', {
      tenant_id: localSub.tenant_id,
    });
    return;
  }

  const { error: updErr } = await supabase
    .from('tenant_subscriptions')
    .update({ status: 'canceled', canceled_at: new Date().toISOString() })
    .eq('id', localSub.id);
  if (updErr) throw new Error(`subscription.deleted update: ${updErr.message}`);

  await logBillingEvent(supabase, {
    tenant_id: localSub.tenant_id,
    event_type: BILLING_EVENTS.SUBSCRIPTION_CANCELED,
    source: 'webhook',
    payload: {
      subscription_id: localSub.id,
      provider_subscription_id: providerSubId,
      previous_status: localSub.status,
      reason: 'stripe_subscription_deleted',
    },
    request_id: requestId,
  });

  await syncTenantBillingState(supabase, localSub.tenant_id);

  logger.info('[StripePlatformWebhook] Synced subscription cancellation from Stripe', {
    tenant_id: localSub.tenant_id,
    provider_subscription_id: providerSubId,
  });
}

// Production default: router built with real dependencies.
export const stripePlatformWebhookRouter = createStripePlatformWebhookRouter();
export default stripePlatformWebhookRouter;
