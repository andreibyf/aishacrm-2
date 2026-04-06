import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ESCALATION_REASONS,
  CONFIDENCE_LEVELS,
  isValidEscalationReason,
  isValidConfidence,
  createEscalationResult,
} from '../careEscalationTypes.js';

describe('careEscalationTypes', () => {
  it('validates escalation reasons and confidence levels', () => {
    assert.ok(isValidEscalationReason(ESCALATION_REASONS.OBJECTION));
    assert.ok(isValidEscalationReason(ESCALATION_REASONS.COMPLIANCE_SENSITIVE));
    assert.equal(isValidEscalationReason('bad_reason'), false);

    assert.ok(isValidConfidence(CONFIDENCE_LEVELS.HIGH));
    assert.ok(isValidConfidence(CONFIDENCE_LEVELS.LOW));
    assert.equal(isValidConfidence('unknown'), false);
  });

  it('creates safe escalation result defaults and preserves valid values', () => {
    const defaults = createEscalationResult();
    assert.equal(defaults.escalate, false);
    assert.deepEqual(defaults.reasons, []);
    assert.equal(defaults.confidence, CONFIDENCE_LEVELS.LOW);

    const custom = createEscalationResult({
      escalate: true,
      reasons: [ESCALATION_REASONS.OBJECTION],
      confidence: CONFIDENCE_LEVELS.HIGH,
      meta: { match_count: 2 },
    });

    assert.equal(custom.escalate, true);
    assert.deepEqual(custom.reasons, [ESCALATION_REASONS.OBJECTION]);
    assert.equal(custom.confidence, CONFIDENCE_LEVELS.HIGH);
    assert.deepEqual(custom.meta, { match_count: 2 });
  });
});
