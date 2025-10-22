/**
 * incomingWebhook
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.0';

// Helper to find a unique record
async function findUniqueRecord(entityClient, findCriteria, tenant_id) {
    if (findCriteria.first_name && findCriteria.last_name) {
        const filters = { tenant_id, first_name: findCriteria.first_name, last_name: findCriteria.last_name };
        if (findCriteria.email) {
            const byEmail = await entityClient.filter({ ...filters, email: findCriteria.email });
            if (byEmail.length === 1) return byEmail[0];
            if (byEmail.length > 1) throw new Error(`Multiple records found for email: ${findCriteria.email}`);
        }
        if (findCriteria.phone) {
            const byPhone = await entityClient.filter({ ...filters, phone: findCriteria.phone });
            if (byPhone.length === 1) return byPhone[0];
            if (byPhone.length > 1) throw new Error(`Multiple records found for phone: ${findCriteria.phone}`);
        }
    }
    if (findCriteria.name && entityClient.entityName === 'Account') {
         const byName = await entityClient.filter({ tenant_id, name: findCriteria.name });
         if (byName.length === 1) return byName[0];
         if (byName.length > 1) throw new Error(`Multiple accounts found for name: ${findCriteria.name}`);
    }
    return null;
}

// This function now contains the core logic, to be called *after* security is confirmed.
async function handleWebhook(req) {
    const base44 = createClientFromRequest(req);
    const serviceRoleClient = base44.asServiceRole;

    try {
        const ALLOWED_ENTITIES = {
            contact: 'Contact',
            lead: 'Lead',
            account: 'Account',
            activity: 'Activity'
        };

        const payload = await req.json();

        if (payload.source === 'qa_runner' && payload.test === true) {
            return new Response(JSON.stringify({ status: 'success', message: 'QA Test Ping Received' }), { status: 200 });
        }

        const { entity_type, tenant_id, action, record_id, record_data, find_criteria } = payload;

        if (!entity_type || !ALLOWED_ENTITIES[entity_type.toLowerCase()]) {
            return new Response(JSON.stringify({ error: 'Invalid or missing entity_type' }), { status: 400 });
        }
        if (!tenant_id) {
            return new Response(JSON.stringify({ error: 'Missing tenant_id' }), { status: 400 });
        }
        if (!action || !['create', 'update'].includes(action)) {
            return new Response(JSON.stringify({ error: 'Invalid or missing action. Must be "create" or "update".' }), { status: 400 });
        }
        if (!record_data || typeof record_data !== 'object') {
            return new Response(JSON.stringify({ error: 'Missing or invalid record_data' }), { status: 400 });
        }

        const entityName = ALLOWED_ENTITIES[entity_type.toLowerCase()];
        const entityClient = serviceRoleClient.entities[entityName];
        
        let result;
        let existingRecord = null;

        if (action === 'update') {
            if (record_id) {
                existingRecord = await entityClient.get(record_id);
            } else if (find_criteria) {
                existingRecord = await findUniqueRecord(entityClient, find_criteria, tenant_id);
            }

            if (existingRecord) {
                result = await entityClient.update(existingRecord.id, record_data);
                return new Response(JSON.stringify({ status: 'success', action: 'updated', id: result.id }), { status: 200 });
            } else {
                const dataToCreate = { ...record_data, tenant_id };
                result = await entityClient.create(dataToCreate);
                return new Response(JSON.stringify({ status: 'success', action: 'created', id: result.id }), { status: 201 });
            }

        } else if (action === 'create') {
            const dataToCreate = { ...record_data, tenant_id };
            result = await entityClient.create(dataToCreate);
            return new Response(JSON.stringify({ status: 'success', action: 'created', id: result.id }), { status: 201 });
        }

        return new Response(JSON.stringify({ error: 'Unhandled webhook action or state' }), { status: 400 });
        
    } catch (error) {
        console.error('Incoming Webhook Business Logic Error:', error);
        return new Response(JSON.stringify({ error: 'An error occurred during webhook processing', details: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}


// The main server function now ONLY handles security.
Deno.serve(async (req) => {
    try {
        const apiKey = req.headers.get('x-api-key');
        if (!apiKey) {
            return new Response(JSON.stringify({ error: "API key is missing" }), { status: 401, headers: { "Content-Type": "application/json" } });
        }

        const base44 = createClientFromRequest(req);
        const serviceRoleClient = base44.asServiceRole;
        const keys = await serviceRoleClient.entities.ApiKey.filter({ key_value: apiKey, is_active: true });

        if (keys.length === 0) {
            return new Response(JSON.stringify({ error: "Invalid or inactive API key" }), { status: 403, headers: { "Content-Type": "application/json" } });
        }
        
        return await handleWebhook(req.clone());

    } catch (error) {
        console.error('Incoming Webhook Security Error:', error);
        return new Response(JSON.stringify({ error: 'A critical security error occurred', details: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
});

----------------------------

export default incomingWebhook;
