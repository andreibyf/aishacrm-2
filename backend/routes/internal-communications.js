import express from 'express';
import logger from '../lib/logger.js';
import {
  buildCommunicationsError,
  requireInternalCommunicationsService,
  validateCommunicationsRequest,
} from '../lib/communicationsApiValidation.js';
import { handleInboundCommunicationsEvent } from '../services/inboundCommunicationsService.js';

export default function createInternalCommunicationsRoutes(_pgPool) {
  const router = express.Router();

  router.use(requireInternalCommunicationsService);

  router.post('/inbound', validateCommunicationsRequest('inbound'), async (req, res) => {
    try {
      const response = await handleInboundCommunicationsEvent({
        ...req.body,
        user: req.user,
        traceId: req.communications?.traceId || null,
        idempotencyKey: req.communications?.idempotencyKey || null,
      });
      return res.status(202).json(response);
    } catch (error) {
      const traceId = req.communications?.traceId || req.headers['x-aisha-trace-id'] || null;
      logger.error(
        {
          error: error.message,
          code: error.code,
          trace_id: traceId,
          tenant_id: req.body?.tenant_id || null,
          mailbox_id: req.body?.mailbox_id || null,
        },
        '[communications] inbound handler failed',
      );

      return res.status(error.statusCode || 500).json(
        buildCommunicationsError(
          error.code || 'communications_internal_error',
          error.message || 'Inbound communications handling failed',
          {},
          traceId,
        ),
      );
    }
  });

  router.post('/outbound', validateCommunicationsRequest('outbound'), async (req, res) => {
    return respondNotImplemented(req, res, 'outbound');
  });

  router.post(
    '/outbound/reconcile',
    validateCommunicationsRequest('outboundReconcile'),
    async (req, res) => {
      return respondNotImplemented(req, res, 'outbound_reconcile');
    },
  );

  router.post('/threads/replay', validateCommunicationsRequest('replay'), async (req, res) => {
    return respondNotImplemented(req, res, 'threads_replay');
  });

  router.post(
    '/scheduling/replies',
    validateCommunicationsRequest('schedulingReplies'),
    async (req, res) => {
      return respondNotImplemented(req, res, 'scheduling_replies');
    },
  );

  router.get('/health', async (_req, res) => {
    return res.json({
      ok: true,
      status: 'stub',
      result: {
        backend: 'ready',
        validation: 'ready',
        routes: 'mounted',
        implementation: 'pending',
      },
    });
  });

  return router;
}

function respondNotImplemented(req, res, operation) {
  const traceId = req.communications?.traceId || req.headers['x-aisha-trace-id'] || null;
  logger.info(
    {
      operation,
      source_service: req.body?.source_service,
      tenant_id: req.body?.tenant_id || null,
      mailbox_id: req.body?.mailbox_id || null,
      trace_id: traceId,
      idempotency_key: req.communications?.idempotencyKey,
    },
    '[communications] request validated but handler is not implemented',
  );

  return res.status(501).json(
    buildCommunicationsError(
      'communications_not_implemented',
      'Communications endpoint scaffold is mounted but business logic is not implemented yet',
      { operation },
      traceId,
    ),
  );
}
