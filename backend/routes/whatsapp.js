/**
 * WhatsApp Webhook Routes
 *
 * Receives inbound WhatsApp messages from Twilio, processes them through
 * AiSHA, and sends replies back. No authentication middleware — Twilio
 * signature validation is used instead.
 *
 * Tenant opt-in: Only tenants with an active `whatsapp` integration in
 * tenant_integrations will receive and respond to messages.
 *
 * [2026-02-23 Claude] — initial implementation
 */

import express from 'express';
import {
  validateTwilioSignature,
  resolveTenantFromWhatsAppNumber,
  processInboundWhatsApp,
} from '../lib/whatsappService.js';
import logger from '../lib/logger.js';

// ---------------------------------------------------------------------------
// AiSHA Chat Handler (v2 — full tool calling + context)
// ---------------------------------------------------------------------------

import { buildSystemPrompt, getOpenAIClient } from '../lib/aiProvider.js';
import { getSupabaseClient } from '../lib/supabase-db.js';
import { resolveLLMApiKey, selectLLMConfigForTenant } from '../lib/aiEngine/index.js';
import { createAnthropicClientWrapper } from '../lib/aiEngine/anthropicAdapter.js';
import {
  buildTenantContextDictionary,
  generateContextDictionaryPrompt,
} from '../lib/tenantContextDictionary.js';
import { fetchEntityLabels, updateToolSchemasWithLabels } from '../lib/entityLabelInjector.js';
import {
  generateToolSchemas,
  executeBraidTool,
  TOOL_ACCESS_TOKEN,
  summarizeToolResult,
  getBraidSystemPrompt,
} from '../lib/braidIntegration-v2.js';
import { loadAiSettings } from '../lib/aiSettingsLoader.js';

const MAX_TOOL_ITERATIONS = 5;

// Cache tool schemas at module level (they don't change between requests)
let _cachedBaseTools = null;
let _baseToolsCacheTime = 0;
const TOOL_SCHEMA_CACHE_TTL = 600_000; // 10 minutes

/**
 * Call AiSHA with a WhatsApp conversation context.
 * v2 — full tool calling, context dictionary, entity labels, AI settings.
 * [2026-02-24 Claude]
 */
