import express from 'express';
import logger from '../lib/logger.js';
import {
  buildCommunicationsError,
  requireInternalCommunicationsService,
  validateCommunicationsRequest,
} from '../lib/communicationsApiValidation.js';
import { handleInboundCommunicationsEvent } from '../services/inboundCommunicationsService.js';
import {
  processSchedulingReplyEvent,
  reconcileOutboundDeliveryEvent,
  replayCommunicationsThread,
} from '../services/communicationsEventService.js';

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

      return res
        .status(error.statusCode || 500)
        .json(
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
      try {
        const response = await reconcileOutboundDeliveryEvent({
          ...req.body,
          user: req.user,
          traceId: req.communications?.traceId || null,
          idempotencyKey: req.communications?.idempotencyKey || null,
        });
        return res.status(202).json(response);
      } catch (error) {
        return handleCommunicationsError(req, res, error, 'outbound reconcile');
      }
    },
  );

  router.post('/threads/replay', validateCommunicationsRequest('replay'), async (req, res) => {
    try {
      const response = await replayCommunicationsThread({
        ...req.body,
        user: req.user,
        traceId: req.communications?.traceId || null,
        idempotencyKey: req.communications?.idempotencyKey || null,
      });
      return res.status(202).json(response);
    } catch (error) {
      return handleCommunicationsError(req, res, error, 'thread replay');
    }
  });

  router.post(
    '/scheduling/replies',
    validateCommunicationsRequest('schedulingReplies'),
    async (req, res) => {
      try {
        const response = await processSchedulingReplyEvent({
          ...req.body,
          user: req.user,
          traceId: req.communications?.traceId || null,
          idempotencyKey: req.communications?.idempotencyKey || null,
        });
        return res.status(202).json(response);
      } catch (error) {
        return handleCommunicationsError(req, res, error, 'scheduling reply');
      }
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

  return res
    .status(501)
    .json(
      buildCommunicationsError(
        'communications_not_implemented',
        'Communications endpoint scaffold is mounted but business logic is not implemented yet',
        { operation },
        traceId,
      ),
    );
}

function handleCommunicationsError(req, res, error, operation) {
  const traceId = req.communications?.traceId || req.headers['x-aisha-trace-id'] || null;
  logger.error(
    {
      error: error.message,
      code: error.code,
      operation,
      trace_id: traceId,
      tenant_id: req.body?.tenant_id || null,
      mailbox_id: req.body?.mailbox_id || null,
    },
    `[communications] ${operation} handler failed`,
  );

  return res
    .status(error.statusCode || 500)
    .json(
      buildCommunicationsError(
        error.code || 'communications_internal_error',
        error.message || `Communications ${operation} handling failed`,
        {},
        traceId,
      ),
    );
}
