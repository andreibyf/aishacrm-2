/**
 * C.A.R.E. Trigger Signal Adapter
 * 
 * Converts aiTriggersWorker context into CareSignals for state engine analysis.
 * Part of PR6: Triggers Worker Shadow Wiring
 * 
 * RULES:
 * - Pure function, no side effects
 * - No database calls
 * - No external API calls
 * - Deterministic signal derivation based on trigger type
 * - Only use data already present in trigger context
 */

import { TRIGGER_TYPES } from '../aiTriggersWorker.js';

/**
 * Convert trigger context into CareSignals for state engine
 * 
 * @param {Object} params - Trigger parameters
 * @param {string} params.trigger_type - TRIGGER_TYPES constant (e.g., 'lead_stagnant')
 * @param {Object} params.context - Trigger context from worker (days_stagnant, deal_name, etc.)
 * @param {string} params.record_type - 'lead' | 'opportunity' | 'activity' | 'contact' | 'account'
 * @param {string} params.record_id - UUID of affected record
 * @returns {Object} CareSignals object
 */
export function signalsFromTrigger({ trigger_type, context = {}, record_type, record_id }) {
  const signals = {
    // Metadata for audit trails
    meta: {
      trigger_type,
      record_type,
      record_id,
      triggered_at: new Date().toISOString(),
    },
  };

  // Map trigger types to appropriate signals
  switch (trigger_type) {
    case TRIGGER_TYPES.LEAD_STAGNANT:
      // Stagnant lead = prolonged silence, no bidirectional engagement
      signals.silence_days = context.days_stagnant || 7;
      signals.has_bidirectional = false;
      signals.meta.lead_name = context.lead_name;
      signals.meta.status = context.status;
      break;

    case TRIGGER_TYPES.DEAL_DECAY:
      // Decaying deal = silence in opportunity, no recent activity
      signals.silence_days = context.days_inactive || 14;
      signals.has_bidirectional = false;
      signals.meta.deal_name = context.deal_name;
      signals.meta.stage = context.stage;
      signals.meta.amount = context.amount;
      break;

    case TRIGGER_TYPES.DEAL_REGRESSION:
      // Deal regressed = negative momentum signal
      signals.has_bidirectional = false;
      signals.meta.stage = context.stage;
      signals.meta.previous_stage = context.previous_stage;
      signals.meta.regression = true;
      break;

    case TRIGGER_TYPES.ACCOUNT_RISK:
      // Account at risk = warning signal
      signals.meta.risk_level = context.risk_level || 'medium';
      signals.meta.risk_factors = context.risk_factors || [];
      signals.silence_days = context.days_since_contact || 0;
      break;

    case TRIGGER_TYPES.ACTIVITY_OVERDUE:
      // Overdue activity = execution risk, potential dissatisfaction
      // Map days_overdue to silence_days to trigger state transitions
      signals.silence_days = context.days_overdue || 1;
      signals.meta.overdue = true;
      signals.meta.days_overdue = context.days_overdue || 1;
      signals.meta.activity_type = context.type;
      signals.meta.subject = context.subject;
      break;

    case TRIGGER_TYPES.CONTACT_INACTIVE:
      // Inactive contact = prolonged silence
      signals.silence_days = context.days_inactive || 30;
      signals.has_bidirectional = false;
      signals.meta.contact_name = context.contact_name;
      break;

    case TRIGGER_TYPES.OPPORTUNITY_HOT:
      // Hot opportunity = positive engagement signal
      signals.has_bidirectional = true;
      signals.proposal_sent = true; // Close imminent
      signals.meta.probability = context.probability || 70;
      signals.meta.days_to_close = context.days_to_close || 0;
      signals.meta.amount = context.amount;
      signals.meta.deal_name = context.deal_name;
      break;

    case TRIGGER_TYPES.FOLLOWUP_NEEDED:
      // Follow-up needed = engagement signal
      signals.has_bidirectional = true;
      signals.meta.followup_reason = context.reason || 'general';
      break;

    default:
      // Unknown trigger type - minimal signal
      signals.meta.unknown_trigger = true;
      break;
  }

  return signals;
}

/**
 * Build escalation text from trigger context for escalation detection
 * Similar to PR5's buildEscalationText but for trigger-based scenarios
 * 
 * @param {Object} params - Trigger parameters
 * @param {string} params.trigger_type - TRIGGER_TYPES constant
 * @param {Object} params.context - Trigger context
 * @returns {string} Text for escalation analysis
 */
export function buildTriggerEscalationText({ trigger_type, context = {} }) {
  const parts = [];

  // Add trigger type context
  parts.push(`Trigger: ${trigger_type.replace(/_/g, ' ')}`);

  // Add relevant context based on trigger type
  switch (trigger_type) {
    case TRIGGER_TYPES.LEAD_STAGNANT:
      if (context.lead_name) parts.push(`Lead: ${context.lead_name}`);
      if (context.days_stagnant) parts.push(`Stagnant for ${context.days_stagnant} days`);
      if (context.status) parts.push(`Status: ${context.status}`);
      break;

    case TRIGGER_TYPES.DEAL_DECAY:
      if (context.deal_name) parts.push(`Deal: ${context.deal_name}`);
      if (context.days_inactive) parts.push(`Inactive for ${context.days_inactive} days`);
      if (context.stage) parts.push(`Stage: ${context.stage}`);
      if (context.amount) parts.push(`Amount: $${context.amount}`);
      break;

    case TRIGGER_TYPES.ACTIVITY_OVERDUE:
      if (context.subject) parts.push(`Activity: ${context.subject}`);
      if (context.days_overdue) parts.push(`Overdue by ${context.days_overdue} days`);
      if (context.type) parts.push(`Type: ${context.type}`);
      break;

    case TRIGGER_TYPES.OPPORTUNITY_HOT:
      if (context.deal_name) parts.push(`Deal: ${context.deal_name}`);
      if (context.probability) parts.push(`Probability: ${context.probability}%`);
      if (context.days_to_close !== undefined) parts.push(`Closes in ${context.days_to_close} days`);
      if (context.amount) parts.push(`Amount: $${context.amount}`);
      break;

    default:
      // Generic context serialization
      Object.entries(context).forEach(([key, value]) => {
        if (value !== null && value !== undefined && typeof value !== 'object') {
          parts.push(`${key}: ${value}`);
        }
      });
      break;
  }

  return parts.join('. ');
}
