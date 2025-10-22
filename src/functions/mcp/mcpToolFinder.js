/**
 * mcpToolFinder
 * Server-side function for your backend
 */

// A dedicated, isolated function for testing tool discovery.
export const mcpToolFinder = () => {
  console.log("Executing mcpToolFinder: a dedicated diagnostic function.");
  const tools = [
    { name: '[Finder] get_activities', description: 'Test activity tool' },
    { name: '[Finder] get_contacts', description: 'Test contact tool' },
    { name: '[Finder] get_leads', description: 'Test lead tool' }
  ];

  return {
    jsonrpc: '2.0',
    id: 'mcp-tool-finder-diagnostic',
    result: { tools: tools }
  };
};

export default Deno.serve((req) => {
    const result = mcpToolFinder();
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
});

----------------------------

export default mcpToolFinder;
