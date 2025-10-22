/**
 * handleStripeWebhook
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.5.0';
import Stripe from 'npm:stripe';

Deno.serve(async (req) => {
  const stripe = new Stripe(Deno.env.get("STRIPE_API_KEY"), {
    apiVersion: "2023-10-16",
  });

  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  
  const base44 = createClientFromRequest(req);
  const signature = req.headers.get("stripe-signature");
  const body = await req.text();
  
  let event;
  try {
    event = await stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    return new Response(err.message, { status: 400 });
  }

  const { SubscriptionPlan, Subscription } = base44.asServiceRole.entities;

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const { tenant_id } = session.metadata;

        const plan = await SubscriptionPlan.filter({ stripe_price_id: session.line_items.data[0].price.id });
        if (!plan.length) throw new Error(`Plan not found for price ID: ${session.line_items.data[0].price.id}`);

        await Subscription.create({
          tenant_id: tenant_id,
          plan_id: plan[0].id,
          stripe_customer_id: session.customer,
          stripe_subscription_id: session.subscription,
          status: 'active',
          current_period_end: new Date(session.expires_at * 1000).toISOString(),
          started_at: new Date().toISOString(),
        });
        break;
      }
      
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const subRecord = await Subscription.filter({ stripe_subscription_id: subscription.id });
        if (!subRecord.length) break;

        const plan = await SubscriptionPlan.filter({ stripe_price_id: subscription.items.data[0].price.id });

        await Subscription.update(subRecord[0].id, {
          status: subscription.status,
          plan_id: plan.length ? plan[0].id : subRecord[0].plan_id,
          current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          cancel_at_period_end: subscription.cancel_at_period_end,
        });
        break;
      }
      
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const subRecord = await Subscription.filter({ stripe_subscription_id: subscription.id });
        if (subRecord.length) {
          await Subscription.update(subRecord[0].id, {
            status: 'canceled',
            canceled_at: new Date().toISOString(),
          });
        }
        break;
      }

      default:
        console.log(`Unhandled event type ${event.type}`);
    }
  } catch (error) {
    console.error("Webhook handler error:", error);
    return new Response(JSON.stringify({ error: 'Webhook handler failed.' }), { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
});


----------------------------

export default handleStripeWebhook;
