/**
 * n8nUpdateContact
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.5.0';

// Helper function to map incoming data fields to CRM schema fields
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
    // 1. Accept POST requests only
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
        // 2. Validate the N8N_API_KEY for security
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

        const { contactId, fieldMap, data } = await req.json();

        if (!contactId || !fieldMap || !data) {
             return new Response(JSON.stringify({
                status: 'error',
                message: 'Request body must include "contactId", "fieldMap", and "data" objects.'
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        // 3. Map the incoming data to our schema
        const dataToUpdate = mapData(fieldMap, data);

        if (Object.keys(dataToUpdate).length === 0) {
            return new Response(JSON.stringify({
                status: 'success',
                message: 'No updatable fields provided after mapping. Nothing to update.',
                data: null
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        const base44 = createClientFromRequest(req);
        
        // Check if the contact exists before attempting an update
        const existingContact = await base44.asServiceRole.entities.Contact.get(contactId);
        if (!existingContact) {
             return new Response(JSON.stringify({
                status: 'error',
                message: `Contact with ID ${contactId} not found.`
            }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        // 4. Update the contact with all mapped data
        const updatedContact = await base44.asServiceRole.entities.Contact.update(contactId, dataToUpdate);

        // 5. Return success response
        return new Response(JSON.stringify({
            status: 'success',
            message: 'Contact updated successfully',
            data: updatedContact
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Error updating contact via n8n:', error);
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

export default n8nUpdateContact;
