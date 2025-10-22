/**
 * testSystemOpenAI
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.5.0';
import OpenAI from 'npm:openai';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        const user = await base44.auth.me();
        if (!user || (user.role !== 'admin' && user.role !== 'superadmin')) {
            return new Response(JSON.stringify({ 
                success: false, 
                error: "Unauthorized. Only admins can test system OpenAI settings." 
            }), { 
                status: 403, 
                headers: { "Content-Type": "application/json" } 
            });
        }

        const { api_key, model = 'gpt-4o-mini' } = await req.json();

        if (!api_key || typeof api_key !== 'string') {
            return new Response(JSON.stringify({ 
                success: false, 
                error: "API key is required and must be a valid string" 
            }), { 
                status: 400, 
                headers: { "Content-Type": "application/json" } 
            });
        }

        // Basic API key format validation
        if (!api_key.startsWith('sk-') || api_key.length < 20) {
            return new Response(JSON.stringify({ 
                success: false, 
                error: "Invalid API key format. OpenAI API keys should start with 'sk-' and be longer than 20 characters." 
            }), { 
                status: 400, 
                headers: { "Content-Type": "application/json" } 
            });
        }

        // Initialize OpenAI with the provided key
        const openai = new OpenAI({
            apiKey: api_key,
        });

        try {
            // Test the connection with a simple request
            const completion = await openai.chat.completions.create({
                model: model,
                messages: [{ 
                    role: "user", 
                    content: "Respond with exactly: 'OpenAI integration test successful'" 
                }],
                max_tokens: 20
            });

            const response = completion.choices[0].message.content;

            return new Response(JSON.stringify({ 
                success: true, 
                message: `Connection successful! Model: ${model}, Response: ${response}` 
            }), { 
                status: 200, 
                headers: { "Content-Type": "application/json" } 
            });

        } catch (openaiError) {
            console.error("OpenAI API error:", openaiError);
            
            let errorMessage = "Failed to connect to OpenAI";
            
            if (openaiError.status === 401) {
                errorMessage = "Invalid API key - please check your OpenAI API key";
            } else if (openaiError.status === 429) {
                errorMessage = "Rate limit exceeded or quota exhausted";
            } else if (openaiError.status === 404) {
                errorMessage = `Model '${model}' not found or not accessible with this API key`;
            } else if (openaiError.message?.includes('model')) {
                errorMessage = "Model not available or not supported";
            }

            return new Response(JSON.stringify({ 
                success: false, 
                error: errorMessage,
                details: openaiError.message || "Unknown OpenAI API error"
            }), { 
                status: 400, 
                headers: { "Content-Type": "application/json" } 
            });
        }

    } catch (error) {
        console.error("Error testing system OpenAI:", error);
        
        return new Response(JSON.stringify({ 
            success: false, 
            error: "Internal server error while testing OpenAI connection",
            details: error.message 
        }), { 
            status: 500, 
            headers: { "Content-Type": "application/json" } 
        });
    }
});

----------------------------

export default testSystemOpenAI;
