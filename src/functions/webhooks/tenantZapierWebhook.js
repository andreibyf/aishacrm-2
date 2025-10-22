/**
 * tenantZapierWebhook
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.5.0';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);

    // Authenticate the user making the request
    if (!(await base44.auth.isAuthenticated())) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
            status: 401, 
            headers: { 'Content-Type': 'application/json' } 
        });
    }

    const user = await base44.auth.me();
    if (!user.tenant_id) {
        return new Response(JSON.stringify({ error: 'User must be assigned to a tenant' }), { 
            status: 403, 
            headers: { 'Content-Type': 'application/json' } 
        });
    }

    try {
        const { event_type, data } = await req.json();

        // Get tenant's Zapier integration settings
        const integrations = await base44.entities.TenantIntegration.filter({
            tenant_id: user.tenant_id,
            integration_type: 'zapier',
            is_active: true
        });

        if (integrations.length === 0) {
            return new Response(JSON.stringify({ 
                message: 'No Zapier integration configured for this tenant' 
            }), { 
                status: 200, 
                headers: { 'Content-Type': 'application/json' } 
            });
        }

        const integration = integrations[0];
        const { webhook_url, api_key } = integration.api_credentials;

        // Prepare webhook payload with tenant context
        const payload = {
            tenant_id: user.tenant_id,
            event_type: event_type,
            timestamp: new Date().toISOString(),
            data: data
        };

        // Send to tenant's Zapier webhook
        const headers = {
            'Content-Type': 'application/json'
        };

        if (api_key) {
            headers['Authorization'] = `Bearer ${api_key}`;
        }

        const response = await fetch(webhook_url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`Zapier webhook failed: ${response.status} ${response.statusText}`);
        }

        // Update integration sync status
        await base44.entities.TenantIntegration.update(integration.id, {
            last_sync: new Date().toISOString(),
            sync_status: 'connected',
            error_message: null
        });

        return new Response(JSON.stringify({
            success: true,
            message: 'Webhook sent to Zapier successfully'
        }), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Error sending Zapier webhook:', error);

        // Update integration with error status
        try {
            const integrations = await base44.entities.TenantIntegration.filter({
                tenant_id: user.tenant_id,
                integration_type: 'zapier',
                is_active: true
            });

            if (integrations.length > 0) {
                await base44.entities.TenantIntegration.update(integrations[0].id, {
                    sync_status: 'error',
                    error_message: error.message
                });
            }
        } catch (updateError) {
            console.error('Error updating integration status:', updateError);
        }

        return new Response(JSON.stringify({ 
            error: 'Failed to send webhook',
            details: error.message 
        }), { 
            status: 500, 
            headers: { 'Content-Type': 'application/json' } 
        });
    }
});

----------------------------

export default tenantZapierWebhook;
