/**
 * handleVoiceCommand
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, api-key, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// A single, powerful tool. The AI's job is just to pass the user's instruction.
const tools = [
  {
    name: 'process_crm_instruction',
    description: 'Use this for any actionable instruction or command related to the CRM. This includes creating, updating, finding, or deleting records, as well as navigating the app.',
    inputSchema: {
      type: 'object',
      properties: {
        instruction: {
          type: 'string',
          description: 'The user\'s full, natural language instruction. Example: "Create a new contact for John Doe at john.doe@example.com"',
        }
      },
      required: ['instruction']
    }
  }
];

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const startTime = Date.now();
    let trackingData = {
        timestamp: new Date().toISOString(),
        function_name: 'handleVoiceCommand', // Updated function name
        user_email: 'unknown',
        tenant_id: 'unknown',
        instruction: null,
        method: null,
        success: false,
        error_message: null,
        execution_time_ms: 0,
        plan_generated: false,
        plan_executed: false
    };

    let body;
    try {
        const base44 = createClientFromRequest(req);
        body = await req.json();
        trackingData.method = body.method;

        // Standard MCP tool listing
        if (body.method === 'tools/list') {
            trackingData.success = true;
            trackingData.execution_time_ms = Date.now() - startTime;
            
            return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { tools } }), {
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }

        // The main tool call for any instruction
        if (body.method === 'tools/call' && body.params.name === 'process_crm_instruction') {
            const userInstruction = body.params.arguments.instruction;
            const tenantId = body.params.context.tenant_id;
            const userEmail = body.params.context.user_email;
            
            trackingData.instruction = userInstruction;
            trackingData.tenant_id = tenantId;
            trackingData.user_email = userEmail;
            
            if (!userInstruction) {
                throw new Error("Instruction is missing from the tool call.");
            }

            console.log('🤖 Voice Command Received (handleVoiceCommand):', {
                user: userEmail,
                tenant: tenantId,
                instruction: userInstruction,
                timestamp: trackingData.timestamp
            });

            // --- UNIFIED AI FLOW ---
            // 1. Generate the plan from the user's voice instruction.
            const planResponse = await base44.functions.invoke('generateAIPlan', { prompt: userInstruction });
            
            if (planResponse.error || !planResponse.data.success || !planResponse.data.plan) {
                throw new Error(planResponse.error?.message || planResponse.data.error || "I couldn't understand that request. Could you please rephrase?");
            }
            
            const plan = planResponse.data.plan;
            trackingData.plan_generated = true;
            
            console.log('🧠 AI Plan Generated (handleVoiceCommand):', {
                user: userEmail,
                instruction: userInstruction,
                planType: plan.type,
                planAction: plan.action
            });

            // 2. Execute the generated plan.
            const executionResponse = await base44.functions.invoke('executeAIPlan', { 
                plan, 
                tenant_id: tenantId, 
                current_user_email: userEmail 
            });
            
            if (executionResponse.error || !executionResponse.data.success) {
                throw new Error(executionResponse.error?.message || executionResponse.data.summaryMessage || "Something went wrong while processing your request.");
            }
            
            const { summaryMessage, uiActions } = executionResponse.data;
            trackingData.plan_executed = true;
            trackingData.success = true;
            trackingData.execution_time_ms = Date.now() - startTime;
            
            console.log('✅ Voice Command Completed (handleVoiceCommand):', {
                user: userEmail,
                instruction: userInstruction,
                executionTime: trackingData.execution_time_ms + 'ms',
                response: summaryMessage,
                uiActions: uiActions?.length || 0
            });
            
            // 3. Formulate the final response for the widget.
            const result = {
                spokenResponse: summaryMessage,
                uiActions: uiActions || []
            };

            return new Response(JSON.stringify({
                jsonrpc: '2.0',
                id: body.id,
                result: { content: [{ type: 'text', text: JSON.stringify(result) }] }
            }), {
                headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }

        // Fallback for unknown methods
        return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, error: { code: -32601, message: 'Method not found' } }), {
            status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });

    } catch (error) {
        trackingData.success = false;
        trackingData.error_message = error.message;
        trackingData.execution_time_ms = Date.now() - startTime;

        console.error('❌ Voice Command Failed (handleVoiceCommand):', {
            user: trackingData.user_email,
            instruction: trackingData.instruction,
            error: error.message,
            executionTime: trackingData.execution_time_ms + 'ms',
            planGenerated: trackingData.plan_generated,
            planExecuted: trackingData.plan_executed
        });

        let requestId = body ? body.id : 1;
        const errorResult = { spokenResponse: `I'm sorry, I encountered an error: ${error.message}`, uiActions: [] };
        return new Response(JSON.stringify({
            jsonrpc: '2.0',
            id: requestId,
            result: { content: [{ type: 'text', text: JSON.stringify(errorResult) }] }
        }), {
            status: 200, // Return 200 so the widget can speak the error
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
    } finally {
        // Store execution tracking data for troubleshooting
        try {
            const base44 = createClientFromRequest(req);
            await base44.asServiceRole.entities.PerformanceLog.create({
                function_name: 'handleVoiceCommand',
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

export default handleVoiceCommand;
