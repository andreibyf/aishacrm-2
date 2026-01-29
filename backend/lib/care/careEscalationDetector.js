/**
 * Customer C.A.R.E. v1 - Escalation Detector
 * 
 * PR3: Read-only escalation detection with deterministic heuristics
 * 
 * This module analyzes communication signals to detect when human escalation
 * is required. It does NOT perform gating or actions - only detection.
 * 
 * Detection Rules (v1):
 * 1. Objection phrases → escalate (high confidence)
 * 2. Pricing/contract phrases → escalate (medium confidence)
 * 3. Compliance-sensitive phrases → escalate (high confidence)
 * 4. Negative sentiment → escalate (medium confidence)
 * 5. Fail-safe on uncertainty → escalate (low confidence)
 * 
 * Safety guarantees:
 * - Pure function (deterministic, no side effects)
 * - No database writes
 * - No external API calls
 * - No message sending
 * - Action origin captured in metadata only (no gating)
 * 
 * @module careEscalationDetector
 */

import {
  ESCALATION_REASONS,
  CONFIDENCE_LEVELS,
  createEscalationResult,
} from './careEscalationTypes.js';

import {
  OBJECTION_PHRASES,
  PRICING_CONTRACT_PHRASES,
  COMPLIANCE_SENSITIVE_PHRASES,
  HIGH_RISK_AMBIGUOUS_PHRASES,
  _NEGATIVE_SENTIMENT_WORDS,
  containsAnyPhrase,
  _normalizeText,
} from './careEscalationLexicon.js';

/**
 * Detect if escalation to human is required based on input signals
 * 
 * @param {Object} input - Detection input
 * @param {string} [input.text] - Message text to analyze
 * @param {'positive' | 'neutral' | 'negative' | number} [input.sentiment] - Sentiment score or label
 * @param {'call' | 'sms' | 'email' | 'chat' | 'other'} [input.channel] - Communication channel
 * @param {'user_directed' | 'care_autonomous'} [input.action_origin] - Action origin (metadata only)
 * @param {Object} [input.meta] - Optional raw signal metadata
 * @returns {Object} Escalation result {escalate, reasons, confidence, meta}
 */
