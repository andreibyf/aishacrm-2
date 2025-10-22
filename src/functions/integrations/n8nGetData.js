/**
 * n8nGetData
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.5.0';

Deno.serve(async (req) => {
    if (req.method !== 'GET') {
        return new Response(JSON.stringify({
            status: 'error',
            message: 'Only GET requests are allowed'
        }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        // Validate API key
        const apiKey = req.headers.get('x-api-key') || req.headers.get('Authorization')?.replace('Bearer ', '');
        const expectedApiKey = Deno.env.get('N8N_API_KEY');

        if (!apiKey || apiKey !== expectedApiKey) {
            return new Response(JSON.stringify({
                status: 'error',
                message: 'Invalid or missing API key'
            }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const url = new URL(req.url);
        const entity = url.searchParams.get('entity'); // contacts, leads, accounts, etc.
        const limit = parseInt(url.searchParams.get('limit') || '10');
        const email = url.searchParams.get('email'); // For finding specific records

        if (!entity) {
            return new Response(JSON.stringify({
                status: 'error',
                message: 'Entity parameter is required (contacts, leads, accounts, opportunities, activities)'
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const base44 = createClientFromRequest(req);
        let data;

        // Map entity names to proper case
        const entityMap = {
            contacts: 'Contact',
            leads: 'Lead', 
            accounts: 'Account',
            opportunities: 'Opportunity',
            activities: 'Activity'
        };

        const entityName = entityMap[entity.toLowerCase()];
        if (!entityName) {
            return new Response(JSON.stringify({
                status: 'error',
                message: 'Invalid entity. Use: contacts, leads, accounts, opportunities, activities'
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Get data with optional filtering
        if (email) {
            // Filter by email
            data = await base44.asServiceRole.entities[entityName].filter({ email }, '-created_date', limit);
        } else {
            // Get recent records
            data = await base44.asServiceRole.entities[entityName].list('-created_date', limit);
        }

        return new Response(JSON.stringify({
            status: 'success',
            message: `Retrieved ${data.length} ${entity}`,
            data: data
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Error retrieving data via n8n:', error);
        return new Response(JSON.stringify({
            status: 'error',
            message: 'Internal server error',
            details: error.message
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
});

----------------------------

export default n8nGetData;
