/**
 * C.A.R.E. v1 - Escalation Detector Tests
 * 
 * PR3: Unit tests for read-only escalation detection
 * 
 * Test coverage:
 * - Objection phrase detection
 * - Pricing/contract phrase detection
 * - Compliance-sensitive phrase detection
 * - Negative sentiment detection
 * - Fail-safe behavior on uncertainty
 * - Benign input (no escalation)
 * - Input validation
 * - Confidence level logic
 * - Action origin metadata capture (not gating)
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { detectEscalation, validateInput } from '../careEscalationDetector.js';
import { ESCALATION_REASONS, CONFIDENCE_LEVELS } from '../careEscalationTypes.js';

describe('Care Escalation Detector', () => {

  // ========================================
  // Rule 1: Objection Detection
  // ========================================
  
  describe('Objection Detection', () => {
    test('detects "not interested" as objection with high confidence', () => {
      const result = detectEscalation({
        text: 'I am not interested in this offer.',
      });

      assert.equal(result.escalate, true);
      assert.ok(result.reasons.includes(ESCALATION_REASONS.OBJECTION));
      assert.equal(result.confidence, CONFIDENCE_LEVELS.HIGH);
      assert.ok(result.meta.matched_phrases.length > 0);
    });

    test('detects "stop calling" as objection', () => {
      const result = detectEscalation({
        text: 'Please stop calling me.',
      });

      assert.equal(result.escalate, true);
      assert.ok(result.reasons.includes(ESCALATION_REASONS.OBJECTION));
      assert.equal(result.confidence, CONFIDENCE_LEVELS.HIGH);
    });

    test('detects "unsubscribe" as objection', () => {
      const result = detectEscalation({
        text: 'Unsubscribe me from this list.',
      });

      assert.equal(result.escalate, true);
      assert.ok(result.reasons.includes(ESCALATION_REASONS.OBJECTION));
    });

    test('case-insensitive objection detection', () => {
      const result = detectEscalation({
        text: 'NOT INTERESTED!!!',
      });

      assert.equal(result.escalate, true);
      assert.ok(result.reasons.includes(ESCALATION_REASONS.OBJECTION));
    });
  });

  // ========================================
  // Rule 2: Pricing/Contract Detection
  // ========================================

  describe('Pricing/Contract Detection', () => {
    test('detects pricing phrases with medium confidence', () => {
      const result = detectEscalation({
        text: 'What is the price for this service?',
      });

      assert.equal(result.escalate, true);
      assert.ok(result.reasons.includes(ESCALATION_REASONS.PRICING_OR_CONTRACT));
      assert.equal(result.confidence, CONFIDENCE_LEVELS.MEDIUM);
    });

    test('detects contract-related phrases', () => {
      const result = detectEscalation({
        text: 'I want to cancel my contract.',
      });

      assert.equal(result.escalate, true);
      assert.ok(result.reasons.includes(ESCALATION_REASONS.PRICING_OR_CONTRACT));
    });

    test('detects refund requests', () => {
      const result = detectEscalation({
        text: 'I need a refund for my payment.',
      });

      assert.equal(result.escalate, true);
      assert.ok(result.reasons.includes(ESCALATION_REASONS.PRICING_OR_CONTRACT));
    });

    test('multiple pricing hits upgrade to high confidence', () => {
      const result = detectEscalation({
        text: 'The price is too expensive, I want a refund and to cancel my contract.',
      });

      assert.equal(result.escalate, true);
      assert.ok(result.reasons.includes(ESCALATION_REASONS.PRICING_OR_CONTRACT));
      assert.equal(result.confidence, CONFIDENCE_LEVELS.HIGH);
    });
  });

  // ========================================
  // Rule 3: Compliance-Sensitive Detection
  // ========================================

  describe('Compliance-Sensitive Detection', () => {
    test('detects HIPAA mentions with high confidence', () => {
      const result = detectEscalation({
        text: 'This violates HIPAA regulations.',
      });

      assert.equal(result.escalate, true);
      assert.ok(result.reasons.includes(ESCALATION_REASONS.COMPLIANCE_SENSITIVE));
      assert.equal(result.confidence, CONFIDENCE_LEVELS.HIGH);
    });

    test('detects legal threats', () => {
      const result = detectEscalation({
        text: 'I will contact my attorney about this.',
      });

      assert.equal(result.escalate, true);
      assert.ok(result.reasons.includes(ESCALATION_REASONS.COMPLIANCE_SENSITIVE));
    });

    test('detects fraud allegations', () => {
      const result = detectEscalation({
        text: 'This is a scam and I will report the fraud.',
      });

      assert.equal(result.escalate, true);
      assert.ok(result.reasons.includes(ESCALATION_REASONS.COMPLIANCE_SENSITIVE));
    });

    test('detects lawsuit mentions', () => {
      const result = detectEscalation({
        text: 'I am considering a lawsuit.',
      });

      assert.equal(result.escalate, true);
      assert.ok(result.reasons.includes(ESCALATION_REASONS.COMPLIANCE_SENSITIVE));
    });
  });

  // ========================================
  // Rule 4: Negative Sentiment Detection
  // ========================================

  describe('Negative Sentiment Detection', () => {
    test('detects negative sentiment label with medium confidence', () => {
      const result = detectEscalation({
        text: 'This service is okay.',
        sentiment: 'negative',
      });

      assert.equal(result.escalate, true);
      assert.ok(result.reasons.includes(ESCALATION_REASONS.NEGATIVE_SENTIMENT));
      assert.equal(result.confidence, CONFIDENCE_LEVELS.MEDIUM);
    });

    test('detects negative sentiment score (numeric)', () => {
      const result = detectEscalation({
        text: 'Some feedback here.',
        sentiment: -0.5, // Negative score
      });

      assert.equal(result.escalate, true);
      assert.ok(result.reasons.includes(ESCALATION_REASONS.NEGATIVE_SENTIMENT));
    });

    test('does not escalate on mildly negative sentiment', () => {
      const result = detectEscalation({
        text: 'Could be better.',
        sentiment: -0.2, // Just below threshold
      });

      assert.equal(result.escalate, false);
    });

    test('positive sentiment does not trigger escalation', () => {
      const result = detectEscalation({
        text: 'Great service!',
        sentiment: 'positive',
      });

      assert.equal(result.escalate, false);
    });
  });

  // ========================================
  // Rule 5: Fail-Safe on Uncertainty
  // ========================================

  describe('Fail-Safe Behavior', () => {
    test('escalates on malformed input', () => {
      const result = detectEscalation(null);

      assert.equal(result.escalate, true);
      assert.ok(result.reasons.includes(ESCALATION_REASONS.UNKNOWN_HIGH_RISK));
      assert.equal(result.confidence, CONFIDENCE_LEVELS.LOW);
    });

    test('escalates on invalid input type', () => {
      const result = detectEscalation('not an object');

      assert.equal(result.escalate, true);
      assert.ok(result.reasons.includes(ESCALATION_REASONS.UNKNOWN_HIGH_RISK));
    });

    test('escalates on high-risk ambiguous phrases when no other triggers', () => {
      const result = detectEscalation({
        text: 'I feel harassed by these calls.',
      });

      assert.equal(result.escalate, true);
      assert.ok(result.reasons.includes(ESCALATION_REASONS.UNKNOWN_HIGH_RISK));
      assert.equal(result.confidence, CONFIDENCE_LEVELS.LOW);
    });

    test('does not add fail-safe reason when other reasons present', () => {
      const result = detectEscalation({
        text: 'Stop calling me, this is harassment!',
      });

      assert.equal(result.escalate, true);
      // Should have objection, NOT unknown_high_risk
      assert.ok(result.reasons.includes(ESCALATION_REASONS.OBJECTION));
      assert.ok(!result.reasons.includes(ESCALATION_REASONS.UNKNOWN_HIGH_RISK));
    });
  });

  // ========================================
  // No Escalation (Benign Input)
  // ========================================

  describe('No Escalation Cases', () => {
    test('benign neutral text does not escalate', () => {
      const result = detectEscalation({
        text: 'Thank you for the information.',
        sentiment: 'neutral',
      });

      assert.equal(result.escalate, false);
      assert.equal(result.reasons.length, 0);
      assert.equal(result.confidence, CONFIDENCE_LEVELS.HIGH);
    });

    test('positive inquiry does not escalate', () => {
      const result = detectEscalation({
        text: 'I would like to learn more about your services.',
        sentiment: 'positive',
      });

      assert.equal(result.escalate, false);
    });

    test('empty text does not escalate', () => {
      const result = detectEscalation({
        text: '',
      });

      assert.equal(result.escalate, false);
    });

    test('no input does not escalate (safe default)', () => {
      const result = detectEscalation({});

      assert.equal(result.escalate, false);
      assert.equal(result.confidence, CONFIDENCE_LEVELS.HIGH);
    });
  });

  // ========================================
  // Multiple Triggers / Confidence Logic
  // ========================================

  describe('Multiple Triggers', () => {
    test('objection + pricing = high confidence (objection dominates)', () => {
      const result = detectEscalation({
        text: 'Not interested, and the price is too high.',
      });

      assert.equal(result.escalate, true);
      assert.ok(result.reasons.includes(ESCALATION_REASONS.OBJECTION));
      assert.ok(result.reasons.includes(ESCALATION_REASONS.PRICING_OR_CONTRACT));
      assert.equal(result.confidence, CONFIDENCE_LEVELS.HIGH);
    });

    test('compliance + negative sentiment = high confidence', () => {
      const result = detectEscalation({
        text: 'This is a violation and I am very angry.',
        sentiment: 'negative',
      });

      assert.equal(result.escalate, true);
      assert.ok(result.reasons.includes(ESCALATION_REASONS.COMPLIANCE_SENSITIVE));
      assert.ok(result.reasons.includes(ESCALATION_REASONS.NEGATIVE_SENTIMENT));
      assert.equal(result.confidence, CONFIDENCE_LEVELS.HIGH);
    });
  });

  // ========================================
  // Action Origin Metadata (NOT Gating)
  // ========================================

  describe('Action Origin Metadata', () => {
    test('captures action_origin in metadata (user_directed)', () => {
      const result = detectEscalation({
        text: 'I need help with pricing.',
        action_origin: 'user_directed',
      });

      assert.equal(result.meta.action_origin, 'user_directed');
      // Should still escalate on pricing phrase
      assert.equal(result.escalate, true);
    });

    test('captures action_origin in metadata (care_autonomous)', () => {
      const result = detectEscalation({
        text: 'Not interested.',
        action_origin: 'care_autonomous',
      });

      assert.equal(result.meta.action_origin, 'care_autonomous');
      // Action origin does NOT affect gating in PR3
      assert.equal(result.escalate, true);
    });

    test('action_origin does not affect escalation decision', () => {
      const result1 = detectEscalation({
        text: 'Stop calling.',
        action_origin: 'user_directed',
      });

      const result2 = detectEscalation({
        text: 'Stop calling.',
        action_origin: 'care_autonomous',
      });

      // Both should escalate identically
      assert.equal(result1.escalate, result2.escalate);
      assert.deepEqual(result1.reasons, result2.reasons);
      assert.equal(result1.confidence, result2.confidence);
    });
  });

  // ========================================
  // Input Validation
  // ========================================

  describe('Input Validation', () => {
    test('validates valid input', () => {
      const validation = validateInput({
        text: 'Hello',
        sentiment: 'positive',
        channel: 'email',
        action_origin: 'user_directed',
      });

      assert.equal(validation.valid, true);
      assert.equal(validation.errors.length, 0);
    });

    test('rejects invalid text type', () => {
      const validation = validateInput({
        text: 123,
      });

      assert.equal(validation.valid, false);
      assert.ok(validation.errors.some(e => e.includes('text must be a string')));
    });

    test('rejects invalid sentiment value', () => {
      const validation = validateInput({
        sentiment: 'very_bad',
      });

      assert.equal(validation.valid, false);
      assert.ok(validation.errors.some(e => e.includes('sentiment')));
    });

    test('rejects invalid channel', () => {
      const validation = validateInput({
        channel: 'fax',
      });

      assert.equal(validation.valid, false);
      assert.ok(validation.errors.some(e => e.includes('channel')));
    });

    test('rejects invalid action_origin', () => {
      const validation = validateInput({
        action_origin: 'system_generated',
      });

      assert.equal(validation.valid, false);
      assert.ok(validation.errors.some(e => e.includes('action_origin')));
    });
  });

  // ========================================
  // Channel Metadata
  // ========================================

  describe('Channel Metadata', () => {
    test('captures channel in metadata', () => {
      const result = detectEscalation({
        text: 'Call me back.',
        channel: 'sms',
      });

      assert.equal(result.meta.channel, 'sms');
    });

    test('channel does not affect escalation logic', () => {
      const result1 = detectEscalation({
        text: 'Not interested.',
        channel: 'call',
      });

      const result2 = detectEscalation({
        text: 'Not interested.',
        channel: 'email',
      });

      assert.equal(result1.escalate, result2.escalate);
      assert.deepEqual(result1.reasons, result2.reasons);
    });
  });

  // ========================================
  // Edge Cases
  // ========================================

  describe('Edge Cases', () => {
    test('handles very long text', () => {
      const longText = 'This is a normal message. '.repeat(100) + 'Not interested.';
      const result = detectEscalation({ text: longText });

      assert.equal(result.escalate, true);
      assert.ok(result.reasons.includes(ESCALATION_REASONS.OBJECTION));
    });

    test('handles special characters', () => {
      const result = detectEscalation({
        text: '!!! NOT INTERESTED !!! $$$ STOP $$$',
      });

      assert.equal(result.escalate, true);
      assert.ok(result.reasons.includes(ESCALATION_REASONS.OBJECTION));
    });

    test('handles unicode characters', () => {
      const result = detectEscalation({
        text: 'não estou interessado (not interested) 🚫',
      });

      assert.equal(result.escalate, true);
    });

    test('handles undefined sentiment gracefully', () => {
      const result = detectEscalation({
        text: 'Hello',
        sentiment: undefined,
      });

      assert.equal(result.escalate, false);
    });
  });
});
