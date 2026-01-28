/**
 * AI Chat Routes
 * Main chat endpoint and related functionality
 */

import express from 'express';
import logger from '../../lib/logger.js';
import { routeChat } from '../../flows/index.js';
import { getTenantIdFromRequest } from '../../lib/aiEngine/index.js';

export default function createChatRoutes(pgPool) {
  const router = express.Router();

  // Main chat endpoint
  router.post('/chat', async (req, res) => {
    const startTime = Date.now();
    
    try {
      logger.debug('[AI Chat] Request received:', {
        tenant_id: getTenantIdFromRequest(req),
        message_length: req.body?.message?.length || 0,
        user: req.user?.email || 'anonymous'
      });

      // Route through the main chat flow handler
      await routeChat(req, res, pgPool);
      
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('[AI Chat] Unhandled error:', {
        error: error.message,
        duration,
        tenant_id: getTenantIdFromRequest(req)
      });
      
      if (!res.headersSent) {
        res.status(500).json({
          status: 'error',
          message: 'Chat processing failed',
          duration
        });
      }
    }
  });

  return router;
}