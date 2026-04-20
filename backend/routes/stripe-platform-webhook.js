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
import { resolvePlanByProviderPriceId } from '../lib/billing/planResolver.js';
import { BILLING_ERROR_CODES } from '../lib/billing/errors.js';

/**
 * Pick the correct billing event type for a subscription.updated webhook
 * based on the status transition. Avoids misrepresenting a delinquency
 * (active -> past_due) as a subscription renewal in the audit trail.
 *
 *   * -> canceled                        => SUBSCRIPTION_CANCELED
 *   non-active -> active                  => SUBSCRIPTION_RENEWED
 *                                            (recovery from past_due, re-activation, etc.)
 *   anything else (e.g. active -> past_due,
 *   active -> suspended, past_due -> suspended,
 *   cancel_at_period_end flag flip)       => SUBSCRIPTION_STATUS_CHANGED
 */
export function pickSubscriptionUpdateEventType({ previous, next }) {
  if (next === 'canceled') return BILLING_EVENTS.SUBSCRIPTION_CANCELED;
  if (next === 'active' && previous !== 'active') return BILLING_EVENTS.SUBSCRIPTION_RENEWED;
  return BILLING_EVENTS.SUBSCRIPTION_STATUS_CHANGED;
}

export function createStripePlatformWebhookRouter(opts = {}) {
  const getClient = opts.getSupabaseClient || defaultGetSupabaseClient;
  const stripeAdapter = opts.stripeAdapter || defaultStripeAdapter;

  const router = express.Router();

  router.post(
    '/stripe-platform',
    express.raw({ type: 'application/json', limit: '1mb' }),
    async (req, res) => {
      const signature = req.headers['stripe-signature'];

      const cfg = getPlatformBillingConfig();
      if (!cfg.isConfigured) {
        logger.warn('[StripePlatformWebhook] Received event but platform billing not configured');
        return res.status(503).json({ error: 'Platform billing not configured' });
      }
      // Webhook signature verification needs both the secret key and the
      // webhook secret. Check explicitly here so a missing webhook secret
      // surfaces as 503 (misconfiguration) rather than 400 (invalid signature)
      // — otherwise operators get a misleading error during setup.
      if (!cfg.stripeWebhookSecret) {
        logger.warn(
          '[StripePlatformWebhook] STRIPE_PLATFORM_WEBHOOK_SECRET missing — cannot verify signatures',
        );
        return res.status(503).json({ error: 'Platform billing webhook secret not configured' });
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
        // Only swallow the known idempotency race: if another worker/webhook
        // assigned a plan between our SELECT and the INSERT, assignPlan()
        // re-throws with "tenant already has an active subscription".
        // All other failures (plan deactivated, transient DB error, RLS
        // denial, etc.) MUST propagate so Stripe retries the webhook —
        // otherwise we ack 200 with no local subscription row.
        const isRace = /already has an active subscription/i.test(err.message);
        if (!isRace) {
          logger.error('[StripePlatformWebhook] assignPlan failed (non-race)', {
            error: err.message,
            tenant_id: tenantId,
            plan_code: planCode,
            session_id: session.id,
          });
          throw err;
        }
        logger.warn('[StripePlatformWebhook] assignPlan race ignored', {
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
 * provider_subscription_id and sync BOTH its status AND its billing_plan_id.
 *
 * Plan mapping: Stripe does not guarantee ordering of items.data[], so we
 * scan every item and prefer a role=base match. A role=seat-only match is
 * recorded for audit but does not promote the plan (seat prices are
 * reusable across plans). Ambiguous matches (same price ID used as base on
 * one plan and seat on another) throw CONFIGURATION_ERROR; we log and keep
 * processing -- status syncing is more important than perfect plan mapping
 * in the face of misconfiguration.
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

  // Resolve plan from the subscription's Stripe Price IDs. Stripe does NOT
  // guarantee ordering within `items.data[]` -- a subscription with both a
  // base line and a seat line can have either one first. We therefore scan
  // every item, preferring a role=base match (which is what identifies the
  // plan). A role=seat match is kept only as a "resolved but not promotable"
  // fallback for logging/audit, since the same seat price can be reused
  // across plans and cannot disambiguate on its own.
  //
  // Defensive: tolerate missing items (older webhook payload shapes, test
  // fixtures) by leaving plan mapping untouched.
  let nextPlanId = localSub.billing_plan_id;
  let resolvedPlanCode = null;
  let resolvedPlanRole = null;
  let primaryPriceId = null; // the price id we ultimately used for resolution
  const priceIds = Array.isArray(stripeSub.items?.data)
    ? stripeSub.items.data.map((it) => it?.price?.id).filter((id) => typeof id === 'string' && id)
    : [];

  for (const priceId of priceIds) {
    try {
      const match = await resolvePlanByProviderPriceId(supabase, priceId);
      if (!match?.plan) {
        // Unknown price id -- note it as the "primary" only if nothing
        // resolved yet, so at least some stripe_price_id makes it into the
        // audit payload.
        if (primaryPriceId === null) primaryPriceId = priceId;
        logger.info('[StripePlatformWebhook] subscription.updated: price_id not in billing_plans', {
          provider_subscription_id: providerSubId,
          stripe_price_id: priceId,
        });
        continue;
      }

      // Base match wins unconditionally -- record it and stop scanning.
      if (match.role === 'base') {
        resolvedPlanCode = match.plan.code;
        resolvedPlanRole = 'base';
        primaryPriceId = priceId;
        if (match.plan.id !== localSub.billing_plan_id) {
          nextPlanId = match.plan.id;
        }
        break;
      }

      // Seat match: remember it only if we haven't seen any resolvable
      // match yet. Do NOT promote to nextPlanId -- seat prices are reusable
      // across plans and cannot identify the plan on their own. Continue
      // scanning in case a base match appears in a later item.
      if (resolvedPlanCode === null) {
        resolvedPlanCode = match.plan.code;
        resolvedPlanRole = match.role;
        primaryPriceId = priceId;
      }
    } catch (err) {
      // Ambiguous-match (CONFIGURATION_ERROR) and any other resolver error:
      // log loudly but do NOT abort the webhook. Status sync still runs.
      // Continue scanning remaining items -- a later one might resolve cleanly.
      const isConfig = err?.code === BILLING_ERROR_CODES.CONFIGURATION_ERROR;
      logger[isConfig ? 'error' : 'warn'](
        '[StripePlatformWebhook] subscription.updated: plan resolution failed',
        {
          provider_subscription_id: providerSubId,
          stripe_price_id: priceId,
          error: err.message,
          code: err.code || null,
        },
      );
      if (primaryPriceId === null) primaryPriceId = priceId;
    }
  }

  const planChanged = nextPlanId !== localSub.billing_plan_id;

  if (nextStatus === localSub.status && !cancelAtPeriodEnd && !planChanged) {
    logger.debug('[StripePlatformWebhook] subscription.updated no-op (status + plan unchanged)', {
      tenant_id: localSub.tenant_id,
      status: stripeStatus,
    });
    return;
  }

  const patch = { status: nextStatus };
  if (nextStatus === 'canceled') patch.canceled_at = new Date().toISOString();
  if (planChanged) patch.billing_plan_id = nextPlanId;

  const { error: updErr } = await supabase
    .from('tenant_subscriptions')
    .update(patch)
    .eq('id', localSub.id);
  if (updErr) throw new Error(`subscription.updated update: ${updErr.message}`);

  await logBillingEvent(supabase, {
    tenant_id: localSub.tenant_id,
    event_type: pickSubscriptionUpdateEventType({
      previous: localSub.status,
      next: nextStatus,
    }),
    source: 'webhook',
    payload: {
      subscription_id: localSub.id,
      provider_subscription_id: providerSubId,
      stripe_status: stripeStatus,
      cancel_at_period_end: cancelAtPeriodEnd,
      previous_status: localSub.status,
      new_status: nextStatus,
      stripe_price_id: primaryPriceId,
      resolved_plan_code: resolvedPlanCode,
      resolved_plan_role: resolvedPlanRole,
    },
    request_id: requestId,
  });

  // Separate PLAN_CHANGED event when the billing_plan_id actually moved.
  // Kept distinct from the status-change event so dashboards/audit filtering
  // can surface plan migrations independently of dunning state changes.
  if (planChanged) {
    await logBillingEvent(supabase, {
      tenant_id: localSub.tenant_id,
      event_type: BILLING_EVENTS.PLAN_CHANGED,
      source: 'webhook',
      payload: {
        subscription_id: localSub.id,
        provider_subscription_id: providerSubId,
        previous_plan_id: localSub.billing_plan_id,
        new_plan_id: nextPlanId,
        new_plan_code: resolvedPlanCode,
        stripe_price_id: primaryPriceId,
      },
      request_id: requestId,
    });
  }

  await syncTenantBillingState(supabase, localSub.tenant_id);

  logger.info('[StripePlatformWebhook] Synced subscription from Stripe update', {
    tenant_id: localSub.tenant_id,
    from: localSub.status,
    to: nextStatus,
    plan_changed: planChanged,
    new_plan_code: planChanged ? resolvedPlanCode : null,
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
