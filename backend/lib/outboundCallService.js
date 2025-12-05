/**
 * Outbound Call Service
 * 
 * Unified interface for initiating outbound calls via CallFluent or Thoughtly.
 * Used by both workflow automations and AI assistant.
 */

import { getSupabaseClient } from './supabase-db.js';

// Get supabase client (lazy initialization)
const getSupabase = () => getSupabaseClient();

/**
 * Initiate an outbound call
 * 
 * @param {Object} options
 * @param {string} options.tenant_id - Tenant UUID
 * @param {string} options.provider - 'callfluent' or 'thoughtly'
 * @param {string} options.phone_number - Phone number to call
 * @param {string} options.contact_id - Optional contact ID
 * @param {string} options.contact_name - Name for AI context
 * @param {string} options.contact_email - Email for AI context
 * @param {string} options.company - Company for AI context
 * @param {string} options.purpose - Call purpose/objective
 * @param {string[]} options.talking_points - Key points for AI to cover
 * @param {string} options.agent_id - Provider-specific agent ID (optional, uses tenant default)
 * @param {Object} options.metadata - Additional metadata
 */
export async function initiateOutboundCall(options) {
  const {
    tenant_id,
    provider,
    phone_number,
    contact_id,
    contact_name,
    contact_email,
    company,
    purpose,
    talking_points = [],
    agent_id,
    metadata = {}
  } = options;

  if (!tenant_id || !phone_number) {
    throw new Error('tenant_id and phone_number are required');
  }

  if (!['callfluent', 'thoughtly'].includes(provider)) {
    throw new Error(`Invalid provider: ${provider}. Must be 'callfluent' or 'thoughtly'`);
  }

  console.log(`[OutboundCall] Initiating ${provider} call to ${phone_number} for tenant ${tenant_id}`);

  // Step 1: Get provider credentials from tenant_integrations
  const credentials = await getProviderCredentials(tenant_id, provider);
  if (!credentials) {
    throw new Error(`No ${provider} integration configured for tenant`);
  }

  // Use provided agent_id or fall back to tenant default
  const effectiveAgentId = agent_id || credentials.agent_id;
  if (!effectiveAgentId) {
    throw new Error(`No agent_id configured for ${provider}`);
  }

  // Step 2: Build call context
  const callContext = {
    phone_number,
    contact: {
      id: contact_id,
      name: contact_name || 'Unknown',
      email: contact_email,
      company: company
    },
    purpose: purpose || 'General outreach',
    talking_points: Array.isArray(talking_points) ? talking_points : [talking_points],
    metadata: {
      ...metadata,
      tenant_id,
      initiated_at: new Date().toISOString()
    }
  };

  // Step 3: Trigger call via provider API
  let result;
  if (provider === 'callfluent') {
    result = await triggerCallFluentCall(credentials, effectiveAgentId, callContext);
  } else {
    result = await triggerThoughtlyCall(credentials, effectiveAgentId, callContext);
  }

  // Step 4: Log the call initiation as an activity
  if (contact_id) {
    await logCallInitiation(tenant_id, contact_id, provider, purpose, result);
  }

  return result;
}

/**
 * Get provider credentials from tenant_integrations
 */
async function getProviderCredentials(tenant_id, provider) {
  const { data, error } = await getSupabase()
    .from('tenant_integrations')
    .select('credentials, settings')
    .eq('tenant_id', tenant_id)
    .eq('integration_type', provider)
    .eq('is_active', true)
    .single();

  if (error || !data) {
    console.log(`[OutboundCall] No active ${provider} integration for tenant ${tenant_id}`);
    return null;
  }

  return {
    ...data.credentials,
    ...data.settings
  };
}

/**
 * Trigger CallFluent AI call
 */
