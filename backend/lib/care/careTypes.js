/**
 * Customer C.A.R.E. Type Definitions
 * 
 * Canonical types for Customer Cognitive Autonomous Relationship Execution (C.A.R.E.).
 * 
 * This module defines the core data structures used throughout the C.A.R.E. system:
 * - Care states (unaware → lost)
 * - Entity types (lead, contact, account)
 * - Transition proposals
 * - State context
 * 
 * These types are aligned with:
 * - docs/product/customer-care-v1.md (behavioral contract)
 * - backend/migrations/116_customer_care_state.sql (database schema)
 * 
 * @module careTypes
 */

/**
 * Canonical C.A.R.E. states from behavioral contract
 * 
 * State progression:
 * - unaware: No awareness of our offering
 * - aware: Knows we exist, no interaction
 * - engaged: Active conversation, exploring fit
 * - evaluating: Considering specific proposal
 * - committed: Made commitment (verbal or written)
 * - active: Ongoing relationship (customer)
 * - at_risk: Showing signs of disengagement
 * - dormant: Inactive for extended period
 * - reactivated: Re-engaged after dormancy
 * - lost: Explicit rejection or permanent disengagement
 * 
 * @typedef {'unaware'|'aware'|'engaged'|'evaluating'|'committed'|'active'|'at_risk'|'dormant'|'reactivated'|'lost'} CareState
 */

/**
 * All valid C.A.R.E. states as a Set for O(1) validation
 * @type {Set<CareState>}
 */
export const VALID_CARE_STATES = new Set([
  'unaware',
  'aware',
  'engaged',
  'evaluating',
  'committed',
  'active',
  'at_risk',
  'dormant',
  'reactivated',
  'lost'
]);

/**
 * Entity types that can have C.A.R.E. state
 * @typedef {'lead'|'contact'|'account'} CareEntityType
 */

/**
 * All valid entity types as a Set for O(1) validation
 * @type {Set<CareEntityType>}
 */
export const VALID_ENTITY_TYPES = new Set([
  'lead',
  'contact',
  'account'
]);

/**
 * Escalation status values
 * @typedef {'open'|'closed'} EscalationStatus
 */

/**
 * Context required to identify a C.A.R.E. entity
 * 
 * @typedef {Object} CareContext
 * @property {string} tenant_id - Tenant UUID
 * @property {CareEntityType} entity_type - Type of entity
 * @property {string} entity_id - Entity UUID
 */

/**
 * Current C.A.R.E. state record (matches customer_care_state table)
 * 
 * @typedef {Object} CareStateRecord
 * @property {string} id - Record UUID
 * @property {string} tenant_id - Tenant UUID
 * @property {CareEntityType} entity_type - Entity type
 * @property {string} entity_id - Entity UUID
 * @property {CareState} care_state - Current state
 * @property {boolean} hands_off_enabled - Autonomy opt-in flag
 * @property {EscalationStatus|null} escalation_status - Escalation status
 * @property {Date|null} last_signal_at - Last signal timestamp
 * @property {Date} created_at - Record creation
 * @property {Date} updated_at - Last update
 */

/**
 * Proposed state transition
 * 
 * Every transition MUST include a non-empty reason explaining why
 * the transition is being proposed. This is critical for:
 * - Explainability
 * - Debugging
 * - Compliance
 * - Customer trust
 * 
 * @typedef {Object} CareTransitionProposal
 * @property {CareState|null} from_state - Current state (null for initial state)
 * @property {CareState} to_state - Proposed new state
 * @property {string} reason - Required explanation (non-empty)
 * @property {Object} [meta] - Optional additional context
 */

/**
 * State transition event for history (matches customer_care_state_history table)
 * 
 * @typedef {Object} CareHistoryEvent
 * @property {string} tenant_id - Tenant UUID
 * @property {CareEntityType} entity_type - Entity type
 * @property {string} entity_id - Entity UUID
 * @property {CareState|null} from_state - Previous state
 * @property {CareState|null} to_state - New state
 * @property {string} event_type - Event classification
 * @property {string} reason - Required explanation
 * @property {Object} [meta] - Optional context
 * @property {string} [actor_type='system'] - Actor type (system|user|agent)
 * @property {string} [actor_id] - Actor identifier
 */

/**
 * Event type classifications for history
 * @typedef {'state_proposed'|'state_applied'|'escalation_opened'|'escalation_closed'|'action_candidate'|'signal_recorded'} HistoryEventType
 */

export default {
  VALID_CARE_STATES,
  VALID_ENTITY_TYPES
};
