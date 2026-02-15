/**
 * C.A.R.E. Shadow Audit Logger
 * 
 * Standardized logging for "would have acted" events during shadow mode.
 * 
 * This logger:
 * - MUST NOT write to database
 * - MUST NOT emit user-facing notifications
 * - MUST NOT trigger external systems
 * - MAY log to existing application logger only
 * 
 * Uses the same structured JSON format as careAuditEmitter for consistent
 * log parsing and telemetry-sidecar harvesting. Shadow events are distinguished
 * by the `is_shadow: true` flag and `type: 'care_shadow'` marker.
 * 
 * Grep pattern: grep '\[CARE_AUDIT\]' logs.txt  (catches both audit AND shadow)
 * Shadow only:  grep '"is_shadow":true' logs.txt
 * 
 * @module careShadowLog
 */

import logger from '../logger.js';

/**
 * Log a shadow C.A.R.E. event
 * 
 * Records what the system *would* have done if autonomy were fully enabled.
 * These events are for internal observability and debugging only.
 * 
 * @param {Object} event - Shadow event details
 * @param {string} event.type - Event type (e.g., 'would_send_followup', 'would_schedule_meeting')
 * @param {string} [event.tenant_id] - Tenant UUID
 * @param {string} [event.entity_type] - Entity type (lead|contact|account)
 * @param {string} [event.entity_id] - Entity ID
 * @param {string} [event.reason] - Why this action would have been taken
 * @param {Object} [event.meta] - Additional metadata
 * 
 * @example
 * logCareShadow({
 *   type: 'would_send_followup',
 *   tenant_id: 'abc-123',
 *   entity_type: 'lead',
 *   entity_id: 'lead-456',
 *   reason: 'Lead in Evaluating state, 3 days since last contact',
 *   meta: { days_since_contact: 3, care_state: 'evaluating' }
 * });
 */
export function logCareShadow(event) {
  if (!event || typeof event !== 'object') {
    logger.warn('[CARE_AUDIT] shadow_invalid: Invalid event object provided to logCareShadow');
    return;
  }
  
  const {
    type,
    tenant_id,
    entity_type,
    entity_id,
    reason,
    meta = {},
  } = event;
  
  // Validate required fields
  if (!type) {
    logger.warn('[CARE_AUDIT] shadow_invalid: Event missing required "type" field');
    return;
  }
  
  // Emit structured JSON with same format as careAuditEmitter
  // so telemetry-sidecar and grep patterns work uniformly.
  const shadowEvent = {
    ts: new Date().toISOString(),
    tenant_id: tenant_id || null,
    entity_type: entity_type || null,
    entity_id: entity_id || null,
    event_type: type,
    reason: reason || null,
    meta,
    // Markers for filtering
    type: 'care_shadow',
    _telemetry: true,
    is_shadow: true,
  };
  
  const logLine = JSON.stringify(shadowEvent);
  logger.info(`[CARE_AUDIT] ${logLine}`);
}

/**
 * Log a batch of shadow events
 * 
 * @param {Array<Object>} events - Array of shadow events
 */
export function logCareShadowBatch(events) {
  if (!Array.isArray(events)) {
    logger.warn('[CARE_AUDIT] shadow_invalid: logCareShadowBatch expects an array');
    return;
  }
  
  events.forEach(logCareShadow);
}

export default {
  logCareShadow,
  logCareShadowBatch,
};
