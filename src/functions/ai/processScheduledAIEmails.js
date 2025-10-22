/**
 * processScheduledAIEmails
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.0';

// Helper function to replace template variables in a string
const fillTemplate = (template, data) => {
    if (!template) return '';
    return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => {
        return data[key] || '';
    });
};

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        const now = new Date();
        
        // Find all due, scheduled AI email activities
        const dueActivities = await base44.asServiceRole.entities.Activity.filter({
            type: 'scheduled_ai_email',
            status: 'scheduled',
            due_date: { $lte: now.toISOString().split('T')[0] } 
        });
        
        console.log(`[AIEmailProcessor] Found ${dueActivities.length} potential activities.`);

        const results = [];
        for (const activity of dueActivities) {
            // Further filter by time if available
            if (activity.due_time) {
                const dueDateTime = new Date(`${activity.due_date}T${activity.due_time}`);
                if (dueDateTime > now) {
                    continue; // Not yet time to send
                }
            }

            console.log(`[AIEmailProcessor] Processing activity ID: ${activity.id}`);
            let target = null;
            let log = { timestamp: now.toISOString(), status: 'failed' };
            
            try {
                // 1. Get related entity (Contact or Lead)
                if (activity.related_to === 'contact') {
                    target = await base44.asServiceRole.entities.Contact.get(activity.related_id);
                } else if (activity.related_to === 'lead') {
                    target = await base44.asServiceRole.entities.Lead.get(activity.related_id);
                }

                if (!target || !target.email) {
                    throw new Error(`Target ${activity.related_to} not found or has no email.`);
                }
                
                // 2. Prepare data for template filling
                const templateData = {
                    contact_name: `${target.first_name} ${target.last_name}`,
                    first_name: target.first_name,
                    company: target.company || (target.account ? target.account.name : ''),
                };
                
                // 3. Generate email body using LLM
                const bodyPrompt = fillTemplate(activity.ai_email_config?.body_prompt, templateData);
                const { output: emailBody, error: llmError } = await base44.asServiceRole.integrations.Core.InvokeLLM({
                    prompt: bodyPrompt,
                });
                
                if (llmError) {
                    throw new Error(`LLM generation failed: ${llmError.message}`);
                }
                
                // 4. Send the email
                const subject = fillTemplate(activity.ai_email_config?.subject_template, templateData);
                await base44.asServiceRole.integrations.Core.SendEmail({
                    to: target.email,
                    subject: subject || activity.subject,
                    body: emailBody,
                });

                log.status = 'success';
                log.message = `Email successfully sent to ${target.email}. Subject: ${subject}`;
                
                await base44.asServiceRole.entities.Activity.update(activity.id, {
                    status: 'completed',
                    outcome: `AI Email sent.`,
                    execution_log: [...(activity.execution_log || []), log]
                });
                
                results.push({ activityId: activity.id, status: 'success' });

            } catch (error) {
                console.error(`[AIEmailProcessor] Failed to process activity ${activity.id}:`, error);
                log.message = error.message;

                await base44.asServiceRole.entities.Activity.update(activity.id, {
                    status: 'failed',
                    outcome: `AI Email failed: ${error.message}`,
                    execution_log: [...(activity.execution_log || []), log]
                });

                results.push({ activityId: activity.id, status: 'failed', error: error.message });
            }
        }
        
        return Response.json({ success: true, message: `Processed ${results.length} scheduled AI emails.`, results });
        
    } catch (error) {
        console.error('[AIEmailProcessor] Fatal error in function:', error);
        return new Response(JSON.stringify({ success: false, error: error.message }), {
            status: 500, headers: { 'Content-Type': 'application/json' }
        });
    }
});

----------------------------

export default processScheduledAIEmails;
