/**
 * AI Routes
 * Chat, sentiment, summarization, embeddings, conversations
 */

import express from 'express';
import OpenAI from 'openai';
import fetch from 'node-fetch';

export default function createAIRoutes(pgPool, braidModules = []) {
  const router = express.Router();

  // Middleware to get tenant_id from request
  const getTenantId = (req) => {
    return req.headers['x-tenant-id'] || req.user?.tenant_id;
  };

  // Helper to get OpenAI API key (checks tenant first, then global, then env)
  const getOpenAIKey = async (tenant_id) => {
    try {
      // 1. PRIORITY: Check if tenant has tenant-specific OpenAI integration configured
      const tenantResult = await pgPool.query(
        `SELECT api_credentials FROM tenant_integrations 
         WHERE tenant_id = $1 
         AND integration_type = 'openai' 
         AND is_active = true 
         LIMIT 1`,
        [tenant_id]
      );
      
      if (tenantResult.rows.length > 0 && tenantResult.rows[0].api_credentials?.api_key) {
        console.log('[OpenAI] Using tenant-specific OpenAI key');
        return tenantResult.rows[0].api_credentials.api_key;
      }
      
      // 2. FALLBACK: Check global system settings (from UI Global Integration)
      const systemResult = await pgPool.query(
        `SELECT settings FROM system_settings WHERE id = 1 LIMIT 1`
      );
      
      if (systemResult.rows.length > 0) {
        const systemSettings = systemResult.rows[0].settings;
        const globalKey = systemSettings?.system_openai_settings?.openai_api_key;
        if (globalKey && systemSettings?.system_openai_settings?.enabled !== false) {
          console.log('[OpenAI] Using global system OpenAI key');
          return globalKey;
        }
      }
      
      // 3. LAST RESORT: Fallback to environment variable
      if (process.env.OPENAI_API_KEY) {
        console.log('[OpenAI] Using environment variable OpenAI key');
        return process.env.OPENAI_API_KEY;
      }
      
      console.log('[OpenAI] No API key found');
      return null;
    } catch (error) {
      console.error('Error fetching OpenAI key:', error);
      return process.env.OPENAI_API_KEY || null;
    }
  };

  // SSE clients storage for real-time conversation updates
  const conversationClients = new Map(); // conversationId -> Set of response objects

  /**
   * Discover MCP tools and convert to OpenAI function calling format
  * @param {string} _tenant_id - Tenant ID for context (unused but kept for API consistency)
   * @returns {Promise<Array>} OpenAI-compatible tool definitions
   */
  const discoverMCPTools = async (_tenant_id) => {
    const tools = [];
    
    // Convert Braid MCP functions to OpenAI tools
    for (const mod of braidModules) {
      if (mod.error || !mod.hir || !mod.hir.functions) continue;
      
      for (const fn of mod.hir.functions) {
        // Parse parameters from Braid HIR format: "param1: type1, param2: type2"
        const properties = {};
        const required = [];
        
        if (fn.params && fn.params.length > 0) {
          const paramPairs = fn.params.split(',').map(p => p.trim());
          for (const pair of paramPairs) {
            const [name, type] = pair.split(':').map(s => s.trim());
            if (name && type) {
              // Map Braid types to JSON Schema types
              const jsonType = type.toLowerCase().includes('string') ? 'string' 
                             : type.toLowerCase().includes('i32') ? 'number'
                             : type.toLowerCase().includes('bool') ? 'boolean'
                             : 'string';
              
              properties[name] = {
                type: jsonType,
                description: `${name} parameter (${type})`
              };
              required.push(name);
            }
          }
        }
        
        tools.push({
          type: 'function',
          function: {
            name: `braid_${fn.name}`,
            description: `Braid function: ${fn.name} from ${mod.file}. ${fn.effects?.join(', ') || 'Pure function'}`,
            parameters: {
              type: 'object',
              properties,
              required
            }
          }
        });
      }
    }
    
    // Add core CRM MCP tools
    tools.push({
      type: 'function',
      function: {
        name: 'crm_get_tenant_stats',
        description: 'Get count statistics for accounts, contacts, leads, opportunities, and activities',
        parameters: {
          type: 'object',
          properties: {},
          required: []
        }
      }
    });
    
    tools.push({
      type: 'function',
      function: {
        name: 'crm_search_leads',
        description: 'Search for leads by name, email, or company',
        parameters: {
          type: 'object',
          properties: {
            q: { type: 'string', description: 'Search query' },
            limit: { type: 'number', description: 'Max results (default 10)' }
          },
          required: []
        }
      }
    });
    
    tools.push({
      type: 'function',
      function: {
        name: 'crm_search_contacts',
        description: 'Search for contacts by name or email',
        parameters: {
          type: 'object',
          properties: {
            q: { type: 'string', description: 'Search query' },
            limit: { type: 'number', description: 'Max results (default 10)' }
          },
          required: []
        }
      }
    });
    
    return tools;
  };
  
  /**
   * Execute an MCP tool call
   * @param {string} toolName - Tool name from OpenAI (e.g., "braid_score_lead" or "crm_get_tenant_stats")
   * @param {object} args - Tool arguments
   * @param {string} tenant_id - Tenant ID for context
   * @returns {Promise<string>} JSON string result
   */
  const executeMCPTool = async (toolName, args, tenant_id) => {
    try {
      // Handle Braid tools
      if (toolName.startsWith('braid_')) {
        const functionName = toolName.replace(/^braid_/, '');
        
        // Call MCP execute-tool endpoint internally
        const mcpResponse = await fetch(`http://localhost:${process.env.PORT || 3001}/api/mcp/execute-tool`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            server_id: 'braid',
            tool_name: `braid.${functionName}`,
            parameters: args
          })
        });
        
        const result = await mcpResponse.json();
        if (result.status === 'success') {
          return JSON.stringify(result.data);
        } else {
          return JSON.stringify({ error: result.message });
        }
      }
      
      // Handle CRM tools
      if (toolName.startsWith('crm_')) {
        const toolNameMcp = toolName.replace(/^crm_/, 'crm.');
        
        const mcpResponse = await fetch(`http://localhost:${process.env.PORT || 3001}/api/mcp/execute-tool`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            server_id: 'crm',
            tool_name: toolNameMcp,
            parameters: { ...args, tenant_id }
          })
        });
        
        const result = await mcpResponse.json();
        if (result.status === 'success') {
          return JSON.stringify(result.data);
        } else {
          return JSON.stringify({ error: result.message });
        }
      }
      
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
    } catch (error) {
      console.error('[MCP Tool Execution Error]', error);
      return JSON.stringify({ error: error.message });
    }
  };

  // POST /api/ai/conversations - Create new conversation
  router.post('/conversations', async (req, res) => {
    try {
      const { agent_name = 'crm_assistant', metadata = {} } = req.body;
      let tenant_id = getTenantId(req);

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id required' });
      }

      // Resolve tenant string ID to UUID (e.g., "labor-depot" -> UUID from tenant table)
      // If tenant_id is already a UUID format, use it directly
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidPattern.test(tenant_id)) {
        // Lookup tenant UUID by name/id string
        const tenantLookup = await pgPool.query(
          'SELECT id FROM tenant WHERE id = $1 OR name = $1',
          [tenant_id]
        );
        if (tenantLookup.rows.length === 0) {
          return res.status(400).json({ status: 'error', message: `Tenant not found: ${tenant_id}` });
        }
        tenant_id = tenantLookup.rows[0].id;
      }

      const result = await pgPool.query(
        `INSERT INTO conversations (tenant_id, agent_name, metadata, status)
         VALUES ($1, $2, $3, 'active')
         RETURNING *`,
        [tenant_id, agent_name, JSON.stringify(metadata)]
      );

      res.json({
        status: 'success',
        data: result.rows[0],
      });
    } catch (error) {
      console.error('Create conversation error:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/ai/conversations/:id - Get conversation details
  router.get('/conversations/:id', async (req, res) => {
    try {
      const { id } = req.params;
      let tenant_id = getTenantId(req);

      // Resolve tenant string to UUID if needed
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (tenant_id && !uuidPattern.test(tenant_id)) {
        const tenantLookup = await pgPool.query(
          'SELECT id FROM tenant WHERE id = $1 OR name = $1',
          [tenant_id]
        );
        if (tenantLookup.rows.length > 0) {
          tenant_id = tenantLookup.rows[0].id;
        }
      }

      // Get conversation
      const convResult = await pgPool.query(
        'SELECT * FROM conversations WHERE id = $1 AND tenant_id = $2',
        [id, tenant_id]
      );

      if (convResult.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Conversation not found' });
      }

      // Get messages
      const messagesResult = await pgPool.query(
        `SELECT * FROM conversation_messages 
         WHERE conversation_id = $1 
         ORDER BY created_date ASC`,
        [id]
      );

      res.json({
        status: 'success',
        data: {
          ...convResult.rows[0],
          messages: messagesResult.rows,
        },
      });
    } catch (error) {
      console.error('Get conversation error:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/ai/conversations/:id/messages - Add message to conversation
  router.post('/conversations/:id/messages', async (req, res) => {
    try {
      const { id } = req.params;
      const { role, content, metadata = {} } = req.body;
      let tenant_id = getTenantId(req);

      if (!role || !content) {
        return res.status(400).json({ status: 'error', message: 'role and content required' });
      }

      // Resolve tenant string to UUID if needed
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (tenant_id && !uuidPattern.test(tenant_id)) {
        const tenantLookup = await pgPool.query(
          'SELECT id FROM tenant WHERE id = $1 OR name = $1',
          [tenant_id]
        );
        if (tenantLookup.rows.length > 0) {
          tenant_id = tenantLookup.rows[0].id;
        }
      }

      // Verify conversation exists and belongs to tenant
      const convCheck = await pgPool.query(
        'SELECT id FROM conversations WHERE id = $1 AND tenant_id = $2',
        [id, tenant_id]
      );

      if (convCheck.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Conversation not found' });
      }

      // Insert user message
      const result = await pgPool.query(
        `INSERT INTO conversation_messages (conversation_id, role, content, metadata)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [id, role, content, JSON.stringify(metadata)]
      );

      const message = result.rows[0];

      // Update conversation updated_date
      await pgPool.query(
        'UPDATE conversations SET updated_date = CURRENT_TIMESTAMP WHERE id = $1',
        [id]
      );

      // Broadcast user message to SSE clients
      if (conversationClients.has(id)) {
        const clients = conversationClients.get(id);
        const data = JSON.stringify({ type: 'message', data: message });
        
        clients.forEach((client) => {
          client.write(`data: ${data}\n\n`);
        });
      }

      // Generate AI response if this is a user message
      if (role === 'user') {
        console.log('[AI Response] Starting AI response generation for user message');
        
        // Get OpenAI key for this tenant (from DB or env)
        const apiKey = await getOpenAIKey(tenant_id);
        
        if (apiKey) {
          console.log('[AI Response] OpenAI key found, fetching conversation history');
          
          // Get conversation history for context
          const historyResult = await pgPool.query(
            `SELECT role, content FROM conversation_messages 
             WHERE conversation_id = $1 
             ORDER BY created_date ASC`,
            [id]
          );

          const messages = historyResult.rows.map(m => ({
            role: m.role,
            content: m.content
          }));

          console.log(`[AI Response] History loaded: ${messages.length} messages`);

          try {
            // Create OpenAI client with tenant's API key
            const tenantOpenAI = new OpenAI({ apiKey });
            
            console.log('[AI Response] Discovering MCP tools...');
            
            // Discover available MCP tools (Braid + CRM)
            const tools = await discoverMCPTools(tenant_id);
            console.log(`[AI Response] Discovered ${tools.length} MCP tools`);
            
            console.log('[AI Response] Calling OpenAI API with MCP tools...');
            
            // Call OpenAI to generate response with MCP function calling
            let completion = await tenantOpenAI.chat.completions.create({
              model: 'gpt-4o-mini',
              messages: [
                {
                  role: 'system',
                  content: 'You are Ai-SHA, a helpful CRM assistant. You help users manage their business contacts, leads, opportunities, and activities. Use the available functions to get real data from the CRM system. Be concise and professional.'
                },
                ...messages
              ],
              tools,
              tool_choice: 'auto',
              temperature: 0.7,
              max_tokens: 1000
            });
            
            // Handle function calls
            const responseMessage = completion.choices[0].message;
            
            if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
              console.log(`[AI Response] AI requested ${responseMessage.tool_calls.length} function calls`);
              
              // Add assistant's function call message to conversation
              messages.push(responseMessage);
              
              // Execute each function call
              for (const toolCall of responseMessage.tool_calls) {
                const functionName = toolCall.function.name;
                const functionArgs = JSON.parse(toolCall.function.arguments || '{}');
                
                console.log(`[AI Response] Executing function: ${functionName}`);
                
                // Execute via MCP
                const functionResult = await executeMCPTool(functionName, functionArgs, tenant_id);
                
                // Add function result to messages
                messages.push({
                  role: 'tool',
                  tool_call_id: toolCall.id,
                  content: functionResult
                });
                
                console.log(`[AI Response] Function ${functionName} returned:`, functionResult);
              }
              
              // Call OpenAI again with function results
              console.log('[AI Response] Calling OpenAI API again with function results...');
              completion = await tenantOpenAI.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                  {
                    role: 'system',
                    content: 'You are Ai-SHA, a helpful CRM assistant. You help users manage their business contacts, leads, opportunities, and activities. Use the available functions to get real data from the CRM system. Be concise and professional.'
                  },
                  ...messages
                ],
                tools,
                temperature: 0.7,
                max_tokens: 1000
              });
            }

            console.log('[AI Response] OpenAI API call completed');

            const assistantMessage = completion.choices[0]?.message?.content;
            
            if (assistantMessage) {
              console.log(`[AI Response] Got assistant message: ${assistantMessage.substring(0, 50)}...`);
              
              // Insert assistant response
              const aiResult = await pgPool.query(
                `INSERT INTO conversation_messages (conversation_id, role, content, metadata)
                 VALUES ($1, $2, $3, $4)
                 RETURNING *`,
                [id, 'assistant', assistantMessage, JSON.stringify({ model: 'gpt-4o-mini' })]
              );

              const aiMessage = aiResult.rows[0];

              console.log('[AI Response] Assistant message saved to database');

              // Update conversation timestamp
              await pgPool.query(
                'UPDATE conversations SET updated_date = CURRENT_TIMESTAMP WHERE id = $1',
                [id]
              );

              // Broadcast AI response to SSE clients
              if (conversationClients.has(id)) {
                const clients = conversationClients.get(id);
                const data = JSON.stringify({ type: 'message', data: aiMessage });
                
                console.log(`[AI Response] Broadcasting to ${clients.size} SSE clients`);
                
                clients.forEach((client) => {
                  client.write(`data: ${data}\n\n`);
                });
              } else {
                console.log('[AI Response] No SSE clients connected for this conversation');
              }
            } else {
              console.log('[AI Response] No assistant message in OpenAI response');
            }
          } catch (aiError) {
            console.error('[AI Response] OpenAI generation error:', aiError.message);
            console.error('[AI Response] Full error:', aiError);
            // Don't fail the request if AI generation fails - user message was saved
          }
        } else {
          console.log('[AI Response] No OpenAI API key available');
        }
      }

      res.json({
        status: 'success',
        data: message,
      });
    } catch (error) {
      console.error('Add message error:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/ai/conversations/:id/stream - SSE stream for conversation updates
  router.get('/conversations/:id/stream', async (req, res) => {
    try {
      const { id } = req.params;
      let tenant_id = getTenantId(req);

      // Resolve tenant string to UUID if needed
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (tenant_id && !uuidPattern.test(tenant_id)) {
        const tenantLookup = await pgPool.query(
          'SELECT id FROM tenant WHERE id = $1 OR name = $1',
          [tenant_id]
        );
        if (tenantLookup.rows.length > 0) {
          tenant_id = tenantLookup.rows[0].id;
        }
      }

      // Verify conversation exists
      const convCheck = await pgPool.query(
        'SELECT id FROM conversations WHERE id = $1 AND tenant_id = $2',
        [id, tenant_id]
      );

      if (convCheck.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Conversation not found' });
      }

      // Set SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Access-Control-Allow-Origin', '*');

      // Send initial connection message
      res.write(`data: ${JSON.stringify({ type: 'connected', conversationId: id })}\n\n`);

      // Add client to conversation's subscriber list
      if (!conversationClients.has(id)) {
        conversationClients.set(id, new Set());
      }
      conversationClients.get(id).add(res);

      // Send heartbeat every 30 seconds to keep connection alive
      const heartbeat = setInterval(() => {
        res.write(`: heartbeat\n\n`);
      }, 30000);

      // Clean up on disconnect
      req.on('close', () => {
        clearInterval(heartbeat);
        if (conversationClients.has(id)) {
          conversationClients.get(id).delete(res);
          if (conversationClients.get(id).size === 0) {
            conversationClients.delete(id);
          }
        }
      });
    } catch (error) {
      console.error('Stream conversation error:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/ai/chat - AI chat completion
  router.post('/chat', async (req, res) => {
    try {
      const { messages, model = 'gpt-4', temperature = 0.7 } = req.body;

      res.json({
        status: 'success',
        message: 'AI chat not yet implemented',
        data: { model, temperature, message_count: messages?.length || 0 },
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/ai/summarize - Summarize text
  router.post('/summarize', async (req, res) => {
    try {
      const { text, max_length = 150 } = req.body;

      res.json({
        status: 'success',
        data: { summary: 'Summary not yet implemented', original_length: text?.length || 0, max_length },
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/ai/embeddings - Generate embeddings
  router.post('/embeddings', async (req, res) => {
    try {
      const { text, model = 'text-embedding-ada-002' } = req.body;

      res.json({
        status: 'success',
        data: { embeddings: [], model, text_length: text?.length || 0 },
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
