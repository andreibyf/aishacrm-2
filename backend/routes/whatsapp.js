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
// AiSHA Chat Handler (simplified — no tool calling for v1)
// ---------------------------------------------------------------------------

import { buildSystemPrompt, getOpenAIClient } from '../lib/aiProvider.js';
import { getSupabaseClient } from '../lib/supabase-db.js';
import { resolveLLMApiKey, pickModel, selectLLMConfigForTenant } from '../lib/aiEngine/index.js';
import { createAnthropicClientWrapper } from '../lib/aiEngine/anthropicAdapter.js';

/**
 * Call AiSHA with a WhatsApp conversation context.
 * Simplified version — chat only, no tool calling (v1).
 * Tool calling will be added once the basic flow is proven.
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

  // Build system prompt (skip context dictionary — it needs pgPool which isn't available here)
  let baseSystemPrompt;
  try {
    baseSystemPrompt = buildSystemPrompt(tenantRecord.id, tenantRecord.name);
  } catch (e) {
    logger.warn(`[WhatsApp] buildSystemPrompt failed, using fallback: ${e.message}`);
    baseSystemPrompt = `You are AiSHA, an AI assistant for ${tenantRecord.name || 'this company'}. You help customers with inquiries, scheduling, and general support.`;
  }

  // Add WhatsApp-specific instructions
  const whatsappInstructions = `
IMPORTANT CONTEXT: This conversation is happening via WhatsApp.
- The customer is messaging from their phone: ${senderPhone}
- Keep responses concise and mobile-friendly (avoid long paragraphs)
- Use plain text only (no markdown, no HTML, no code blocks)
- If the customer is a known ${entityContext?.type || 'contact'}: ${entityContext?.name || 'Unknown'}
- Do NOT include any internal IDs, technical fields, or system metadata in responses
- Be conversational and helpful, as if texting a valued customer
`;

  const fullSystemPrompt = baseSystemPrompt + '\n\n' + whatsappInstructions;

  // Resolve LLM config
  let provider, apiKey, modelName;
  try {
    const llmConfig = await selectLLMConfigForTenant(tenantId);
    provider = llmConfig?.provider || process.env.LLM_PROVIDER || 'anthropic';
    apiKey = await resolveLLMApiKey({ tenantSlugOrId: tenantId, provider });
    modelName = pickModel(provider, 'chat');
    // Safety check: ensure model matches provider
    if (provider === 'anthropic' && modelName.startsWith('gpt')) {
      logger.warn(`[WhatsApp] Model/provider mismatch: ${provider}/${modelName}, fixing`);
      modelName = 'claude-sonnet-4-20250514';
    } else if (provider !== 'anthropic' && modelName.startsWith('claude')) {
      logger.warn(`[WhatsApp] Model/provider mismatch: ${provider}/${modelName}, fixing`);
      modelName = 'gpt-4o-mini';
    }
  } catch (e) {
    logger.warn(`[WhatsApp] LLM config resolution failed, using env defaults: ${e.message}`);
    provider = process.env.LLM_PROVIDER || 'anthropic';
    apiKey = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;
    modelName = provider === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gpt-4o-mini';
  }

  if (!apiKey) throw new Error('No LLM API key available');

  logger.info(`[WhatsApp] Calling LLM: provider=${provider} model=${modelName}`);

  // Build the messages array — no tool calling for now (simpler, more reliable)
  const llmMessages = [{ role: 'system', content: fullSystemPrompt }, ...messages.slice(-8)];

  let finalReply = '';

  // Both providers use the same OpenAI-compatible interface
  // (createAnthropicClientWrapper wraps Anthropic SDK in OpenAI-style API)
  const client =
    provider === 'anthropic'
      ? createAnthropicClientWrapper(apiKey)
      : getOpenAIClient(apiKey, provider);

  const completion = await client.chat.completions.create({
    model: modelName,
    messages: llmMessages,
    temperature: 0.4,
    max_tokens: 1024,
  });

  finalReply = completion.choices?.[0]?.message?.content || '';

  if (!finalReply) {
    finalReply = "I've received your message. How can I help you today?";
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
