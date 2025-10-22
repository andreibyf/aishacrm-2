/**
 * voiceCommand
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

    const startTime = Date.now();
    let trackingData = {
        timestamp: new Date().toISOString(),
        function_name: 'voiceCommand',
        user_email: 'unknown',
        tenant_id: 'unknown',
        instruction: null,
        success: false,
        error_message: null,
        execution_time_ms: 0
    };

    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        trackingData.user_email = user.email;
        trackingData.tenant_id = user.tenant_id;

        const body = await req.json();
        const userInstruction = body.instruction;
        trackingData.instruction = userInstruction;
        
        if (!userInstruction) {
            throw new Error("Instruction is required");
        }

        console.log('🤖 Voice Command Received:', {
            user: user.email,
            tenant: user.tenant_id,
            instruction: userInstruction,
            timestamp: trackingData.timestamp
        });

        // 1. Generate the plan
        const planResponse = await base44.functions.invoke('generateAIPlan', { prompt: userInstruction });
        
        if (planResponse.error || !planResponse.data.success || !planResponse.data.plan) {
            throw new Error(planResponse.error?.message || planResponse.data.error || "I couldn't understand that request. Could you please rephrase?");
        }
        
        const plan = planResponse.data.plan;

        // 2. Execute the plan
        const executionResponse = await base44.functions.invoke('executeAIPlan', { 
            plan, 
            tenant_id: user.tenant_id, 
            current_user_email: user.email 
        });
        
        if (executionResponse.error || !executionResponse.data.success) {
            throw new Error(executionResponse.error?.message || executionResponse.data.summaryMessage || "Something went wrong while processing your request.");
        }
        
        const { summaryMessage, uiActions } = executionResponse.data;
        trackingData.success = true;
        trackingData.execution_time_ms = Date.now() - startTime;
        
        console.log('✅ Voice Command Completed:', {
            user: user.email,
            instruction: userInstruction,
            executionTime: trackingData.execution_time_ms + 'ms',
            response: summaryMessage
        });
        
        return new Response(JSON.stringify({
            success: true,
            message: summaryMessage,
            uiActions: uiActions || []
        }), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });

    } catch (error) {
        trackingData.success = false;
        trackingData.error_message = error.message;
        trackingData.execution_time_ms = Date.now() - startTime;

        console.error('❌ Voice Command Failed:', {
            user: trackingData.user_email,
            instruction: trackingData.instruction,
            error: error.message,
            executionTime: trackingData.execution_time_ms + 'ms'
        });

        return new Response(JSON.stringify({
            success: false,
            error: error.message,
            message: `I'm sorry, I encountered an error: ${error.message}`
        }), {
            status: 200, // Return 200 so the widget can speak the error
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
    } finally {
        // Store execution tracking data
        try {
            const base44 = createClientFromRequest(req);
            await base44.asServiceRole.entities.PerformanceLog.create({
                function_name: 'voiceCommand',
                response_time_ms: trackingData.execution_time_ms,
                status: trackingData.success ? 'success' : 'error',
                error_message: trackingData.error_message
            });
        } catch (logError) {
            console.warn('Failed to log voice command execution:', logError);
        }
    }
});

----------------------------

export default voiceCommand;
