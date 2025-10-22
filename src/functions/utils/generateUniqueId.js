/**
 * generateUniqueId
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    try {
        const { entity_type, tenant_id } = await req.json();

        if (!entity_type || !tenant_id) {
            return Response.json({ error: "entity_type and tenant_id are required" }, { status: 400 });
        }

        const base44 = createClientFromRequest(req).asServiceRole;

        const prefixes = {
            Lead: 'LEAD',
            Contact: 'CONT',
            Account: 'ACCT'
        };

        if (!prefixes[entity_type]) {
            return Response.json({ error: `Invalid entity_type. Must be one of: ${Object.keys(prefixes).join(', ')}` }, { status: 400 });
        }

        const prefix = prefixes[entity_type];
        const entityName = entity_type;

        try {
            // CRITICAL FIX: Get records for THIS TENANT ONLY
            const allRecords = await base44.entities[entityName].filter({
                tenant_id: tenant_id
            });

            // Filter for records with unique_id starting with our prefix FOR THIS TENANT
            const existingUniqueIds = allRecords
                .filter(record => record.unique_id && record.unique_id.startsWith(`${prefix}-`))
                .map(record => record.unique_id)
                .sort();

            let nextIdNumber = 1;
            
            if (existingUniqueIds.length > 0) {
                // Extract numbers from existing IDs
                const existingNumbers = existingUniqueIds
                    .map(id => {
                        const parts = id.split('-');
                        if (parts.length >= 2) {
                            const number = parseInt(parts[parts.length - 1]);
                            return isNaN(number) ? 0 : number;
                        }
                        return 0;
                    })
                    .filter(num => num > 0);

                if (existingNumbers.length > 0) {
                    nextIdNumber = Math.max(...existingNumbers) + 1;
                }
            }

            // Generate unique_id: PREFIX-NNNNNN (scoped to tenant)
            const unique_id = `${prefix}-${String(nextIdNumber).padStart(6, '0')}`;

            console.log(`[generateUniqueId] Generated for ${entity_type} in tenant ${tenant_id}: ${unique_id}`);

            return Response.json({ unique_id: unique_id });
            
        } catch (queryError) {
            console.error('Query error in generateUniqueId:', queryError);
            
            // Fallback: Generate ID based on timestamp if query fails
            const timestamp = Date.now().toString().slice(-6);
            const unique_id = `${prefix}-${timestamp}`;
            
            return Response.json({ unique_id: unique_id });
        }

    } catch (error) {
        console.error('Error generating unique ID:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});

----------------------------

export default generateUniqueId;
