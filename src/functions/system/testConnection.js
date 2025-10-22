/**
 * testConnection
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

    console.log('🟢 TEST CONNECTION: Request received!');
    console.log('🟢 Method:', req.method);
    console.log('🟢 URL:', req.url);
    console.log('🟢 Headers:', Object.fromEntries(req.headers.entries()));
    
    try {
        const body = await req.json();
        console.log('🟢 Body:', body);
        
        const base44 = createClientFromRequest(req);
        
        // Test basic service role access
        console.log('🟢 Testing service role access...');
        const testQuery = await base44.asServiceRole.entities.Lead.filter({}, '-created_date', 1);
        console.log('🟢 Service role test successful, found leads:', testQuery.length);
        
        // Test generateAIPlan function
        console.log('🟢 Testing generateAIPlan function...');
        const planResponse = await base44.functions.invoke('generateAIPlan', { prompt: body.instruction || "How many leads do I have?" });
        console.log('🟢 Plan response:', planResponse);
        
        if (planResponse.error) {
            throw new Error(`generateAIPlan failed: ${planResponse.error.message}`);
        }
        
        if (!planResponse.data.success) {
            throw new Error(`generateAIPlan unsuccessful: ${planResponse.data.error}`);
        }
        
        console.log('🟢 Plan generated successfully:', planResponse.data.plan);
        
        return new Response(JSON.stringify({
            success: true,
            message: 'Test connection successful',
            debug: {
                bodyReceived: body,
                planGenerated: planResponse.data.plan,
                leadsFound: testQuery.length
            }
        }), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
        
    } catch (error) {
        console.error('🚨 Test connection error:', error);
        
        return new Response(JSON.stringify({
            success: false,
            error: error.message,
            stack: error.stack
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
    }
});

----------------------------

export default testConnection;
