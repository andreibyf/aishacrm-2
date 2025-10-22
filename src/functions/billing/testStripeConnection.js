/**
 * testStripeConnection
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.0';
import Stripe from 'npm:stripe@15.9.0';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }

        const { apiKey } = await req.json();

        if (!apiKey || typeof apiKey !== 'string' || !apiKey.startsWith('sk_')) {
            return Response.json({ success: false, message: 'Invalid API key format provided.' }, { status: 400 });
        }

        try {
            const stripe = new Stripe(apiKey);
            // Make a simple, read-only API call to verify the key
            await stripe.customers.list({ limit: 1 });

            return Response.json({ success: true, message: 'Connection successful!' });

        } catch (stripeError) {
            console.error("Stripe API error:", stripeError);
            let errorMessage = "An error occurred while connecting to Stripe.";
            if (stripeError.code === 'api_key_invalid') {
                errorMessage = "The provided API key is invalid or expired.";
            } else if (stripeError.message) {
                errorMessage = stripeError.message;
            }

            return Response.json({ success: false, message: errorMessage }, { status: 400 });
        }

    } catch (error) {
        console.error("Main function error:", error);
        return Response.json({ success: false, message: error.message || 'An internal server error occurred.' }, { status: 500 });
    }
});

----------------------------

export default testStripeConnection;
