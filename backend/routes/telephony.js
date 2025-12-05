/**
 * Telephony Routes
 * Call tracking, transcription, AI analysis, webhook handlers
 */

import express from 'express';
import { handleInboundCall, handleOutboundCall } from '../lib/callFlowHandler.js';
import { normalizeWebhook } from '../lib/webhookAdapters.js';
import { initiateOutboundCall, checkProviderStatus, getProviderAgents } from '../lib/outboundCallService.js';

export default function createTelephonyRoutes(pgPool) {
  const router = express.Router();

  // GET /api/telephony/status - Get telephony system status
  router.get('/status', async (req, res) => {
    try {
      res.json({
        status: 'success',
        data: {
          enabled: true,
          providers: ['twilio', 'signalwire', 'callfluent', 'thoughtly'],
          active_calls: 0,
          webhooks_configured: true
        }
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/telephony/test-webhook - Test webhook configuration
  router.post('/test-webhook', async (req, res) => {
    try {
      const { provider = 'twilio', tenant_id } = req.body;
      res.json({
        status: 'success',
        message: 'Webhook test endpoint',
        data: { provider, tenant_id, test: true }
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  /**
   * @openapi
   * /api/telephony/initiate-call:
   *   post:
   *     summary: Initiate an outbound AI call
   *     description: Trigger an outbound call via CallFluent or Thoughtly AI agent. The AI agent will call the specified phone number with the provided context.
   *     tags: [telephony]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [tenant_id, provider, phone_number]
   *             properties:
   *               tenant_id:
   *                 type: string
   *                 format: uuid
   *               provider:
   *                 type: string
   *                 enum: [callfluent, thoughtly]
   *               phone_number:
   *                 type: string
   *                 description: Phone number to call (E.164 format preferred)
   *               contact_id:
   *                 type: string
   *                 format: uuid
   *                 description: Optional contact/lead ID for context
   *               contact_name:
   *                 type: string
   *                 description: Name for AI agent context
   *               contact_email:
   *                 type: string
   *               company:
   *                 type: string
   *               purpose:
   *                 type: string
   *                 description: Call purpose/objective for AI agent
   *               talking_points:
   *                 type: array
   *                 items:
   *                   type: string
   *                 description: Key points for AI to cover
   *               agent_id:
   *                 type: string
   *                 description: Specific AI agent ID (optional, uses tenant default)
   *     responses:
   *       200:
   *         description: Call initiated
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 provider:
   *                   type: string
   *                 status:
   *                   type: string
   *                 call_id:
   *                   type: string
   *                 message:
   *                   type: string
   */
  router.post('/initiate-call', async (req, res) => {
    try {
      const result = await initiateOutboundCall(req.body);
      res.json(result);
    } catch (error) {
      console.error('[Telephony] Initiate call error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to initiate call',
        message: error.message
      });
    }
  });

  /**
   * @openapi
   * /api/telephony/provider-status/{provider}:
   *   get:
   *     summary: Check AI calling provider status
   *     description: Check if a calling provider (CallFluent or Thoughtly) is configured and ready for the tenant
   *     tags: [telephony]
   *     parameters:
   *       - in: path
   *         name: provider
   *         required: true
   *         schema:
   *           type: string
   *           enum: [callfluent, thoughtly]
   *       - in: query
   *         name: tenant_id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       200:
   *         description: Provider status
   */
  router.get('/provider-status/:provider', async (req, res) => {
    try {
      const { provider } = req.params;
      const { tenant_id } = req.query;

      if (!tenant_id) {
        return res.status(400).json({ error: 'tenant_id required' });
      }

      const status = await checkProviderStatus(tenant_id, provider);
      res.json(status);
    } catch (error) {
      console.error('[Telephony] Provider status error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * @openapi
   * /api/telephony/agents/{provider}:
   *   get:
   *     summary: Get available AI agents for provider
   *     description: List configured AI agents for CallFluent or Thoughtly
   *     tags: [telephony]
   *     parameters:
   *       - in: path
   *         name: provider
   *         required: true
   *         schema:
   *           type: string
   *           enum: [callfluent, thoughtly]
   *       - in: query
   *         name: tenant_id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       200:
   *         description: Available agents
   */
  router.get('/agents/:provider', async (req, res) => {
    try {
      const { provider } = req.params;
      const { tenant_id } = req.query;

      if (!tenant_id) {
        return res.status(400).json({ error: 'tenant_id required' });
      }

      const agents = await getProviderAgents(tenant_id, provider);
      res.json(agents);
    } catch (error) {
      console.error('[Telephony] Get agents error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * @openapi
   * /api/telephony/webhook/{provider}/inbound:
   *   post:
   *     summary: Provider-specific inbound webhook
   *     description: Handles provider-specific webhook format and normalizes to standard format
   *     tags: [telephony]
   *     parameters:
   *       - in: path
   *         name: provider
   *         required: true
   *         schema:
   *           type: string
   *           enum: [twilio, signalwire, callfluent, thoughtly]
   *       - in: query
   *         name: tenant_id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     requestBody:
   *       description: Provider-specific payload (varies by provider)
   *       required: true
   *     responses:
   *       200:
   *         description: Call processed
   */
  router.post('/webhook/:provider/inbound', async (req, res) => {
    try {
      const { provider } = req.params;
      const tenant_id = req.query.tenant_id || req.body.tenant_id;

      if (!tenant_id) {
        return res.status(400).json({ 
          status: 'error',
          error: 'tenant_id required as query parameter or in body' 
        });
      }

      // Normalize provider-specific payload
      const normalizedPayload = normalizeWebhook(req, tenant_id, provider);
      
      const result = await handleInboundCall(pgPool, normalizedPayload);
      res.json(result);
    } catch (error) {
      console.error('[Telephony] Provider inbound webhook error:', error);
      res.status(500).json({ 
        status: 'error',
        error: 'Failed to process inbound call',
        message: error.message 
      });
    }
  });

  /**
   * @openapi
   * /api/telephony/webhook/{provider}/outbound:
   *   post:
   *     summary: Provider-specific outbound webhook
   *     description: Handles provider-specific webhook format for outbound calls
   *     tags: [telephony]
   *     parameters:
   *       - in: path
   *         name: provider
   *         required: true
   *         schema:
   *           type: string
   *           enum: [twilio, signalwire, callfluent, thoughtly]
   *       - in: query
   *         name: tenant_id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       200:
   *         description: Call processed
   */
  router.post('/webhook/:provider/outbound', async (req, res) => {
    try {
      const { provider } = req.params;
      const tenant_id = req.query.tenant_id || req.body.tenant_id;

      if (!tenant_id) {
        return res.status(400).json({ 
          status: 'error',
          error: 'tenant_id required as query parameter or in body' 
        });
      }

      // Normalize provider-specific payload
      const normalizedPayload = normalizeWebhook(req, tenant_id, provider);
      
      const result = await handleOutboundCall(pgPool, normalizedPayload);
      res.json(result);
    } catch (error) {
      console.error('[Telephony] Provider outbound webhook error:', error);
      res.status(500).json({ 
        status: 'error',
        error: 'Failed to process outbound call',
        message: error.message 
      });
    }
  });

  /**
   * @openapi
   * /api/telephony/prepare-call:
   *   post:
   *     summary: Prepare outbound call context for AI agent
   *     description: Fetch contact details and call context before AI agent makes call. Returns all info needed for agent to conduct conversation.
   *     tags: [telephony]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [tenant_id, contact_id]
   *             properties:
   *               tenant_id:
   *                 type: string
   *                 format: uuid
   *               contact_id:
   *                 type: string
   *                 format: uuid
   *                 description: Contact or lead to call
   *               campaign_id:
   *                 type: string
   *                 format: uuid
   *                 description: Optional campaign context
   *               call_purpose:
   *                 type: string
   *                 description: Override default call purpose
   *     responses:
   *       200:
   *         description: Call context prepared
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 contact:
   *                   type: object
   *                   properties:
   *                     id:
   *                       type: string
   *                     name:
   *                       type: string
   *                     phone:
   *                       type: string
   *                     email:
   *                       type: string
   *                     company:
   *                       type: string
   *                     title:
   *                       type: string
   *                     type:
   *                       type: string
   *                 call_context:
   *                   type: object
   *                   properties:
   *                     purpose:
   *                       type: string
   *                     talking_points:
   *                       type: array
   *                       items:
   *                         type: string
   *                     campaign_info:
   *                       type: object
   *                     recent_interactions:
   *                       type: array
   */
  router.post('/prepare-call', async (req, res) => {
    try {
      const { tenant_id, contact_id, campaign_id, call_purpose } = req.body;
      
      if (!tenant_id || !contact_id) {
        return res.status(400).json({ 
          status: 'error',
          error: 'tenant_id and contact_id are required' 
        });
      }

      // Import prepareOutboundCall from handler
      const { prepareOutboundCall } = await import('../lib/callFlowHandler.js');
      
      const callContext = await prepareOutboundCall(pgPool, {
        tenant_id,
        contact_id,
        campaign_id,
        call_purpose
      });
      
      res.json(callContext);
    } catch (error) {
      console.error('[Telephony] Prepare call error:', error);
      res.status(500).json({ 
        status: 'error',
        error: 'Failed to prepare call context',
        message: error.message 
      });
    }
  });

  /**
   * @openapi
   * /api/telephony/inbound-webhook:
   *   post:
   *     summary: Handle inbound call webhook
   *     description: Process inbound call from providers (Twilio, SignalWire, CallFluent, Thoughtly). Auto-creates contacts, logs calls, summarizes transcripts.
   *     tags: [telephony]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [tenant_id, from_number, provider]
   *             properties:
   *               tenant_id:
   *                 type: string
   *                 format: uuid
   *               from_number:
   *                 type: string
   *                 description: Caller phone number
   *               to_number:
   *                 type: string
   *                 description: Your phone number
   *               call_sid:
   *                 type: string
   *                 description: Provider call ID
   *               call_status:
   *                 type: string
   *                 enum: [completed, in-progress, failed]
   *               duration:
   *                 type: integer
   *                 description: Call duration in seconds
   *               recording_url:
   *                 type: string
   *                 format: uri
   *               transcript:
   *                 type: string
   *                 description: Call transcript for AI summarization
   *               provider:
   *                 type: string
   *                 enum: [twilio, signalwire, callfluent, thoughtly]
   *               metadata:
   *                 type: object
   *     responses:
   *       200:
   *         description: Call processed, contact created/found, activity logged
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 contact_id:
   *                   type: string
   *                 contact_type:
   *                   type: string
   *                   enum: [contact, lead]
   *                 activity_id:
   *                   type: string
   *                 summary:
   *                   type: string
   *                 sentiment:
   *                   type: string
   */
  router.post('/inbound-webhook', async (req, res) => {
    try {
      const result = await handleInboundCall(pgPool, req.body);
      res.json(result);
    } catch (error) {
      console.error('[Telephony] Inbound webhook error:', error);
      res.status(500).json({ 
        status: 'error',
        error: 'Failed to process inbound call',
        message: error.message 
      });
    }
  });

  /**
   * @openapi
   * /api/telephony/outbound-webhook:
   *   post:
   *     summary: Handle outbound call webhook
   *     description: Process outbound call results. Logs activity, updates campaign progress, creates notes from transcripts.
   *     tags: [telephony]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [tenant_id, to_number, provider, outcome]
   *             properties:
   *               tenant_id:
   *                 type: string
   *                 format: uuid
   *               to_number:
   *                 type: string
   *                 description: Destination phone number
   *               from_number:
   *                 type: string
   *               call_sid:
   *                 type: string
   *               call_status:
   *                 type: string
   *                 enum: [completed, in-progress, failed]
   *               duration:
   *                 type: integer
   *               outcome:
   *                 type: string
   *                 enum: [answered, no-answer, busy, failed, voicemail]
   *               recording_url:
   *                 type: string
   *                 format: uri
   *               transcript:
   *                 type: string
   *               contact_id:
   *                 type: string
   *                 description: Contact/lead UUID (optional)
   *               campaign_id:
   *                 type: string
   *                 description: Campaign UUID if part of AI campaign
   *               provider:
   *                 type: string
   *                 enum: [twilio, signalwire, callfluent, thoughtly]
   *               metadata:
   *                 type: object
   *     responses:
   *       200:
   *         description: Call processed, activity logged, campaign updated
   */
  router.post('/outbound-webhook', async (req, res) => {
    try {
      const result = await handleOutboundCall(pgPool, req.body);
      res.json(result);
    } catch (error) {
      console.error('[Telephony] Outbound webhook error:', error);
      res.status(500).json({ 
        status: 'error',
        error: 'Failed to process outbound call',
        message: error.message 
      });
    }
  });

  /**
   * @openapi
   * /api/telephony/log-call:
   *   post:
   *     summary: Manually log a phone call
   *     description: Log a call manually from UI (not via webhook). Creates activity record.
   *     tags: [telephony]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [tenant_id, contact_id, direction]
   *             properties:
   *               tenant_id:
   *                 type: string
   *                 format: uuid
   *               contact_id:
   *                 type: string
   *                 format: uuid
   *               direction:
   *                 type: string
   *                 enum: [inbound, outbound]
   *               duration:
   *                 type: integer
   *               recording_url:
   *                 type: string
   *                 format: uri
   *               notes:
   *                 type: string
   *     responses:
   *       200:
   *         description: Call logged successfully
   */
  router.post('/log-call', async (req, res) => {
    try {
      const { tenant_id, contact_id, direction, duration, recording_url: _recording_url, notes } = req.body;
      
      if (!tenant_id || !contact_id || !direction) {
        return res.status(400).json({ 
          status: 'error',
          error: 'tenant_id, contact_id, and direction are required' 
        });
      }

      // Use outbound handler for manual logs
      const payload = {
        tenant_id,
        contact_id,
        to_number: 'manual',
        call_status: 'completed',
        duration: duration || 0,
        outcome: 'answered',
        provider: 'manual',
        metadata: { manual_log: true, notes }
      };

      const result = await handleOutboundCall(pgPool, payload);
      res.json(result);
    } catch (error) {
      console.error('[Telephony] Manual log error:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  /**
   * @openapi
   * /api/telephony/transcribe:
   *   post:
   *     summary: Transcribe a call recording
   *     description: Initiates transcription for a recording URL (stub for future integration).
   *     tags: [telephony]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               recording_url:
   *                 type: string
   *                 format: uri
   *               language:
   *                 type: string
   *                 default: en-US
   *     responses:
   *       501:
   *         description: Not implemented (use provider webhooks with transcripts)
   */
  router.post('/transcribe', async (req, res) => {
    try {
      const { recording_url, language = 'en-US' } = req.body;

      res.status(501).json({
        status: 'error',
        message: 'Transcription not yet implemented',
        hint: 'Use provider webhooks with transcripts for now',
        data: { recording_url, language },
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  /**
   * @openapi
   * /api/telephony/analyze-sentiment:
   *   post:
   *     summary: Analyze call sentiment
   *     description: Sentiment analysis now handled automatically in webhook endpoints.
   *     tags: [telephony]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               call_id:
   *                 type: string
   *               transcript:
   *                 type: string
   *     responses:
   *       200:
   *         description: Use webhook endpoints for automatic sentiment analysis
   */
  router.post('/analyze-sentiment', async (req, res) => {
    try {
      res.json({
        status: 'success',
        message: 'Use inbound-webhook or outbound-webhook endpoints for automatic sentiment analysis',
        data: {
          sentiment: 'neutral',
          score: 0,
          key_phrases: [],
        },
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  return router;
}
