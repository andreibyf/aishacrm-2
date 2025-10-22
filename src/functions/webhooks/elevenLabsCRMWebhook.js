/**
 * elevenLabsCRMWebhook
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, api-key, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        console.log('🤖 ElevenLabs webhook called');
        console.log('🔑 Headers received:', {
            apiKey: req.headers.get('api-key') ? 'Present' : 'Missing',
            authorization: req.headers.get('authorization') ? 'Present' : 'Missing'
        });
        
        const base44 = createClientFromRequest(req);
        const { instruction, tenant_id, user_email } = await req.json();
        
        // Verify BOTH authentication headers from ElevenLabs
        const apiKey = req.headers.get('api-key');
        const authHeader = req.headers.get('authorization');
        
        if (!apiKey || !apiKey.startsWith('aisha_')) {
            console.warn('🚨 Invalid or missing api-key');
            return new Response(JSON.stringify({
                success: false,
                error: 'Missing Base44 API key',
                message: 'ElevenLabs must provide the api-key header for platform access.'
            }), { 
                status: 401, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            });
        }

        if (!authHeader || !authHeader.startsWith('Bearer aisha_user_')) {
            console.warn('🚨 Invalid or missing user authorization');
            return new Response(JSON.stringify({
                success: false,
                error: 'Missing user authentication',
                message: 'ElevenLabs must provide the authorization Bearer token for user access.'
            }), { 
                status: 401, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            });
        }

        console.log('✅ ElevenLabs authentication validated (both api-key and Bearer token present)');

        // Generate AI plan
        const planResponse = await base44.asServiceRole.functions.invoke('generateAIPlan', { 
            prompt: instruction 
        });

        if (!planResponse.data?.success || !planResponse.data?.plan) {
            throw new Error(`Plan generation failed: ${planResponse.data?.error || 'Unknown error'}`);
        }

        const plan = planResponse.data.plan;
        console.log('🧠 AI Plan generated:', plan);

        // Execute the plan
        const executeResponse = await base44.asServiceRole.functions.invoke('executeAIPlan', {
            plan: plan,
            tenant_id: tenant_id,
            user_email: user_email
        });

        if (!executeResponse.data?.success) {
            throw new Error(`Plan execution failed: ${executeResponse.data?.error || 'Unknown error'}`);
        }

        console.log('✅ Plan executed successfully');
        
        return new Response(JSON.stringify({
            success: true,
            message: executeResponse.data.message,
            uiActions: executeResponse.data.uiActions || []
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('🚨 ElevenLabs webhook error:', error);
        return new Response(JSON.stringify({
            success: false,
            error: error.message,
            message: `I'm sorry, I encountered an error: ${error.message}`
        }), {
            status: 200, // Return 200 so ElevenLabs can read the error message
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});

----------------------------

export default elevenLabsCRMWebhook;
