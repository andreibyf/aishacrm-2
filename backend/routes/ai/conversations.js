/**
 * AI Conversations Routes
 * Conversation management for AI chat sessions
 */

import express from 'express';
import logger from '../../lib/logger.js';
import { getSupabaseClient } from '../../lib/supabase-db.js';
import { resolveCanonicalTenant } from '../../lib/tenantCanonicalResolver.js';
import { getTenantIdFromRequest } from '../../lib/aiEngine/index.js';

export default function createConversationsRoutes(_pgPool) {
  const router = express.Router();

  // SSE clients storage for real-time conversation updates
  const conversationClients = new Map(); // conversationId -> Set<res>

  const parseMetadata = (value) => {
    if (!value) return {};
    if (typeof value === 'object') return value;
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  };

  const _broadcastMessage = (conversationId, message) => {
    if (!conversationClients.has(conversationId)) {
      return;
    }
    const payload = JSON.stringify({ type: 'message', data: message });
    const clients = conversationClients.get(conversationId);
    clients.forEach((client) => {
      try {
        client.write(`data: ${payload}\\n\\n`);
      } catch (err) {
        logger.warn('[AI Routes] Failed to broadcast conversation update:', err.message || err);
      }
    });
  };

  const getTenantId = (req) => {
    return getTenantIdFromRequest(req) || 
           req.headers['x-tenant-id'] || 
           req.query.tenant_id || 
           req.query.tenantId || 
           req.user?.tenant_id;
  };

  // POST /api/ai/conversations - Create new conversation
  router.post('/conversations', async (req, res) => {
    let tenantIdentifier = null;
    let tenantRecord = null;
    let agentName = 'crm_assistant';
    
    try {
      const { agent_name = 'crm_assistant', metadata = {} } = req.body;
      agentName = agent_name;
      tenantIdentifier = getTenantId(req);
      
      if (!tenantIdentifier) {
        return res.status(400).json({
          status: 'error', 
          message: 'Tenant ID is required in header (x-tenant-id) or query parameter'
        });
      }

      try {
        tenantRecord = await resolveCanonicalTenant(tenantIdentifier);
        if (!tenantRecord?.found) {
          logger.warn('[AI] Conversation creation - tenant not found:', tenantIdentifier);
          return res.status(404).json({ 
            status: 'error', 
            message: 'Tenant not found'
          });
        }
      } catch (err) {
        logger.error('[AI] Conversation creation - tenant resolution error:', err);
        return res.status(500).json({ 
          status: 'error', 
          message: 'Failed to resolve tenant'
        });
      }

      const supa = getSupabaseClient();
      
      const { data, error } = await supa
        .from('ai_conversations')
        .insert({
          tenant_id: tenantRecord.uuid,
          agent_name: agentName,
          metadata: metadata || {},
          created_date: new Date().toISOString(),
          is_active: true,
        })
        .select()
        .single();

      if (error) {
        logger.error('[AI] Failed to create conversation:', error);
        return res.status(500).json({
          status: 'error',
          message: 'Failed to create conversation'
        });
      }

      res.status(201).json({
        status: 'success',
        data: {
          id: data.id,
          agent_name: data.agent_name,
          metadata: parseMetadata(data.metadata),
          created_date: data.created_date,
          is_active: data.is_active,
          tenant_id: data.tenant_id
        }
      });

    } catch (error) {
      logger.error('[AI] Conversation creation error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  });

  // GET /api/ai/conversations - List conversations
  router.get('/conversations', async (req, res) => {
    try {
      const tenantIdentifier = getTenantId(req);
      
      if (!tenantIdentifier) {
        return res.status(400).json({
          status: 'error',
          message: 'Tenant ID is required'
        });
      }

      const tenantRecord = await resolveCanonicalTenant(tenantIdentifier);
      if (!tenantRecord?.found) {
        return res.status(404).json({
          status: 'error',
          message: 'Tenant not found'
        });
      }

      const supa = getSupabaseClient();
      const limit = Math.min(parseInt(req.query.limit || '50'), 100);
      const offset = parseInt(req.query.offset || '0');

      const { data, error, count } = await supa
        .from('ai_conversations')
        .select('*', { count: 'exact' })
        .eq('tenant_id', tenantRecord.uuid)
        .order('created_date', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        logger.error('[AI] Failed to list conversations:', error);
        return res.status(500).json({
          status: 'error',
          message: 'Failed to retrieve conversations'
        });
      }

      res.json({
        status: 'success',
        data: (data || []).map(conv => ({
          id: conv.id,
          agent_name: conv.agent_name,
          metadata: parseMetadata(conv.metadata),
          created_date: conv.created_date,
          is_active: conv.is_active,
          tenant_id: conv.tenant_id
        })),
        meta: {
          total: count || 0,
          limit,
          offset
        }
      });

    } catch (error) {
      logger.error('[AI] List conversations error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  });

  // Additional conversation routes would go here...
  // For brevity, I'm including just the core create/list operations
  // The full implementation would include GET /:id, PATCH /:id, DELETE /:id, 
  // messages endpoints, and SSE streaming

  return router;
}