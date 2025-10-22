/**
 * elevenLabsNavigation
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
    function_name: 'elevenLabsNavigation',
    request_body: null,
    success: false,
    error_message: null,
    execution_time_ms: 0,
    response_data: null
  };

  try {
    const base44 = createClientFromRequest(req);

    // 1. API Key Authentication
    const apiKey = req.headers.get('api-key');
    if (!apiKey) {
        return new Response(JSON.stringify({ error: "Unauthorized: API key is missing from headers." }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders }});
    }

    const storedKeys = await base44.asServiceRole.entities.ApiKey.filter({ key_value: apiKey });
    if (storedKeys.length === 0 || !storedKeys[0].is_active) {
        return new Response(JSON.stringify({ error: "Unauthorized: Invalid or inactive API key." }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }
    
    // Log key usage (fire and forget)
    base44.asServiceRole.entities.ApiKey.update(storedKeys[0].id, {
        last_used: new Date().toISOString(),
        usage_count: (storedKeys[0].usage_count || 0) + 1
    }).catch(console.error);

    const body = await req.json();
    trackingData.request_body = body;

    const { action, target } = body;

    if (action !== 'navigate') {
      throw new Error('Invalid action. Expected "navigate".');
    }

    if (!target) {
      throw new Error('Target page is required for navigation.');
    }

    const validPages = [
      'Dashboard', 'Contacts', 'Accounts', 'Leads', 'Opportunities', 
      'Activities', 'Reports', 'Settings', 'CashFlow', 'Employees', 
      'AICampaigns', 'DocumentProcessing', 'DocumentManagement'
    ];

    if (!validPages.some(page => page.toLowerCase() === target.toLowerCase())) {
      throw new Error(`Invalid target page: ${target}.`);
    }
    
    const properCaseTarget = validPages.find(page => page.toLowerCase() === target.toLowerCase());

    const response = {
      success: true,
      message: `Navigating to ${properCaseTarget}`,
      uiAction: {
        type: 'navigate',
        target: properCaseTarget
      }
    };

    trackingData.success = true;
    trackingData.response_data = response;
    trackingData.execution_time_ms = Date.now() - startTime;

    console.log('🎯 ElevenLabs Navigation Executed:', { target: properCaseTarget });

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });

  } catch (error) {
    trackingData.success = false;
    trackingData.error_message = error.message;
    trackingData.execution_time_ms = Date.now() - startTime;
    console.error('❌ ElevenLabs Navigation Error:', { error: error.message });

    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      message: `Navigation failed: ${error.message}`
    }), {
      status: 200, // Return 200 so the widget can speak the error
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } finally {
    // Store execution tracking data
    try {
      const base44 = createClientFromRequest(req);
      await base44.asServiceRole.entities.PerformanceLog.create({
        function_name: 'elevenLabsNavigation',
        response_time_ms: trackingData.execution_time_ms,
        status: trackingData.success ? 'success' : 'error',
        error_message: trackingData.error_message
      });
    } catch (logError) {
      console.warn('Failed to log navigation execution:', logError);
    }
  }
});

----------------------------

export default elevenLabsNavigation;
