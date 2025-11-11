/**
 * AI Routes
 * Chat, sentiment, summarization, embeddings, conversations
 */

import express from 'express';
import { createChatCompletion, buildSystemPrompt } from '../lib/aiProvider.js';

export default function createAIRoutes(pgPool) {
  const router = express.Router();

  // Middleware to get tenant_id from request
  const getTenantId = (req) => {
    return req.headers['x-tenant-id'] || req.user?.tenant_id;
  };

  // SSE clients storage for real-time conversation updates
  const conversationClients = new Map(); // conversationId -> Set of response objects

  // POST /api/ai/conversations - Create new conversation
  router.post('/conversations', async (req, res) => {
    try {
      const { agent_name = 'crm_assistant', metadata = {} } = req.body;
      const tenant_id = getTenantId(req);

      if (!tenant_id) {
        return res.status(400).json({ status: 'error', message: 'tenant_id required' });
      }

      const result = await pgPool.query(
        `INSERT INTO conversations (tenant_id, agent_name, metadata, status)
         VALUES ($1, $2, $3, 'active')
         RETURNING *`,
        [tenant_id, agent_name, JSON.stringify(metadata)]
      );

      res.json({
        status: 'success',
        data: result.rows[0],
      });
    } catch (error) {
      console.error('Create conversation error:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/ai/conversations/:id - Get conversation details
  router.get('/conversations/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const tenant_id = getTenantId(req);

      // Get conversation
      const convResult = await pgPool.query(
        'SELECT * FROM conversations WHERE id = $1 AND tenant_id = $2',
        [id, tenant_id]
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
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // POST /api/ai/conversations/:id/messages - Add message to conversation
  router.post('/conversations/:id/messages', async (req, res) => {
    try {
      const { id } = req.params;
      const { role, content, metadata = {} } = req.body;
      const tenant_id = getTenantId(req);

      if (!role || !content) {
        return res.status(400).json({ status: 'error', message: 'role and content required' });
      }

      // Verify conversation exists and belongs to tenant
      const convCheck = await pgPool.query(
        'SELECT id FROM conversations WHERE id = $1 AND tenant_id = $2',
        [id, tenant_id]
      );

      if (convCheck.rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Conversation not found' });
      }

      // Insert message
      const result = await pgPool.query(
        `INSERT INTO conversation_messages (conversation_id, role, content, metadata)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [id, role, content, JSON.stringify(metadata)]
      );

      const message = result.rows[0];

      // Update conversation updated_date
      await pgPool.query(
        'UPDATE conversations SET updated_date = CURRENT_TIMESTAMP WHERE id = $1',
        [id]
      );

      // Broadcast to SSE clients
      if (conversationClients.has(id)) {
        const clients = conversationClients.get(id);
        const data = JSON.stringify({ type: 'message', data: message });
        
        clients.forEach((client) => {
          client.write(`data: ${data}\n\n`);
        });
      }

      res.json({
        status: 'success',
        data: message,
      });
    } catch (error) {
      console.error('Add message error:', error);
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // GET /api/ai/conversations/:id/stream - SSE stream for conversation updates
  router.get('/conversations/:id/stream', async (req, res) => {
    try {
      const { id } = req.params;
      const tenant_id = getTenantId(req);

      // Verify conversation exists
      const convCheck = await pgPool.query(
        'SELECT id FROM conversations WHERE id = $1 AND tenant_id = $2',
        [id, tenant_id]
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

      const result = await createChatCompletion({ messages: msgs, model, temperature });
      if (result.status === 'error') {
        const http = /OPENAI_API_KEY/.test(result.error || '') ? 501 : 500; // 501 Not Implemented if key missing
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
