import express from 'express';
import { BRAID_SYSTEM_PROMPT, generateToolSchemas } from '../lib/braidIntegration-v2.js';
import { resolveLLMApiKey } from '../lib/aiEngine/index.js';
import { fetchEntityLabels, generateEntityLabelPrompt, updateToolSchemasWithLabels } from '../lib/entityLabelInjector.js';

const REALTIME_URL = 'https://api.openai.com/v1/realtime/client_secrets';
const DEFAULT_REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL || 'gpt-4o-realtime-preview-2024-12-17';
const DEFAULT_REALTIME_VOICE = process.env.OPENAI_REALTIME_VOICE || 'marin';
const REALTIME_MODULE_NAME = 'Realtime Voice';
const REALTIME_SOURCE = 'AI Realtime Tokens';
const DEFAULT_REALTIME_INSTRUCTIONS = `${BRAID_SYSTEM_PROMPT}\n\n` +
  [
    'You are running in Realtime Voice mode for AiSHA CRM.',
    '',
    'When the user asks about any CRM data (accounts, contacts, leads, opportunities, activities, metrics, pipeline,',
    'revenue, counts, lists, tenant configuration, or anything stored in the database), you MUST:',
    '1) Choose the most appropriate CRM tool from the available tools.',
    '2) Call that tool instead of guessing, hallucinating numbers, or saying there is a generic technical issue.',
    '3) Wait for the tool result, then summarize it clearly in natural language for the user.',
    '',
    'Only answer from your own knowledge when the question is clearly NOT about CRM data (for example, general small talk',
    'or questions about how to use the system).',
    '',
  'WHEN A RECORD IS NOT FOUND (CRITICAL FOR VOICE):',
  '- DO NOT say "network error" or "technical issue" when a search returns empty results.',
  '- Empty results simply mean no matches were found - this is NOT an error.',
  '- When you cannot find a lead/contact/account by name, ask the user to confirm the spelling.',
  '- Suggest checking a different entity type: "I could not find that as a lead. Would you like me to check contacts or accounts?"',
  '- Offer to list all records: "Would you like me to list all leads so you can identify the correct one?"',
  '',
  'CONTEXT RETENTION (CRITICAL):',
  '- Remember entity names and IDs from earlier in the conversation.',
  '- When user says "that lead" or "update them", use context from the previous query.',
  '- If unclear which entity they mean, ask for clarification.',
  '',
    'Never speak or send raw JSON like {"stage":"active"} or {"entity":"opportunities","filters":{...}} as your final answer.',
    'Treat any JSON-shaped content as internal tool arguments only: call the appropriate tool with those arguments, wait for',
    'the tool result, and then answer in natural language based solely on that result.',
    '',
    'Always operate in read_only or propose_actions mode.',
    'Never execute destructive CRM actions, deletes, bulk wipes, or schema changes.',
  ].join(' ');

// Tools that are blocked from Realtime Voice for safety
const BLOCKED_REALTIME_TOOLS = [
  'delete_account', 'delete_lead', 'delete_contact', 'delete_opportunity',
  'delete_activity', 'delete_note', 'delete_task', 'delete_document',
  'bulk_delete', 'archive_all', 'reset_data', 'drop_table', 'truncate',
  'execute_sql', 'run_migration', 'delete_tenant', 'delete_user'
];

/**
 * Filter tool schemas for Realtime Voice safety.
 * Removes destructive tools (delete_*, schema changes, bulk operations).
 */
const filterRealtimeTools = (tools) => {
  if (!Array.isArray(tools)) return [];
  return tools.filter(tool => {
    const name = tool.name || tool.function?.name || '';
    // Block any tool starting with delete_ or in the explicit blocklist
    if (name.startsWith('delete_')) return false;
    if (BLOCKED_REALTIME_TOOLS.includes(name)) return false;
    return true;
  });
};

const extractClientSecret = (payload) => {
  if (!payload) return { value: null, expires_at: null };
  if (payload?.client_secret) {
    return {
      value: payload.client_secret.value || null,
      expires_at: payload.client_secret.expires_at || null,
    };
  }
  return {
    value: payload.value || null,
    expires_at: payload.expires_at || null,
  };
};

