/**
 * n8nCreateLead
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
        
        // Map the incoming data to our lead schema
        const leadData = mapData(fieldMap, data);

        // Validate required CRM fields after mapping
        const requiredFields = ['first_name', 'last_name', 'email'];
        for (const field of requiredFields) {
            if (!leadData[field]) {
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

        // Prepare lead data with defaults
        const newLead = {
            first_name: leadData.first_name,
            last_name: leadData.last_name,
            email: leadData.email,
            phone: leadData.phone || '',
            company: leadData.company || '',
            job_title: leadData.job_title || '',
            source: leadData.source || 'n8n_automation',
            status: leadData.status || 'new',
            score: leadData.score || 50,
            score_reason: leadData.score_reason || 'Created via n8n automation',
            ai_action: leadData.ai_action || 'follow_up',
            last_contacted: leadData.last_contacted || new Date().toISOString(),
            next_action: leadData.next_action || 'Initial contact and qualification',
            address_1: leadData.address_1 || '',
            city: leadData.city || '',
            state: leadData.state || '',
            zip: leadData.zip || '',
            country: leadData.country || '',
            notes: leadData.notes || 'Lead created via n8n automation',
            estimated_value: leadData.estimated_value || null,
            tags: leadData.tags || ['n8n', 'automation'],
            tenant_id: tenant[0].id
        };

        const createdLead = await base44.asServiceRole.entities.Lead.create(newLead);

        return new Response(JSON.stringify({
            status: 'success',
            message: 'Lead created successfully',
            data: {
                id: createdLead.id,
                ...createdLead
            }
        }), {
            status: 201,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Error creating lead via n8n:', error);
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

export default n8nCreateLead;
