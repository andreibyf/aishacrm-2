/**
 * invokeTenantLLM
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.0';
import OpenAI from 'npm:openai';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);

    try {
        const user = await base44.auth.me();
        if (!user) {
            return new Response(JSON.stringify({ error: "User not authenticated." }), { 
                status: 401, 
                headers: { "Content-Type": "application/json" } 
            });
        }

        const { prompt, max_tokens, temperature, tenant_id } = await req.json();

        // Determine the effective tenant ID
        let effectiveTenantId = user.tenant_id;
        
        // For superadmins, check if they have selectedTenantId in the request
        if (user.role === 'superadmin') {
            const urlParams = new URL(req.url).searchParams;
            const selectedTenantId = urlParams.get('selectedTenantId') || tenant_id;
            if (selectedTenantId) {
                effectiveTenantId = selectedTenantId;
            }
        }

        if (!effectiveTenantId) {
            return new Response(JSON.stringify({ 
                error: "No tenant context available.",
                success: false 
            }), { 
                status: 403, 
                headers: { "Content-Type": "application/json" } 
            });
        }

        console.log('Looking for OpenAI integration for tenant:', effectiveTenantId);

        // Fetch the OpenAI integration settings for the specific tenant
        const openaiIntegrations = await base44.entities.TenantIntegration.filter({
            tenant_id: effectiveTenantId,
            integration_type: 'openai_llm',
            is_active: true
        });

        if (openaiIntegrations.length === 0 || !openaiIntegrations[0].api_credentials?.api_key) {
            return new Response(JSON.stringify({ 
                error: `OpenAI API key not configured for tenant: ${effectiveTenantId}. Please configure it in Integrations.`,
                success: false
            }), { 
                status: 404, 
                headers: { "Content-Type": "application/json" } 
            });
        }

        const openaiIntegration = openaiIntegrations[0];
        console.log('Found OpenAI integration for tenant:', effectiveTenantId);

        // Initialize OpenAI with the tenant's specific key
        const openai = new OpenAI({
            apiKey: openaiIntegration.api_credentials.api_key,
        });

        // Use tenant's configured model or default
        const model = openaiIntegration.configuration?.model || 'gpt-4o-mini';

        // Make the call to OpenAI
        const completion = await openai.chat.completions.create({
            model: model,
            messages: [{ role: "user", content: prompt }],
            max_tokens: max_tokens || 1000,
            temperature: temperature || 0.7,
        });

        const reply = completion.choices[0].message.content;

        return new Response(JSON.stringify({ 
            success: true,
            response: reply,
            model: model,
            usage: completion.usage
        }), { 
            status: 200, 
            headers: { "Content-Type": "application/json" } 
        });

    } catch (error) {
        console.error("Error invoking tenant LLM:", error);
        
        // Avoid circular reference by only extracting safe error properties
        const safeError = {
            message: error.message,
            name: error.name,
            stack: error.stack
        };
        
        return new Response(JSON.stringify({ 
            error: "Failed to communicate with the AI model.", 
            details: safeError.message,
            success: false
        }), { 
            status: 500, 
            headers: { "Content-Type": "application/json" } 
        });
    }
});

----------------------------

export default invokeTenantLLM;
