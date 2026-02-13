/**
 * C.A.R.E. State Engine
 * 
 * Core state machine for Customer Cognitive Autonomous Relationship Execution.
 * 
 * This module implements:
 * - State validation
 * - Default state assignment
 * - Deterministic transition proposals based on signals
 * - State persistence via store helpers
 * 
 * CRITICAL SAFETY RULES:
 * - Every transition MUST have a non-empty reason
 * - Invalid states are rejected immediately
 * - This module DOES NOT execute actions (that's PR7)
 * - This module DOES NOT send messages or schedule meetings
 * - This is pure logic + database writes only
 * 
 * @module careStateEngine
 */

import { VALID_CARE_STATES, VALID_ENTITY_TYPES } from './careTypes.js';
import { SIGNAL_THRESHOLDS, enrichSignals, validateSignals } from './careSignals.js';

/**
 * Validate that a state string is a valid CareState
 * 
 * @param {string} state - State to validate
 * @returns {string} Valid CareState
 * @throws {Error} If state is invalid
 */
export function validateCareState(state) {
  if (!state || typeof state !== 'string') {
    throw new Error('State must be a non-empty string');
  }
  
  if (!VALID_CARE_STATES.has(state)) {
    throw new Error(
      `Invalid C.A.R.E. state: "${state}". ` +
      `Valid states: ${Array.from(VALID_CARE_STATES).join(', ')}`
    );
  }
  
  return state;
}

/**
 * Validate that an entity type is valid
 * 
 * @param {string} entity_type - Entity type to validate
 * @returns {string} Valid CareEntityType
 * @throws {Error} If entity type is invalid
 */
export function validateEntityType(entity_type) {
  if (!entity_type || typeof entity_type !== 'string') {
    throw new Error('Entity type must be a non-empty string');
  }
  
  if (!VALID_ENTITY_TYPES.has(entity_type)) {
    throw new Error(
      `Invalid entity type: "${entity_type}". ` +
      `Valid types: ${Array.from(VALID_ENTITY_TYPES).join(', ')}`
    );
  }
  
  return entity_type;
}

/**
 * Get default C.A.R.E. state for a new entity
 * 
 * All entities start in "unaware" state by default.
 * 
 * @param {string} entity_type - Entity type (lead|contact|account)
 * @returns {string} Default state ('unaware')
 */
export function getDefaultCareState(entity_type) {
  validateEntityType(entity_type);
  return 'unaware';
}

/**
 * Propose a state transition based on current state and signals
 * 
 * This is the core state machine logic. It examines the current state
 * and available signals to determine if a transition should be proposed.
 * 
 * Transition rules (v1 deterministic logic):
 * 
 * 1. unaware -> aware: any engagement signal (inbound)
 * 2. aware -> engaged: bidirectional exchange
 * 3. engaged -> evaluating: proposal sent
 * 4. evaluating -> committed: commitment recorded
 * 5. committed -> active: immediate (stable relationship)
 * 6. any -> at_risk: silence >= AT_RISK_SILENCE_DAYS
 * 7. at_risk -> dormant: silence >= DORMANT_SILENCE_DAYS
 * 8. dormant -> reactivated: inbound after dormancy
 * 9. any -> lost: explicit rejection
 * 
 * @param {Object} params - Parameters
 * @param {string} params.current_state - Current CareState
 * @param {Object} params.signals - CareSignals object
 * @returns {Object|null} CareTransitionProposal or null if no transition
 */