async function triggerCallFluentCall(credentials, agentId, callContext) {
  const { api_key, base_url } = credentials;
  const baseUrl = base_url || 'https://api.callfluent.com';

  // Build webhook URL for call completion callback
  const webhookUrl = `${process.env.BACKEND_URL || 'http://localhost:4001'}/api/telephony/webhook/callfluent/outbound?tenant_id=${callContext.metadata.tenant_id}`;

  const payload = {
    agent_id: agentId,
    to: callContext.phone_number,
    context: {
      contact_name: callContext.contact.name,
      contact_email: callContext.contact.email,
      contact_company: callContext.contact.company,
      call_purpose: callContext.purpose,
      talking_points: callContext.talking_points
    },
    metadata: {
      contact_id: callContext.contact.id,
      ...callContext.metadata
    },
    webhook_url: webhookUrl
  };

  console.log('[OutboundCall] CallFluent request:', JSON.stringify(payload, null, 2));

  // If no API key, return mock response (development mode)
  if (!api_key) {
    console.log('[OutboundCall] No API key - returning mock response');
    return {
      success: true,
      provider: 'callfluent',
      status: 'initiated',
      call_id: `cf_mock_${Date.now()}`,
      message: 'Call initiated (mock mode - no API key configured)'
    };
  }

  try {
    const response = await fetch(`${baseUrl}/v1/calls`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${api_key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`CallFluent API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return {
      success: true,
      provider: 'callfluent',
      status: 'initiated',
      call_id: data.call_id || data.id,
      message: 'Call initiated successfully',
      raw_response: data
    };
  } catch (error) {
    console.error('[OutboundCall] CallFluent error:', error);
    return {
      success: false,
      provider: 'callfluent',
      status: 'failed',
      error: error.message
    };
  }
}

/**
 * Trigger Thoughtly AI call
 */
async function triggerThoughtlyCall(credentials, agentId, callContext) {
  const { api_key, base_url } = credentials;
  const baseUrl = base_url || 'https://api.thoughtly.ai';

  // Build webhook URL for call completion callback
  const webhookUrl = `${process.env.BACKEND_URL || 'http://localhost:4001'}/api/telephony/webhook/thoughtly/outbound?tenant_id=${callContext.metadata.tenant_id}`;

  const payload = {
    agent_id: agentId,
    phone_number: callContext.phone_number,
    contact_info: {
      name: callContext.contact.name,
      email: callContext.contact.email,
      company: callContext.contact.company
    },
    script: callContext.purpose,
    talking_points: callContext.talking_points,
    metadata: {
      contact_id: callContext.contact.id,
      ...callContext.metadata
    },
    callback_url: webhookUrl
  };

  console.log('[OutboundCall] Thoughtly request:', JSON.stringify(payload, null, 2));

  // If no API key, return mock response (development mode)
  if (!api_key) {
    console.log('[OutboundCall] No API key - returning mock response');
    return {
      success: true,
      provider: 'thoughtly',
      status: 'initiated',
      call_id: `th_mock_${Date.now()}`,
      message: 'Call initiated (mock mode - no API key configured)'
    };
  }

  try {
    const response = await fetch(`${baseUrl}/v1/calls`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${api_key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Thoughtly API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return {
      success: true,
      provider: 'thoughtly',
      status: 'initiated',
      call_id: data.call_id || data.id,
      message: 'Call initiated successfully',
      raw_response: data
    };
  } catch (error) {
    console.error('[OutboundCall] Thoughtly error:', error);
    return {
      success: false,
      provider: 'thoughtly',
      status: 'failed',
      error: error.message
    };
  }
}

/**
 * Log call initiation as an activity
 */
async function logCallInitiation(tenant_id, contact_id, provider, purpose, result) {
  try {
    // Determine related_to_type based on contact lookup
    const { data: contact } = await getSupabase()
      .from('contacts')
      .select('id')
      .eq('id', contact_id)
      .single();

    const relatedType = contact ? 'contact' : 'lead';

    await getSupabase().from('activities').insert({
      tenant_id,
      type: 'call',
      subject: `Outbound call initiated via ${provider}`,
      body: `Purpose: ${purpose}\n\nStatus: ${result.status}\nCall ID: ${result.call_id || 'N/A'}`,
      status: result.success ? 'planned' : 'failed',
      related_to_type: relatedType,
      related_to_id: contact_id,
      metadata: {
        provider,
        call_id: result.call_id,
        direction: 'outbound',
        initiated_by: 'system'
      }
    });
  } catch (error) {
    console.error('[OutboundCall] Failed to log activity:', error);
    // Don't throw - activity logging is not critical
  }
}

/**
 * Get available AI agents for a provider
 */
export async function getProviderAgents(tenant_id, provider) {
  const credentials = await getProviderCredentials(tenant_id, provider);
  if (!credentials) {
    return { success: false, error: `No ${provider} integration configured` };
  }

  // Return configured agent(s) - actual agent list would require API call
  return {
    success: true,
    provider,
    agents: [
      {
        id: credentials.agent_id,
        name: credentials.agent_name || 'Default Agent',
        is_default: true
      }
    ]
  };
}

/**
 * Check provider status/health
 */
export async function checkProviderStatus(tenant_id, provider) {
  const credentials = await getProviderCredentials(tenant_id, provider);
  if (!credentials) {
    return {
      configured: false,
      status: 'not_configured',
      message: `No ${provider} integration found`
    };
  }

  return {
    configured: true,
    status: credentials.api_key ? 'ready' : 'missing_api_key',
    has_agent: !!credentials.agent_id,
    message: credentials.api_key ? 'Ready to make calls' : 'API key not configured'
  };
}
