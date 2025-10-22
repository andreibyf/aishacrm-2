/**
 * mcpServerDebug
 * Server-side function for your backend
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': '*',
};

Deno.serve(async (req) => {
  console.log('🟢 MCP DEBUG: Request received!');
  console.log('🟢 Method:', req.method);
  console.log('🟢 URL:', req.url);
  console.log('🟢 Headers:', Object.fromEntries(req.headers.entries()));
  
  if (req.method === 'OPTIONS') {
    console.log('🟢 Handling OPTIONS request');
    return new Response('ok', { headers: corsHeaders });
  }
  
  try {
    const body = await req.text();
    console.log('🟢 Raw Body:', body);
    
    if (!body) {
      console.log('🟡 Empty body received');
      return new Response(JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        result: { message: 'Empty body received' }
      }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    
    let payload;
    try {
      payload = JSON.parse(body);
      console.log('🟢 Parsed payload:', JSON.stringify(payload, null, 2));
    } catch (parseError) {
      console.log('🔴 JSON Parse Error:', parseError.message);
      return new Response(JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        error: { code: -32700, message: 'Parse error' }
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    
    // Handle different methods
    if (payload.method === 'tools/list') {
      console.log('🟢 Handling tools/list request');
      const response = {
        jsonrpc: '2.0',
        id: payload.id,
        result: {
          tools: [
            { name: 'navigate_to_contacts', description: 'Navigate to contacts' },
            { name: 'navigate_to_dashboard', description: 'Navigate to dashboard' }
          ]
        }
      };
      console.log('🟢 Sending tools/list response:', JSON.stringify(response, null, 2));
      return new Response(JSON.stringify(response), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    
    // Default response for any other method
    const response = {
      jsonrpc: '2.0',
      id: payload.id || 1,
      result: { message: `Method ${payload.method} received successfully` }
    };
    
    console.log('🟢 Sending default response:', JSON.stringify(response, null, 2));
    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
    
  } catch (error) {
    console.error('🔴 UNEXPECTED ERROR:', error.message);
    console.error('🔴 ERROR STACK:', error.stack);
    
    return new Response(JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      error: { code: -32603, message: 'Internal server error', data: error.message }
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
});

----------------------------

export default mcpServerDebug;
