/**
 * checkBackendStatus
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  // Handle preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const base44 = createClientFromRequest(req);

    // Check Base44 SDK connection by fetching the user
    await base44.auth.me();
    const sdkStatus = { component: 'Base44 SDK', status: 'healthy', details: 'Successfully connected and authenticated.' };

    const overallStatus = 'healthy';
    const responseBody = {
      overall_status: overallStatus,
      timestamp: new Date().toISOString(),
      components: [sdkStatus]
    };

    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const responseBody = {
      overall_status: 'error',
      timestamp: new Date().toISOString(),
      components: [
        { component: 'Base44 SDK', status: 'error', details: error?.message || 'Unknown error' }
      ]
    };

    return new Response(JSON.stringify(responseBody), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

----------------------------

export default checkBackendStatus;
