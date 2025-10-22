/**
 * mcpServerSimple
 * Server-side function for your backend
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, api-key, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  console.log(`Request method: ${req.method}`);
  console.log(`Request headers:`, Object.fromEntries(req.headers.entries()));
  
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS preflight request');
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.text();
    console.log(`Request body: ${body}`);
    
    const payload = JSON.parse(body);
    console.log(`Parsed payload:`, payload);

    let response = {
      jsonrpc: '2.0',
      id: payload.id || 1,
      result: { message: 'Simple test response' }
    };

    if (payload.method === 'tools/list') {
      response.result = {
        tools: [
          { name: 'test_tool', description: 'A simple test tool' }
        ]
      };
    }

    console.log(`Sending response:`, response);
    
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      error: { code: -32603, message: 'Internal server error', data: error.message }
    }), {
      status: 500,
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
});

----------------------------

export default mcpServerSimple;
