/**
 * invokeSystemOpenAI
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.0';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  
  try {
    // Verify user is authenticated
    const currentUser = await base44.auth.me();
    if (!currentUser) {
      return new Response(JSON.stringify({ 
        error: 'Unauthorized',
        success: false 
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const { prompt, context_data, max_tokens, temperature } = await req.json();
    
    if (!prompt) {
      return new Response(JSON.stringify({
        error: 'Prompt is required',
        success: false
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Get admin's system OpenAI settings
    let systemSettings = null;
    
    try {
      const adminUsers = await base44.asServiceRole.entities.User.filter({ role: 'admin' });
      const superAdminUsers = await base44.asServiceRole.entities.User.filter({ role: 'superadmin' });
      
      // Try superadmin first, then admin
      for (const user of [...superAdminUsers, ...adminUsers]) {
        if (user.system_openai_settings?.enabled && user.system_openai_settings?.openai_api_key) {
          systemSettings = user.system_openai_settings;
          console.log('Found OpenAI settings for user:', user.email);
          break;
        }
      }
    } catch (userFetchError) {
      console.warn('Could not fetch admin users for OpenAI settings:', userFetchError);
    }

    if (!systemSettings) {
      console.log('No system OpenAI settings found');
      return new Response(JSON.stringify({ 
        error: 'System OpenAI not configured',
        success: false,
        fallback: true,
        message: 'No admin has configured system OpenAI settings'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log('Making OpenAI API call...');
    
    // Make OpenAI API call
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${systemSettings.openai_api_key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: systemSettings.model || 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are an AI assistant for a CRM system. You are helping user ${currentUser.email} from tenant ${currentUser.tenant_id || 'admin'}. 
            
            CRITICAL TENANT ISOLATION RULES:
            - Only provide information about data that belongs to tenant: ${currentUser.tenant_id || 'admin'}
            - Never reveal information from other tenants
            - If asked about data outside your scope, politely decline
            - Keep responses professional and CRM-focused
            
            ${context_data ? `Context data: ${JSON.stringify(context_data)}` : ''}`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: max_tokens || systemSettings.max_tokens || 1000,
        temperature: temperature || systemSettings.temperature || 0.7,
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error('OpenAI API error:', openaiResponse.status, errorText);
      
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: { message: errorText } };
      }
      
      throw new Error(`OpenAI API error (${openaiResponse.status}): ${errorData.error?.message || errorText}`);
    }

    const data = await openaiResponse.json();
    
    return new Response(JSON.stringify({
      success: true,
      response: data.choices[0].message.content,
      usage: data.usage,
      model: systemSettings.model || 'gpt-4o-mini'
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('System OpenAI error:', error);
    return new Response(JSON.stringify({
      error: error.message || 'Failed to process AI request',
      success: false
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});

----------------------------

export default invokeSystemOpenAI;