export function detectEscalation(input = {}) {
  // Validate input
  if (!input || typeof input !== 'object') {
    // Fail safe: malformed input → escalate with low confidence
    return createEscalationResult({
      escalate: true,
      reasons: [ESCALATION_REASONS.UNKNOWN_HIGH_RISK],
      confidence: CONFIDENCE_LEVELS.LOW,
      meta: { error: 'malformed_input' },
    });
  }

  const { text, sentiment, channel, action_origin, meta = {} } = input;
  
  // Initialize detection state
  const reasons = [];
  const matchedPhrases = [];
  let highestConfidence = CONFIDENCE_LEVELS.HIGH; // Start optimistic, downgrade if needed

  // Rule 1: Check for objection phrases (HIGH confidence)
  if (text && typeof text === 'string') {
    const objectionCheck = containsAnyPhrase(text, OBJECTION_PHRASES);
    if (objectionCheck.matched) {
      reasons.push(ESCALATION_REASONS.OBJECTION);
      matchedPhrases.push(...objectionCheck.matches);
      highestConfidence = CONFIDENCE_LEVELS.HIGH;
    }

    // Rule 2: Check for pricing/contract phrases (MEDIUM confidence)
    const pricingCheck = containsAnyPhrase(text, PRICING_CONTRACT_PHRASES);
    if (pricingCheck.matched) {
      reasons.push(ESCALATION_REASONS.PRICING_OR_CONTRACT);
      matchedPhrases.push(...pricingCheck.matches);
      
      // Multiple pricing hits → upgrade to HIGH
      if (pricingCheck.matches.length > 2) {
        highestConfidence = CONFIDENCE_LEVELS.HIGH;
      } else if (highestConfidence === CONFIDENCE_LEVELS.HIGH && reasons.length === 1) {
        // First reason is pricing only → MEDIUM
        highestConfidence = CONFIDENCE_LEVELS.MEDIUM;
      }
    }

    // Rule 3: Check for compliance-sensitive phrases (HIGH confidence)
    const complianceCheck = containsAnyPhrase(text, COMPLIANCE_SENSITIVE_PHRASES);
    if (complianceCheck.matched) {
      reasons.push(ESCALATION_REASONS.COMPLIANCE_SENSITIVE);
      matchedPhrases.push(...complianceCheck.matches);
      highestConfidence = CONFIDENCE_LEVELS.HIGH;
    }

    // Rule 5: Fail-safe check for high-risk ambiguous content
    const highRiskCheck = containsAnyPhrase(text, HIGH_RISK_AMBIGUOUS_PHRASES);
    if (highRiskCheck.matched && reasons.length === 0) {
      // Only trigger fail-safe if no other reasons found
      reasons.push(ESCALATION_REASONS.UNKNOWN_HIGH_RISK);
      matchedPhrases.push(...highRiskCheck.matches);
      highestConfidence = CONFIDENCE_LEVELS.LOW;
    }
  }

  // Rule 4: Check sentiment (MEDIUM confidence)
  if (sentiment !== undefined) {
    const isNegative = 
      sentiment === 'negative' ||
      (typeof sentiment === 'number' && sentiment < -0.3); // Threshold for numeric sentiment
    
    if (isNegative) {
      reasons.push(ESCALATION_REASONS.NEGATIVE_SENTIMENT);
      
      // If sentiment is the only trigger, set MEDIUM confidence
      if (reasons.length === 1) {
        highestConfidence = CONFIDENCE_LEVELS.MEDIUM;
      }
    }
  }

  // Determine final confidence based on reason combination
  let finalConfidence;
  if (reasons.length === 0) {
    // No triggers → HIGH confidence in "no escalation"
    finalConfidence = CONFIDENCE_LEVELS.HIGH;
  } else if (reasons.includes(ESCALATION_REASONS.OBJECTION) || 
             reasons.includes(ESCALATION_REASONS.COMPLIANCE_SENSITIVE)) {
    // Objection or compliance → always HIGH
    finalConfidence = CONFIDENCE_LEVELS.HIGH;
  } else if (reasons.includes(ESCALATION_REASONS.UNKNOWN_HIGH_RISK) && reasons.length === 1) {
    // Only fail-safe trigger → LOW
    finalConfidence = CONFIDENCE_LEVELS.LOW;
  } else {
    // Pricing, sentiment, or combinations → use tracked confidence
    finalConfidence = highestConfidence;
  }

  // Build metadata
  const resultMeta = {
    match_count: matchedPhrases.length,
    ...(matchedPhrases.length > 0 && { matched_phrases: matchedPhrases }),
    ...(channel && { channel }),
    ...(action_origin && { action_origin }), // Captured but NOT used for gating in PR3
    ...meta, // Include any additional metadata from input
  };

  // Return result
  return createEscalationResult({
    escalate: reasons.length > 0,
    reasons,
    confidence: finalConfidence,
    meta: resultMeta,
  });
}

/**
 * Validate escalation detector input
 * Helper for external callers to check input before detection
 * 
 * @param {Object} input - Input to validate
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateInput(input) {
  const errors = [];

  if (!input || typeof input !== 'object') {
    errors.push('Input must be an object');
    return { valid: false, errors };
  }

  const { text, sentiment, channel, action_origin } = input;

  // Text is optional but must be string if provided
  if (text !== undefined && typeof text !== 'string') {
    errors.push('text must be a string');
  }

  // Sentiment is optional but must be valid if provided
  if (sentiment !== undefined) {
    const validSentiments = ['positive', 'neutral', 'negative'];
    if (typeof sentiment === 'string' && !validSentiments.includes(sentiment)) {
      errors.push('sentiment must be "positive", "neutral", "negative", or a number');
    } else if (typeof sentiment !== 'string' && typeof sentiment !== 'number') {
      errors.push('sentiment must be a string or number');
    }
  }

  // Channel is optional but must be valid if provided
  if (channel !== undefined) {
    const validChannels = ['call', 'sms', 'email', 'chat', 'other'];
    if (!validChannels.includes(channel)) {
      errors.push(`channel must be one of: ${validChannels.join(', ')}`);
    }
  }

  // Action origin is optional but must be valid if provided
  if (action_origin !== undefined) {
    const validOrigins = ['user_directed', 'care_autonomous'];
    if (!validOrigins.includes(action_origin)) {
      errors.push(`action_origin must be one of: ${validOrigins.join(', ')}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
