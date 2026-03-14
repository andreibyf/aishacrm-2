import { isValidUUID } from './uuidValidator.js';

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isIsoDateString(value) {
  return isNonEmptyString(value) && !Number.isNaN(Date.parse(value));
}

function hasEmailShape(value) {
  return isNonEmptyString(value) && value.includes('@');
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeTraceId(req, body) {
  return req.headers['x-aisha-trace-id'] || body?.meta?.trace_id || null;
}

export function buildCommunicationsError(code, message, details = {}, traceId = null) {
  return {
    ok: false,
    error: {
      code,
      message,
      details,
    },
    trace_id: traceId,
  };
}

export function requireInternalCommunicationsService(req, res, next) {
  const traceId = req.headers['x-aisha-trace-id'] || null;
  const user = req.user;

  if (!user?.email) {
    return res.status(401).json(
      buildCommunicationsError(
        'communications_invalid_auth',
        'Internal communications routes require authenticated service access',
        {},
        traceId,
      ),
    );
  }

  if (!user.internal && !user.service_role) {
    return res.status(403).json(
      buildCommunicationsError(
        'communications_invalid_auth',
        'Internal communications routes only allow internal service callers',
        {},
        traceId,
      ),
    );
  }

  return next();
}

export function validateCommunicationsRequest(kind) {
  return (req, res, next) => {
    const body = req.body || {};
    const traceId = normalizeTraceId(req, body);
    const errors = [];
    const idempotencyKey = req.headers['x-aisha-idempotency-key'];

    if (!isNonEmptyString(idempotencyKey)) {
      errors.push({
        field: 'headers.x-aisha-idempotency-key',
        message: 'X-AISHA-IDEMPOTENCY-KEY header is required',
      });
    }

    if (body.tenant_id !== undefined && body.tenant_id !== null && !isValidUUID(body.tenant_id)) {
      errors.push({
        field: 'tenant_id',
        message: 'tenant_id must be a valid UUID when provided',
      });
    }

    if (!isNonEmptyString(body.source_service)) {
      errors.push({
        field: 'source_service',
        message: 'source_service is required',
      });
    }

    if (!isNonEmptyString(body.event_type)) {
      errors.push({
        field: 'event_type',
        message: 'event_type is required',
      });
    }

    if (!isIsoDateString(body.occurred_at)) {
      errors.push({
        field: 'occurred_at',
        message: 'occurred_at must be a valid ISO timestamp',
      });
    }

    if (!isPlainObject(body.payload)) {
      errors.push({
        field: 'payload',
        message: 'payload must be an object',
      });
    }

    if (!body.tenant_id && !isNonEmptyString(body.mailbox_id) && !hasEmailShape(body.mailbox_address)) {
      errors.push({
        field: 'tenant_resolution',
        message: 'tenant_id, mailbox_id, or mailbox_address is required to resolve tenant scope',
      });
    }

    if (isPlainObject(body.meta)) {
      if (body.meta.trace_id !== undefined && !isNonEmptyString(body.meta.trace_id)) {
        errors.push({
          field: 'meta.trace_id',
          message: 'meta.trace_id must be a non-empty string when provided',
        });
      }
      if (body.meta.attempt !== undefined && !Number.isInteger(body.meta.attempt)) {
        errors.push({
          field: 'meta.attempt',
          message: 'meta.attempt must be an integer when provided',
        });
      }
    }

    if (errors.length === 0) {
      validateRoutePayload(kind, body.payload, errors);
    }

    if (errors.length > 0) {
      return res.status(400).json(
        buildCommunicationsError(
          'communications_payload_invalid',
          'Communications request failed validation',
          { errors },
          traceId,
        ),
      );
    }

    req.communications = {
      traceId,
      idempotencyKey,
      kind,
    };

    return next();
  };
}

function validateRoutePayload(kind, payload, errors) {
  switch (kind) {
    case 'inbound':
      validateInboundPayload(payload, errors);
      break;
    case 'outbound':
      validateOutboundPayload(payload, errors);
      break;
    case 'outboundReconcile':
      validateOutboundReconcilePayload(payload, errors);
      break;
    case 'replay':
      validateReplayPayload(payload, errors);
      break;
    case 'schedulingReplies':
      validateSchedulingReplyPayload(payload, errors);
      break;
    default:
      break;
  }
}

function validateInboundPayload(payload, errors) {
  if (!isNonEmptyString(payload.message_id)) {
    errors.push({ field: 'payload.message_id', message: 'message_id is required' });
  }
  if (!isNonEmptyString(payload.subject)) {
    errors.push({ field: 'payload.subject', message: 'subject is required' });
  }
  if (!isIsoDateString(payload.received_at)) {
    errors.push({ field: 'payload.received_at', message: 'received_at must be a valid ISO timestamp' });
  }
  if (!isPlainObject(payload.from) || !hasEmailShape(payload.from.email)) {
    errors.push({ field: 'payload.from.email', message: 'from.email is required' });
  }
  if (!Array.isArray(payload.to) || payload.to.length === 0) {
    errors.push({ field: 'payload.to', message: 'to must contain at least one recipient' });
  }
}

function validateOutboundPayload(payload, errors) {
  if (!isNonEmptyString(payload.send_request_id)) {
    errors.push({ field: 'payload.send_request_id', message: 'send_request_id is required' });
  }
  if (!isNonEmptyString(payload.sender_identity_id)) {
    errors.push({ field: 'payload.sender_identity_id', message: 'sender_identity_id is required' });
  }
  if (!Array.isArray(payload.to) || payload.to.length === 0) {
    errors.push({ field: 'payload.to', message: 'to must contain at least one recipient' });
  }
  if (!isNonEmptyString(payload.subject)) {
    errors.push({ field: 'payload.subject', message: 'subject is required' });
  }
  if (!isNonEmptyString(payload.text_body) && !isNonEmptyString(payload.html_body)) {
    errors.push({
      field: 'payload.body',
      message: 'either text_body or html_body is required',
    });
  }
}

function validateOutboundReconcilePayload(payload, errors) {
  if (!isNonEmptyString(payload.outbound_message_id)) {
    errors.push({
      field: 'payload.outbound_message_id',
      message: 'outbound_message_id is required',
    });
  }
  if (!isNonEmptyString(payload.delivery_state)) {
    errors.push({ field: 'payload.delivery_state', message: 'delivery_state is required' });
  }
}

function validateReplayPayload(payload, errors) {
  if (!isNonEmptyString(payload.replay_job_id)) {
    errors.push({ field: 'payload.replay_job_id', message: 'replay_job_id is required' });
  }
  if (!isNonEmptyString(payload.replay_reason)) {
    errors.push({ field: 'payload.replay_reason', message: 'replay_reason is required' });
  }
  if (!isNonEmptyString(payload.original_event_type)) {
    errors.push({
      field: 'payload.original_event_type',
      message: 'original_event_type is required',
    });
  }
}

function validateSchedulingReplyPayload(payload, errors) {
  if (!isNonEmptyString(payload.invite_id)) {
    errors.push({ field: 'payload.invite_id', message: 'invite_id is required' });
  }
  if (!hasEmailShape(payload.attendee_email)) {
    errors.push({
      field: 'payload.attendee_email',
      message: 'attendee_email is required',
    });
  }
  if (!isNonEmptyString(payload.reply_message) && !isNonEmptyString(payload.reply_state_hint)) {
    errors.push({
      field: 'payload.reply',
      message: 'either reply_message or reply_state_hint is required',
    });
  }
}
