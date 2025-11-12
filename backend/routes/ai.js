/**
 * AI Routes
 * Chat, sentiment, summarization, embeddings, conversations
 */

import express from 'express';
import { createChatCompletion, buildSystemPrompt, getOpenAIClient } from '../lib/aiProvider.js';

const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export default function createAIRoutes(pgPool) {
  const router = express.Router();
  const DEFAULT_CHAT_MODEL = process.env.DEFAULT_OPENAI_MODEL || 'gpt-4o-mini';
  const MAX_TOOL_ITERATIONS = 3;
  const tenantIntegrationKeyCache = new Map();

  // SSE clients storage for real-time conversation updates
  const conversationClients = new Map(); // conversationId -> Set<res>

  const parseMetadata = (value) => {
    if (!value) return {};
    if (typeof value === 'object') return value;
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  };

  const broadcastMessage = (conversationId, message) => {
    if (!conversationClients.has(conversationId)) {
      return;
    }
    const payload = JSON.stringify({ type: 'message', data: message });
    const clients = conversationClients.get(conversationId);
    clients.forEach((client) => {
      try {
        client.write(`data: ${payload}\n\n`);
      } catch (err) {
        console.warn('[AI Routes] Failed to broadcast conversation update:', err.message || err);
      }
    });
  };

  const resolveTenantOpenAiKey = async ({ explicitKey, headerKey, userKey, tenantSlug }) => {
    if (explicitKey) return explicitKey;
    if (headerKey) return headerKey;

    if (tenantSlug) {
      if (tenantIntegrationKeyCache.has(tenantSlug)) {
        const cached = tenantIntegrationKeyCache.get(tenantSlug);
        if (cached) {
          return cached;
        }
      }

      try {
        const result = await pgPool.query(
          `SELECT api_credentials FROM tenant_integrations
           WHERE tenant_id = $1
             AND is_active = true
             AND integration_type IN ('openai_llm')
           ORDER BY updated_at DESC NULLS LAST, created_at DESC
           LIMIT 1`,
          [tenantSlug]
        );

        if (result.rows?.length) {
          const rawCreds = result.rows[0].api_credentials;
          const creds = typeof rawCreds === 'object' ? rawCreds : JSON.parse(rawCreds || '{}');
          const tenantKey = creds?.api_key || creds?.apiKey || null;
          tenantIntegrationKeyCache.set(tenantSlug, tenantKey || null);
          if (tenantKey) {
            return tenantKey;
          }
        } else {
          tenantIntegrationKeyCache.set(tenantSlug, null);
        }
      } catch (error) {
        console.warn('[AI Routes] Failed to resolve tenant OpenAI key:', error.message || error);
      }
    }

    if (userKey) return userKey;

    // Fallback to system settings table
    try {
      console.log('[AI Routes] Checking system_settings table for OpenAI key...');
      const systemSettingsResult = await pgPool.query(
        `SELECT settings FROM system_settings
         WHERE settings IS NOT NULL
           AND settings->>'system_openai_settings' IS NOT NULL
         LIMIT 1`
      );

      console.log('[AI Routes] System settings query returned:', systemSettingsResult.rows?.length, 'rows');
      if (systemSettingsResult.rows?.length) {
        const settings = systemSettingsResult.rows[0].settings;
        console.log('[AI Routes] Found settings:', typeof settings, settings ? 'has data' : 'empty');
        const systemOpenAI = typeof settings === 'object' 
          ? settings.system_openai_settings 
          : JSON.parse(settings || '{}').system_openai_settings;
        
        console.log('[AI Routes] System OpenAI config:', {
          found: !!systemOpenAI,
          enabled: systemOpenAI?.enabled,
          hasKey: !!systemOpenAI?.openai_api_key
        });
        
        if (systemOpenAI?.enabled && systemOpenAI?.openai_api_key) {
          console.log('[AI Routes] ✓ Using system OpenAI key from system_settings');
          return systemOpenAI.openai_api_key;
        }
      }
    } catch (error) {
      console.warn('[AI Routes] Failed to resolve system settings:', error.message || error);
    }

    // Fallback to admin/superadmin user settings (legacy)
    try {
      const systemUsersResult = await pgPool.query(
        `SELECT system_openai_settings FROM users
         WHERE role IN ('admin', 'superadmin')
           AND system_openai_settings IS NOT NULL
           AND (system_openai_settings->>'enabled')::boolean = true
           AND system_openai_settings->>'openai_api_key' IS NOT NULL
         ORDER BY 
           CASE role WHEN 'superadmin' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END,
           updated_at DESC NULLS LAST
         LIMIT 1`
      );

      if (systemUsersResult.rows?.length) {
        const systemSettings = systemUsersResult.rows[0].system_openai_settings;
        const systemKey = typeof systemSettings === 'object' 
          ? systemSettings.openai_api_key 
          : JSON.parse(systemSettings || '{}').openai_api_key;
        if (systemKey) {
          return systemKey;
        }
      }
    } catch (error) {
      console.warn('[AI Routes] Failed to resolve user system OpenAI settings:', error.message || error);
    }

    return null;
  };

  const fetchTenantSnapshot = async (tenantIdSlug, options = {}) => {
    const limitRaw = options.limit ?? options.activities_limit ?? 5;
    const safeLimit = Math.min(Math.max(Number(limitRaw) || 5, 1), 10);
    const segmentsAll = ['activities', 'opportunities', 'leads', 'accounts', 'contacts'];

    const scopeRaw = options.scope;
    let segments = [];
    if (Array.isArray(scopeRaw)) {
      segments = scopeRaw.map((item) => String(item || '').toLowerCase()).filter((item) => segmentsAll.includes(item));
    } else if (typeof scopeRaw === 'string') {
      const entry = scopeRaw.toLowerCase();
      if (segmentsAll.includes(entry)) {
        segments = [entry];
      }
    }

    if (segments.length === 0) {
      segments = segmentsAll;
    }

    const snapshot = {
      tenant_id: tenantIdSlug,
      generated_at: new Date().toISOString(),
      summary: {},
    };

    if (segments.includes('activities')) {
      const { rows } = await pgPool.query(
        `SELECT id, subject, status, type, due_date, owner_id, created_at
         FROM activities
         WHERE tenant_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [tenantIdSlug, safeLimit]
      );
      snapshot.activities = rows;
      snapshot.summary.activities_count = rows.length;
    }

    if (segments.includes('opportunities')) {
      const { rows } = await pgPool.query(
        `SELECT id, name, stage, amount, close_date, owner_id, probability, updated_at
         FROM opportunities
         WHERE tenant_id = $1
         ORDER BY updated_at DESC
         LIMIT $2`,
        [tenantIdSlug, safeLimit]
      );
      snapshot.opportunities = rows;
      snapshot.summary.opportunities_count = rows.length;
    }

    if (segments.includes('leads')) {
      const { rows } = await pgPool.query(
        `SELECT id, first_name, last_name, email, status, company, source, owner_id, created_at
         FROM leads
         WHERE tenant_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [tenantIdSlug, safeLimit]
      );
      snapshot.leads = rows;
      snapshot.summary.leads_count = rows.length;
    }

    if (segments.includes('accounts')) {
      const { rows } = await pgPool.query(
        `SELECT id, name, industry, owner_id, annual_revenue, website, updated_at
         FROM accounts
         WHERE tenant_id = $1
         ORDER BY updated_at DESC
         LIMIT $2`,
        [tenantIdSlug, safeLimit]
      );
      snapshot.accounts = rows;
      snapshot.summary.accounts_count = rows.length;
    }

    if (segments.includes('contacts')) {
      const { rows } = await pgPool.query(
        `SELECT id, first_name, last_name, email, job_title, account_id, owner_id, updated_at
         FROM contacts
         WHERE tenant_id = $1
         ORDER BY updated_at DESC
         LIMIT $2`,
        [tenantIdSlug, safeLimit]
      );
      snapshot.contacts = rows;
      snapshot.summary.contacts_count = rows.length;
    }

    return snapshot;
  };

  const insertAssistantMessage = async (conversationId, content, metadata = {}) => {
    try {
      const result = await pgPool.query(
        `INSERT INTO conversation_messages (conversation_id, role, content, metadata)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [conversationId, 'assistant', content, JSON.stringify(metadata)]
      );

      await pgPool.query(
        'UPDATE conversations SET updated_date = CURRENT_TIMESTAMP WHERE id = $1',
        [conversationId]
      );

      const message = result.rows[0];
      broadcastMessage(conversationId, message);
      return message;
    } catch (error) {
      console.error('[AI Routes] insertAssistantMessage error:', {
        conversationId,
        contentLength: content?.length,
        metadataSize: JSON.stringify(metadata).length,
        error: error.message
      });
      throw error;
    }
  };

  const executeToolCall = async ({ toolName, args, tenantRecord }) => {
    switch (toolName) {
      case 'fetch_tenant_snapshot': {
        // Use tenant_id (slug) not id (UUID) because data tables reference tenant_id
        return fetchTenantSnapshot(tenantRecord.tenant_id, args || {});
      }
      default:
        return { error: `Unsupported tool: ${toolName}` };
    }
  };

  const generateAssistantResponse = async ({
    conversationId,
    tenantRecord,
    tenantIdentifier,
    conversation,
    requestDescriptor = {},
  }) => {
    try {
      const tenantSlug = tenantRecord?.tenant_id || tenantIdentifier || null;
      const conversationMetadata = parseMetadata(conversation?.metadata);

      const apiKey = await resolveTenantOpenAiKey({
        explicitKey: requestDescriptor.bodyApiKey,
        headerKey: requestDescriptor.headerApiKey,
        userKey: requestDescriptor.userApiKey,
        tenantSlug,
      });

      if (!apiKey) {
        await logAiEvent({
          level: 'WARNING',
          message: 'AI agent blocked: missing OpenAI API key',
          tenantRecord,
          tenantIdentifier,
          metadata: {
            operation: 'agent_followup',
            conversation_id: conversationId,
            agent_name: conversation?.agent_name,
          },
        });

        await insertAssistantMessage(conversationId, 'I cannot reach the AI model right now because no OpenAI API key is configured for this client. Please contact an administrator.', {
          reason: 'missing_api_key',
        });
        return;
      }

      const client = getOpenAIClient(apiKey);
      if (!client) {
        await logAiEvent({
          level: 'ERROR',
          message: 'AI agent blocked: failed to initialize OpenAI client',
          tenantRecord,
          tenantIdentifier,
          metadata: {
            operation: 'agent_followup',
            conversation_id: conversationId,
            agent_name: conversation?.agent_name,
          },
        });

        await insertAssistantMessage(conversationId, 'I was unable to initialize the AI model for this request. Please try again later.', {
          reason: 'client_init_failed',
        });
        return;
      }

      const history = await pgPool.query(
        `SELECT role, content FROM conversation_messages
         WHERE conversation_id = $1
         ORDER BY created_date ASC`,
        [conversationId]
      );

      const tenantName = conversationMetadata?.tenant_name || tenantRecord?.name || tenantSlug || 'CRM Tenant';
      const systemPrompt = `${buildSystemPrompt({ tenantName })}\n\nUse the available CRM tools to fetch data before answering. Only reference data returned by the tools to guarantee tenant isolation.`;

      const messages = [
        { role: 'system', content: systemPrompt },
      ];

      for (const row of history.rows || []) {
        if (!row || !row.role) continue;
        if (row.role === 'system') continue;
        messages.push({ role: row.role, content: row.content });
      }

      const model = requestDescriptor.modelOverride || conversationMetadata?.model || DEFAULT_CHAT_MODEL;
      const rawTemperature = requestDescriptor.temperatureOverride ?? conversationMetadata?.temperature ?? 0.2;
      const temperature = Math.min(Math.max(Number(rawTemperature) || 0.2, 0), 2);

      const tools = [
        {
          type: 'function',
          function: {
            name: 'fetch_tenant_snapshot',
            description: 'Retrieve a fresh summary of CRM data (activities, opportunities, leads, accounts, contacts) for the current tenant. Use this before answering questions that require factual data.',
            parameters: {
              type: 'object',
              properties: {
                scope: {
                  type: 'string',
                  description: 'Optional area to focus on. One of activities, opportunities, leads, accounts, contacts.',
                },
                limit: {
                  type: 'integer',
                  description: 'Maximum number of records per category (1-10). Defaults to 5.',
                  minimum: 1,
                  maximum: 10,
                },
              },
            },
          },
        },
      ];

      const executedTools = [];
      let assistantResponded = false;
      let conversationMessages = [...messages];

      for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
        const response = await client.chat.completions.create({
          model,
          messages: conversationMessages,
          tools,
          tool_choice: 'auto',
          temperature,
        });

        const choice = response.choices?.[0];
        if (!choice?.message) {
          break;
        }

        const { message } = choice;
        const toolCalls = message.tool_calls || [];

        if (toolCalls.length > 0) {
          conversationMessages.push({
            role: 'assistant',
            content: message.content || '',
            tool_calls: toolCalls.map((call) => ({
              id: call.id,
              type: call.type,
              function: {
                name: call.function?.name,
                arguments: call.function?.arguments,
              },
            })),
          });

          for (const call of toolCalls) {
            const toolName = call.function?.name;
            let parsedArgs = {};
            try {
              parsedArgs = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
            } catch {
              parsedArgs = {};
            }

            let toolResult;
            try {
              toolResult = await executeToolCall({
                toolName,
                args: parsedArgs,
                tenantRecord,
              });
              console.log(`[AI Tool Execution] ${toolName} for tenant ${tenantRecord.tenant_id}:`, JSON.stringify(toolResult, null, 2));
            } catch (toolError) {
              toolResult = { error: toolError.message || String(toolError) };
              console.error(`[AI Tool Execution] ${toolName} error:`, toolError);
            }

            executedTools.push({
              name: toolName,
              arguments: parsedArgs,
              result_preview: typeof toolResult === 'string' ? toolResult.slice(0, 500) : JSON.stringify(toolResult).slice(0, 500),
            });

            const toolContent = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);
            conversationMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              content: toolContent,
            });
          }

          continue;
        }

        const assistantText = (message.content || '').trim();
        if (assistantText) {
          await insertAssistantMessage(conversationId, assistantText, {
            model: response.model || model,
            usage: response.usage || null,
            tool_interactions: executedTools,
            iterations: iteration + 1,
          });
          assistantResponded = true;
        }

        break;
      }

      if (!assistantResponded) {
        await insertAssistantMessage(
          conversationId,
          'I could not complete that request right now. Please try again shortly.',
          {
            reason: 'empty_response',
            tool_interactions: executedTools,
          }
        );

        await logAiEvent({
          level: 'WARNING',
          message: 'AI agent produced no response',
          tenantRecord,
          tenantIdentifier,
          metadata: {
            operation: 'agent_followup',
            conversation_id: conversationId,
            agent_name: conversation?.agent_name,
            tool_interactions: executedTools,
          },
        });
      }
    } catch (error) {
      console.error('[AI Routes] Agent follow-up error:', error);
      await logAiEvent({
        message: 'AI agent follow-up failed',
        tenantRecord,
        tenantIdentifier,
        error,
        metadata: {
          operation: 'agent_followup',
          conversation_id: conversationId,
          agent_name: conversation?.agent_name,
        },
      });

      await insertAssistantMessage(
        conversationId,
        'I ran into an error while processing that request. Please try again in a moment.',
        {
          reason: 'exception',
        }
      );
    }
  };

  // Middleware to get tenant_id from request
  const getTenantId = (req) => {
    return (
      req.headers['x-tenant-id'] ||
      req.query?.tenant_id ||
      req.query?.tenantId ||
      req.user?.tenant_id
    );
  };

  const tenantLookupCache = new Map();

  const cacheTenantRecord = (record) => {
    if (!record) return;
    if (record.id) {
      tenantLookupCache.set(record.id, record);
    }
    if (record.tenant_id) {
      tenantLookupCache.set(record.tenant_id, record);
    }
  };

  const resolveTenantRecord = async (identifier) => {
    if (!identifier || typeof identifier !== 'string') {
      return null;
    }

    const key = identifier.trim();
    if (!key) {
      return null;
    }

    if (tenantLookupCache.has(key)) {
      return tenantLookupCache.get(key);
    }

    const attempts = UUID_PATTERN.test(key)
      ? [
          { sql: 'SELECT id, tenant_id, name FROM tenant WHERE id = $1 LIMIT 1', value: key },
          { sql: 'SELECT id, tenant_id, name FROM tenant WHERE tenant_id = $1 LIMIT 1', value: key },
        ]
      : [
          { sql: 'SELECT id, tenant_id, name FROM tenant WHERE tenant_id = $1 LIMIT 1', value: key },
          { sql: 'SELECT id, tenant_id, name FROM tenant WHERE id = $1 LIMIT 1', value: key },
        ];

    for (const attempt of attempts) {
      try {
        const result = await pgPool.query(attempt.sql, [attempt.value]);
        if (result.rows?.length) {
          const record = result.rows[0];
          cacheTenantRecord(record);
          tenantLookupCache.set(key, record);
          return record;
        }
      } catch (error) {
        console.warn('[AI Routes] Tenant lookup failed for identifier:', key, error.message || error);
      }
    }

    tenantLookupCache.set(key, null);
    return null;
  };

  const truncateString = (value, maxLength = 1000) => {
    if (typeof value !== 'string') {
      return value;
    }
    return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
  };

  const sanitizeMetadata = (metadata = {}) => {
    const sanitized = {};
    for (const [key, value] of Object.entries(metadata)) {
      if (value === undefined) continue;
      if (typeof value === 'string') {
        sanitized[key] = truncateString(value);
      } else if (Array.isArray(value)) {
        sanitized[key] = { count: value.length };
      } else if (value && typeof value === 'object') {
        try {
          const serialized = JSON.stringify(value);
          sanitized[key] = serialized.length > 1000 ? truncateString(serialized) : value;
        } catch {
          sanitized[key] = String(value);
        }
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  };

  const logAiEvent = async ({
    level = 'ERROR',
    message,
    tenantRecord,
    tenantIdentifier,
    error,
    metadata = {},
  }) => {
    if (!pgPool || !message) return;
    const tenantSlug = tenantRecord?.tenant_id || tenantIdentifier || 'system';
    const stackTrace = error?.stack ? truncateString(String(error.stack), 8000) : null;
    const payload = sanitizeMetadata({
      feature: 'ai',
      component: 'agent_chat',
      tenant_uuid: tenantRecord?.id,
      tenant_slug: tenantSlug,
      error_message: error?.message,
      error_code: error?.code,
      ...metadata,
    });

    try {
      await pgPool.query(
        `INSERT INTO system_logs (tenant_id, level, message, source, metadata, stack_trace, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [
          tenantSlug,
          level,
          message,
          'AI Routes',
          JSON.stringify(payload),
          stackTrace,
        ]
      );
    } catch (logError) {
      console.error('[AI Routes] Failed to record system log:', logError.message || logError);
    }
  };

  // POST /api/ai/conversations - Create new conversation
  router.post('/conversations', async (req, res) => {
    let tenantIdentifier = null;
    let tenantRecord = null;
    let agentName = 'crm_assistant';
    try {
      const { agent_name = 'crm_assistant', metadata = {} } = req.body;
      agentName = agent_name;
      tenantIdentifier = getTenantId(req);
      tenantRecord = await resolveTenantRecord(tenantIdentifier);

      if (!tenantRecord?.id) {
        await logAiEvent({
          level: 'WARNING',
          message: 'AI conversation creation blocked: missing tenant context',
          tenantRecord,
          tenantIdentifier,
          metadata: {
            operation: 'create_conversation',
            agent_name: agentName,
            request_path: req.originalUrl || req.url,
          },
        });
        return res.status(400).json({ status: 'error', message: 'Valid tenant_id required' });
      }

      const enrichedMetadata = {
        ...metadata,
        tenant_slug: metadata?.tenant_slug ?? tenantRecord.tenant_id ?? tenantIdentifier ?? null,
        tenant_uuid: metadata?.tenant_uuid ?? tenantRecord.id,
        tenant_name: metadata?.tenant_name ?? tenantRecord.name ?? null,
      };

      const result = await pgPool.query(
        `INSERT INTO conversations (tenant_id, agent_name, metadata, status)
         VALUES ($1, $2, $3, 'active')
         RETURNING *`,
        [tenantRecord.id, agentName, JSON.stringify(enrichedMetadata)]
      );

      res.json({
        status: 'success',
        data: result.rows[0],
      });
    } catch (error) {
      console.error('Create conversation error:', error);
      await logAiEvent({
        message: 'AI conversation creation failed',
        tenantRecord,
        tenantIdentifier,
        error,
        metadata: {
          operation: 'create_conversation',
          agent_name: agentName,
          request_path: req.originalUrl || req.url,
          http_status: 500,
        },
      });
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/ai/conversations - List conversations for tenant
  router.get('/conversations', async (req, res) => {
    let tenantIdentifier = null;
    let tenantRecord = null;
    try {
      tenantIdentifier = getTenantId(req);
      tenantRecord = await resolveTenantRecord(tenantIdentifier);

      if (!tenantRecord?.id) {
        await logAiEvent({
          level: 'WARNING',
          message: 'AI conversation list blocked: missing tenant context',
          tenantRecord,
          tenantIdentifier,
          metadata: {
            operation: 'list_conversations',
            request_path: req.originalUrl || req.url,
          },
        });
        return res.status(400).json({ status: 'error', message: 'Valid tenant_id required' });
      }

      const { agent_name = null, status = 'active', limit = 25 } = req.query || {};
      const safeLimit = Math.min(parseInt(limit, 10) || 25, 100);

      // Query conversations using simple SELECT without ORDER BY (avoid adapter parsing issues)
      const convQuery = `SELECT id, agent_name, status, created_date, updated_date FROM conversations WHERE tenant_id = $1 ${agent_name ? 'AND agent_name = $2' : ''} ${status ? `AND status = $${agent_name ? 3 : 2}` : ''} LIMIT $${agent_name && status ? 4 : agent_name || status ? 3 : 2}`;
      const convParams = [tenantRecord.id];
      if (agent_name) convParams.push(agent_name);
      if (status) convParams.push(status);
      convParams.push(safeLimit * 2); // Fetch extra since we'll sort in JS
      
      const convResult = await pgPool.query(convQuery, convParams);
      const conversations = convResult.rows || [];

      if (conversations.length === 0) {
        return res.json({ status: 'success', data: [] });
      }

      // Get message counts and last message times for all conversations
      const ids = conversations.map(c => c.id);
      const countsQuery = `SELECT conversation_id, COUNT(*)::int AS message_count, MAX(created_date) AS last_message_at FROM conversation_messages WHERE conversation_id = ANY($1) GROUP BY conversation_id`;
      const countsResult = await pgPool.query(countsQuery, [ids]);
      const countsMap = new Map(countsResult.rows.map(r => [r.conversation_id, r]));

      // Get last message excerpt for each conversation (simple approach: one query per conversation)
      const lastMsgMap = new Map();
      for (const id of ids) {
        const msgQuery = `SELECT content FROM conversation_messages WHERE conversation_id = $1 LIMIT 1`;
        const msgResult = await pgPool.query(msgQuery, [id]);
        if (msgResult.rows.length > 0) {
          lastMsgMap.set(id, { content: msgResult.rows[0].content });
        }
      }

      // Merge and sort by last activity in JavaScript
      const data = conversations.map(c => {
        const meta = countsMap.get(c.id) || {};
        const last = lastMsgMap.get(c.id) || {};
        return {
          ...c,
          message_count: meta.message_count || 0,
          last_message_at: meta.last_message_at || null,
          last_message_excerpt: last.content ? last.content.slice(0, 200) : null,
        };
      }).sort((a, b) => {
        const aTime = new Date(a.last_message_at || a.updated_date || a.created_date).getTime();
        const bTime = new Date(b.last_message_at || b.updated_date || b.created_date).getTime();
        return bTime - aTime;
      }).slice(0, safeLimit);

      res.json({ status: 'success', data });
    } catch (error) {
      console.error('List conversations error:', error);
      await logAiEvent({
        message: 'AI conversation list failed',
        tenantRecord,
        tenantIdentifier,
        error,
        metadata: {
          operation: 'list_conversations',
          request_path: req.originalUrl || req.url,
          http_status: 500,
        },
      });
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/ai/conversations/:id - Get conversation details
  router.get('/conversations/:id', async (req, res) => {
    const { id } = req.params;
    let tenantIdentifier = null;
    let tenantRecord = null;
    try {
      tenantIdentifier = getTenantId(req);
      tenantRecord = await resolveTenantRecord(tenantIdentifier);

      if (!tenantRecord?.id) {
        await logAiEvent({
          level: 'WARNING',
          message: 'AI conversation fetch blocked: missing tenant context',
          tenantRecord,
          tenantIdentifier,
          metadata: {
            operation: 'get_conversation',
            conversation_id: id,
            request_path: req.originalUrl || req.url,
          },
        });
        return res.status(400).json({ status: 'error', message: 'Valid tenant_id required' });
      }

      // Get conversation
      const convResult = await pgPool.query(
        'SELECT * FROM conversations WHERE id = $1 AND tenant_id = $2',
        [id, tenantRecord.id]
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
      await logAiEvent({
        message: 'AI conversation fetch failed',
        tenantRecord,
        tenantIdentifier,
        error,
        metadata: {
          operation: 'get_conversation',
          conversation_id: id,
          request_path: req.originalUrl || req.url,
          http_status: 500,
        },
      });
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // DELETE /api/ai/conversations/:id - Delete a conversation
  router.delete('/conversations/:id', async (req, res) => {
    const { id } = req.params;
    let tenantIdentifier = null;
    let tenantRecord = null;
    try {
      tenantIdentifier = getTenantId(req);
      tenantRecord = await resolveTenantRecord(tenantIdentifier);

      if (!tenantRecord?.id) {
        return res.status(400).json({ status: 'error', message: 'Valid tenant_id required' });
      }

      // Verify conversation belongs to tenant before deleting
      const convResult = await pgPool.query(
        'SELECT id FROM conversations WHERE id = $1 AND tenant_id = $2',
        [id, tenantRecord.id]
      );

      if (!convResult.rows?.length) {
        return res.status(404).json({ status: 'error', message: 'Conversation not found' });
      }

      // Delete messages first (foreign key constraint)
      await pgPool.query(
        'DELETE FROM conversation_messages WHERE conversation_id = $1',
        [id]
      );

      // Delete conversation
      await pgPool.query(
        'DELETE FROM conversations WHERE id = $1 AND tenant_id = $2',
        [id, tenantRecord.id]
      );

      await logAiEvent({
        message: 'Conversation deleted',
        tenantRecord,
        tenantIdentifier,
        metadata: {
          operation: 'delete_conversation',
          conversation_id: id,
        },
      });

      res.json({ status: 'success', message: 'Conversation deleted' });
    } catch (error) {
      console.error('Delete conversation error:', error);
      await logAiEvent({
        message: 'AI conversation deletion failed',
        tenantRecord,
        tenantIdentifier,
        error,
        metadata: {
          operation: 'delete_conversation',
          conversation_id: id,
          request_path: req.originalUrl || req.url,
          http_status: 500,
        },
      });
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/ai/conversations/:id/messages - Get conversation messages
  router.get('/conversations/:id/messages', async (req, res) => {
    const { id } = req.params;
    try {
      const tenantIdentifier = getTenantId(req);
      const tenantRecord = await resolveTenantRecord(tenantIdentifier);

      if (!tenantRecord?.id) {
        return res.status(400).json({ status: 'error', message: 'Tenant context required' });
      }

      // Verify conversation belongs to tenant
      const convResult = await pgPool.query(
        'SELECT id FROM conversations WHERE id = $1 AND tenant_id = $2',
        [id, tenantRecord.id]
      );

      if (!convResult.rows?.length) {
        return res.status(404).json({ status: 'error', message: 'Conversation not found' });
      }

      // Get messages
      const messagesResult = await pgPool.query(
        `SELECT id, conversation_id, role, content, metadata, created_date
         FROM conversation_messages
         WHERE conversation_id = $1
         ORDER BY created_date ASC`,
        [id]
      );

      res.json({
        status: 'success',
        data: messagesResult.rows || []
      });
    } catch (error) {
      console.error('[AI Routes] Get messages error:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/ai/conversations/:id/messages - Add message to conversation
  router.post('/conversations/:id/messages', async (req, res) => {
    const { id } = req.params;
    const { role, content, metadata = {} } = req.body;
    let tenantIdentifier = null;
    let tenantRecord = null;
    let conversation = null;
    try {
      if (!role || !content) {
        return res.status(400).json({ status: 'error', message: 'role and content required' });
      }

      const shouldTriggerAgent = role === 'user';

      tenantIdentifier = getTenantId(req);
      tenantRecord = await resolveTenantRecord(tenantIdentifier);

      if (!tenantRecord?.id) {
        await logAiEvent({
          level: 'WARNING',
          message: 'AI conversation message blocked: missing tenant context',
          tenantRecord,
          tenantIdentifier,
          metadata: {
            operation: 'add_message',
            conversation_id: id,
            role,
            request_path: req.originalUrl || req.url,
          },
        });
        return res.status(400).json({ status: 'error', message: 'Valid tenant_id required' });
      }

      const convResult = await pgPool.query(
        `SELECT id, tenant_id, agent_name, metadata
         FROM conversations
         WHERE id = $1 AND tenant_id = $2
         LIMIT 1`,
        [id, tenantRecord.id]
      );

      if (convResult.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Conversation not found' });
      }

      conversation = convResult.rows[0];
      const conversationMetadata = parseMetadata(conversation.metadata);

      const result = await pgPool.query(
        `INSERT INTO conversation_messages (conversation_id, role, content, metadata)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [id, role, content, JSON.stringify(metadata)]
      );

      const message = result.rows[0];

      await pgPool.query(
        'UPDATE conversations SET updated_date = CURRENT_TIMESTAMP WHERE id = $1',
        [id]
      );

      broadcastMessage(id, message);

      res.json({
        status: 'success',
        data: message,
      });

      if (shouldTriggerAgent) {
        const requestDescriptor = {
          bodyApiKey: req.body?.api_key || null,
          headerApiKey: req.headers['x-openai-key'] || null,
          userApiKey: req.user?.system_openai_settings?.openai_api_key || null,
          modelOverride: req.body?.model,
          temperatureOverride: req.body?.temperature,
        };

        setImmediate(() => {
          generateAssistantResponse({
            conversationId: id,
            tenantRecord,
            tenantIdentifier,
            conversation: { ...conversation, metadata: conversationMetadata },
            requestDescriptor,
          }).catch((err) => {
            console.error('[AI Routes] Async agent follow-up error:', err);
          });
        });
      }
    } catch (error) {
      console.error('Add message error:', error);
      await logAiEvent({
        message: 'AI conversation message failed',
        tenantRecord,
        tenantIdentifier,
        error,
        metadata: {
          operation: 'add_message',
          conversation_id: id,
          role,
          request_path: req.originalUrl || req.url,
          http_status: 500,
        },
      });
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/ai/conversations/:id/stream - SSE stream for conversation updates
  router.get('/conversations/:id/stream', async (req, res) => {
    try {
      const { id } = req.params;
      const tenantIdentifier = getTenantId(req);
      const tenantRecord = await resolveTenantRecord(tenantIdentifier);

      if (!tenantRecord?.id) {
        return res.status(400).json({ status: 'error', message: 'Valid tenant_id required' });
      }

      // Verify conversation exists
      const convCheck = await pgPool.query(
        'SELECT id FROM conversations WHERE id = $1 AND tenant_id = $2',
        [id, tenantRecord.id]
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
  const { messages = [], model = process.env.DEFAULT_OPENAI_MODEL || 'gpt-4o-mini', temperature = 0.7, tenantName } = req.body || {};

      // Basic validation
      if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ status: 'error', message: 'messages array is required' });
      }

      // Ensure we have a system message at the start
      let msgs = messages;
      const hasSystem = msgs[0]?.role === 'system';
      if (!hasSystem) {
        msgs = [{ role: 'system', content: buildSystemPrompt({ tenantName }) }, ...messages];
      }

      // Resolve API key priority: explicit in body > tenant integration > backend env
      let apiKey = req.body?.api_key || null;
      const tenantIdentifier = getTenantId(req);
  const tenantRecord = tenantIdentifier ? await resolveTenantRecord(tenantIdentifier) : null;
  const tenantSlug = tenantRecord?.tenant_id || tenantIdentifier || null;
      // Allow explicit header override (avoids putting key in body for some clients)
      if (!apiKey && req.headers['x-openai-key']) {
        apiKey = req.headers['x-openai-key'];
      }
      if (!apiKey && tenantSlug) {
        try {
          // Prefer active OpenAI LLM integration for tenant
          const ti = await pgPool.query(
            `SELECT api_credentials, integration_type FROM tenant_integrations
             WHERE tenant_id = $1 AND is_active = true AND integration_type IN ('openai_llm')
             ORDER BY updated_at DESC NULLS LAST, created_at DESC LIMIT 1`,
            [tenantSlug]
          );
          if (ti.rows?.length) {
            const creds = ti.rows[0].api_credentials || {};
            apiKey = creds.api_key || creds.apiKey || null;
          }
        } catch (e) {
          console.warn('[ai.chat] Failed to fetch tenant OpenAI integration:', e.message || e);
        }
      }
      // Fall back to authenticated user system settings if present
      if (!apiKey && req.user?.system_openai_settings?.openai_api_key) {
        apiKey = req.user.system_openai_settings.openai_api_key;
      }

      // Fall back to system settings table
      if (!apiKey) {
        try {
          const systemSettingsResult = await pgPool.query(
            `SELECT settings FROM system_settings
             WHERE settings IS NOT NULL
               AND settings->>'system_openai_settings' IS NOT NULL
             LIMIT 1`
          );

          if (systemSettingsResult.rows?.length) {
            const settings = systemSettingsResult.rows[0].settings;
            const systemOpenAI = typeof settings === 'object' 
              ? settings.system_openai_settings 
              : JSON.parse(settings || '{}').system_openai_settings;
            
            if (systemOpenAI?.enabled && systemOpenAI?.openai_api_key) {
              apiKey = systemOpenAI.openai_api_key;
            }
          }
        } catch (error) {
          console.warn('[ai.chat] Failed to resolve system settings:', error.message || error);
        }
      }

      const result = await createChatCompletion({ messages: msgs, model, temperature, apiKey });
      if (result.status === 'error') {
        const http = /OPENAI_API_KEY|not configured/i.test(result.error || '') ? 501 : 500; // 501 if key missing
        return res.status(http).json({ status: 'error', message: result.error });
      }

      // Optional: persist assistant reply if a conversation_id was provided
      const { conversation_id } = req.body || {};
      let savedMessage = null;
      if (conversation_id && result.content) {
        try {
          const insert = await pgPool.query(
            `INSERT INTO conversation_messages (conversation_id, role, content, metadata)
             VALUES ($1, 'assistant', $2, $3) RETURNING *`,
            [conversation_id, result.content, JSON.stringify({ model })]
          );
          savedMessage = insert.rows?.[0] || null;
        } catch (err) {
          console.warn('[ai.chat] Failed to persist assistant message:', err.message || err);
        }
      }

      return res.json({
        status: 'success',
        data: {
          response: result.content,
          usage: result.usage,
          model: result.model,
          savedMessage
        }
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
