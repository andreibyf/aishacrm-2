/**
 * triggerLeadQualifier
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.0';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    
    try {
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { leadId } = await req.json();
        
        if (!leadId) {
            return Response.json({ error: 'Lead ID is required' }, { status: 400 });
        }

        // Use Lead.get() instead of Lead.find()
        const lead = await base44.entities.Lead.get(leadId);
        
        if (!lead) {
            return Response.json({ error: 'Lead not found' }, { status: 404 });
        }

        // Trigger the AI agent for lead qualification
        try {
            const agentResponse = await base44.agents.invoke('leadQualifier_68ad4ad50c568e1643957c6a', {
                message: `Please analyze and qualify this lead: ${lead.first_name} ${lead.last_name} from ${lead.company || 'unknown company'}. Email: ${lead.email || 'not provided'}. Phone: ${lead.phone || 'not provided'}. Source: ${lead.source || 'unknown'}. Current score: ${lead.score || 'not set'}.`,
                context: {
                    lead_id: lead.id,
                    lead_data: lead
                }
            });

            return Response.json({ 
                status: 'success', 
                message: 'Lead qualification triggered successfully',
                agent_response: agentResponse 
            });
            
        } catch (agentError) {
            console.error('Agent invocation failed:', agentError);
            return Response.json({ 
                status: 'error', 
                message: 'Failed to trigger lead qualification agent',
                error: agentError.message 
            }, { status: 500 });
        }

    } catch (error) {
        console.error('Error in triggerLeadQualifier:', error);
        return Response.json({ 
            status: 'error', 
            message: 'Failed to process lead qualification request',
            error: error.message 
        }, { status: 500 });
    }
});

----------------------------

export default triggerLeadQualifier;
