/**
 * createCheckoutSession
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.0';
import Stripe from 'npm:stripe@15.10.0';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  
  if (!(await base44.auth.isAuthenticated())) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), 
      { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  
  try {
    const { priceId, tenantId } = await req.json();
    if (!priceId || !tenantId) {
      return new Response(JSON.stringify({ error: 'priceId and tenantId are required.' }), 
        { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    
    // Fetch Stripe key from superadmin user settings
    const [superAdmin] = await base44.asServiceRole.entities.User.filter({ role: 'superadmin' }, '', 1);
    if (!superAdmin?.system_stripe_settings?.secret_key) {
      throw new Error("System Stripe configuration not found.");
    }
    const stripeApiKey = superAdmin.system_stripe_settings.secret_key;

    const stripe = new Stripe(stripeApiKey, {
      apiVersion: "2023-10-16",
    });
    
    const user = await base44.auth.me();
    
    const checkoutSession = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${Deno.env.get("BASE44_APP_URL")}/Settings?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${Deno.env.get("BASE44_APP_URL")}/Settings`,
      customer_email: user.email,
      metadata: {
        tenant_id: tenantId,
        user_email: user.email
      },
    });

    return new Response(JSON.stringify({ sessionId: checkoutSession.id, url: checkoutSession.url }), 
      { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Error creating checkout session:', error);
    return new Response(JSON.stringify({ error: error.message }), 
      { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});


----------------------------

export default createCheckoutSession;
