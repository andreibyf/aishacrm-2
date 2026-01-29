/**
 * Customer C.A.R.E. Policy Gate
 * 
 * Evaluates whether a proposed C.A.R.E. action is allowed based on:
 * - Action Origin (care_autonomous vs user_directed)
 * - Action Type (message, meeting, workflow, etc.)
 * - Content analysis (escalation signals, prohibited topics)
 * 
 * This module is PURE and DETERMINISTIC:
 * - No database access
 * - No external API calls
 * - Same inputs always produce same outputs
 * 
 * Action Origin Contract (from docs/product/customer-care-v1.md):
 * 
 * care_autonomous:
 *   - Must be CONSERVATIVE (low-risk actions only)
 *   - Cannot perform binding commitments, pricing changes, negotiations
 *   - Cannot perform regulated actions (GDPR requests, contracts)
 *   - Cannot impersonate users
 * 
 * user_directed:
 *   - Less restrictive (user explicitly requested action)
 *   - Still blocked for hard prohibitions (impersonation, regulated actions)
 *   - Escalated for high-risk actions (requires human confirmation)
 * 
 * Policy Gate Results:
 * - ALLOWED: Action can proceed
 * - ESCALATED: Requires human review/confirmation
 * - BLOCKED: Action must not be executed
 * 
 * @module carePolicyGate
 */

/**
 * Policy gate result enum
 */
export const CarePolicyGateResult = {
  ALLOWED: 'allowed',
  ESCALATED: 'escalated',
  BLOCKED: 'blocked'
};

/**
 * Action types
 */
const ActionType = {
  MESSAGE: 'message',
  MEETING: 'meeting',
  WORKFLOW: 'workflow',
  TASK: 'task',
  NOTE: 'note',
  UPDATE: 'update',
  FOLLOW_UP: 'follow_up',
};

/**
 * Hard prohibitions (never allowed, regardless of action_origin)
 */
const HARD_PROHIBITIONS = [
  // Impersonation
  { pattern: /sign(ed)?\s+off\s+as\s+(?!.*ai|.*care|.*system)/i, reason: 'Impersonation attempt' },
  { pattern: /regards,\s*(?!.*ai|.*care|.*system)/i, reason: 'Human impersonation in signature' },
  
  // Binding commitments
  { pattern: /\b(guarantee|promise|commit|pledge)\s+(to|that|we\s+will)/i, reason: 'Binding commitment' },
  { pattern: /legally\s+binding/i, reason: 'Legal binding statement' },
  
  // Pricing/negotiation
  { pattern: /\b(discount|price\s+reduction|special\s+offer|deal)\s+of\s+\$?\d+/i, reason: 'Pricing negotiation' },
  { pattern: /\b(final|best)\s+price/i, reason: 'Price negotiation' },
  
  // Regulated actions
  { pattern: /delete\s+(all\s+)?(your|my)\s+data/i, reason: 'GDPR deletion request' },
  { pattern: /cease\s+and\s+desist/i, reason: 'Legal action' },
  { pattern: /\b(lawsuit|litigation|legal\s+action)/i, reason: 'Legal threat' },
];

/**
 * Autonomous-specific prohibitions (only for care_autonomous)
 */
const AUTONOMOUS_PROHIBITIONS = [
  // Any commitment
  { pattern: /\bwe\s+will\s+(definitely|certainly|absolutely)/i, reason: 'Strong commitment (autonomous)' },
  { pattern: /\bI\s+can\s+guarantee/i, reason: 'Guarantee (autonomous)' },
  
  // Complex negotiations
  { pattern: /\b(negotiate|discuss\s+pricing|pricing\s+discussion)/i, reason: 'Negotiation (autonomous)' },
  
  // Urgent actions
  { pattern: /\burgent|asap|immediately\s+required/i, reason: 'Urgency signal (autonomous)' },
];

/**
 * Evaluate C.A.R.E. policy for a proposed action
 * 
 * @param {Object} params - Evaluation parameters
 * @param {string} params.action_origin - 'care_autonomous' | 'user_directed' | 'office_agent'
 * @param {string} params.proposed_action_type - Type of action (message, meeting, workflow, etc.)
 * @param {string} [params.text] - Action content/text to analyze
 * @param {Object} [params.meta] - Optional metadata for context
 * @returns {Object} Policy decision
 * @returns {string} return.policy_gate_result - 'allowed' | 'escalated' | 'blocked'
 * @returns {boolean} return.escalate - True if requires human review
 * @returns {Array<string>} return.reasons - List of reasons for decision
 */
export function evaluateCarePolicy({ action_origin, proposed_action_type, text = '', meta: _meta = {} }) {
  const reasons = [];
  let result = CarePolicyGateResult.ALLOWED;

  // Validate inputs
  if (!action_origin) {
    return {
      policy_gate_result: CarePolicyGateResult.BLOCKED,
      escalate: false,
      reasons: ['Missing action_origin']
    };
  }

  if (!proposed_action_type) {
    return {
      policy_gate_result: CarePolicyGateResult.BLOCKED,
      escalate: false,
      reasons: ['Missing proposed_action_type']
    };
  }

  // Check hard prohibitions (applies to ALL origins)
  for (const prohibition of HARD_PROHIBITIONS) {
    if (text && prohibition.pattern.test(text)) {
      return {
        policy_gate_result: CarePolicyGateResult.BLOCKED,
        escalate: false,
        reasons: [prohibition.reason]
      };
    }
  }

  // Check autonomous-specific prohibitions
  if (action_origin === 'care_autonomous') {
    for (const prohibition of AUTONOMOUS_PROHIBITIONS) {
      if (text && prohibition.pattern.test(text)) {
        return {
          policy_gate_result: CarePolicyGateResult.ESCALATED,
          escalate: true,
          reasons: [prohibition.reason]
        };
      }
    }

    // Autonomous actions require conservative approval
    // For now, escalate all autonomous actions except low-risk types
    const lowRiskTypes = [ActionType.NOTE, ActionType.TASK, ActionType.FOLLOW_UP];
    if (!lowRiskTypes.includes(proposed_action_type)) {
      result = CarePolicyGateResult.ESCALATED;
      reasons.push(`Autonomous ${proposed_action_type} requires human approval`);
    }
  }

  // user_directed actions are less restricted but still check for high-risk signals
  if (action_origin === 'user_directed') {
    // Check for high-risk content that should escalate
    const highRiskPatterns = [
      { pattern: /\b(contract|agreement|terms\s+and\s+conditions)/i, reason: 'Legal document reference' },
      { pattern: /\$[\d,]{5,}/i, reason: 'Large financial amount' }, // $10,000+ (with or without commas)
    ];

    for (const risk of highRiskPatterns) {
      if (text && risk.pattern.test(text)) {
        result = CarePolicyGateResult.ESCALATED;
        reasons.push(risk.reason);
        break;
      }
    }
  }

  // If still allowed and no reasons, add default reason
  if (result === CarePolicyGateResult.ALLOWED && reasons.length === 0) {
    reasons.push(`${action_origin} ${proposed_action_type} approved by policy`);
  }

  return {
    policy_gate_result: result,
    escalate: result === CarePolicyGateResult.ESCALATED,
    reasons
  };
}

export default {
  evaluateCarePolicy,
  CarePolicyGateResult
};