const normalizeTenantId = (value) => {
  if (!value) return null;
  const str = String(value);
  if (!str || str === 'null' || str === 'undefined') {
    return null;
  }
  return str;
};

const resolveRequestIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown';
};

const logRealtimeSystemEvent = async (pgPool, { level = 'INFO', tenantId, message, metadata = {} }) => {
  if (!pgPool || process.env.DISABLE_DB_LOGGING === 'true') return;
  try {
    await pgPool.query(
      `INSERT INTO system_logs (tenant_id, level, message, source, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [tenantId || 'system', level, message, REALTIME_SOURCE, JSON.stringify(metadata)]
    );
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[AI][Realtime] Failed to log system event', error?.message);
    }
  }
};

export default function createAiRealtimeRoutes(pgPool) {
  const router = express.Router();

  const isRealtimeModuleEnabled = async (tenantId) => {
    if (!pgPool) return true;
    const normalizedTenantId = normalizeTenantId(tenantId);
    try {
      if (normalizedTenantId) {
        const tenantRow = await pgPool.query(
          'SELECT is_enabled FROM modulesettings WHERE tenant_id = $1 AND module_name = $2 ORDER BY updated_at DESC LIMIT 1',
          [normalizedTenantId, REALTIME_MODULE_NAME]
        );
        if (tenantRow.rows.length > 0) {
          return tenantRow.rows[0].is_enabled !== false;
        }
      }

      const defaultRow = await pgPool.query(
        'SELECT is_enabled FROM modulesettings WHERE tenant_id IS NULL AND module_name = $1 ORDER BY updated_at DESC LIMIT 1',
        [REALTIME_MODULE_NAME]
      );
      if (defaultRow.rows.length > 0) {
        return defaultRow.rows[0].is_enabled !== false;
      }
      return true;
    } catch (error) {
      console.error('[AI][Realtime] Module lookup failed', {
        message: error?.message,
        tenantId: normalizedTenantId || 'unknown',
      });
      return true;
    }
  };

  router.get('/realtime-token', async (req, res) => {
    const startedAt = Date.now();
    const requestIp = resolveRequestIp(req);
    const userAgent = req.get('user-agent') || req.headers['user-agent'] || 'unknown';
    const baseMetadata = {
      user_id: req.user?.id,
      user_email: req.user?.email || null,
      ip: requestIp,
      user_agent: userAgent,
    };
    try {
      if (!req.user?.id) {
        return res.status(401).json({ status: 'error', message: 'Authentication required' });
      }

      const tenantIdFromQuery = normalizeTenantId(req.query?.tenant_id);
      const tenantIdFromUser = normalizeTenantId(req.user?.tenant_id);
      const tenantId = tenantIdFromQuery || tenantIdFromUser || null;

      // Use centralized key resolver with tenant awareness
      const apiKey = await resolveLLMApiKey({
        headerKey: req.headers['x-openai-key'],
        userKey: req.user?.system_openai_settings?.openai_api_key,
        tenantSlugOrId: tenantId,
      });
      if (!apiKey) {
        console.error('[AI][Realtime] No API key available for minting realtime token');
        return res.status(500).json({ status: 'error', message: 'Realtime voice is not configured' });
      }

      const moduleEnabled = await isRealtimeModuleEnabled(tenantId);
      if (!moduleEnabled) {
        console.warn('[AI][Realtime] Token request blocked by module settings', {
          tenantId: tenantId || 'unknown',
          userId: req.user?.id || 'anonymous',
        });
        await logRealtimeSystemEvent(pgPool, {
          tenantId,
          level: 'WARNING',
          message: 'Realtime token blocked by module settings',
          metadata: baseMetadata,
        });
        return res.status(403).json({
          status: 'error',
          message: 'Realtime Voice module is disabled for this tenant',
        });
      }

      // Fetch entity labels and inject into instructions
      const entityLabels = await fetchEntityLabels(pgPool, tenantId);
      const labelPrompt = generateEntityLabelPrompt(entityLabels);
      const enhancedInstructions = DEFAULT_REALTIME_INSTRUCTIONS + labelPrompt;

      const sessionPayload = {
        session: {
          type: 'realtime',
          model: DEFAULT_REALTIME_MODEL,
          instructions: enhancedInstructions,
          max_output_tokens: 4096, // Maximum allowed for gpt-4o-realtime
          audio: {
            output: {
              voice: DEFAULT_REALTIME_VOICE,
            },
          },
        },
      };

      // Generate and filter tools for Realtime Voice
      try {
        const allTools = await generateToolSchemas();
        console.log(`[AI][Realtime] generateToolSchemas returned ${allTools?.length || 0} tools`);
        const safeTools = filterRealtimeTools(allTools || []);
        console.log(`[AI][Realtime] After filtering: ${safeTools.length} safe tools`);
        if (safeTools.length > 0) {
          // Update tool descriptions with entity labels
          const labeledTools = updateToolSchemasWithLabels(safeTools, entityLabels);
          // Convert to OpenAI Realtime format (function calling)
          sessionPayload.session.tools = labeledTools.map(tool => ({
            type: 'function',
            name: tool.function?.name || tool.name,
            description: tool.function?.description || tool.description || '',
            parameters: tool.function?.parameters || tool.parameters || { type: 'object', properties: {} }
          }));
          sessionPayload.session.tool_choice = 'auto';
          console.log(`[AI][Realtime] Added ${labeledTools.length} tools with entity labels to session payload`);
          console.log(`[AI][Realtime] Tool names:`, labeledTools.slice(0, 5).map(t => t.function?.name || t.name));
        }
      } catch (toolError) {
        console.warn('[AI][Realtime] Failed to generate tool schemas, proceeding without tools:', toolError?.message);
        console.error('[AI][Realtime] Tool error stack:', toolError?.stack);
      }

      console.log('[AI][Realtime] Session payload (truncated):', JSON.stringify(sessionPayload).substring(0, 1000));

      const response = await fetch(REALTIME_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sessionPayload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[AI][Realtime] Failed to mint token', {
          status: response.status,
          body: errorText,
          tenantId: tenantId || 'unknown',
        });
        await logRealtimeSystemEvent(pgPool, {
          tenantId,
          level: 'ERROR',
          message: 'Realtime token request failed',
          metadata: {
            ...baseMetadata,
            status: response.status,
            duration_ms: Date.now() - startedAt,
          },
        });
        return res.status(response.status).json({
          status: 'error',
          message: 'Failed to create realtime session',
          details: errorText || null,
        });
      }

      const payload = await response.json();
      console.log('[AI][Realtime] OpenAI response payload keys:', Object.keys(payload));
      console.log('[AI][Realtime] OpenAI response:', JSON.stringify(payload).substring(0, 500));
      
      const secret = extractClientSecret(payload);
      console.log('[AI][Realtime] Extracted secret:', { 
        hasValue: !!secret.value, 
        valueLength: secret.value?.length,
        valuePreview: secret.value?.substring(0, 30),
        expires_at: secret.expires_at 
      });

      if (!secret.value) {
        console.error('[AI][Realtime] Token response missing value', payload);
        await logRealtimeSystemEvent(pgPool, {
          tenantId,
          level: 'ERROR',
          message: 'Realtime token missing value',
          metadata: {
            ...baseMetadata,
            duration_ms: Date.now() - startedAt,
          },
        });
        return res.status(502).json({ status: 'error', message: 'Realtime service returned invalid token' });
      }

      console.info('[AI][Realtime] Token minted', {
        tenantId: tenantId || 'unknown',
        userId: req.user?.id || 'anonymous',
        durationMs: Date.now() - startedAt,
      });

      await logRealtimeSystemEvent(pgPool, {
        tenantId,
        level: 'INFO',
        message: 'Realtime token minted',
        metadata: {
          ...baseMetadata,
          duration_ms: Date.now() - startedAt,
          expires_at: secret.expires_at,
        },
      });

      return res.json({
        value: secret.value,
        expires_at: secret.expires_at,
      });
    } catch (error) {
      console.error('[AI][Realtime] Error minting token', {
        message: error?.message,
      });
      await logRealtimeSystemEvent(pgPool, {
        tenantId: normalizeTenantId(req.user?.tenant_id) || normalizeTenantId(req.query?.tenant_id) || null,
        level: 'ERROR',
        message: 'Realtime token exception',
        metadata: {
          ...baseMetadata,
          error: error?.message,
        },
      });
      return res.status(500).json({ status: 'error', message: 'Unable to mint realtime token' });
    }
  });

  return router;
}
