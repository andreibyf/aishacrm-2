/**
 * manualTriggerAICalls
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.0';

async function validateApiKey(base44, providedKey) {
    if (!providedKey) {
        return { valid: false, reason: 'No API key provided' };
    }
    
    try {
        const apiKeys = await base44.asServiceRole.entities.ApiKey.filter({
            key_value: providedKey,
            is_active: true
        });
        
        if (apiKeys.length > 0) {
            const apiKey = apiKeys[0];
            
            await base44.asServiceRole.entities.ApiKey.update(apiKey.id, {
                last_used: new Date().toISOString(),
                usage_count: (apiKey.usage_count || 0) + 1
            });
            
            return { 
                valid: true, 
                keyName: apiKey.key_name,
                keyId: apiKey.id 
            };
        }
        
        return { valid: false, reason: 'Invalid API key' };
        
    } catch (error) {
        console.error('Error validating API key:', error);
        return { valid: false, reason: 'API key validation error' };
    }
}

Deno.serve(async (req) => {
    // Add CORS headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
        'Content-Type': 'application/json'
    };

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 200, headers });
    }

    // Only allow POST requests
    if (req.method !== 'POST') {
        return Response.json({ 
            error: 'Method not allowed',
            message: 'This endpoint only accepts POST requests'
        }, { status: 405, headers });
    }

    try {
        const base44 = createClientFromRequest(req);
        
        // Validate API key first
        const providedApiKey = req.headers.get('x-api-key');
        console.log(`[Auth] API key provided: ${providedApiKey ? 'Yes' : 'No'}`);
        
        const keyValidation = await validateApiKey(base44, providedApiKey);
        
        if (!keyValidation.valid) {
            console.warn(`[Auth] Unauthorized API call: ${keyValidation.reason}`);
            return Response.json({ 
                error: 'Unauthorized',
                message: keyValidation.reason
            }, { status: 401, headers });
        }
        
        console.log(`[Auth] Authorized request from: ${keyValidation.keyName}`);

        // Parse JSON body for parameters
        let requestData;
        try {
            const body = await req.text();
            requestData = body ? JSON.parse(body) : {};
        } catch (parseError) {
            return Response.json({
                error: 'Invalid JSON body',
                message: 'Request body must be valid JSON'
            }, { status: 400, headers });
        }

        const tenantId = requestData.tenant_id;
        const maxCalls = parseInt(requestData.max_calls || '20');

        // Tenant ID is REQUIRED
        if (!tenantId) {
            return Response.json({ 
                error: 'Missing tenant_id parameter',
                message: 'tenant_id is required in request body',
                example: {
                    "tenant_id": "68b0cba04f934c88fe26afab",
                    "max_calls": 20
                }
            }, { status: 400, headers });
        }

        console.log(`Processing scheduled AI calls for tenant: ${tenantId} (max: ${maxCalls})`);

        // Get current time for scheduling check (this is in UTC)
        const currentTime = new Date();
        
        // Only process SCHEDULED calls (not failed ones - those need manual intervention)
        const filter = {
            tenant_id: tenantId,
            type: 'scheduled_ai_call',
            status: 'scheduled'
        };

        console.log(`Filter: ${JSON.stringify(filter)}`);

        // Get scheduled AI call activities for this tenant
        const scheduledActivities = await base44.asServiceRole.entities.Activity.filter(filter, '-due_date', maxCalls * 2);

        console.log(`Found ${scheduledActivities.length} scheduled AI call activities`);
        
        // Debug each activity found
        scheduledActivities.forEach((activity, index) => {
            console.log(`Activity ${index + 1}:`);
            console.log(`  - ID: ${activity.id}`);
            console.log(`  - Subject: ${activity.subject}`);
            console.log(`  - Status: ${activity.status}`);
            console.log(`  - Due: ${activity.due_date} ${activity.due_time}`);
        });

        // Filter by time window with proper timezone handling
        const eligibleActivities = scheduledActivities.filter(activity => {
            if (!activity.due_date) {
                console.log(`Activity ${activity.id}: No due_date, skipping`);
                return false;
            }
            
            const dueDateStr = activity.due_date; // YYYY-MM-DD format
            const dueTimeStr = activity.due_time || '09:00'; // HH:MM format in user's local timezone
            
            console.log(`\nChecking Activity ${activity.id}:`);
            console.log(`  - Subject: ${activity.subject}`);
            console.log(`  - Due Date: ${dueDateStr} (user's date)`);
            console.log(`  - Due Time: ${dueTimeStr} (user's local time)`);
            
            try {
                // CRITICAL: Parse as LOCAL time, then convert to UTC
                // The due_time is stored in the user's timezone (EST/EDT)
                
                // Parse the time components
                const [hours, minutes] = dueTimeStr.split(':').map(Number);
                
                // Create date in user's timezone (assuming EST/EDT = UTC-4 or UTC-5)
                // For now, assume EDT (UTC-4) since it's September (or generally during DST)
                const dateParts = dueDateStr.split('-');
                const year = parseInt(dateParts[0]);
                const month = parseInt(dateParts[1]) - 1; // JS months are 0-indexed
                const day = parseInt(dateParts[2]);
                
                // Create a Date object representing the time components as if they were UTC.
                // In a UTC server environment, this effectively interprets the YYYY-MM-DD HH:MM
                // as UTC, which is a starting point for adjustment.
                const localDateTime = new Date(year, month, day, hours, minutes, 0);
                
                // Convert to UTC by adding the timezone offset from the assumed user's timezone.
                // If user's time is EDT (UTC-4), adding 4 hours to the UTC-interpreted components
                // will yield the correct UTC time.
                const timezoneOffsetHours = 4; // EDT offset from UTC
                const dueDateTime = new Date(localDateTime.getTime() + (timezoneOffsetHours * 60 * 60 * 1000));
                
                const timeDiff = dueDateTime.getTime() - currentTime.getTime();
                const timeDiffMinutes = timeDiff / (1000 * 60);
                const timeDiffHours = timeDiff / (1000 * 60 * 60);
                
                console.log(`  - Local DateTime: ${localDateTime.toISOString()} (as if UTC)`);
                console.log(`  - Adjusted UTC DateTime: ${dueDateTime.toISOString()} (actual UTC)`);
                console.log(`  - Current UTC Time: ${currentTime.toISOString()}`);
                console.log(`  - Time Difference: ${timeDiffMinutes.toFixed(1)} minutes (${timeDiffHours.toFixed(1)} hours)`);
                
                // Process calls that are due within past 2 hours to next 5 minutes
                const withinWindow = timeDiff >= -2 * 60 * 60 * 1000 && timeDiff <= 5 * 60 * 1000;
                
                if (timeDiff < 0) {
                    console.log(`  - Call is OVERDUE by ${Math.abs(timeDiffMinutes).toFixed(1)} minutes`);
                } else if (timeDiff <= 5 * 60 * 1000) {
                    console.log(`  - Call is DUE within next ${timeDiffMinutes.toFixed(1)} minutes`);
                } else {
                    console.log(`  - Call is FUTURE by ${timeDiffMinutes.toFixed(1)} minutes`);
                }
                
                console.log(`  - Within processing window: ${withinWindow}`);
                
                return withinWindow;
            } catch (parseError) {
                console.error(`Activity ${activity.id}: Date parsing error:`, parseError);
                return false;
            }
        }).slice(0, maxCalls);

        console.log(`After timezone-aware filtering: ${eligibleActivities.length} eligible activities`);

        if (eligibleActivities.length === 0) {
            return Response.json({ 
                success: true, 
                message: scheduledActivities.length > 0 ? 
                    `Found ${scheduledActivities.length} scheduled calls, but none are due within the processing window (accounting for EST/EDT timezone)` :
                    `No scheduled AI calls found for tenant ${tenantId}`,
                processed: 0,
                total_scheduled: scheduledActivities.length,
                eligible_for_processing: eligibleActivities.length,
                tenant_id: tenantId,
                current_time: currentTime.toISOString(),
                processing_window: "Past 2 hours to next 5 minutes (UTC, converted from user's EDT timezone)",
                activities_found: scheduledActivities.map(a => ({
                    id: a.id,
                    subject: a.subject,
                    status: a.status,
                    due_date: a.due_date,
                    due_time: a.due_time
                }))
            }, { headers });
        }

        let processed = 0;
        let errors = 0;
        const processedActivities = [];

        for (const activity of eligibleActivities) {
            try {
                console.log(`\n=== PROCESSING ACTIVITY ${activity.id} ===`);
                console.log(`Subject: ${activity.subject}`);

                // Update status to in-progress first
                await base44.asServiceRole.entities.Activity.update(activity.id, {
                    status: 'in-progress'
                });

                // Get tenant for AI calling configuration
                const tenant = await base44.asServiceRole.entities.Tenant.get(tenantId);
                if (!tenant) {
                    throw new Error(`Tenant ${tenantId} not found`);
                }

                const config = activity.ai_call_config;
                if (!config || !config.contact_phone) {
                    throw new Error('Missing phone number in AI call config');
                }

                console.log(`Initiating AI call to: ${config.contact_phone}`);
                console.log(`AI Provider: ${config.ai_provider || 'callfluent'}`);

                // Call the universal AI calling function
                const callResult = await base44.asServiceRole.functions.invoke('universalAICall', {
                    tenant_id: tenantId,
                    phone_number: config.contact_phone,
                    contact_name: config.contact_name || 'Unknown Contact',
                    ai_provider: config.ai_provider || 'callfluent',
                    prompt: config.prompt || `Scheduled call regarding: ${activity.subject}`,
                    call_objective: config.call_objective || 'follow_up',
                    max_duration: config.max_duration || 300,
                    activity_id: activity.id
                });

                console.log(`Call result:`, callResult);

                // Update execution log
                const executionLog = activity.execution_log || [];
                executionLog.push({
                    timestamp: new Date().toISOString(),
                    status: callResult.data?.success ? 'initiated' : 'failed',
                    message: callResult.data?.message || 'Call processed',
                    call_sid: callResult.data?.call_sid || null,
                    triggered_by: 'automated_scheduler'
                });

                // Update activity with result
                const finalStatus = callResult.data?.success ? 'in-progress' : 'failed';
                await base44.asServiceRole.entities.Activity.update(activity.id, {
                    status: finalStatus,
                    execution_log: executionLog,
                    outcome: callResult.data?.message || 'Automated scheduler processed'
                });

                processedActivities.push({
                    id: activity.id,
                    subject: activity.subject,
                    status: finalStatus,
                    result: callResult.data?.success ? 'success' : 'failed'
                });

                processed++;
                console.log(`✅ Successfully processed activity ${activity.id}`);

            } catch (error) {
                console.error(`❌ Error processing activity ${activity.id}:`, error);
                errors++;

                // Update to failed status
                try {
                    const executionLog = activity.execution_log || [];
                    executionLog.push({
                        timestamp: new Date().toISOString(),
                        status: 'failed',
                        message: error.message,
                        triggered_by: 'automated_scheduler'
                    });

                    await base44.asServiceRole.entities.Activity.update(activity.id, {
                        status: 'failed',
                        execution_log: executionLog,
                        outcome: `Error: ${error.message}`
                    });

                    processedActivities.push({
                        id: activity.id,
                        subject: activity.subject,
                        status: 'failed',
                        result: 'error',
                        error: error.message
                    });

                } catch (updateError) {
                    console.error(`Failed to update activity ${activity.id} status:`, updateError);
                }
            }
        }

        return Response.json({
            success: true,
            message: processed > 0 ? 
                `Successfully processed ${processed} scheduled AI calls` :
                `No scheduled AI calls due for tenant ${tenantId}`,
            processed: processed,
            errors: errors,
            total_scheduled: scheduledActivities.length,
            tenant_id: tenantId,
            current_time: currentTime.toISOString(),
            processing_window: "Past 2 hours to next 5 minutes (UTC, converted from user's EDT timezone)",
            processed_activities: processedActivities
        }, { headers });

    } catch (error) {
        console.error('Error in manualTriggerAICalls:', error);
        return Response.json({
            success: false,
            error: error.message,
            message: 'Function execution failed'
        }, { status: 500, headers });
    }
});


----------------------------

export default manualTriggerAICalls;
