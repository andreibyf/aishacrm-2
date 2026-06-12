/**
 * Tests for the lite-tier rule-fixers.
 * [2026-06-11 Claude] Phase 1 of the lite-tier quality pipeline.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  fillIdentityPlaceholders,
  truncateToLimit,
  repairJson,
  applyRuleFixers,
} from '../../../lib/quality/ruleFixers.js';

const agentProfile = {
  display_name: 'Jordan Rivera',
  metadata: { title: 'Customer Service Manager' },
};
const tenant = { name: 'Acme CRM' };

describe('fillIdentityPlaceholders', () => {
  it('fills name/title/company placeholders from identity', () => {
    const out = fillIdentityPlaceholders(
      'Best, [Your Name]\n[Your Title], [Company]',
      agentProfile,
      tenant,
    );
    assert.match(out, /Best, Jordan Rivera/);
    assert.match(out, /Customer Service Manager, Acme CRM/);
  });

  it('leaves placeholders we have no value for untouched', () => {
    const out = fillIdentityPlaceholders('Call me at [Phone]', agentProfile, tenant);
    assert.match(out, /\[Phone\]/);
  });

  it('is a no-op when identity is missing', () => {
    const out = fillIdentityPlaceholders('Best, [Your Name]', {}, {});
    assert.match(out, /\[Your Name\]/);
  });
});

describe('truncateToLimit', () => {
  it('returns unchanged when under the limit', () => {
    assert.equal(truncateToLimit('short', 100), 'short');
  });

  it('cuts at a sentence boundary when possible', () => {
    const text = 'First sentence here. Second sentence runs much longer than the cap allows.';
    const out = truncateToLimit(text, 25);
    assert.equal(out, 'First sentence here.');
  });

  it('falls back to a word boundary (no mid-word cut)', () => {
    const out = truncateToLimit('alpha bravo charlie delta', 14);
    assert.ok(!out.endsWith('cha'));
    assert.ok(out.length <= 14);
  });
});

describe('repairJson', () => {
  it('passes through already-valid JSON (canonicalized)', () => {
    assert.equal(repairJson('{"a":1}'), '{"a":1}');
  });

  it('extracts JSON embedded in prose', () => {
    assert.equal(repairJson('Here is the result: {"ok": true} — done'), '{"ok":true}');
  });

  it('returns the original when no JSON is present', () => {
    assert.equal(repairJson('no json here'), 'no json here');
  });
});

describe('applyRuleFixers', () => {
  it('fixes placeholders and reports the gate id', () => {
    const { output, fixed } = applyRuleFixers(
      'Hi Sarah, best [Your Name]',
      [{ gate: 'no_unfilled_placeholders' }],
      { agentProfile, tenant },
    );
    assert.match(output, /Jordan Rivera/);
    assert.deepEqual(fixed, ['no_unfilled_placeholders']);
  });

  it('does not report a fix that changed nothing', () => {
    const { fixed } = applyRuleFixers(
      'Call me at [Phone]',
      [{ gate: 'no_unfilled_placeholders' }],
      { agentProfile, tenant },
    );
    assert.deepEqual(fixed, []);
  });

  it('truncates only when a maxChars limit is provided', () => {
    const long = 'one two three four five six seven eight nine ten';
    const { fixed } = applyRuleFixers(long, [{ gate: 'within_length' }], {
      limits: { maxChars: 15 },
    });
    assert.deepEqual(fixed, ['within_length']);
  });

  it('ignores non-mechanical defects', () => {
    const { output, fixed } = applyRuleFixers(
      'off topic text',
      [{ gate: 'relevant_to_subject' }, { gate: 'has_cta' }],
      { agentProfile },
    );
    assert.equal(output, 'off topic text');
    assert.deepEqual(fixed, []);
  });
});
