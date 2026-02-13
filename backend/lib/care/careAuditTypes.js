/**
 * C.A.R.E. v1 – Audit Event Types
 * 
 * Type definitions and constants for C.A.R.E. audit events.
 * Used by careAuditEmitter for structured logging and telemetry.
 * 
 * PR4: Internal audit + telemetry emitter
 * 
 * @module backend/lib/care/careAuditTypes
 */

/**
 * Policy gate result for C.A.R.E. actions
 * Determines whether an action is allowed, escalated, or blocked
 * 
 * @enum {string}
 */
export const CarePolicyGateResult = {
  /** Action is allowed to proceed */
  ALLOWED: 'allowed',
  
  /** Action requires human review/escalation */
  ESCALATED: 'escalated',
  
  /** Action is blocked by policy */
  BLOCKED: 'blocked',
};

/**
 * C.A.R.E. audit event types
 * Defines the categories of audit events we track
 * 
 * @enum {string}
 */
export const CareAuditEventType = {
  /** State transition proposed (not yet applied) */
  STATE_PROPOSED: 'state_proposed',
  
  /** State transition applied */
  STATE_APPLIED: 'state_applied',
  
  /** Escalation condition detected */
  ESCALATION_DETECTED: 'escalation_detected',
  
  /** Action candidate identified */
  ACTION_CANDIDATE: 'action_candidate',
  
  /** Action skipped due to policy/conditions */
  ACTION_SKIPPED: 'action_skipped',
};

/**
 * C.A.R.E. Audit Event
 * 
 * Structured audit event for C.A.R.E. v1 decision tracking.
 * All fields are required unless marked optional.
 * 
 * @typedef {Object} CareAuditEvent
 * @property {string} ts - ISO 8601 timestamp
 * @property {string} tenant_id - Tenant UUID
 * @property {string} entity_type - Entity type (e.g., 'conversation', 'call', 'lead')
 * @property {string} entity_id - Entity UUID
 * @property {string} event_type - One of CareAuditEventType
 * @property {string} action_origin - One of 'user_directed' | 'care_autonomous'
 * @property {string} reason - Non-empty human-readable reason for the event
 * @property {string} policy_gate_result - One of CarePolicyGateResult
 * @property {Object} [meta] - Optional metadata object
 */

/**
 * Create a validated CareAuditEvent object
 * 
 * @param {Object} params - Event parameters
 * @param {string} params.tenant_id - Tenant UUID
 * @param {string} params.entity_type - Entity type
 * @param {string} params.entity_id - Entity UUID
 * @param {string} params.event_type - Event type from CareAuditEventType
 * @param {string} params.action_origin - Action origin ('user_directed' | 'care_autonomous')
 * @param {string} params.reason - Non-empty reason
 * @param {string} params.policy_gate_result - Gate result from CarePolicyGateResult
 * @param {Object} [params.meta] - Optional metadata
 * @returns {CareAuditEvent}
 */
export function createAuditEvent({
  tenant_id,
  entity_type,
  entity_id,
  event_type,
  action_origin,
  reason,
  policy_gate_result,
  meta = {},
}) {
  return {
    ts: new Date().toISOString(),
    tenant_id,
    entity_type,
    entity_id,
    event_type,
    action_origin,
    reason,
    policy_gate_result,
    meta,
  };
}
