/**
 * mcpServerPublic
 * Server-side function for your backend
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': '*',
};

Deno.serve(async (req) => {
  console.log(`🟢 PUBLIC TEST: ${req.method} request received`);
  console.log(`🟢 Headers:`, Object.fromEntries(req.headers.entries()));
  
  if (req.method === 'OPTIONS') {
    console.log('🟢 Handling preflight');
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.text();
    console.log(`🟢 Body: ${body}`);
    
    const response = {
      jsonrpc: '2.0',
      id: 1,
      result: {
        tools: [
          { name: 'test_navigation', description: 'Test navigation tool' }
        ]
      }
    };

    console.log(`🟢 Sending response:`, response);
    
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });

  } catch (error) {
    console.error('🔴 Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
});

----------------------------

export default mcpServerPublic;
