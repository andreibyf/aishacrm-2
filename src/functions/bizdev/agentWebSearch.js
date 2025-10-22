/**
 * agentWebSearch
 * Server-side function for your backend
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Verify user is authenticated
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { prompt, response_json_schema, tenant_id, tenant_name, tenant_industry } = await req.json();

    if (!prompt) {
      return Response.json({ error: 'Prompt is required' }, { status: 400 });
    }

    // Use the Core.InvokeLLM integration with internet context
    const result = await base44.integrations.Core.InvokeLLM({
      prompt,
      add_context_from_internet: true,
      response_json_schema: response_json_schema || null
    });

    return Response.json({
      success: true,
      result,
      context: {
        tenant_id,
        tenant_name,
        tenant_industry
      }
    });

  } catch (error) {
    console.error('Agent web search error:', error);
    return Response.json({ 
      success: false,
      error: error.message || 'Web search failed'
    }, { status: 500 });
  }
});

----------------------------

export default agentWebSearch;
