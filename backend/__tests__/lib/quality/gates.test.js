/**
 * Tests for the lite-tier deterministic gates.
 * [2026-06-11 Claude] Phase 1 of the lite-tier quality pipeline.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runGates, extractSubjectTerms, tokenize } from '../../../lib/quality/gates.js';

const find = (defects, id) => defects.find((d) => d.gate === id);

describe('extractSubjectTerms', () => {
  it('pulls proper nouns, skipping the leading action verb', () => {
    const terms = extractSubjectTerms('Draft an email to Sarah Chen at Brightwave Logistics');
    assert.ok(terms.includes('Sarah'));
    assert.ok(terms.includes('Chen'));
    assert.ok(terms.includes('Brightwave'));
    assert.ok(!terms.includes('Draft'), 'leading verb should be excluded');
  });

  it('pulls quoted phrases', () => {
    const terms = extractSubjectTerms('Summarize the note about "Q3 renewal risk"');
    assert.ok(terms.includes('Q3 renewal risk'));
  });

  it('returns [] when there is nothing salient', () => {
    assert.deepEqual(extractSubjectTerms('write something nice'), []);
  });
});

describe('runGates — relevance (headline bar)', () => {
  const ctx = {
    taskType: 'email_draft',
    taskDescription: 'Draft an email to Sarah Chen at Brightwave Logistics about the renewal',
  };

  it('passes an on-topic draft', () => {
    const out =
      'Hi Sarah, following up on the Brightwave renewal — could we book a 15-minute call?';
    const { defects } = runGates(out, ctx);
    assert.equal(find(defects, 'relevant_to_subject'), undefined);
  });

  it('flags a fully off-topic draft as SEVERE', () => {
    const out = 'The weather today is sunny with a chance of rain in the afternoon. Let me know?';
    const { pass, defects } = runGates(out, ctx);
    assert.equal(pass, false);
    const rel = find(defects, 'relevant_to_subject');
    assert.ok(rel);
    assert.equal(rel.severity, 'severe');
  });

  it('flags a thin/low-overlap draft as MILD', () => {
    const out = 'Hi Sarah, just checking in. Could we book a quick call? Let me know.';
    // Mentions Sarah (1 of 3 terms) → overlap ~0.33 < 0.34 → mild
    const rel = find(runGates(out, ctx).defects, 'relevant_to_subject');
    assert.ok(rel);
    assert.equal(rel.severity, 'mild');
  });

  it('abstains when the task has no extractable subject terms', () => {
    const rel = find(
      runGates('here is some generic text output', {
        taskType: 'generic_text',
        taskDescription: 'write something',
      }).defects,
      'relevant_to_subject',
    );
    assert.equal(rel, undefined);
  });
});

describe('runGates — empty / refusal', () => {
  it('short-circuits empty output to a single non_empty defect', () => {
    const { pass, defects } = runGates('   ', { taskType: 'email_draft' });
    assert.equal(pass, false);
    assert.equal(defects.length, 1);
    assert.equal(defects[0].gate, 'non_empty');
    assert.equal(defects[0].severity, 'mild'); // → refine, per Decision 4
  });

  it('flags a refusal as a mild relevance defect', () => {
    const d = find(
      runGates("I'm sorry, I can't help with that request.", {
        taskType: 'generic_text',
        taskDescription: 'Draft an email to Sarah',
      }).defects,
      'no_model_refusal',
    );
    assert.ok(d);
    assert.equal(d.defectClass, 'relevance');
    assert.equal(d.severity, 'mild');
  });
});

describe('runGates — mechanical', () => {
  it('flags unfilled placeholders as minor (rule-fixable)', () => {
    const d = find(
      runGates('Hi Sarah, great to connect about Brightwave. Best, [Your Name]', {
        taskType: 'email_draft',
        taskDescription: 'Draft an email to Sarah at Brightwave',
      }).defects,
      'no_unfilled_placeholders',
    );
    assert.ok(d);
    assert.equal(d.severity, 'minor');
    assert.match(d.detail, /\[Your Name\]/);
  });

  it('flags over-length only when a limit is set', () => {
    const long = 'x'.repeat(50);
    assert.equal(
      find(runGates(long, { taskType: 'note_summary' }).defects, 'within_length'),
      undefined,
    );
    const d = find(
      runGates(long, { taskType: 'note_summary', limits: { maxChars: 20 } }).defects,
      'within_length',
    );
    assert.ok(d);
  });

  it('flags invalid JSON for tool_result', () => {
    assert.ok(find(runGates('not json', { taskType: 'tool_result' }).defects, 'valid_json'));
    assert.equal(
      find(runGates('{"ok":true}', { taskType: 'tool_result' }).defects, 'valid_json'),
      undefined,
    );
  });
});

describe('runGates — email CTA', () => {
  it('flags a draft with no call-to-action', () => {
    const out = 'Hi Sarah, it was lovely to see you. Brightwave looks impressive. Take care.';
    assert.ok(
      find(
        runGates(out, {
          taskType: 'email_draft',
          taskDescription: 'Draft an email to Sarah at Brightwave',
        }).defects,
        'has_cta',
      ),
    );
  });

  it('passes a draft with a question CTA', () => {
    const out = 'Hi Sarah, great to connect about Brightwave. Could we book a quick call?';
    assert.equal(
      find(
        runGates(out, {
          taskType: 'email_draft',
          taskDescription: 'Draft an email to Sarah at Brightwave',
        }).defects,
        'has_cta',
      ),
      undefined,
    );
  });
});

describe('tokenize', () => {
  it('drops stopwords and short tokens', () => {
    const t = tokenize('The renewal is about Brightwave');
    assert.ok(t.has('renewal'));
    assert.ok(t.has('brightwave'));
    assert.ok(!t.has('the'));
    assert.ok(!t.has('is'));
  });
});