async function callAiSHA({
  tenantId,
  conversationId,
  messages,
  entityContext,
  channel,
  senderPhone,
}) {
  const supabase = getSupabaseClient();

  // Resolve tenant record
  const { data: tenantRecord } = await supabase
    .from('tenant')
    .select('*')
    .eq('id', tenantId)
    .single();

  if (!tenantRecord) throw new Error('Tenant not found');

  // Load AI settings for this tenant
  let aiSettings = {};
  try {
    aiSettings = (await loadAiSettings('aisha', tenantId)) || {};
  } catch (e) {
    logger.warn(`[WhatsApp] loadAiSettings failed: ${e.message}`);
  }

  // Build system prompt
  let baseSystemPrompt;
  try {
    baseSystemPrompt = buildSystemPrompt(tenantRecord.id, tenantRecord.name);
  } catch (e) {
    logger.warn(`[WhatsApp] buildSystemPrompt failed, using fallback: ${e.message}`);
    baseSystemPrompt = `You are AiSHA, an AI assistant for ${tenantRecord.name || 'this company'}. You help customers with inquiries, scheduling, and general support.`;
  }

  // Load tenant context dictionary (uses Supabase internally)
  try {
    const tenantDictionary = await buildTenantContextDictionary(null, tenantId);
    if (tenantDictionary && !tenantDictionary.error) {
      const contextPrompt = generateContextDictionaryPrompt(tenantDictionary);
      if (contextPrompt) {
        baseSystemPrompt += '\n\n' + contextPrompt;
      }
    }
  } catch (e) {
    logger.warn(`[WhatsApp] Context dictionary failed: ${e.message}`);
  }

  // Add Braid tool system prompt (tells LLM about available tools and how to use them)
  let braidPrompt = '';
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
    braidPrompt = getBraidSystemPrompt(tz) || '';
  } catch (e) {
    logger.warn(`[WhatsApp] getBraidSystemPrompt failed: ${e.message}`);
  }

  // Add WhatsApp-specific instructions with explicit tenant context
  const whatsappInstructions = `
IMPORTANT CONTEXT: This conversation is happening via WhatsApp.
- You are operating on behalf of the business: "${tenantRecord.name || 'this company'}" (tenant_id: ${tenantId})
- ALWAYS include tenant_id: "${tenantId}" in ALL tool call arguments. This is required for every tool.
- The customer is messaging from their phone: ${senderPhone}
- Keep responses concise and mobile-friendly (avoid long paragraphs)
- Use plain text only (no markdown, no HTML, no code blocks)
- If the customer is a known ${entityContext?.type || 'contact'}: ${entityContext?.name || 'Unknown'}
- Do NOT include any internal IDs, technical fields, or system metadata in responses
- Be conversational and helpful, as if texting a valued customer
- ALWAYS call fetch_tenant_snapshot or the appropriate tool before answering CRM data questions.
- NEVER hallucinate records; only reference data returned by tools.
- NEVER fabricate or hallucinate tool calls or function results.
`;

  const fullSystemPrompt = baseSystemPrompt + '\n\n' + braidPrompt + '\n\n' + whatsappInstructions;

  // Resolve LLM config
  // [2026-02-24 Claude] Use selectLLMConfigForTenant which handles provider+model together
  let provider, apiKey, modelName;
  try {
    const llmConfig = selectLLMConfigForTenant({
      capability: 'chat_tools',
      tenantSlugOrId: tenantId,
    });
    provider = llmConfig?.provider || process.env.LLM_PROVIDER || 'anthropic';
    modelName = llmConfig?.model;
    apiKey = await resolveLLMApiKey({ tenantSlugOrId: tenantId, provider });
  } catch (e) {
    logger.warn(`[WhatsApp] LLM config resolution failed, using env defaults: ${e.message}`);
    provider = process.env.LLM_PROVIDER || 'anthropic';
    apiKey = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;
    modelName = provider === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gpt-4o-mini';
  }

  if (!apiKey) throw new Error('No LLM API key available');

  // Generate tools with custom entity labels (base schemas are cached)
  let tools = [];
  try {
    if (!_cachedBaseTools || Date.now() - _baseToolsCacheTime > TOOL_SCHEMA_CACHE_TTL) {
      _cachedBaseTools = await generateToolSchemas();
      _baseToolsCacheTime = Date.now();
      logger.info(
        `[WhatsApp] Tool schemas generated and cached (${_cachedBaseTools.length} tools)`,
      );
    }
    const entityLabels = await fetchEntityLabels(null, tenantId);
    tools = updateToolSchemasWithLabels(_cachedBaseTools, entityLabels);
  } catch (e) {
    logger.warn(`[WhatsApp] Tool schema generation failed (chat-only mode): ${e.message}`);
  }

  logger.info(
    `[WhatsApp] Calling LLM: provider=${provider} model=${modelName} tools=${tools.length}`,
  );

  const llmMessages = [{ role: 'system', content: fullSystemPrompt }, ...messages.slice(-8)];

  const client =
    provider === 'anthropic'
      ? createAnthropicClientWrapper(apiKey)
      : getOpenAIClient(apiKey, provider);

  const temperature = aiSettings?.temperature ?? 0.4;

  // Tool-calling loop
  let finalReply = '';
  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const completionOpts = {
      model: modelName,
      messages: llmMessages,
      temperature,
      max_tokens: 1024,
    };
    if (tools.length > 0) {
      completionOpts.tools = tools;
      completionOpts.tool_choice = 'auto';
    }

    const completion = await client.chat.completions.create(completionOpts);
    const choice = completion.choices?.[0];

    if (!choice) break;

    // If no tool calls, we have a final text response
    if (choice.finish_reason !== 'tool_calls' && !choice.message?.tool_calls?.length) {
      finalReply = choice.message?.content || '';
      break;
    }

    // Process tool calls
    const assistantMessage = choice.message;
    llmMessages.push(assistantMessage);

    for (const toolCall of assistantMessage.tool_calls || []) {
      const toolName = toolCall.function?.name;
      let toolArgs;
      try {
        toolArgs = JSON.parse(toolCall.function?.arguments || '{}');
      } catch {
        toolArgs = {};
      }

      logger.info(`[WhatsApp] Tool call: ${toolName}`, { args: toolArgs });

      let toolResult;
      try {
        toolResult = await executeBraidTool(
          toolName,
          { ...toolArgs, tenant_id: tenantId },
          tenantRecord,
          senderPhone, // userId equivalent for WhatsApp
          TOOL_ACCESS_TOKEN, // security token (positional arg 5)
        );
      } catch (toolErr) {
        logger.error(`[WhatsApp] Tool execution error (${toolName}): ${toolErr.message}`);
        toolResult = { error: toolErr.message };
      }

      // Unwrap nested API response for better summarization
      // summarizeToolResult works best with arrays or simple objects
      let unwrappedResult = toolResult;
      if (toolResult?.tag === 'Ok' && toolResult?.value && typeof toolResult.value === 'object') {
        let target = toolResult.value;
        // Unwrap { status: 'success', data: { ... } } pattern
        if (target.status === 'success' && target.data && typeof target.data === 'object') {
          target = target.data;
        }
        // Now target might be { leads: [...], total: 5 } or { stats: {...} } etc.
        // If it contains exactly one array key, extract that array for summarization
        if (!Array.isArray(target) && typeof target === 'object') {
          const arrayKeys = Object.keys(target).filter((k) => Array.isArray(target[k]));
          if (arrayKeys.length === 1) {
            unwrappedResult = { tag: 'Ok', value: target[arrayKeys[0]] };
          } else if (target.stats) {
            // Dashboard bundle — keep as-is for stats summarizer
            unwrappedResult = { tag: 'Ok', value: target };
          }
        }
      }

      const resultSummary = summarizeToolResult
        ? summarizeToolResult(unwrappedResult, toolName)
        : JSON.stringify(toolResult)?.slice(0, 2000);

      logger.info(`[WhatsApp] Tool result summary for ${toolName}: ${resultSummary.slice(0, 300)}`);

      llmMessages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: resultSummary,
      });
    }
  }

  if (!finalReply) {
    finalReply = "I've received your message. How can I help you today?";
  }

  // Strip any markdown formatting for WhatsApp plain text
  finalReply = finalReply
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`{1,3}[^`]*`{1,3}/g, (m) => m.replace(/`/g, ''))
    .replace(/#{1,6}\s/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();

  return finalReply;
}

