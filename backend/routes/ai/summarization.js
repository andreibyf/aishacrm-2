/**
 * AI Summarization Routes
 * Content summarization endpoints
 */

import express from 'express';
import logger from '../../lib/logger.js';
import { getOpenAIClient } from '../../lib/aiProvider.js';
import { resolveLLMApiKey, getTenantIdFromRequest } from '../../lib/aiEngine/index.js';

export default function createSummarizationRoutes(_pgPool) {
  const router = express.Router();

  // POST /api/ai/summarize
  router.post('/summarize', async (req, res) => {
    const startTime = Date.now();
    
    try {
      const { text, options = {} } = req.body;
      
      if (!text || typeof text !== 'string') {
        return res.status(400).json({
          status: 'error',
          message: 'Text content is required'
        });
      }

      if (text.length > 50000) {
        return res.status(400).json({
          status: 'error',
          message: 'Text too long (max 50,000 characters)'
        });
      }

      const tenantIdentifier = getTenantIdFromRequest(req);
      const apiKey = await resolveLLMApiKey({
        explicitKey: req.body?.openai_api_key,
        headerKey: req.get('x-openai-key'),
        userKey: req.user?.openai_api_key,
        tenantSlugOrId: tenantIdentifier,
      });

      if (!apiKey) {
        return res.status(400).json({
          status: 'error',
          message: 'OpenAI API key not configured'
        });
      }

      const client = getOpenAIClient(apiKey);
      const model = options.model || 'gpt-4o-mini';
      const maxLength = options.max_length || 150;
      
      const systemPrompt = `You are a professional summarizer. Create a concise, informative summary of the provided text. 
      Target length: approximately ${maxLength} words. Focus on key points, main ideas, and important details.`;

      const completion = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Please summarize this text:\\n\\n${text}` }
        ],
        temperature: 0.3,
        max_tokens: Math.min(maxLength * 2, 1000)
      });

      const summary = completion.choices[0]?.message?.content?.trim() || '';
      
      res.json({
        status: 'success',
        data: {
          summary,
          original_length: text.length,
          summary_length: summary.length,
          model_used: model
        },
        processing_time_ms: Date.now() - startTime
      });

    } catch (error) {
      logger.error('[AI Summarization] Error:', error);
      res.status(500).json({
        status: 'error',
        message: error.message || 'Summarization failed',
        processing_time_ms: Date.now() - startTime
      });
    }
  });

  return router;
}