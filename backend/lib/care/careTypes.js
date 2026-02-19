/**
 * C.A.R.E. Type Definitions
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
 * Entity types that can have C.A.R.E. relationship state.
 * These are the "who" — the relationship anchor that state is keyed on.
 * @typedef {'lead'|'contact'|'account'|'opportunity'} CareStateEntityType
 */

/**
 * Entity types that can appear as signal sources (signal_entity_type).
 * These are the "what happened" — the trigger source.
 * Superset of state entity types.
 * @typedef {'lead'|'contact'|'account'|'opportunity'|'activity'} CareSignalEntityType
 */

/**
 * Entity types that can hold C.A.R.E. state (used by state engine & store).
 * Includes opportunity because deal_decay/opportunity_hot track state on the deal itself.
 * Does NOT include activity — activities are signal sources only.
 * @type {Set<CareStateEntityType>}
 */
export const VALID_ENTITY_TYPES = new Set([
  'lead',
  'contact',
  'account',
  'opportunity',
]);

/**
 * All entity types that can appear in C.A.R.E. events (state holders + signal sources).
 * Use this for validating signal_entity_type fields in event payloads.
 * @type {Set<CareSignalEntityType>}
 */
export const VALID_SIGNAL_ENTITY_TYPES = new Set([
  'lead',
  'contact',
  'account',
  'opportunity',
  'activity',
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

/**
 * Action origin classification (Agent-Task Safety Contract)
 * 
 * All actions AiSHA performs MUST be classified with an action origin
 * to ensure safe coexistence with Office Agents and user-instructed tasks.
 * 
 * @typedef {'user_directed'|'care_autonomous'} ActionOrigin
 * 
 * - user_directed: Initiated by explicit user instruction (e.g., Office Agent task)
 * - care_autonomous: Initiated by AiSHA without explicit user instruction (Hands-Off Mode)
 * 
 * Hard rules:
 * 1. care_autonomous actions MUST pass Hands-Off Mode gates
 * 2. user_directed actions MUST NOT be blocked except for hard safety prohibitions
 * 3. On uncertainty, fail safe: treat as care_autonomous and escalate
 * 
 * Audit requirements:
 * - Every action must record: action_origin, reason, policy_gate_result
 */

/**
 * Policy gate result for action execution
 * @typedef {'allowed'|'escalated'|'blocked'} PolicyGateResult
 */

/**
 * Outcome classification for C.A.R.E. trigger evaluation cycles.
 *
 * Each trigger→suggestion evaluation produces exactly one outcome type,
 * enabling observability into why a cycle produced (or suppressed) a suggestion.
 *
 * This is observability metadata — do not branch execution on outcome_type.
 *
 * @readonly
 * @enum {string}
 */
export const OUTCOME_TYPES = Object.freeze({
  /** Suggestion persisted successfully */
  suggestion_created: 'suggestion_created',
  /** Cooldown / dedup check blocked creation */
  duplicate_suppressed: 'duplicate_suppressed',
  /** generateAiSuggestion() returned null/error */
  generation_failed: 'generation_failed',
  /** Confidence below threshold */
  low_confidence: 'low_confidence',
  /** DB unique constraint (23505) caught */
  constraint_violation: 'constraint_violation',
  /** Unexpected runtime error */
  error: 'error',
});

export default {
  VALID_CARE_STATES,
  VALID_ENTITY_TYPES,
  VALID_SIGNAL_ENTITY_TYPES,
  OUTCOME_TYPES,
};