export function proposeTransition({ current_state, signals }) {
  // Validate inputs
  validateCareState(current_state);
  validateSignals(signals);
  
  // Enrich signals with derived fields
  const enrichedSignals = enrichSignals(signals);
  
  // Rule priority (check in order):
  
  // 1. Explicit rejection -> lost (terminal state, highest priority)
  if (enrichedSignals.explicit_rejection) {
    return {
      from_state: current_state,
      to_state: 'lost',
      reason: 'Explicit rejection detected (customer declined)',
      meta: { signal: 'explicit_rejection' }
    };
  }
  
  // 2. Reactivation: dormant -> reactivated (inbound after dormancy)
  if (current_state === 'dormant' && enrichedSignals.last_inbound_at) {
    // Check if this is a *new* inbound (we don't persist previous last_inbound, so assume any inbound while dormant is reactivation)
    return {
      from_state: current_state,
      to_state: 'reactivated',
      reason: 'Customer re-engaged after dormancy',
      meta: { signal: 'last_inbound_at', last_inbound: enrichedSignals.last_inbound_at }
    };
  }
  
  // 3. Silence-based degradation
  const silenceDays = enrichedSignals.silence_days || 0;
  
  // at_risk -> dormant (extended silence)
  if (current_state === 'at_risk' && silenceDays >= SIGNAL_THRESHOLDS.DORMANT_SILENCE_DAYS) {
    return {
      from_state: current_state,
      to_state: 'dormant',
      reason: `No inbound for ${silenceDays} days (threshold: ${SIGNAL_THRESHOLDS.DORMANT_SILENCE_DAYS})`,
      meta: { signal: 'silence_days', silence_days: silenceDays }
    };
  }
  
  // any -> at_risk (moderate silence, not already dormant or lost)
  if (
    !['at_risk', 'dormant', 'lost'].includes(current_state) &&
    silenceDays >= SIGNAL_THRESHOLDS.AT_RISK_SILENCE_DAYS
  ) {
    return {
      from_state: current_state,
      to_state: 'at_risk',
      reason: `No inbound for ${silenceDays} days (threshold: ${SIGNAL_THRESHOLDS.AT_RISK_SILENCE_DAYS})`,
      meta: { signal: 'silence_days', silence_days: silenceDays }
    };
  }
  
  // 4. Forward progression (happy path)
  
  // unaware -> aware (any engagement)
  if (current_state === 'unaware' && enrichedSignals.last_inbound_at) {
    return {
      from_state: current_state,
      to_state: 'aware',
      reason: 'First inbound communication received',
      meta: { signal: 'last_inbound_at', last_inbound: enrichedSignals.last_inbound_at }
    };
  }
  
  // aware -> engaged (bidirectional exchange)
  if (current_state === 'aware' && enrichedSignals.has_bidirectional) {
    return {
      from_state: current_state,
      to_state: 'engaged',
      reason: 'Bidirectional conversation established',
      meta: { signal: 'has_bidirectional' }
    };
  }
  
  // engaged -> evaluating (proposal sent)
  if (current_state === 'engaged' && enrichedSignals.proposal_sent) {
    return {
      from_state: current_state,
      to_state: 'evaluating',
      reason: 'Formal proposal sent to customer',
      meta: { signal: 'proposal_sent' }
    };
  }
  
  // evaluating -> committed (commitment recorded)
  if (current_state === 'evaluating' && enrichedSignals.commitment_recorded) {
    return {
      from_state: current_state,
      to_state: 'committed',
      reason: 'Customer commitment recorded (verbal or written)',
      meta: { signal: 'commitment_recorded' }
    };
  }
  
  // committed -> active (immediate, stable relationship)
  if (current_state === 'committed') {
    // Transition to active can happen immediately or be triggered by:
    // - Contract signed
    // - Payment received
    // - Meeting completed
    // For v1, we'll transition on any of these positive signals
    if (
      enrichedSignals.contract_signed ||
      enrichedSignals.payment_received ||
      enrichedSignals.meeting_completed
    ) {
      const reasons = [];
      if (enrichedSignals.contract_signed) reasons.push('contract signed');
      if (enrichedSignals.payment_received) reasons.push('payment received');
      if (enrichedSignals.meeting_completed) reasons.push('meeting completed');
      
      return {
        from_state: current_state,
        to_state: 'active',
        reason: `Relationship activated: ${reasons.join(', ')}`,
        meta: {
          signals: {
            contract_signed: enrichedSignals.contract_signed,
            payment_received: enrichedSignals.payment_received,
            meeting_completed: enrichedSignals.meeting_completed
          }
        }
      };
    }
  }
  
  // No transition proposed
  return null;
}

/**
 * Apply a state transition (persist to database)
 * 
 * This function:
 * 1. Validates the proposal
 * 2. Upserts customer_care_state with new state
 * 3. Appends customer_care_state_history record
 * 
 * IMPORTANT: This function DOES NOT check autonomy gates or execute actions.
 * It is purely a database write operation.
 * 
 * @param {Object} params - Parameters
 * @param {Object} params.ctx - CareContext (tenant_id, entity_type, entity_id)
 * @param {Object} params.proposal - CareTransitionProposal
 * @param {Object} params.store - CareStateStore instance
 * @param {Object} [params.actor] - Actor info (optional)
 * @param {string} [params.actor.type='system'] - Actor type
 * @param {string} [params.actor.id] - Actor ID
 * @returns {Promise<Object>} Updated state record
 * @throws {Error} If proposal is invalid or database write fails
 */
export async function applyTransition({ ctx, proposal, store, actor = {} }) {
  // Validate context
  if (!ctx || !ctx.tenant_id || !ctx.entity_type || !ctx.entity_id) {
    throw new Error('Invalid context: tenant_id, entity_type, and entity_id are required');
  }
  
  validateEntityType(ctx.entity_type);
  
  // Validate proposal
  if (!proposal || !proposal.to_state) {
    throw new Error('Invalid proposal: to_state is required');
  }
  
  validateCareState(proposal.to_state);
  
  // Validate reason (CRITICAL)
  if (!proposal.reason || typeof proposal.reason !== 'string' || proposal.reason.trim() === '') {
    throw new Error('Invalid proposal: non-empty reason is required for all transitions');
  }
  
  // Validate store
  if (!store || typeof store.upsertCareState !== 'function' || typeof store.appendCareHistory !== 'function') {
    throw new Error('Invalid store: must provide upsertCareState and appendCareHistory methods');
  }
  
  // 1. Upsert customer_care_state
  const updatedState = await store.upsertCareState(ctx, {
    care_state: proposal.to_state,
    last_signal_at: new Date(),
    updated_at: new Date()
  });
  
  // 2. Append customer_care_state_history
  await store.appendCareHistory(ctx, {
    from_state: proposal.from_state || null,
    to_state: proposal.to_state,
    event_type: 'state_applied',
    reason: proposal.reason,
    meta: proposal.meta || null,
    actor_type: actor.type || 'system',
    actor_id: actor.id || null
  });
  
  return updatedState;
}

export default {
  validateCareState,
  validateEntityType,
  getDefaultCareState,
  proposeTransition,
  applyTransition
};
