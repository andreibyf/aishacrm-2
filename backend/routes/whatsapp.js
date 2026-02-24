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
 * Setup requirements:
 *   1. Add tenant_integrations row:
 *      integration_type: 'whatsapp'
 *      is_active: true
 *      config: { whatsapp_number: '+14155238886' }
 *      api_credentials: { account_sid: '...', auth_token: '...' }
 *        (or reuse existing Twilio integration credentials)
 *   2. Configure Twilio WhatsApp Sandbox/Number webhook URL:
 *      POST https://your-domain.com/api/whatsapp/webhook
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
// AiSHA Chat Handler
// ---------------------------------------------------------------------------
// This wraps the core AI chat logic for WhatsApp context.
// We import the pieces we need and build a simplified handler
// that doesn't require HTTP request/response.

import { buildSystemPrompt, getOpenAIClient } from '../lib/aiProvider.js';
import { getSupabaseClient } from '../lib/supabase-db.js';
import { resolveCanonicalTenant } from '../lib/tenantCanonicalResolver.js';
import {
  generateToolSchemas,
  executeBraidTool,
  TOOL_ACCESS_TOKEN,
} from '../lib/braidIntegration-v2.js';
import {
  buildTenantContextDictionary,
  generateContextDictionaryPrompt,
} from '../lib/tenantContextDictionary.js';
import { loadAiSettings } from '../lib/aiSettingsLoader.js';
import { resolveLLMApiKey, pickModel, selectLLMConfigForTenant } from '../lib/aiEngine/index.js';
import { createAnthropicClientWrapper } from '../lib/aiEngine/anthropicAdapter.js';
import {
  enhanceSystemPromptSmart,
  fetchEntityLabels,
  updateToolSchemasWithLabels,
} from '../lib/entityLabelInjector.js';
import { CORE_TOOLS } from '../lib/aiBudgetConfig.js';

