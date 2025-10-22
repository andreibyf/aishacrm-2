/**
 * tenantOutlookCalendar
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
            integration_type: 'outlook_calendar',
            is_active: true
        });

        if (integrations.length === 0) {
            return new Response(JSON.stringify({
                error: 'Outlook Calendar integration not configured for this tenant'
            }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const integration = integrations[0];
        const { action, title, start_time, end_time, attendees } = await req.json();

        switch (action) {
            case 'create_event':
                 // Simplified example - implement actual Microsoft Graph API calls here
                return new Response(JSON.stringify({
                    success: true,
                    message: `Event "${title}" created successfully in Outlook Calendar.`,
                    event_id: `example_event_id_${Date.now()}`,
                    event_url: 'https://outlook.live.com/calendar/0/deeplink/read'
                }), {
                    headers: { 'Content-Type': 'application/json' }
                });

            case 'list_events':
                // Simplified example - implement actual Microsoft Graph API calls here
                return new Response(JSON.stringify({
                    success: true,
                    events: [
                        {
                            title: 'Follow-up with Acme Corp',
                            start: new Date().toISOString(),
                            end: new Date(Date.now() + 3600 * 1000).toISOString(),
                            url: 'https://outlook.live.com/calendar/0/deeplink/read'
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
        console.error('Error in tenant Outlook Calendar integration:', error);
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

export default tenantOutlookCalendar;
