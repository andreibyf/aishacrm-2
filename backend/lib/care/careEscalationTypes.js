/**
 * C.A.R.E. v1 - Escalation Type Definitions
 * 
 * PR3: Read-only escalation detector types
 * 
 * This module defines the type system for escalation detection.
 * Used by careEscalationDetector.js to classify signals requiring human intervention.
 * 
 * Safety: No side effects, no database access, no external calls.
 */

/**
 * @typedef {'objection' | 'pricing_or_contract' | 'negative_sentiment' | 'compliance_sensitive' | 'unknown_high_risk'} EscalationReason
 */

/**
 * Valid escalation reason constants
 * @readonly
 * @enum {EscalationReason}
 */
export const ESCALATION_REASONS = {
  OBJECTION: 'objection',
  PRICING_OR_CONTRACT: 'pricing_or_contract',
  NEGATIVE_SENTIMENT: 'negative_sentiment',
  COMPLIANCE_SENSITIVE: 'compliance_sensitive',
  UNKNOWN_HIGH_RISK: 'unknown_high_risk',
};

/**
 * Valid confidence levels for escalation detection
 * @readonly
 * @enum {string}
 */
export const CONFIDENCE_LEVELS = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
};

/**
 * @typedef {Object} CareEscalationResult
 * @property {boolean} escalate - Whether to escalate to human
 * @property {EscalationReason[]} reasons - List of detected escalation triggers
 * @property {'high' | 'medium' | 'low'} confidence - Confidence level in detection
 * @property {Object} [meta] - Optional metadata about detection
 * @property {string} [meta.action_origin] - Action origin if provided (user_directed | care_autonomous)
 * @property {string} [meta.channel] - Communication channel
 * @property {number} [meta.match_count] - Number of phrase matches
 * @property {string[]} [meta.matched_phrases] - Specific phrases that triggered detection
 */

/**
 * @typedef {Object} EscalationDetectorInput
 * @property {string} [text] - Message text to analyze
 * @property {'positive' | 'neutral' | 'negative' | number} [sentiment] - Sentiment score or label
 * @property {'call' | 'sms' | 'email' | 'chat' | 'other'} [channel] - Communication channel
 * @property {'user_directed' | 'care_autonomous'} [action_origin] - Action origin (metadata only in PR3)
 * @property {Object} [meta] - Optional raw signal metadata
 */

/**
 * Validate escalation reason
 * @param {string} reason - Reason to validate
 * @returns {boolean}
 */
export function isValidEscalationReason(reason) {
  return Object.values(ESCALATION_REASONS).includes(reason);
}

/**
 * Validate confidence level
 * @param {string} confidence - Confidence to validate
 * @returns {boolean}
 */
export function isValidConfidence(confidence) {
  return Object.values(CONFIDENCE_LEVELS).includes(confidence);
}

/**
 * Create a safe escalation result with defaults
 * @param {Partial<CareEscalationResult>} result - Partial result to merge with defaults
 * @returns {CareEscalationResult}
 */
export function createEscalationResult(result = {}) {
  return {
    escalate: result.escalate ?? false,
    reasons: Array.isArray(result.reasons) ? result.reasons : [],
    confidence: isValidConfidence(result.confidence) ? result.confidence : CONFIDENCE_LEVELS.LOW,
    meta: result.meta ?? {},
  };
}