/**
 * Call AiSHA with a WhatsApp conversation context.
 * Simplified version of the /api/ai/chat endpoint logic.
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

  // Load AI settings
  const aiSettings = await loadAiSettings('aisha', tenantId);

  // Build system prompt with tenant context
  const baseSystemPrompt = buildSystemPrompt(tenantRecord.id, tenantRecord.name);
  const contextDict = await buildTenantContextDictionary(tenantRecord.id);
  const contextPrompt = generateContextDictionaryPrompt(contextDict);

  // Add WhatsApp-specific instructions
  const whatsappInstructions = `
IMPORTANT CONTEXT: This conversation is happening via WhatsApp.
- The customer is messaging from their phone: ${senderPhone}
- Keep responses concise and mobile-friendly (avoid long paragraphs)
- Use plain text only (no markdown, no HTML, no code blocks)
- If the customer is a known ${entityContext?.type || 'contact'}: ${entityContext?.name || 'Unknown'}
- You can still use all your CRM tools (lookup contacts, schedule, create activities, etc.)
- Do NOT include any internal IDs, technical fields, or system metadata in responses
- Be conversational and helpful, as if texting a valued customer
`;

  const fullSystemPrompt =
    baseSystemPrompt + '\n\n' + contextPrompt + '\n\n' + whatsappInstructions;

  // Get entity labels for tool schemas
  const entityLabels = await fetchEntityLabels(tenantId);

  // Generate tool schemas
  let toolSchemas = generateToolSchemas(tenantRecord.id);
  if (entityLabels) {
    toolSchemas = updateToolSchemasWithLabels(toolSchemas, entityLabels);
  }

  // Resolve LLM config
  const llmConfig = await selectLLMConfigForTenant(tenantId);
  const provider = llmConfig?.provider || process.env.LLM_PROVIDER || 'anthropic';
  const apiKey = await resolveLLMApiKey(tenantId, provider);
  const modelName = pickModel(provider, 'chat');

  // Build the messages array with system prompt
  const llmMessages = [
    { role: 'system', content: fullSystemPrompt },
    ...messages.slice(-8), // Keep last 8 messages for context window
  ];

  // Call the LLM with tool calling (up to 3 iterations)
  const maxIterations = aiSettings.max_iterations || 3;
  let currentMessages = [...llmMessages];
  let finalReply = '';

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    let response;

    if (provider === 'anthropic') {
      const anthropicClient = createAnthropicClientWrapper(apiKey);
      response = await anthropicClient.chat({
        model: modelName,
        messages: currentMessages,
        tools: toolSchemas,
        temperature: aiSettings.temperature || 0.4,
        max_tokens: 1024,
      });
    } else {
      // OpenAI-compatible
      const openaiClient = getOpenAIClient(apiKey, provider);
      const completion = await openaiClient.chat.completions.create({
        model: modelName,
        messages: currentMessages,
        tools: toolSchemas.map((t) => ({ type: 'function', function: t })),
        temperature: aiSettings.temperature || 0.4,
        max_tokens: 1024,
      });
      response = completion.choices[0]?.message;
    }

    // Check for tool calls
    const toolCalls = response?.tool_calls || [];
    if (toolCalls.length === 0) {
      // No tool calls — we have the final response
      finalReply = response?.content || response?.text || '';
      break;
    }

    // Execute tool calls
    currentMessages.push(response); // Add assistant message with tool_calls

    for (const toolCall of toolCalls) {
      const toolName = toolCall.function?.name || toolCall.name;
      const toolArgs =
        typeof toolCall.function?.arguments === 'string'
          ? JSON.parse(toolCall.function.arguments)
          : toolCall.function?.arguments || toolCall.input || {};

      // Inject tenant_id into tool args
      toolArgs.tenant_id = tenantId;

      logger.debug('[WhatsApp] Executing tool:', toolName, Object.keys(toolArgs));

      let toolResult;
      try {
        toolResult = await executeBraidTool(toolName, toolArgs, TOOL_ACCESS_TOKEN);
      } catch (err) {
        toolResult = { error: err.message };
      }

      currentMessages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(toolResult).substring(0, 3000),
      });
    }
  }

  if (!finalReply) {
    finalReply = "I've processed your request. Is there anything else I can help with?";
  }

  // Strip any markdown formatting for WhatsApp plain text
  finalReply = finalReply
    .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold **text**
    .replace(/\*(.*?)\*/g, '$1') // Remove italic *text*
    .replace(/`{1,3}[^`]*`{1,3}/g, (m) => m.replace(/`/g, '')) // Remove code backticks
    .replace(/#{1,6}\s/g, '') // Remove markdown headers
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Convert links [text](url) → text
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
   *     description: >
   *       Receives inbound WhatsApp messages from Twilio. Validates the request
   *       signature, resolves the tenant, processes through AiSHA, and replies.
   *       No authentication required (Twilio signature validation is used).
   *     tags: [whatsapp]
   *     requestBody:
   *       required: true
   *       content:
   *         application/x-www-form-urlencoded:
   *           schema:
   *             type: object
   *             properties:
   *               MessageSid: { type: string }
   *               From: { type: string, example: 'whatsapp:+15551234567' }
   *               To: { type: string, example: 'whatsapp:+14155238886' }
   *               Body: { type: string }
   *     responses:
   *       200:
   *         description: Message processed (TwiML response)
   *       403:
   *         description: Invalid Twilio signature
   *       404:
   *         description: No tenant configured for this WhatsApp number
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
        // Return 200 with empty TwiML to prevent Twilio retries
        res.type('text/xml');
        return res.send('<Response></Response>');
      }

      // 1. Resolve tenant from the "To" WhatsApp number
      const tenant = await resolveTenantFromWhatsAppNumber(To);
      if (!tenant) {
        logger.warn('[WhatsApp] No tenant found for number:', To);
        res.type('text/xml');
        return res.send('<Response></Response>');
      }

      // 2. Validate Twilio signature
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
          // In production, reject. In dev, warn but continue.
          const isDev = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
          if (!isDev) {
            logger.error('[WhatsApp] Invalid Twilio signature - rejecting');
            return res.status(403).json({ error: 'Invalid signature' });
          }
          logger.warn('[WhatsApp] Invalid Twilio signature (DEV mode - continuing)');
        }
      }

      // 3. Handle media messages (for now, just acknowledge)
      if (parseInt(NumMedia || '0', 10) > 0) {
        logger.info('[WhatsApp] Media message received (not yet supported)');
        // Still process the text body if present
        if (!Body || Body.trim() === '') {
          // Media-only message — acknowledge
          res.type('text/xml');
          return res.send(
            '<Response><Message>Thanks for the image! I can only process text messages right now. How can I help you?</Message></Response>',
          );
        }
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

      // Return empty TwiML — we already sent the reply via REST API
      // (Using REST API instead of TwiML <Message> gives us more control
      // and allows async processing for longer AI responses)
      res.type('text/xml');
      res.send('<Response></Response>');
    } catch (error) {
      logger.error('[WhatsApp] Webhook error:', error);
      // Always return 200 to Twilio to prevent retries
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
   *     parameters:
   *       - in: query
   *         name: tenant_id
   *         required: true
   *         schema: { type: string, format: uuid }
   *     responses:
   *       200:
   *         description: WhatsApp integration status
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
            message: 'No WhatsApp integration configured. Add via Settings → Integrations.',
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
      logger.error('[WhatsApp] Status check error:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