// ---------------------------------------------------------------------------
// Route Definition
// ---------------------------------------------------------------------------

export default function createWhatsAppRoutes(_pgPool) {
  const router = express.Router();

  /**
   * @openapi
   * /api/whatsapp/webhook:
   *   post:
   *     summary: Twilio WhatsApp inbound webhook
   *     tags: [whatsapp]
   */
  router.post('/webhook', async (req, res) => {
    try {
      const { MessageSid, From, To, Body, NumMedia, ProfileName } = req.body || {};

      logger.info('[WhatsApp] Inbound webhook received', {
        messageSid: MessageSid,
        from: From,
        to: To,
        bodyLength: Body?.length || 0,
        numMedia: NumMedia || 0,
        profileName: ProfileName,
      });

      // Basic validation
      if (!From || !To || !Body) {
        logger.warn('[WhatsApp] Missing required fields in webhook');
        res.type('text/xml');
        return res.send('<Response></Response>');
      }

      // 1. Resolve tenant from the "To" WhatsApp number
      const tenant = await resolveTenantFromWhatsAppNumber(To);
      if (!tenant) {
        logger.warn(`[WhatsApp] No tenant found for number: ${To}`);
        res.type('text/xml');
        return res.send('<Response></Response>');
      }

      // 2. Validate Twilio signature (skip in dev)
      const twilioSignature = req.headers['x-twilio-signature'];
      const webhookUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

      if (tenant.twilioCreds?.auth_token) {
        const isValid = validateTwilioSignature(
          tenant.twilioCreds.auth_token,
          webhookUrl,
          req.body,
          twilioSignature,
        );

        if (!isValid) {
          const isDev =
            process.env.NODE_ENV === 'development' ||
            process.env.NODE_ENV === 'test' ||
            !process.env.NODE_ENV;
          if (!isDev) {
            logger.error('[WhatsApp] Invalid Twilio signature - rejecting');
            return res.status(403).json({ error: 'Invalid signature' });
          }
          logger.warn('[WhatsApp] Invalid Twilio signature (DEV mode - continuing)');
        }
      }

      // 3. Handle media-only messages
      if (parseInt(NumMedia || '0', 10) > 0 && (!Body || Body.trim() === '')) {
        res.type('text/xml');
        return res.send(
          '<Response><Message>Thanks for the image! I can only process text messages right now. How can I help you?</Message></Response>',
        );
      }

      // 4. Process the message through AiSHA
      const result = await processInboundWhatsApp({
        tenantId: tenant.tenant_id,
        twilioCreds: tenant.twilioCreds,
        config: tenant.config,
        from: From,
        to: To,
        body: Body.trim(),
        messageSid: MessageSid,
        chatHandler: callAiSHA,
      });

      logger.info('[WhatsApp] Message processed successfully', {
        conversationId: result.conversationId,
        replyLength: result.reply?.length || 0,
        sendSuccess: result.sendResult?.success,
        entityMatched: !!result.entity,
      });

      // Return empty TwiML — reply already sent via REST API
      res.type('text/xml');
      res.send('<Response></Response>');
    } catch (error) {
      logger.error(`[WhatsApp] Webhook error: ${error.message}`);
      logger.error(error.stack);
      res.type('text/xml');
      res.send('<Response></Response>');
    }
  });

  /**
   * @openapi
   * /api/whatsapp/status:
   *   get:
   *     summary: Check WhatsApp integration status for a tenant
   *     tags: [whatsapp]
   */
  router.get('/status', async (req, res) => {
    try {
      const { tenant_id } = req.query;
      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('tenant_integrations')
        .select('id, is_active, config, created_at')
        .eq('tenant_id', tenant_id)
        .eq('integration_type', 'whatsapp')
        .maybeSingle();

      if (error) {
        return res.status(500).json({ status: 'error', message: error.message });
      }

      if (!data) {
        return res.json({
          status: 'success',
          data: {
            configured: false,
            is_active: false,
            message: 'No WhatsApp integration configured.',
          },
        });
      }

      res.json({
        status: 'success',
        data: {
          configured: true,
          is_active: data.is_active,
          whatsapp_number: data.config?.whatsapp_number || null,
          created_at: data.created_at,
        },
      });
    } catch (error) {
      logger.error(`[WhatsApp] Status check error: ${error.message}`);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
