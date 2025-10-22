/**
 * createActivityWebhook
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.5.0';

// This is a dedicated webhook to create an Activity with a simpler, flattened payload.

Deno.serve(async (req) => {
    // 1. Security First: Only allow POST requests
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // 2. Authentication: Check for the n8n API key
    const n8nApiKey = Deno.env.get('N8N_API_KEY');
    const providedApiKey = req.headers.get('x-api-key');
    if (!n8nApiKey || !providedApiKey || providedApiKey !== n8nApiKey) {
        return new Response(JSON.stringify({ error: 'Unauthorized: Invalid or missing API key.' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        });
    }
    
    try {
        const base44 = createClientFromRequest(req);
        const activityData = await req.json();

        // 3. Validation: Ensure required fields are present in the flattened payload
        const { tenant_id, type, subject, due_date } = activityData;
        if (!tenant_id || !type || !subject || !due_date) {
            return new Response(JSON.stringify({ 
                error: 'Missing required fields.',
                message: 'The payload must include tenant_id, type, subject, and due_date.'
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // 4. Create the Activity using the service role for backend operations
        const newActivity = await base44.asServiceRole.entities.Activity.create(activityData);

        // 5. Respond with success
        return new Response(JSON.stringify({ 
            success: true, 
            message: 'Activity created successfully.',
            activity_id: newActivity.id 
        }), {
            status: 201, // 201 Created is the standard for successful creation
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('Error in createActivityWebhook:', error);
        return new Response(JSON.stringify({ 
            error: 'Internal Server Error', 
            details: error.message 
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
});

----------------------------

export default createActivityWebhook;
