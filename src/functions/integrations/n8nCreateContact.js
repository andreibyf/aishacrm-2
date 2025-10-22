/**
 * n8nCreateContact
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.5.0';

// This function maps incoming data to the CRM schema using a provided map.
function mapData(fieldMap, sourceData) {
    const mappedData = {};
    for (const [crmField, sourceField] of Object.entries(fieldMap)) {
        if (sourceData[sourceField] !== undefined) {
            mappedData[crmField] = sourceData[sourceField];
        }
    }
    return mappedData;
}

Deno.serve(async (req) => {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({
            status: 'error',
            message: 'Only POST requests are allowed'
        }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        // Validate API key from headers
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

        // Parse request body for the new structure
        const { fieldMap, data } = await req.json();

        if (!fieldMap || !data) {
             return new Response(JSON.stringify({
                status: 'error',
                message: 'Request body must include "fieldMap" and "data" objects.'
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        // Map the incoming data to our contact schema
        const contactData = mapData(fieldMap, data);

        // Validate required CRM fields after mapping
        const requiredFields = ['first_name', 'last_name', 'email'];
        for (const field of requiredFields) {
            if (!contactData[field]) {
                return new Response(JSON.stringify({
                    status: 'error',
                    message: `Mapping resulted in missing required CRM field: ${field}`
                }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        }
        
        const base44 = createClientFromRequest(req);
        
        const tenant = await base44.asServiceRole.entities.Tenant.list('',1)
        
        if(!tenant[0]){
            return new Response(JSON.stringify({
                status: 'error',
                message: `No Tenant Found`
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Prepare contact data with defaults
        const newContact = {
            first_name: contactData.first_name,
            last_name: contactData.last_name,
            email: contactData.email,
            phone: contactData.phone || '',
            mobile: contactData.mobile || '',
            job_title: contactData.job_title || '',
            department: contactData.department || '',
            account_id: contactData.account_id || null,
            lead_source: contactData.lead_source || 'n8n_automation',
            status: contactData.status || 'prospect',
            address_1: contactData.address_1 || '',
            city: contactData.city || '',
            state: contactData.state || '',
            zip: contactData.zip || '',
            country: contactData.country || '',
            notes: contactData.notes || 'Contact created via n8n automation',
            score: contactData.score || 50,
            score_reason: contactData.score_reason || 'Created via n8n automation',
            ai_action: contactData.ai_action || 'follow_up',
            last_contacted: contactData.last_contacted || new Date().toISOString(),
            next_action: contactData.next_action || 'Initial contact',
            tags: contactData.tags || ['n8n', 'automation'],
            tenant_id: tenant[0].id
        };

        // Create the contact using service role
        const createdContact = await base44.asServiceRole.entities.Contact.create(newContact);

        return new Response(JSON.stringify({
            status: 'success',
            message: 'Contact created successfully',
            data: {
                id: createdContact.id,
                ...createdContact
            }
        }), {
            status: 201,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Error creating contact via n8n:', error);
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

export default n8nCreateContact;
