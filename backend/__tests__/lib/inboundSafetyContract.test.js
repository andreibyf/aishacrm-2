import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  SAFETY_VERDICTS,
  THREAT_CATEGORIES,
  AUTH_RESULT_TYPES,
  AUTH_RESULT_VALUES,
  validateSafetyClassification,
  validateAuthResult,
  buildDefaultSafetyClassification,
  classifyFromHeaders,
  parseSpamScore,
  parseAuthenticationResults,
} from '../../lib/communications/contracts/inboundSafetyContract.js';

describe('inboundSafetyContract', () => {
  describe('validateSafetyClassification', () => {
    it('accepts a valid accepted classification', () => {
      const result = validateSafetyClassification({
        verdict: 'accepted',
        score: 0.1,
        categories: [],
        auth_results: [{ type: 'spf', result: 'pass', detail: null }],
        quarantine_reason: null,
        classified_at: '2025-12-01T00:00:00Z',
        classified_by: 'imap_smtp',
      });
      assert.equal(result.valid, true);
    });

    it('accepts a quarantined classification with reason', () => {
      const result = validateSafetyClassification({
        verdict: 'quarantined',
        categories: ['spam'],
        quarantine_reason: 'High spam score',
        classified_at: '2025-12-01T00:00:00Z',
        classified_by: 'imap_smtp',
      });
      assert.equal(result.valid, true);
    });

    it('rejects quarantined without reason', () => {
      const result = validateSafetyClassification({
        verdict: 'quarantined',
        categories: ['spam'],
        classified_at: '2025-12-01T00:00:00Z',
        classified_by: 'imap_smtp',
      });
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('quarantine_reason')));
    });

    it('rejects unknown verdict', () => {
      const result = validateSafetyClassification({ verdict: 'maybe' });
      assert.equal(result.valid, false);
    });

    it('rejects null', () => {
      const result = validateSafetyClassification(null);
      assert.equal(result.valid, false);
    });

    it('rejects non-numeric score', () => {
      const result = validateSafetyClassification({ verdict: 'accepted', score: 'high' });
      assert.equal(result.valid, false);
    });

    it('rejects invalid auth_results entries', () => {
      const result = validateSafetyClassification({
        verdict: 'accepted',
        auth_results: [{ type: '', result: '' }],
        classified_at: '2025-12-01T00:00:00Z',
        classified_by: 'imap_smtp',
      });
      assert.equal(result.valid, false);
    });

    it('rejects missing classified_at', () => {
      const result = validateSafetyClassification({
        verdict: 'accepted',
        classified_by: 'imap_smtp',
      });
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('classified_at')));
    });

    it('rejects invalid classified_at', () => {
      const result = validateSafetyClassification({
        verdict: 'accepted',
        classified_at: 'not-a-date',
        classified_by: 'imap_smtp',
      });
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('classified_at')));
    });

    it('rejects missing classified_by', () => {
      const result = validateSafetyClassification({
        verdict: 'accepted',
        classified_at: '2025-12-01T00:00:00Z',
      });
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('classified_by')));
    });
  });

  describe('validateAuthResult', () => {
    it('accepts a valid auth result', () => {
      const result = validateAuthResult({ type: 'spf', result: 'pass', detail: 'ok' });
      assert.equal(result.valid, true);
    });

    it('rejects missing type', () => {
      const result = validateAuthResult({ result: 'pass' });
      assert.equal(result.valid, false);
    });
  });

  describe('buildDefaultSafetyClassification', () => {
    it('builds an accepted classification', () => {
      const safety = buildDefaultSafetyClassification('imap_smtp');
      assert.equal(safety.verdict, SAFETY_VERDICTS.ACCEPTED);
      assert.equal(safety.classified_by, 'imap_smtp');
      assert.deepEqual(safety.categories, []);
      assert.deepEqual(safety.auth_results, []);
      assert.equal(safety.quarantine_reason, null);
    });

    it('defaults classified_by to unknown', () => {
      const safety = buildDefaultSafetyClassification();
      assert.equal(safety.classified_by, 'unknown');
    });
  });

  describe('classifyFromHeaders', () => {
    it('classifies clean message as accepted', () => {
      const safety = classifyFromHeaders({}, { providerType: 'imap_smtp' });
      assert.equal(safety.verdict, SAFETY_VERDICTS.ACCEPTED);
      assert.deepEqual(safety.categories, []);
    });

    it('quarantines message with high SpamAssassin score', () => {
      const safety = classifyFromHeaders(
        { 'x-spam-status': 'Yes, score=8.2 required=5.0', 'x-spam-score': '8.2' },
        { providerType: 'imap_smtp', spamThreshold: 5.0 },
      );
      assert.equal(safety.verdict, SAFETY_VERDICTS.QUARANTINED);
      assert.ok(safety.categories.includes(THREAT_CATEGORIES.SPAM));
      assert.equal(safety.score, 8.2);
    });

    it('quarantines message with high Microsoft SCL', () => {
      const safety = classifyFromHeaders(
        { 'x-ms-exchange-organization-scl': '7' },
        { providerType: 'ms_graph' },
      );
      assert.equal(safety.verdict, SAFETY_VERDICTS.QUARANTINED);
      assert.ok(safety.categories.includes(THREAT_CATEGORIES.SPAM));
    });

    it('accepts message with low SCL', () => {
      const safety = classifyFromHeaders(
        { 'x-ms-exchange-organization-scl': '1' },
        { providerType: 'ms_graph' },
      );
      assert.equal(safety.verdict, SAFETY_VERDICTS.ACCEPTED);
    });

    it('parses authentication results from headers', () => {
      const safety = classifyFromHeaders({
        'authentication-results':
          'mx.google.com; spf=pass smtp.mailfrom=user@example.com; dkim=pass header.d=example.com',
      });
      assert.equal(safety.auth_results.length, 2);
      assert.equal(safety.auth_results[0].type, 'spf');
      assert.equal(safety.auth_results[0].result, 'pass');
      assert.equal(safety.auth_results[1].type, 'dkim');
    });
  });

  describe('parseSpamScore', () => {
    it('parses score from SpamAssassin status', () => {
      assert.equal(parseSpamScore('Yes, score=8.2 required=5.0'), 8.2);
    });

    it('parses plain numeric score', () => {
      assert.equal(parseSpamScore('3.1'), 3.1);
    });

    it('returns null for empty string', () => {
      assert.equal(parseSpamScore(''), null);
    });

    it('returns null for non-numeric', () => {
      assert.equal(parseSpamScore('none'), null);
    });
  });

  describe('parseAuthenticationResults', () => {
    it('parses multiple auth results', () => {
      const results = parseAuthenticationResults(
        'mx.google.com; spf=pass smtp.mailfrom=test@example.com; dkim=fail; dmarc=none',
      );
      assert.equal(results.length, 3);
      assert.equal(results[0].type, 'spf');
      assert.equal(results[0].result, 'pass');
      assert.equal(results[1].type, 'dkim');
      assert.equal(results[1].result, 'fail');
      assert.equal(results[2].type, 'dmarc');
      assert.equal(results[2].result, 'none');
    });

    it('returns empty array for empty header', () => {
      assert.deepEqual(parseAuthenticationResults(''), []);
    });
  });

  describe('constants', () => {
    it('exports all safety verdicts', () => {
      assert.equal(SAFETY_VERDICTS.ACCEPTED, 'accepted');
      assert.equal(SAFETY_VERDICTS.QUARANTINED, 'quarantined');
      assert.equal(SAFETY_VERDICTS.REJECTED, 'rejected');
    });

    it('exports all threat categories', () => {
      assert.equal(THREAT_CATEGORIES.SPAM, 'spam');
      assert.equal(THREAT_CATEGORIES.PHISHING, 'phishing');
      assert.equal(THREAT_CATEGORIES.MALWARE, 'malware');
      assert.equal(THREAT_CATEGORIES.SPOOFING, 'spoofing');
      assert.equal(THREAT_CATEGORIES.BULK, 'bulk');
    });

    it('exports auth result types and values', () => {
      assert.equal(AUTH_RESULT_TYPES.SPF, 'spf');
      assert.equal(AUTH_RESULT_TYPES.DKIM, 'dkim');
      assert.equal(AUTH_RESULT_TYPES.DMARC, 'dmarc');
      assert.equal(AUTH_RESULT_VALUES.PASS, 'pass');
      assert.equal(AUTH_RESULT_VALUES.FAIL, 'fail');
    });
  });
});
