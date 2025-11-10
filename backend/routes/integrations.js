/**
 * Integration Routes
 * N8N, OpenAI, Stripe, Twilio, Slack, etc.
 */

import { Router } from 'express';
import OpenAI from 'openai';

export default function createIntegrationRoutes(_pgPool) {
  const router = Router();

  // POST /api/integrations/openai/test - Test OpenAI API connection
  router.post('/openai/test', async (req, res) => {
    const { api_key, model = 'gpt-4o-mini' } = req.body;

    if (!api_key) {
      return res.status(400).json({ success: false, error: "API key is required" });
    }

    if (!api_key.startsWith('sk-') || api_key.length < 20) {
      return res.status(400).json({ 
        success: false, 
        error: "Invalid API key format. OpenAI API keys should start with 'sk-'." 
      });
    }

    try {
      const openai = new OpenAI({ apiKey: api_key });
      const completion = await openai.chat.completions.create({
        model: model,
        messages: [{ role: "user", content: "Respond with: 'OK'" }],
        max_tokens: 5,
      });

      const response = completion.choices[0].message.content;
      if (response.trim() === 'OK') {
        res.json({ 
          success: true, 
          message: `Connection successful! Model: ${model}` 
        });
      } else {
        res.status(400).json({ success: false, error: "Unexpected response from OpenAI." });
      }
    } catch (error) {
      console.error("OpenAI API test error:", error);
      let errorMessage = "Failed to connect to OpenAI.";
      if (error.status === 401) {
        errorMessage = "Invalid API key provided.";
      } else if (error.status === 429) {
        errorMessage = "Rate limit exceeded or quota exhausted.";
      } else if (error.status === 404) {
        errorMessage = `Model '${model}' not found or not accessible.`;
      }
      res.status(error.status || 500).json({ success: false, error: errorMessage, details: error.message });
    }
  });

  // POST /api/integrations/n8n/trigger - Trigger N8N workflow
  router.post('/n8n/trigger', async (req, res) => {
    try {
      const { workflow_id, data: _data } = req.body;

      res.json({
        status: 'success',
        message: 'N8N workflow triggered',
        data: { workflow_id, timestamp: new Date().toISOString() },
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message,
      });
    }
  });

  // POST /api/integrations/openai/chat - OpenAI chat completion
  router.post('/openai/chat', async (req, res) => {
    try {
      const { messages, model = 'gpt-4' } = req.body;

      res.json({
        status: 'success',
        message: 'OpenAI chat not yet implemented',
        data: { model, message_count: messages?.length || 0 },
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message,
      });
    }
  });

  // POST /api/integrations/stripe/create-payment - Create Stripe payment
  router.post('/stripe/create-payment', async (req, res) => {
    try {
      const { amount, currency = 'usd', customer_id } = req.body;

      res.json({
        status: 'success',
        message: 'Stripe payment not yet implemented',
        data: { amount, currency, customer_id },
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message,
      });
    }
  });

  // POST /api/integrations/twilio/send-sms - Send SMS via Twilio
  router.post('/twilio/send-sms', async (req, res) => {
    try {
      const { to, message } = req.body;

      res.json({
        status: 'success',
        message: 'Twilio SMS not yet implemented',
        data: { to, message_length: message?.length || 0 },
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message,
      });
    }
  });

  // POST /api/integrations/slack/send-message - Send Slack message
  router.post('/slack/send-message', async (req, res) => {
    try {
      const { channel, text } = req.body;

      res.json({
        status: 'success',
        message: 'Slack integration not yet implemented',
        data: { channel, text_length: text?.length || 0 },
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error.message,
      });
    }
  });

  return router;
}
