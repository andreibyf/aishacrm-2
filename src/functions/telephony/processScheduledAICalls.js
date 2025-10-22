/**
 * processScheduledAICalls
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.0';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const now = new Date();
        
        // Find all due, scheduled AI call activities
        const dueActivities = await base44.asServiceRole.entities.Activity.filter({
            type: 'scheduled_ai_call',
            status: 'scheduled',
            due_date: { $lte: now.toISOString().split('T')[0] } 
        });
        
        console.log(`[AICallProcessor] Found ${dueActivities.length} potential call activities.`);

        const results = [];
        for (const activity of dueActivities) {
            // Further filter by time if available
            if (activity.due_time) {
                try {
                    const dueDateTime = new Date(`${activity.due_date}T${activity.due_time}`);
                    if (dueDateTime > now) {
                        continue; // Not yet time to call
                    }
                } catch(e) {
                    console.error(`Invalid date/time for activity ${activity.id}, skipping.`);
                    continue;
                }
            }

            console.log(`[AICallProcessor] Processing activity ID: ${activity.id}`);
            let target = null;
            const log = { timestamp: now.toISOString(), status: 'failed' };
            
            try {
                // 1. Get related entity (Contact or Lead)
                if (activity.related_to === 'contact') {
                    target = await base44.asServiceRole.entities.Contact.get(activity.related_id);
                } else if (activity.related_to === 'lead') {
                    target = await base44.asServiceRole.entities.Lead.get(activity.related_id);
                }

                const phoneNumber = target?.phone || target?.mobile;
                if (!target || !phoneNumber) {
                    throw new Error(`Target ${activity.related_to} not found or has no phone number.`);
                }
                
                const aiConfig = activity.ai_call_config;
                if (!aiConfig) {
                    throw new Error('Activity is missing AI call configuration.');
                }
                
                // 2. Prepare parameters for the universal call function
                const callParams = {
                    provider: aiConfig.ai_provider || 'callfluent',
                    tenantId: activity.tenant_id,
                    callConfig: {
                        prompt: aiConfig.prompt,
                        contact_name: `${target.first_name} ${target.last_name}`,
                        contact_phone: phoneNumber,
                        call_objective: aiConfig.call_objective,
                        max_duration: aiConfig.max_duration,
                        // Pass metadata for tracking
                        tenant_id: activity.tenant_id,
                        activity_id: activity.id,
                    }
                };
                
                // 3. Initiate the call via the universal function
                const { data: callResult, error } = await base44.asServiceRole.functions.invoke('universalAICall', callParams);

                if (error) {
                    throw new Error(`Failed to invoke universalAICall: ${error.message}`);
                }

                const callSid = callResult?.call_sid || callResult?.id || 'N/A';
                log.status = 'success';
                log.message = `Call successfully initiated with SID: ${callSid}.`;
                log.call_sid = callSid;
                
                // 4. Update the activity status
                await base44.asServiceRole.entities.Activity.update(activity.id, {
                    status: 'in-progress',
                    outcome: `AI Call initiated. SID: ${callSid}`,
                    call_sid: callSid,
                    execution_log: [...(activity.execution_log || []), log]
                });
                
                results.push({ activityId: activity.id, status: 'success', callSid });

            } catch (error) {
                console.error(`[AICallProcessor] Failed to process activity ${activity.id}:`, error);
                log.message = error.message;

                await base44.asServiceRole.entities.Activity.update(activity.id, {
                    status: 'failed',
                    outcome: `AI Call failed: ${error.message}`,
                    execution_log: [...(activity.execution_log || []), log]
                });

                results.push({ activityId: activity.id, status: 'failed', error: error.message });
            }
        }
        
        return Response.json({ success: true, message: `Processed ${results.length} scheduled AI calls.`, results });
        
    } catch (error) {
        console.error('[AICallProcessor] Fatal error in function:', error);
        return new Response(JSON.stringify({ success: false, error: error.message }), {
            status: 500, headers: { 'Content-Type': 'application/json' }
        });
    }
});

----------------------------

export default processScheduledAICalls;
