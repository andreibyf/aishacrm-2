/**
 * dispatchWebhook
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.5.0';
// Removed: import { createHmac } from 'node:crypto'; // HMAC not used in new outline

// Removed: const N8N_SHARED_SECRET = Deno.env.get('N8N_SHARED_SECRET'); // Shared secret not used in new outline

Deno.serve(async (req) => {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const base44 = createClientFromRequest(req).asServiceRole;
        
        // Removed user authentication as the service role client is used
        // if (!(await base44.auth.isAuthenticated())) {
        //     return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        //         status: 401,
        //         headers: { 'Content-Type': 'application/json' }
        //     });
        // }
        // Removed: const user = await base44.auth.me();

        const requestBody = await req.json();
        const { eventName, payload } = requestBody;

        if (!eventName || !payload) {
            return new Response(JSON.stringify({ error: 'Missing eventName or payload' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        console.log(`[Webhook Dispatch] Processing ${eventName} event`);

        // Get all active webhooks that match this event
        const matchingWebhooks = await base44.entities.Webhook.filter({
            event_name: eventName,
            is_active: true
        });

        if (matchingWebhooks.length === 0) {
            console.log(`[Webhook Dispatch] No active webhooks found for event: ${eventName}`);
            return Response.json({ 
                success: true, 
                message: `No webhooks configured for ${eventName}`,
                webhooks_triggered: 0 
            });
        }

        // Enhanced payload with relationship data
        let enhancedPayload = { ...payload };

        // If this is a contact or lead update that involves account linking
        if ((eventName === 'contact.updated' || eventName === 'lead.updated') && payload.account_id) {
            try {
                // Fetch the associated account data
                const account = await base44.entities.Account.get(payload.account_id);
                if (account) {
                    enhancedPayload.associated_account = {
                        id: account.id,
                        name: account.name,
                        type: account.type,
                        industry: account.industry
                    };
                }
            } catch (error) {
                console.warn(`[Webhook Dispatch] Could not fetch associated account ${payload.account_id}:`, error);
            }
        }

        // If this is an account update, include related contacts count
        if (eventName === 'account.updated') {
            try {
                // Ensure payload.id exists before filtering
                if (payload.id) {
                    const relatedContacts = await base44.entities.Contact.filter({
                        account_id: payload.id
                    });
                    const relatedLeads = await base44.entities.Lead.filter({
                        account_id: payload.id
                    });
                    enhancedPayload.relationships = {
                        contacts_count: relatedContacts.length,
                        leads_count: relatedLeads.length
                    };
                }
            } catch (error) {
                console.warn(`[Webhook Dispatch] Could not fetch relationship counts for account ${payload.id}:`, error);
            }
        }

        const webhookPromises = matchingWebhooks.map(async (webhook) => {
            try {
                console.log(`[Webhook Dispatch] Dispatching ${eventName} to: ${webhook.target_url}`);
                
                // Removed HMAC signature generation as per outline
                const headers = {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Ai-SHA-CRM-Webhook/1.0'
                };

                const response = await fetch(webhook.target_url, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        event: eventName,
                        timestamp: new Date().toISOString(),
                        // Removed user object from webhook payload
                        data: enhancedPayload
                    }),
                    signal: AbortSignal.timeout(10000) // 10 second timeout
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                return { 
                    webhook_id: webhook.id, 
                    status: 'success',
                    target_url: webhook.target_url
                };
            } catch (error) {
                console.error(`[Webhook Dispatch] Webhook delivery failed for ${webhook.target_url}:`, error.message);
                return { 
                    webhook_id: webhook.id, 
                    status: 'failed', 
                    error: error.message,
                    target_url: webhook.target_url
                };
            }
        });

        const results = await Promise.all(webhookPromises);
        const successful = results.filter(r => r.status === 'success').length;
        const failed = results.filter(r => r.status === 'failed').length;

        return Response.json({
            success: true,
            message: `Webhooks dispatched: ${successful} successful, ${failed} failed`,
            webhooks_triggered: matchingWebhooks.length,
            results: results
        });

    } catch (error) {
        console.error('[Webhook Dispatch] Fatal error:', error);
        return Response.json({ 
            error: 'Failed to dispatch webhooks',
            details: error.message 
        }, { status: 500 });
    }
});


----------------------------

export default dispatchWebhook;
