/**
 * callFluentWebhookV2
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.0';

Deno.serve(async (req) => {
    const startTime = Date.now();
    
    try {
        const base44 = createClientFromRequest(req);
        
        let requestBody;
        try {
            requestBody = await req.json();
        } catch (parseError) {
            return new Response(JSON.stringify({ 
                success: false,
                error: 'Invalid JSON payload',
                message: 'Request body could not be parsed as JSON',
                details: parseError.message,
                timestamp: new Date().toISOString(),
                processing_time_ms: Date.now() - startTime
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        console.log('CallFluent webhook received:', JSON.stringify(requestBody, null, 2));

        const {
            call_status,
            phone_number,
            client_id,
            contact_name,
            company_name,
            call_summary,
            call_date_time,
            call_objective,
            assignee_name,
            call_sid,
            call_transcript // Added call_transcript
        } = requestBody;

        // Validate required fields based on call status
        if (call_status === 'ai_call_initiated') {
            if (!client_id || !phone_number || !contact_name) {
                return new Response(JSON.stringify({ 
                    success: false,
                    error: 'Missing required fields',
                    message: 'For call initiation: client_id, phone_number, and contact_name are required',
                    received_fields: Object.keys(requestBody),
                    timestamp: new Date().toISOString()
                }), { 
                    status: 400, 
                    headers: { 'Content-Type': 'application/json' } 
                });
            }
        } else {
            // For call results
            if (!phone_number || !client_id) {
                return new Response(JSON.stringify({ 
                    success: false,
                    error: 'Missing required fields',
                    message: 'phone_number and client_id are required for call results',
                    call_status: call_status || 'not_provided',
                    timestamp: new Date().toISOString()
                }), { 
                    status: 400, 
                    headers: { 'Content-Type': 'application/json' } 
                });
            }
        }

        // Handle call initiation
        if (call_status === 'ai_call_initiated') {
            let tenant;
            try {
                tenant = await base44.asServiceRole.entities.Tenant.get(client_id);
            } catch (tenantError) {
                return new Response(JSON.stringify({ 
                    success: false,
                    error: 'Tenant not found',
                    message: `Could not find tenant with ID: ${client_id}`,
                    details: tenantError.message,
                    client_id: client_id,
                    timestamp: new Date().toISOString()
                }), { 
                    status: 404, 
                    headers: { 'Content-Type': 'application/json' } 
                });
            }

            // Check for CallFluent configuration
            let callAgentUrl = null;
            if (tenant.ai_calling_providers?.callfluent?.is_active && tenant.ai_calling_providers?.callfluent?.webhook_url) {
                callAgentUrl = tenant.ai_calling_providers?.callfluent?.webhook_url;
            } else if (tenant.call_agent_url) {
                callAgentUrl = tenant.call_agent_url; // Legacy fallback
            }

            if (!callAgentUrl) {
                return new Response(JSON.stringify({ 
                    success: false,
                    error: 'AI Agent URL not configured',
                    message: `Tenant '${tenant.name}' does not have CallFluent configured. Please configure the AI calling provider in tenant settings.`,
                    tenant_name: tenant.name,
                    client_id: client_id,
                    timestamp: new Date().toISOString()
                }), { 
                    status: 400, 
                    headers: { 'Content-Type': 'application/json' } 
                });
            }
            
            // Create AI prompt
            const aiPrompt = call_transcript || `You are an AI assistant calling on behalf of ${tenant.name}. 
${assignee_name ? `You are representing ${assignee_name}, a team member from ${tenant.name}.` : ''}

Contact Information:
- Name: ${contact_name}
- Company: ${company_name || 'Unknown Company'}
- Phone: ${phone_number}

Call Objective: ${call_objective || 'General follow-up'}

Please be professional, courteous, and focused on achieving the stated objective.`;

            const agentPayload = {
                phone_number,
                contact_name,
                company_name: company_name || 'Unknown Company',
                tenant_name: tenant.name,
                client_id,
                call_objective: call_objective || 'General follow-up',
                ai_prompt: aiPrompt,
                assignee_name,
                initiated_at: new Date().toISOString()
            };

            console.log("Sending call initiation to agent:", { url: callAgentUrl, payload: agentPayload });

            try {
                const agentResponse = await fetch(callAgentUrl, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        // Add API key if available
                        ...(tenant.ai_calling_providers?.callfluent?.api_key && {
                            'Authorization': `Bearer ${tenant.ai_calling_providers.callfluent.api_key}`
                        })
                    },
                    body: JSON.stringify(agentPayload),
                });

                if (!agentResponse.ok) {
                    const responseText = await agentResponse.text();
                    console.error("Agent response failed:", agentResponse.status, responseText);
                    throw new Error(`Agent responded with ${agentResponse.status}: ${responseText}`);
                }

                const responseText = await agentResponse.text();
                console.log("Agent response successful:", agentResponse.status, responseText);

                // Update the specific activity if activity_id is provided
                const activityId = requestBody.activity_id;
                if (activityId) {
                    try {
                        await base44.asServiceRole.entities.Activity.update(activityId, {
                            status: 'in-progress'
                        });
                        console.log(`Updated specific activity ${activityId} to in-progress`);
                    } catch (updateError) {
                        console.warn(`Could not update activity ${activityId} status:`, updateError);
                    }
                } else {
                    // Try to find and update any related scheduled AI call activity (fallback)
                    try {
                        const activities = await base44.asServiceRole.entities.Activity.filter({
                            tenant_id: client_id,
                            type: 'scheduled_ai_call',
                            status: 'scheduled'
                        });

                        // Find activity with matching phone number
                        const matchingActivity = activities.find(act => 
                            act.ai_call_config?.contact_phone === phone_number
                        );

                        if (matchingActivity) {
                            await base44.asServiceRole.entities.Activity.update(matchingActivity.id, {
                                status: 'in-progress'
                            });
                            console.log(`Updated scheduled activity ${matchingActivity.id} to in-progress`);
                        }
                    } catch (updateError) {
                        console.warn('Could not update scheduled activity status:', updateError);
                    }
                }

            } catch (agentError) {
                console.error("Failed to trigger AI agent:", agentError);
                return new Response(JSON.stringify({ 
                    success: false,
                    error: 'Failed to trigger AI agent',
                    message: 'Could not communicate with the AI agent endpoint',
                    details: agentError.message,
                    agent_url: callAgentUrl,
                    timestamp: new Date().toISOString()
                }), { 
                    status: 500, 
                    headers: { 'Content-Type': 'application/json' } 
                });
            }

            return new Response(JSON.stringify({ 
                success: true,
                message: 'AI agent triggered successfully',
                call_initiated: true,
                tenant_name: tenant.name,
                contact_name,
                phone_number,
                timestamp: new Date().toISOString()
            }), { 
                headers: { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                }
            });

        } else {
            // Handle incoming call results
            const normalizedPhone = phone_number.replace(/\D/g, '');

            console.log(`Processing call result for phone: ${phone_number} (normalized: ${normalizedPhone}), client: ${client_id}`);

            // Find matching contact or lead
            let allContacts, allLeads;
            try {
                [allContacts, allLeads] = await Promise.all([
                    base44.asServiceRole.entities.Contact.filter({ tenant_id: client_id }),
                    base44.asServiceRole.entities.Lead.filter({ tenant_id: client_id })
                ]);
            } catch (dataError) {
                return new Response(JSON.stringify({ 
                    success: false,
                    error: 'Database error',
                    message: 'Could not fetch contacts and leads from database',
                    details: dataError.message,
                    client_id: client_id,
                    timestamp: new Date().toISOString()
                }), { 
                    status: 500, 
                    headers: { 'Content-Type': 'application/json' } 
                });
            }

            const contacts = allContacts.filter(c => c.phone && c.phone.replace(/\D/g, '') === normalizedPhone);
            const leads = allLeads.filter(l => l.phone && l.phone.replace(/\D/g, '') === normalizedPhone);

            console.log(`Found ${contacts.length} contacts and ${leads.length} leads matching phone ${normalizedPhone}`);

            if (contacts.length === 0 && leads.length === 0) {
                console.log(`No matching records found for phone ${normalizedPhone} in client ${client_id}`);
                
                // Still create an activity but without linking to a contact/lead
                const unlinkedActivity = {
                    tenant_id: client_id,
                    type: 'call',
                    subject: `AI Call to ${phone_number}`,
                    description: `Call Summary: ${call_summary || 'No summary provided'}\n\nNote: No matching Contact or Lead found for this phone number.`,
                    status: 'completed',
                    priority: 'normal',
                    due_date: call_date_time ? new Date(call_date_time).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                    due_time: call_date_time ? new Date(call_date_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null,
                    outcome: call_status || 'completed',
                    call_sid: call_sid || 'unknown'
                };

                await base44.asServiceRole.entities.Activity.create(unlinkedActivity);

                return new Response(JSON.stringify({ 
                    success: true,
                    message: 'Call result processed (no matching contact/lead found)',
                    activity_created: true,
                    note_created: false,
                    phone_number: phone_number,
                    normalized_phone: normalizedPhone,
                    client_id: client_id,
                    timestamp: new Date().toISOString()
                }), { 
                    headers: { 'Content-Type': 'application/json' } 
                });
            }

            const target = contacts[0] || leads[0];
            const related_to = contacts.length > 0 ? 'contact' : 'lead';

            console.log(`Found target ${related_to}: ${target.first_name} ${target.last_name} (ID: ${target.id})`);

            // Find and update any existing scheduled AI call activity
            let existingActivity = null;
            if (call_sid) {
                try {
                    const activities = await base44.asServiceRole.entities.Activity.filter({
                        call_sid: call_sid,
                        type: 'scheduled_ai_call',
                        status: 'in-progress'
                    });
                    if (activities.length > 0) {
                        existingActivity = activities[0];
                    }
                } catch (error) {
                    console.warn('Could not find existing scheduled activity:', error);
                }
            }

            // Create or update activity record
            try {
                const activityData = {
                    tenant_id: client_id,
                    assigned_to: target.assigned_to,
                    type: existingActivity ? 'scheduled_ai_call' : 'call',
                    subject: `AI Call with ${target.first_name} ${target.last_name}`,
                    description: `Call Summary: ${call_summary || 'Call completed successfully'}`,
                    status: 'completed',
                    priority: 'normal',
                    due_date: call_date_time ? new Date(call_date_time).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                    due_time: call_date_time ? new Date(call_date_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null,
                    related_to,
                    related_id: target.id,
                    outcome: call_status || 'completed',
                    call_sid: call_sid || 'unknown'
                };

                let activity;
                if (existingActivity) {
                    // Update existing scheduled activity
                    await base44.asServiceRole.entities.Activity.update(existingActivity.id, activityData);
                    activity = { ...existingActivity, ...activityData };
                    console.log(`Updated existing scheduled activity ${existingActivity.id}`);
                } else {
                    // Create new activity
                    activity = await base44.asServiceRole.entities.Activity.create(activityData);
                    console.log(`Created new activity with ID: ${activity.id}`);
                }

            } catch (activityError) {
                console.error("Failed to create/update activity:", activityError);
                return new Response(JSON.stringify({ 
                    success: false,
                    error: 'Failed to create/update activity',
                    message: 'Could not save activity record to database',
                    details: activityError.message,
                    target_record: { id: target.id, type: related_to },
                    timestamp: new Date().toISOString()
                }), { 
                    status: 500, 
                    headers: { 'Content-Type': 'application/json' } 
                });
            }
            
            // Create note record with the call summary
            let noteCreated = false;
            if (call_summary) {
                try {
                    const note = {
                        tenant_id: client_id,
                        related_to,
                        related_id: target.id,
                        title: `AI Call Log - ${new Date(call_date_time || new Date()).toLocaleString()}`,
                        content: call_summary,
                        type: 'call_log'
                    };
                    await base44.asServiceRole.entities.Note.create(note);
                    noteCreated = true;
                    console.log('Created call log note');
                } catch (noteError) {
                    console.error("Failed to create note:", noteError);
                    // Note creation failure is not critical, continue
                }
            }

            return new Response(JSON.stringify({ 
                success: true,
                message: 'Call result processed successfully',
                processed: { 
                    contacts: contacts.length, 
                    leads: leads.length 
                },
                target_record: {
                    id: target.id,
                    type: related_to,
                    name: `${target.first_name} ${target.last_name}`
                },
                activity_created: true,
                activity_updated: !!existingActivity,
                note_created: noteCreated,
                call_status,
                call_sid: call_sid || 'unknown',
                timestamp: new Date().toISOString()
            }), { 
                headers: { 
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                }
            });
        }
        
    } catch (error) {
        console.error("CallFluent Webhook Error:", error);
        
        return new Response(JSON.stringify({ 
            success: false,
            error: 'Internal server error',
            message: 'An unexpected error occurred while processing the webhook',
            details: error.message,
            timestamp: new Date().toISOString(),
            processing_time_ms: Date.now() - startTime
        }), { 
            status: 500, 
            headers: { 'Content-Type': 'application/json' } 
        });
    }
});


----------------------------

export default callFluentWebhookV2;
