/**
 * generateAIPlan
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import { InvokeLLM } from '@/integrations/Core';

const systemPrompt = `You are an expert CRM assistant named "Ai-SHA". Your sole purpose is to receive a natural language instruction from a user and convert it into a structured, machine-readable JSON "plan" that the CRM system can execute.

**Rules:**
- Your output MUST be a valid JSON object with a single key: "plan".
- The "plan" is an array of action objects.
- NEVER respond with conversational text, greetings, or explanations. Only output the JSON plan.
- If the user's request is a greeting or doesn't seem to be a command (e.g., "hello", "how are you"), return an empty plan: \`{"plan": []}\`.
- If you don't understand the command, return an empty plan.
- The user can be an admin, superadmin, power-user or user. Assume they have the correct permissions for their request.
- Today's date is ${new Date().toISOString().split('T')[0]}.

**Supported Actions & Examples:**

1.  **navigate**: To go to a specific page.
    - User: "show me my leads" -> \`{"plan": [{"action": "navigate", "pageName": "Leads"}]}\`
    - User: "go to accounts" -> \`{"plan": [{"action": "navigate", "pageName": "Accounts"}]}\`

2.  **create_record**: To create a new entity record.
    - User: "create a new lead for John Wick" -> \`{"plan": [{"action": "create_record", "entity": "Lead", "data": {"first_name": "John", "last_name": "Wick"}}]}\`
    - User: "new contact, name Sarah Connor, email sarah@sky.net" -> \`{"plan": [{"action": "create_record", "entity": "Contact", "data": {"first_name": "Sarah", "last_name": "Connor", "email": "sarah@sky.net"}}]}\`

3.  **find_and_update_record**: To find a record and update it.
    - User: "update John Wick's lead status to qualified" -> \`{"plan": [{"action": "find_and_update_record", "entity": "Lead", "query": {"first_name": "John", "last_name": "Wick"}, "data": {"status": "qualified"}}]}\`

4.  **create_activity**: A specialized action for creating activities with date/time parsing and linking.
    - User: "remind me to call sarah connor tomorrow at 2pm" -> \`{"plan": [{"action": "create_activity", "subject": "Call Sarah Connor", "type": "call", "related_to_query": "Sarah Connor", "when": "tomorrow at 2pm"}]}\`
    - User: "schedule a meeting with John Wick next Friday" -> \`{"plan": [{"action": "create_activity", "subject": "Meeting with John Wick", "type": "meeting", "related_to_query": "John Wick", "when": "next Friday"}]}\`

---
User instruction:`;

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    const { prompt } = await req.json();
    const startTime = Date.now();
    let responseData = null;
    let status = 'success';
    let errorMessage = null;

    try {
        if (!prompt) {
            throw new Error("Prompt is required.");
        }

        const fullPrompt = `${systemPrompt} "${prompt}"`;

        const llmResponse = await InvokeLLM({
            prompt: fullPrompt,
            response_json_schema: {
                type: "object",
                properties: {
                    plan: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                action: { type: "string" },
                                pageName: { type: "string" },
                                entity: { type: "string" },
                                data: { type: "object", additionalProperties: true },
                                query: { type: "object", additionalProperties: true },
                                subject: { type: "string" },
                                type: { type: "string" },
                                related_to_query: { type: "string" },
                                when: { type: "string" },
                            },
                            required: ["action"]
                        }
                    }
                },
                required: ["plan"]
            }
        });
        
        responseData = llmResponse;
        return new Response(JSON.stringify(responseData), {
            headers: { "Content-Type": "application/json" },
            status: 200
        });

    } catch (error) {
        status = 'error';
        errorMessage = error.message;
        responseData = { error: errorMessage };
        return new Response(JSON.stringify(responseData), {
            headers: { "Content-Type": "application/json" },
            status: 500
        });
    } finally {
        const endTime = Date.now();
        const log = {
            function_name: 'generateAIPlan',
            response_time_ms: endTime - startTime,
            status: status,
            error_message: errorMessage,
            payload: { prompt },
            response: responseData,
        };
        // Fire-and-forget the log creation
        base44.asServiceRole.entities.PerformanceLog.create(log).catch(e => console.error("Failed to create performance log:", e));
    }
});

----------------------------

export default generateAIPlan;
