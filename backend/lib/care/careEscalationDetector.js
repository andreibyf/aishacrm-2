/**
 * C.A.R.E. v1 - Escalation Detector
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
  containsAnyPhrase,
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
  
  // =========================================================================
  // PHASE 1: Collect all matches (no confidence logic yet)
  // =========================================================================
  const reasons = [];
  const matchedPhrases = [];
  
  // Track which categories fired for confidence computation
  let hasObjection = false;
  let hasCompliance = false;
  let hasPricing = false;
  let hasFailSafe = false;
  let hasNegativeSentiment = false;
  let pricingMatchCount = 0;

  if (text && typeof text === 'string') {
    // Rule 1: Objection phrases
    const objectionCheck = containsAnyPhrase(text, OBJECTION_PHRASES);
    if (objectionCheck.matched) {
      reasons.push(ESCALATION_REASONS.OBJECTION);
      matchedPhrases.push(...objectionCheck.matches);
      hasObjection = true;
    }

    // Rule 2: Pricing/contract phrases
    const pricingCheck = containsAnyPhrase(text, PRICING_CONTRACT_PHRASES);
    if (pricingCheck.matched) {
      reasons.push(ESCALATION_REASONS.PRICING_OR_CONTRACT);
      matchedPhrases.push(...pricingCheck.matches);
      hasPricing = true;
      pricingMatchCount = pricingCheck.matches.length;
    }

    // Rule 3: Compliance-sensitive phrases
    const complianceCheck = containsAnyPhrase(text, COMPLIANCE_SENSITIVE_PHRASES);
    if (complianceCheck.matched) {
      reasons.push(ESCALATION_REASONS.COMPLIANCE_SENSITIVE);
      matchedPhrases.push(...complianceCheck.matches);
      hasCompliance = true;
    }

    // Rule 5: Fail-safe (only if no other text-based reasons found)
    if (!hasObjection && !hasPricing && !hasCompliance) {
      const highRiskCheck = containsAnyPhrase(text, HIGH_RISK_AMBIGUOUS_PHRASES);
      if (highRiskCheck.matched) {
        reasons.push(ESCALATION_REASONS.UNKNOWN_HIGH_RISK);
        matchedPhrases.push(...highRiskCheck.matches);
        hasFailSafe = true;
      }
    }
  }

  // Rule 4: Sentiment
  if (sentiment !== undefined) {
    const isNegative = 
      sentiment === 'negative' ||
      (typeof sentiment === 'number' && sentiment < -0.3);
    
    if (isNegative) {
      reasons.push(ESCALATION_REASONS.NEGATIVE_SENTIMENT);
      hasNegativeSentiment = true;
    }
  }

  // =========================================================================
  // PHASE 2: Compute confidence from collected results
  // =========================================================================
  let finalConfidence;
  
  if (reasons.length === 0) {
    // No triggers → HIGH confidence in "no escalation needed"
    finalConfidence = CONFIDENCE_LEVELS.HIGH;
  } else if (hasObjection || hasCompliance) {
    // Objection or compliance → always HIGH (these are unambiguous)
    finalConfidence = CONFIDENCE_LEVELS.HIGH;
  } else if (hasFailSafe && reasons.length === 1) {
    // Only fail-safe trigger → LOW
    finalConfidence = CONFIDENCE_LEVELS.LOW;
  } else if (hasPricing && pricingMatchCount > 2) {
    // Heavy pricing signal (3+ matches) → HIGH
    finalConfidence = CONFIDENCE_LEVELS.HIGH;
  } else if (hasPricing && !hasNegativeSentiment) {
    // Pricing alone (1-2 matches) → MEDIUM
    finalConfidence = CONFIDENCE_LEVELS.MEDIUM;
  } else if (hasNegativeSentiment && !hasPricing) {
    // Sentiment alone → MEDIUM
    finalConfidence = CONFIDENCE_LEVELS.MEDIUM;
  } else {
    // Pricing + sentiment combined, or other combinations → MEDIUM
    finalConfidence = CONFIDENCE_LEVELS.MEDIUM;
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
