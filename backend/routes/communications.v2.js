import { randomUUID } from 'node:crypto';
import express from 'express';
import { validateTenantAccess } from '../middleware/validateTenant.js';
import logger from '../lib/logger.js';
import {
  getCommunicationsThreadMessages,
  listCommunicationsThreads,
} from '../services/communicationsReadService.js';
import { replayCommunicationsThread } from '../services/communicationsEventService.js';
import {
  purgeCommunicationsThread,
  updateCommunicationsThreadStatus,
} from '../services/communicationsStateService.js';

const ALLOWED_THREAD_VIEWS = new Set(['all', 'unread', 'open', 'closed', 'archived']);
const ALLOWED_ENTITY_TYPES = new Set(['lead', 'contact', 'account', 'opportunity', 'activity']);
const ALLOWED_DELIVERY_STATES = new Set([
  'queued',
  'sent',
  'delivered',
  'failed',
  'bounced',
  'opened',
  'clicked',
]);
const ALLOWED_THREAD_STATUSES = new Set(['unread', 'open', 'closed', 'archived']);

export default function createCommunicationsV2Routes(
  _pgPool,
  {
    listThreads = listCommunicationsThreads,
    getThreadMessages = getCommunicationsThreadMessages,
    replayThread = replayCommunicationsThread,
    updateThreadStatus = updateCommunicationsThreadStatus,
    purgeThread = purgeCommunicationsThread,
  } = {},
) {
  const router = express.Router();

  router.use(validateTenantAccess);

  router.get('/threads', async (req, res) => {
    try {
      const tenantId = req.query.tenant_id;
      if (!tenantId) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const view = typeof req.query.view === 'string' ? req.query.view.trim().toLowerCase() : null;
      const entityType =
        typeof req.query.entity_type === 'string'
          ? req.query.entity_type.trim().toLowerCase()
          : null;
      const deliveryState =
        typeof req.query.delivery_state === 'string'
          ? req.query.delivery_state.trim().toLowerCase()
          : null;

      if (view && !ALLOWED_THREAD_VIEWS.has(view)) {
        return res.status(400).json({
          status: 'error',
          message: 'view must be one of: all, unread, open, closed, archived',
          code: 'communications_invalid_view',
        });
      }

      if (entityType && !ALLOWED_ENTITY_TYPES.has(entityType)) {
        return res.status(400).json({
          status: 'error',
          message: 'entity_type must be one of: lead, contact, account, opportunity, activity',
          code: 'communications_invalid_entity_type',
        });
      }

      if (deliveryState && !ALLOWED_DELIVERY_STATES.has(deliveryState)) {
        return res.status(400).json({
          status: 'error',
          message:
            'delivery_state must be one of: queued, sent, delivered, failed, bounced, opened, clicked',
          code: 'communications_invalid_delivery_state',
        });
      }

      const result = await listThreads({
        tenantId,
        limit: req.query.limit,
        offset: req.query.offset,
        mailboxId: req.query.mailbox_id,
        status: req.query.status,
        view,
        entityType,
        entityId: req.query.entity_id,
        deliveryState,
      });

      return res.json({
        status: 'success',
        data: {
          ...result,
          threads: (result.threads || []).map((thread) => ({
            ...thread,
            state: {
              delivery: thread.latest_message?.metadata?.delivery || null,
              replay: thread.metadata?.replay || null,
              events: thread.metadata?.event_log || [],
            },
            latest_message_attachments: thread.latest_message?.metadata?.attachments || [],
          })),
        },
      });
    } catch (error) {
      logger.error('[communications.v2] Failed to list threads:', error.message);
      return res.status(error.statusCode || 500).json({
        status: 'error',
        message: error.message || 'Failed to list communication threads',
        code: error.code || 'communications_threads_query_failed',
      });
    }
  });

  router.get('/threads/:threadId/messages', async (req, res) => {
    try {
      const tenantId = req.query.tenant_id;
      if (!tenantId) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const result = await getThreadMessages({
        tenantId,
        threadId: req.params.threadId,
        limit: req.query.limit,
        offset: req.query.offset,
      });

      if (!result) {
        return res.status(404).json({
          status: 'error',
          message: 'Communication thread not found',
          code: 'communications_thread_not_found',
        });
      }

      return res.json({
        status: 'success',
        data: {
          ...result,
          thread: result.thread
            ? {
                ...result.thread,
                event_log: result.thread.metadata?.event_log || [],
              }
            : result.thread,
          messages: (result.messages || []).map((msg) => ({
            ...msg,
            state: {
              delivery: msg.metadata?.delivery || null,
              meeting: msg.metadata?.meeting || null,
            },
            attachments: msg.metadata?.attachments || msg.attachments || [],
          })),
        },
      });
    } catch (error) {
      logger.error('[communications.v2] Failed to fetch thread messages:', error.message);
      return res.status(error.statusCode || 500).json({
        status: 'error',
        message: error.message || 'Failed to fetch communication thread messages',
        code: error.code || 'communications_messages_query_failed',
      });
    }
  });

  router.post('/threads/:threadId/replay', async (req, res) => {
    try {
      const tenantId = req.body?.tenant_id || req.query?.tenant_id;
      if (!tenantId) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const result = await replayThread({
        tenant_id: tenantId,
        mailbox_id: req.body?.mailbox_id || null,
        source_service: 'communications-ui',
        event_type: 'communications.thread.replay',
        occurred_at: new Date().toISOString(),
        payload: {
          thread_id: req.params.threadId,
          replay_job_id: req.body?.replay_job_id || randomUUID(),
          replay_reason: req.body?.replay_reason || 'operator_requested',
          original_event_type: req.body?.original_event_type || 'communications.inbound.received',
        },
        user: req.user,
        traceId: req.headers['x-aisha-trace-id'] || null,
        idempotencyKey: req.headers['x-aisha-idempotency-key'] || randomUUID(),
      });

      return res.status(202).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      logger.error('[communications.v2] Failed to replay thread:', error.message);
      return res.status(error.statusCode || 500).json({
        status: 'error',
        message: error.message || 'Failed to request thread replay',
        code: error.code || 'communications_thread_replay_failed',
      });
    }
  });

  router.post('/threads/:threadId/status', async (req, res) => {
    try {
      const tenantId = req.body?.tenant_id || req.query?.tenant_id;
      if (!tenantId) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const nextStatus =
        typeof req.body?.status === 'string' ? req.body.status.trim().toLowerCase() : null;

      if (!nextStatus || !ALLOWED_THREAD_STATUSES.has(nextStatus)) {
        return res.status(400).json({
          status: 'error',
          message: 'status must be one of: unread, open, closed, archived',
          code: 'communications_invalid_thread_status',
        });
      }

      const result = await updateThreadStatus({
        tenantId,
        threadId: req.params.threadId,
        status: nextStatus,
        user: req.user,
      });

      return res.json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      logger.error('[communications.v2] Failed to update thread status:', error.message);
      return res.status(error.statusCode || 500).json({
        status: 'error',
        message: error.message || 'Failed to update communication thread status',
        code: error.code || 'communications_thread_status_update_failed',
      });
    }
  });

  router.delete('/threads/:threadId', async (req, res) => {
    try {
      const tenantId = req.body?.tenant_id || req.query?.tenant_id;
      if (!tenantId) {
        return res.status(400).json({ status: 'error', message: 'tenant_id is required' });
      }

      const result = await purgeThread({
        tenantId,
        threadId: req.params.threadId,
        user: req.user,
      });

      return res.json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      logger.error('[communications.v2] Failed to purge thread:', error.message);
      return res.status(error.statusCode || 500).json({
        status: 'error',
        message: error.message || 'Failed to purge communication thread',
        code: error.code || 'communications_thread_purge_failed',
      });
    }
  });

  return router;
}
