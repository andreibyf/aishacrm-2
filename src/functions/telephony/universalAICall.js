/**
 * universalAICall
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.0';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { provider, callConfig, tenantId } = await req.json();

        // Get tenant configuration for the selected provider
        const tenant = await base44.entities.Tenant.get(tenantId);
        if (!tenant) {
            return Response.json({ error: 'Tenant not found' }, { status: 404 });
        }

        const providerConfig = tenant.ai_calling_providers?.[provider];
        if (!providerConfig || !providerConfig.is_active) {
            return Response.json({ 
                error: `${provider} is not configured or active for this tenant` 
            }, { status: 400 });
        }

        let callResult;

        switch (provider) {
            case 'callfluent':
                callResult = await makeCallFluentCall(providerConfig, callConfig);
                break;
            case 'thoughtly':
                callResult = await makeThoughtlyCall(providerConfig, callConfig);
                break;
            default:
                return Response.json({ error: 'Unsupported provider' }, { status: 400 });
        }

        return Response.json(callResult);

    } catch (error) {
        console.error('Universal AI call error:', error);
        return Response.json({ 
            error: 'Failed to initiate call',
            details: error.message 
        }, { status: 500 });
    }
});

async function makeCallFluentCall(config, callConfig) {
    const payload = {
        prompt: callConfig.prompt,
        contact_name: callConfig.contact_name,
        contact_phone: callConfig.contact_phone,
        call_objective: callConfig.call_objective,
        max_duration: callConfig.max_duration || 300,
        metadata: {
            tenant_id: callConfig.tenant_id,
            activity_id: callConfig.activity_id,
            campaign_id: callConfig.campaign_id
        }
    };

    const response = await fetch(config.webhook_url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.api_key}`
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error(`CallFluent API error: ${response.statusText}`);
    }

    return await response.json();
}

async function makeThoughtlyCall(config, callConfig) {
    // Thoughtly API integration
    const payload = {
        agent_id: config.agent_id,
        to_number: callConfig.contact_phone,
        variables: {
            contact_name: callConfig.contact_name,
            custom_prompt: callConfig.prompt,
            call_objective: callConfig.call_objective
        },
        max_duration_seconds: callConfig.max_duration || 300,
        webhook_url: `${Deno.env.get('BASE_URL')}/api/functions/thoughtlyCallResults`,
        metadata: {
            tenant_id: callConfig.tenant_id,
            activity_id: callConfig.activity_id,
            campaign_id: callConfig.campaign_id
        }
    };

    const response = await fetch('https://api.thoughtly.co/v1/calls', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.api_key}`
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error(`Thoughtly API error: ${response.statusText}`);
    }

    return await response.json();
}

----------------------------

export default universalAICall;
