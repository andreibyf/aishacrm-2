/**
 * mcpServer
 * Server-side function for your backend
 */

// REMOVED: No longer importing createClientFromRequest here.
// We will add it back inside the 'tools/call' block when needed.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, api-key, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Statically define tools for maximum speed and reliability.
const tools = [
  {
    name: 'navigate_to_contacts',
    description: 'Navigate to the contacts page in the CRM',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'navigate_to_leads', 
    description: 'Navigate to the leads page in the CRM',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'navigate_to_opportunities',
    description: 'Navigate to the opportunities page in the CRM', 
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'navigate_to_dashboard',
    description: 'Navigate to the dashboard page in the CRM',
    inputSchema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'search_contact',
    description: 'Search for a contact by name',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'The name of the contact to search for' } },
      required: ['name']
    }
  }
];

Deno.serve(async (req) => {
  console.log(`🟢 MCP SERVER: ${req.method} request received`);
  
  if (req.method === 'OPTIONS') {
    console.log('🟢 Handling CORS preflight request');
    return new Response('ok', { headers: corsHeaders });
  }

  let body = '';
  try {
    body = await req.text();
    console.log(`🟢 MCP Body: ${body || '[empty]'}`);
    
    const payload = JSON.parse(body);

    if (payload.method === 'tools/list') {
      const response = {
        jsonrpc: '2.0',
        id: payload.id,
        result: { tools: tools }
      };
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    if (payload.method === 'tools/call') {
      const { name, arguments: args } = payload.params;
      let result = { action: 'navigate', url: '/Dashboard', message: 'Unknown tool' };
      
      switch (name) {
        case 'navigate_to_contacts':
          result = { action: 'navigate', url: '/Contacts', message: 'Navigating to contacts...' };
          break;
        case 'navigate_to_leads':
          result = { action: 'navigate', url: '/Leads', message: 'Navigating to leads...' };
          break;
        case 'navigate_to_opportunities':
          result = { action: 'navigate', url: '/Opportunities', message: 'Navigating to opportunities...' };
          break;
        case 'navigate_to_dashboard':
          result = { action: 'navigate', url: '/Dashboard', message: 'Navigating to dashboard...' };
          break;
        case 'search_contact': {
          const searchName = args?.name || '';
          result = { action: 'navigate', url: `/Contacts?search=${encodeURIComponent(searchName)}`, message: `Searching for contact: ${searchName}` };
          break;
        }
      }
      
      const response = {
        jsonrpc: '2.0',
        id: payload.id,
        result: { content: [{ type: 'text', text: JSON.stringify(result) }] }
      };
      
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // Fallback for unknown methods
    return new Response(JSON.stringify({
      jsonrpc: '2.0',
      id: payload.id,
      error: { code: -32601, message: 'Method not found' }
    }), { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

  } catch (error) {
    console.error('🔴 MCP SERVER FAILED:', error.message);
    console.error('🔴 STACK:', error.stack);
    
    let requestId = 1;
    if (body) {
      try { requestId = JSON.parse(body).id || 1; } catch { /* ignore */ }
    }

    const errorResponse = {
      jsonrpc: '2.0',
      id: requestId,
      error: { code: -32603, message: 'Internal Server Error', data: error.message }
    };
    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
});

----------------------------

export default mcpServer;
