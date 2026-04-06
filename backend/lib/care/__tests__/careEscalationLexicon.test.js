import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  OBJECTION_PHRASES,
  PRICING_CONTRACT_PHRASES,
  COMPLIANCE_SENSITIVE_PHRASES,
  NEGATIVE_SENTIMENT_WORDS,
  normalizeText,
  containsAnyPhrase,
} from '../careEscalationLexicon.js';

describe('careEscalationLexicon', () => {
  it('exports non-empty phrase libraries', () => {
    assert.ok(Array.isArray(OBJECTION_PHRASES) && OBJECTION_PHRASES.length > 0);
    assert.ok(Array.isArray(PRICING_CONTRACT_PHRASES) && PRICING_CONTRACT_PHRASES.length > 0);
    assert.ok(
      Array.isArray(COMPLIANCE_SENSITIVE_PHRASES) && COMPLIANCE_SENSITIVE_PHRASES.length > 0,
    );
    assert.ok(Array.isArray(NEGATIVE_SENTIMENT_WORDS) && NEGATIVE_SENTIMENT_WORDS.length > 0);
  });

  it('normalizes text safely', () => {
    assert.equal(normalizeText('  Hello   WORLD  '), 'hello world');
    assert.equal(normalizeText(null), '');
    assert.equal(normalizeText(undefined), '');
  });

  it('detects phrase matches case-insensitively', () => {
    const r1 = containsAnyPhrase('Please STOP CALLING me now.', OBJECTION_PHRASES);
    assert.equal(r1.matched, true);
    assert.ok(r1.matches.length >= 1);

    const r2 = containsAnyPhrase(
      'Let us discuss contract and pricing details',
      PRICING_CONTRACT_PHRASES,
    );
    assert.equal(r2.matched, true);

    const r3 = containsAnyPhrase('Everything is wonderful', COMPLIANCE_SENSITIVE_PHRASES);
    assert.equal(r3.matched, false);
    assert.deepEqual(r3.matches, []);
  });
});
