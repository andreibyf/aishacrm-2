/**
 * AI Routes - Modular Structure
 * Aggregates all AI-related routes from separate modules
 */

import express from 'express';
import logger from '../../lib/logger.js';
import createAiRealtimeRoutes from '../aiRealtime.js';
import createSpeechRoutes from './speech.js';
import createChatRoutes from './chat.js';
import createConversationsRoutes from './conversations.js';
import createToolsRoutes from './tools.js';
import createSummarizationRoutes from './summarization.js';
import { pickModel } from '../../lib/aiEngine/index.js';

export default function createAIRoutes(pgPool) {
  const router = express.Router();
  
  // Initialize realtime routes (existing)
  router.use(createAiRealtimeRoutes(pgPool));
  
  // Constants shared across modules
  const DEFAULT_CHAT_MODEL = pickModel({ capability: 'chat_tools' });
  
  // Basic assistants endpoint
  router.get('/assistants', async (req, res) => {
    try {
      const { tenant_id } = req.query;
      
      res.json({
        status: 'success',
        data: {
          assistants: [
            { id: 'executive-assistant', name: 'Executive Assistant', model: DEFAULT_CHAT_MODEL, active: true },
            { id: 'sales-assistant', name: 'Sales Assistant', model: DEFAULT_CHAT_MODEL, active: true },
            { id: 'support-assistant', name: 'Support Assistant', model: DEFAULT_CHAT_MODEL, active: false }
          ],
          tenant_id
        }
      });
    } catch (error) {
      logger.error('[AI Assistants] Error:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // Mount modular routes
  router.use(createSpeechRoutes(pgPool));
  router.use(createChatRoutes(pgPool));
  router.use(createConversationsRoutes(pgPool));
  router.use(createToolsRoutes(pgPool));
  router.use(createSummarizationRoutes(pgPool));

  // Additional endpoints that were in the original file
  // These will be extracted to appropriate modules as needed
  
  router.post('/suggest-next-actions', async (req, res) => {
    // Placeholder - this would be moved to tools module eventually
    res.json({ status: 'success', message: 'Not yet implemented in modular structure' });
  });

  router.post('/generate-email-draft', async (req, res) => {
    // Placeholder - this would be moved to a new email module eventually  
    res.json({ status: 'success', message: 'Not yet implemented in modular structure' });
  });

  return router;
}