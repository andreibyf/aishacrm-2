import express from 'express';
import { validateTenantAccess } from '../middleware/validateTenant.js';
import logger from '../lib/logger.js';
import {
  getCommunicationsThreadMessages,
  listCommunicationsThreads,
} from '../services/communicationsReadService.js';

const ALLOWED_THREAD_VIEWS = new Set(['all', 'unread', 'open', 'closed']);
const ALLOWED_ENTITY_TYPES = new Set(['lead', 'contact', 'account', 'opportunity', 'activity']);

export default function createCommunicationsV2Routes(
  _pgPool,
  {
    listThreads = listCommunicationsThreads,
    getThreadMessages = getCommunicationsThreadMessages,
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

      if (view && !ALLOWED_THREAD_VIEWS.has(view)) {
        return res.status(400).json({
          status: 'error',
          message: 'view must be one of: all, unread, open, closed',
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

      const result = await listThreads({
        tenantId,
        limit: req.query.limit,
        offset: req.query.offset,
        mailboxId: req.query.mailbox_id,
        status: req.query.status,
        view,
        entityType,
        entityId: req.query.entity_id,
      });

      return res.json({
        status: 'success',
        data: result,
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
        data: result,
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

  return router;
}
