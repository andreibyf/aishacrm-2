/**
 * generateAIEmailDraft
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.0';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    
    try {
        const currentUser = await base44.auth.me();
        if (!currentUser) {
            return new Response(JSON.stringify({ error: 'Unauthorized: User not found.' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        const { 
            entityType, 
            entityId, 
            userPrompt, 
            tone = 'professional',
            includeCallToAction = true 
        } = await req.json();

        console.log(`Generating email draft for ${entityType} ${entityId}`);

        let entityData;
        let contextName = '';
        let contextEmail = '';
        let contextCompany = '';
        let contextInfo = '';

        try {
            switch (entityType) {
                case 'contact': {
                    entityData = await base44.entities.Contact.get(entityId);
                    contextName = `${entityData.first_name || ''} ${entityData.last_name || ''}`.trim();
                    contextEmail = entityData.email || '';
                    if (entityData.account_id) {
                        try {
                            const account = await base44.entities.Account.get(entityData.account_id);
                            contextCompany = account?.name || 'Unknown Company';
                        } catch (e) { 
                            console.warn('Failed to fetch account:', e);
                            contextCompany = 'Unknown Company'; 
                        }
                    } else {
                        contextCompany = 'No Company';
                    }
                    contextInfo = `Job Title: ${entityData.job_title || 'Not specified'}\nStatus: ${entityData.status}\nLead Source: ${entityData.lead_source}`;
                    break;
                }
                    
                case 'lead': {
                    entityData = await base44.entities.Lead.get(entityId);
                    contextName = `${entityData.first_name || ''} ${entityData.last_name || ''}`.trim();
                    contextEmail = entityData.email || '';
                    contextCompany = entityData.company || 'Unknown Company';
                    contextInfo = `Status: ${entityData.status}\nSource: ${entityData.source}\nEstimated Value: ${entityData.estimated_value ? '$' + entityData.estimated_value : 'Not specified'}`;
                    break;
                }
                    
                case 'opportunity': {
                    entityData = await base44.entities.Opportunity.get(entityId);
                    let contact = null;
                    if (entityData.contact_id) {
                        try {
                            contact = await base44.entities.Contact.get(entityData.contact_id);
                        } catch (e) {
                            console.warn('Failed to fetch contact:', e);
                        }
                    }
                    contextName = contact ? `${contact.first_name || ''} ${contact.last_name || ''}`.trim() : 'Contact';
                    contextEmail = contact?.email || '';
                    let account = null;
                    if (entityData.account_id) {
                        try {
                            account = await base44.entities.Account.get(entityData.account_id);
                        } catch (e) {
                            console.warn('Failed to fetch account:', e);
                        }
                    }
                    contextCompany = account?.name || 'Unknown Company';
                    contextInfo = `Opportunity: ${entityData.name}\nStage: ${entityData.stage}\nAmount: $${entityData.amount}\nClose Date: ${entityData.close_date}`;
                    break;
                }
                    
                default:
                    throw new Error(`Invalid entity type: ${entityType}`);
            }
        } catch (entityError) {
            console.error('Failed to fetch entity data:', entityError);
            return new Response(JSON.stringify({
                error: `Failed to fetch ${entityType} data: ${entityError.message}`,
                success: false
            }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Fetch related data with error handling
        let recentActivities = [];
        let recentNotes = [];

        try {
            recentActivities = await base44.entities.Activity.filter({
                related_to: entityType,
                related_id: entityId
            }, '-created_date', 5);
        } catch (e) {
            console.warn('Failed to fetch activities:', e);
        }

        try {
            recentNotes = await base44.entities.Note.filter({
                related_to: entityType,
                related_id: entityId
            }, '-created_date', 3);
        } catch (e) {
            console.warn('Failed to fetch notes:', e);
        }

        const recentActivitiesStr = recentActivities.length > 0 
            ? recentActivities.map(a => `${a.type}: ${a.subject} - ${a.description || 'No details'}`).join('\n')
            : 'No recent activities logged';

        const recentNotesText = recentNotes.length > 0
            ? recentNotes.map(n => `${n.title}: ${n.content}`).join('\n')
            : 'No recent notes';

        const systemPrompt = `You are an AI assistant helping to draft professional business emails within a CRM system. 

CRITICAL TENANT ISOLATION: Only use the provided context data for this specific ${entityType}. Never reference or include information from other contacts, leads, or opportunities.

Context Information:
- Recipient: ${contextName} (${contextEmail})
- Company: ${contextCompany}
- ${contextInfo}
- Recent Activities: ${recentActivitiesStr}
- Recent Notes: ${recentNotesText}

Email Tone: ${tone}
User's Request: ${userPrompt}

Please generate:
1. A compelling subject line
2. A well-structured email body that is personalized using the context above
3. ${includeCallToAction ? 'Include an appropriate call-to-action' : 'No call-to-action needed'}

Format your response as JSON:
{
    "subject_lines": ["Primary Subject", "Alternative Subject", "Third Option"],
    "email_body": "The full email content here",
    "suggested_cta": "Suggested call-to-action if applicable"
}

Keep the email concise, professional, and personalized. Use the recipient's name and company context naturally.`;

        console.log('Calling tenant LLM service...');

        let aiResponse;
        try {
            // Use tenant's own LLM integration instead of system OpenAI
            const response = await base44.functions.invoke('invokeTenantLLM', {
                prompt: systemPrompt,
                max_tokens: 800,
                temperature: 0.7,
                tenant_id: currentUser.tenant_id // Use tenant's own API key
            });
            
            console.log('Tenant LLM response status:', response.status);
            aiResponse = response.data || response;
        } catch (aiError) {
            console.error('Tenant LLM call failed:', aiError);
            
            // Fallback to system OpenAI if tenant LLM fails
            try {
                console.log('Falling back to system OpenAI...');
                const systemResponse = await base44.functions.invoke('invokeSystemOpenAI', {
                    prompt: systemPrompt,
                    max_tokens: 800,
                    temperature: 0.7
                });
                aiResponse = systemResponse.data || systemResponse;
            } catch (systemError) {
                console.error('System OpenAI fallback also failed:', systemError);
                return new Response(JSON.stringify({
                    error: `AI service failed: ${aiError.message}. Please ensure OpenAI is configured in your tenant integrations.`,
                    success: false
                }), {
                    status: 500,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        }

        // Handle the response properly
        if (!aiResponse || !aiResponse.success) {
            const errorMessage = aiResponse?.error || 'No response from AI service';
            console.error('AI Response error:', errorMessage);
            
            return new Response(JSON.stringify({
                error: `Failed to generate email draft: ${errorMessage}`,
                success: false
            }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Extract the AI response content
        const aiContent = aiResponse.response;
        
        if (!aiContent) {
            return new Response(JSON.stringify({
                error: 'Empty response from AI service',
                success: false
            }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        let draftData;
        try {
            draftData = JSON.parse(aiContent);
        } catch (parseError) {
            console.warn('Failed to parse AI response as JSON, using as plain text:', parseError);
            
            // Fallback: create a basic response structure
            draftData = {
                subject_lines: ["Follow-up from our conversation", "Quick follow-up", "Regarding your request"],
                email_body: aiContent,
                suggested_cta: "I'd love to hear your thoughts."
            };
        }

        return new Response(JSON.stringify({
            success: true,
            recipient: {
                name: contextName,
                email: contextEmail,
                company: contextCompany
            },
            draft: draftData,
            entityType,
            entityId
        }), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Generate AI Email Draft error:', error);
        return new Response(JSON.stringify({
            error: `Failed to generate email draft: ${error.message}`,
            success: false
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
});


----------------------------

export default generateAIEmailDraft;
