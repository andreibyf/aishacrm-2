/**
 * executeAIPlan
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import { parseDate } from 'npm:chrono-node@2.7.2';

// --- Utility Functions ---

async function findRelatedRecord(base44, entityType, query, tenantId) {
    // ... implementation details ...
    // This is a simplified search logic.
    const records = await base44.asServiceRole.entities[entityType].filter({ tenant_id: tenantId });
    const searchTerms = query.toLowerCase().split(/\s+/);

    for (const record of records) {
        const fullName = `${record.first_name || ''} ${record.last_name || ''}`.toLowerCase();
        if (searchTerms.every(term => fullName.includes(term))) {
            return record;
        }
    }
    return null;
}

function parseWhenString(whenStr) {
    if (!whenStr) return {};
    const parsedDate = parseDate(whenStr);
    if (!parsedDate) return {};

    const year = parsedDate.getFullYear();
    const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
    const day = String(parsedDate.getDate()).padStart(2, '0');
    
    const hours = String(parsedDate.getHours()).padStart(2, '0');
    const minutes = String(parsedDate.getMinutes()).padStart(2, '0');

    return {
        due_date: `${year}-${month}-${day}`,
        due_time: `${hours}:${minutes}`
    };
}


// --- Main Execution Logic ---

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    const { plan, tenant_id, current_user_email } = await req.json();
    const startTime = Date.now();
    let responseData = null;
    let status = 'success';
    let errorMessage = null;

    const uiActions = [];
    let summaryMessage = "I've completed your request.";

    try {
        if (!plan || !Array.isArray(plan)) {
            throw new Error("Invalid 'plan' provided. It must be an array of actions.");
        }
        if (!tenant_id) {
            throw new Error("'tenant_id' is required for execution context.");
        }
        if (!current_user_email) {
            throw new Error("'current_user_email' is required for ownership context.");
        }
        
        let createdRecordId = null;
        let createdEntityType = null;

        for (const step of plan) {
            const action = Object.keys(step)[0];
            const params = step[action];

            switch (action) {
                case 'navigate':
                    uiActions.push({ action: 'navigate', pageName: params.pageName });
                    summaryMessage = `Navigating to ${params.pageName}.`;
                    break;

                case 'create_record': {
                    const { entity, data } = params;
                    const finalData = {
                        ...data,
                        tenant_id,
                        assigned_to: current_user_email,
                    };
                    const newRecord = await base44.asServiceRole.entities[entity].create(finalData);
                    createdRecordId = newRecord.id;
                    createdEntityType = entity;
                    summaryMessage = `I've created the new ${entity}: ${data.first_name || data.name}.`;
                    break;
                }
                
                case 'create_activity': {
                    const { subject, type, related_to_query, when } = params;
                    const recordData = {
                        subject,
                        type,
                        tenant_id,
                        assigned_to: current_user_email,
                        status: 'scheduled',
                    };

                    // Handle date/time
                    Object.assign(recordData, parseWhenString(when));

                    // Handle linking
                    if (related_to_query) {
                        for (const entity of ['Contact', 'Lead', 'Account']) {
                            const relatedRecord = await findRelatedRecord(base44, entity, related_to_query, tenant_id);
                            if (relatedRecord) {
                                recordData.related_to = entity.toLowerCase();
                                recordData.related_id = relatedRecord.id;
                                break;
                            }
                        }
                    }
                    
                    const newActivity = await base44.asServiceRole.entities.Activity.create(recordData);
                    createdRecordId = newActivity.id;
                    createdEntityType = 'Activity';
                    summaryMessage = `I've scheduled the activity: ${subject}.`;
                    break;
                }

                default:
                    console.warn(`Unsupported action type: ${action}`);
            }
        }
        
        // If a record was created, add a UI action to view its details
        if (createdRecordId && createdEntityType) {
            const newRecord = await base44.asServiceRole.entities[createdEntityType].get(createdRecordId);
            uiActions.push({
                action: 'view-record-details',
                entityType: createdEntityType,
                record: newRecord
            });
        }

        responseData = { summaryMessage, uiActions };
        return new Response(JSON.stringify(responseData), {
            headers: { "Content-Type": "application/json" },
        });

    } catch (error) {
        status = 'error';
        errorMessage = error.message;
        responseData = { summaryMessage: `I encountered an error: ${errorMessage}`, uiActions: [] };
        return new Response(JSON.stringify({ error: errorMessage }), {
            headers: { "Content-Type": "application/json" },
            status: 500,
        });
    } finally {
        const endTime = Date.now();
        const log = {
            function_name: 'executeAIPlan',
            response_time_ms: endTime - startTime,
            status: status,
            error_message: errorMessage,
            payload: { plan, tenant_id, current_user_email },
            response: responseData,
        };
        // Fire-and-forget the log creation
        base44.asServiceRole.entities.PerformanceLog.create(log).catch(e => console.error("Failed to create performance log:", e));
    }
});

----------------------------

export default executeAIPlan;
