/**
 * Customer C.A.R.E. Shadow Audit Logger
 * 
 * Standardized logging for "would have acted" events during shadow mode.
 * 
 * This logger:
 * - MUST NOT write to database
 * - MUST NOT emit user-facing notifications
 * - MUST NOT trigger external systems
 * - MAY log to existing application logger only
 * 
 * Purpose: Provide observability for C.A.R.E. decisions without side effects.
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
    logger.warn('[CARE:Shadow] Invalid event object provided to logCareShadow');
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
    logger.warn('[CARE:Shadow] Event missing required "type" field');
    return;
  }
  
  // Log to application logger with clear shadow prefix
  logger.info({
    message: '[CARE:Shadow] Would have executed action',
    care_event_type: type,
    tenant_id,
    entity_type,
    entity_id,
    reason,
    ...meta,
    // Marker flags for filtering/querying
    is_shadow_event: true,
    is_autonomous_action: false,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Log a batch of shadow events
 * 
 * @param {Array<Object>} events - Array of shadow events
 */
export function logCareShadowBatch(events) {
  if (!Array.isArray(events)) {
    logger.warn('[CARE:Shadow] logCareShadowBatch expects an array');
    return;
  }
  
  events.forEach(logCareShadow);
}

export default {
  logCareShadow,
  logCareShadowBatch,
};
