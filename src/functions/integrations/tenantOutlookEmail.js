/**
 * tenantOutlookEmail
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.5.0';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);

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
        const integrations = await base44.entities.TenantIntegration.filter({
            tenant_id: user.tenant_id,
            integration_type: 'outlook_email',
            is_active: true
        });

        if (integrations.length === 0) {
            return new Response(JSON.stringify({
                error: 'Outlook Email integration not configured for this tenant'
            }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const integration = integrations[0];
        const { action, to, subject, body } = await req.json();

        switch (action) {
            case 'send_email':
                // Simplified example - implement actual Microsoft Graph API calls here
                console.log(`Simulating sending Outlook email to: ${to}`);
                return new Response(JSON.stringify({
                    success: true,
                    message: `Email to "${to}" with subject "${subject}" sent successfully via Outlook.`,
                    message_id: `example_message_id_${Date.now()}`
                }), {
                    headers: { 'Content-Type': 'application/json' }
                });

            case 'list_emails':
                 // Simplified example - implement actual Microsoft Graph API calls here
                return new Response(JSON.stringify({
                    success: true,
                    emails: [
                        {
                            from: 'client@example.com',
                            subject: 'Inquiry about your services',
                            snippet: 'Hello, I would like to learn more about...',
                            received_date: new Date().toISOString()
                        }
                    ]
                }), {
                    headers: { 'Content-Type': 'application/json' }
                });

            default:
                return new Response(JSON.stringify({ error: 'Invalid action' }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                });
        }

    } catch (error) {
        console.error('Error in tenant Outlook Email integration:', error);
        return new Response(JSON.stringify({
            error: 'Internal server error',
            details: error.message
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
});

----------------------------

export default tenantOutlookEmail;
