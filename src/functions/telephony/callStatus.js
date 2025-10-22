/**
 * callStatus
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.5.0';

Deno.serve(async (req) => {
  const startTime = Date.now();
  
  try {
    // For now, implement basic authentication until middleware is fixed
    const base44 = createClientFromRequest(req);
    
    // Check API key or user authentication
    const apiKey = req.headers.get('x-api-key');
    let user = null;
    
    if (apiKey) {
      // Validate API key - you should have a secure way to validate this
      const validApiKey = Deno.env.get('CRM_API_KEY');
      if (!validApiKey || apiKey !== validApiKey) {
        return new Response(
          JSON.stringify({ error: 'Invalid API key' }), 
          { status: 401, headers: { 'Content-Type': 'application/json' }}
        );
      }
    } else {
      // Check user authentication
      try {
        user = await base44.auth.me();
        if (!user || !['admin', 'power-user'].includes(user.role)) {
          return new Response(
            JSON.stringify({ error: 'Insufficient permissions' }), 
            { status: 403, headers: { 'Content-Type': 'application/json' }}
          );
        }
      } catch (authError) {
        return new Response(
          JSON.stringify({ error: 'Authentication required' }), 
          { status: 401, headers: { 'Content-Type': 'application/json' }}
        );
      }
    }

    const { callSid } = await req.json();
    
    if (!callSid) {
      return new Response(
        JSON.stringify({ error: 'Missing callSid parameter' }), 
        { 
          status: 400, 
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    
    if (!accountSid || !authToken) {
      return new Response(
        JSON.stringify({ error: 'Missing Twilio credentials' }), 
        { 
          status: 500, 
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    // Get call status from Twilio API
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${callSid}.json`;
    const credentials = btoa(`${accountSid}:${authToken}`);
    
    const response = await fetch(twilioUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    
    if (!response.ok) {
      return new Response(
        JSON.stringify({ 
          error: `Failed to fetch call status: ${response.status} ${response.statusText}` 
        }), 
        { 
          status: response.status, 
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    const callData = await response.json();
    
    return new Response(
      JSON.stringify({
        success: true,
        callSid: callData.sid,
        status: callData.status,
        duration: callData.duration,
        price: callData.price,
        priceUnit: callData.price_unit,
        direction: callData.direction,
        from: callData.from,
        to: callData.to,
        startTime: callData.start_time,
        endTime: callData.end_time,
        answeredBy: callData.answered_by
      }), 
      {
        status: 200,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key'
        }
      }
    );
    
  } catch (error) {
    console.error('Error in callStatus function:', error);
    
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error.message 
      }), 
      { 
        status: 500, 
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
});

----------------------------

export default callStatus;
