/**
 * C.A.R.E. v1 – Audit Emitter
 * 
 * Logger-based audit emitter for C.A.R.E. decision tracking.
 * Emits structured JSON logs for offline analysis and debugging.
 * 
 * PR4: Internal audit + telemetry emitter
 * 
 * @module backend/lib/care/careAuditEmitter
 */

import logger from '../logger.js';
import { CarePolicyGateResult, CareAuditEventType } from './careAuditTypes.js';

/**
 * Validate required fields in a C.A.R.E. audit event
 * 
 * @param {Object} event - Event to validate
 * @throws {Error} If validation fails
 */
function validateAuditEvent(event) {
  // Validate reason (must be non-empty string)
  if (!event.reason || typeof event.reason !== 'string' || event.reason.trim().length === 0) {
    throw new Error('CareAuditEmitter: reason is required and must be a non-empty string');
  }

  // Validate action_origin (must be present and valid)
  if (!event.action_origin || typeof event.action_origin !== 'string') {
    throw new Error('CareAuditEmitter: action_origin is required');
  }

  const validOrigins = ['user_directed', 'care_autonomous'];
  if (!validOrigins.includes(event.action_origin)) {
    throw new Error(
      `CareAuditEmitter: action_origin must be one of: ${validOrigins.join(', ')}`
    );
  }

  // Validate policy_gate_result (must be present and valid)
  if (!event.policy_gate_result || typeof event.policy_gate_result !== 'string') {
    throw new Error('CareAuditEmitter: policy_gate_result is required');
  }

  const validResults = Object.values(CarePolicyGateResult);
  if (!validResults.includes(event.policy_gate_result)) {
    throw new Error(
      `CareAuditEmitter: policy_gate_result must be one of: ${validResults.join(', ')}`
    );
  }

  // Validate event_type (should be valid if provided)
  if (event.event_type) {
    const validTypes = Object.values(CareAuditEventType);
    if (!validTypes.includes(event.event_type)) {
      logger.warn('[CARE_AUDIT] Unknown event_type:', event.event_type);
    }
  }

  // Validate basic required fields
  if (!event.tenant_id) {
    throw new Error('CareAuditEmitter: tenant_id is required');
  }

  if (!event.entity_type) {
    throw new Error('CareAuditEmitter: entity_type is required');
  }

  if (!event.entity_id) {
    throw new Error('CareAuditEmitter: entity_id is required');
  }
}

/**
 * Emit a C.A.R.E. audit event
 * 
 * Validates the event and logs it as structured JSON.
 * Does NOT write to database or trigger side effects.
 * 
 * Log format: [CARE_AUDIT] {json}
 * 
 * @param {import('./careAuditTypes.js').CareAuditEvent} event - Audit event to emit
 * @throws {Error} If event validation fails
 * 
 * @example
 * emitCareAudit({
 *   ts: new Date().toISOString(),
 *   tenant_id: 'uuid',
 *   entity_type: 'conversation',
 *   entity_id: 'conv-123',
 *   event_type: 'escalation_detected',
 *   action_origin: 'care_autonomous',
 *   reason: 'Customer used objection phrase: "not interested"',
 *   policy_gate_result: 'escalated',
 *   meta: { escalation_reasons: ['objection'], confidence: 'high' }
 * });
 */
export function emitCareAudit(event) {
  // Validate required fields
  validateAuditEvent(event);

  // Add timestamp and telemetry markers if not present
  const auditEvent = {
    ...event,
    ts: event.ts || new Date().toISOString(),
    _telemetry: true,
    type: 'care_audit',
  };

  // Emit structured JSON log with stable prefix
  // This allows easy grep/filtering: grep '\[CARE_AUDIT\]' logs.txt
  // The _telemetry and type fields enable external telemetry-sidecar harvesting
  const logLine = JSON.stringify(auditEvent);
  logger.info(`[CARE_AUDIT] ${logLine}`);
}

/**
 * Emit multiple C.A.R.E. audit events in batch
 * 
 * Validates and emits multiple events. Stops on first validation error.
 * 
 * @param {import('./careAuditTypes.js').CareAuditEvent[]} events - Array of audit events
 * @throws {Error} If any event validation fails
 */
export function emitCareAuditBatch(events) {
  if (!Array.isArray(events)) {
    throw new Error('CareAuditEmitter: events must be an array');
  }

  for (const event of events) {
    emitCareAudit(event);
  }
}

export default {
  emitCareAudit,
  emitCareAuditBatch,
};
