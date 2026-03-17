import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  EMAIL_TONE,
  EMAIL_LENGTH_TIER,
  GUARDRAIL_SEVERITY,
  LENGTH_LIMITS,
  buildDefaultGuardrails,
  validateGuardrailsConfig,
  evaluateDraft,
  buildStyleDirective,
  countWords,
} from '../../lib/communications/contracts/emailStyleGuardrailsContract.js';

describe('emailStyleGuardrailsContract', () => {
  // -----------------------------------------------------------------------
  // Constants
  // -----------------------------------------------------------------------
  describe('constants', () => {
    it('exports all tone values', () => {
      assert.equal(EMAIL_TONE.FORMAL, 'formal');
      assert.equal(EMAIL_TONE.FRIENDLY, 'friendly');
      assert.equal(EMAIL_TONE.CASUAL, 'casual');
    });

    it('exports all length tiers', () => {
      assert.equal(EMAIL_LENGTH_TIER.CONCISE, 'concise');
      assert.equal(EMAIL_LENGTH_TIER.STANDARD, 'standard');
      assert.equal(EMAIL_LENGTH_TIER.DETAILED, 'detailed');
    });

    it('exports severity levels', () => {
      assert.equal(GUARDRAIL_SEVERITY.ERROR, 'error');
      assert.equal(GUARDRAIL_SEVERITY.WARNING, 'warning');
      assert.equal(GUARDRAIL_SEVERITY.INFO, 'info');
    });

    it('exports length limits for each tier', () => {
      assert.equal(LENGTH_LIMITS.concise, 150);
      assert.equal(LENGTH_LIMITS.standard, 300);
      assert.equal(LENGTH_LIMITS.detailed, 500);
    });
  });

  // -----------------------------------------------------------------------
  // buildDefaultGuardrails
  // -----------------------------------------------------------------------
  describe('buildDefaultGuardrails', () => {
    it('builds sensible defaults', () => {
      const g = buildDefaultGuardrails();
      assert.equal(g.tone, EMAIL_TONE.FRIENDLY);
      assert.equal(g.length_tier, EMAIL_LENGTH_TIER.STANDARD);
      assert.equal(g.require_recipient_name, true);
      assert.equal(g.check_robotic_patterns, true);
      assert.equal(g.max_exclamation_marks, 2);
      assert.equal(g.max_emoji_count, 1);
    });

    it('accepts overrides', () => {
      const g = buildDefaultGuardrails({
        tone: EMAIL_TONE.FORMAL,
        length_tier: EMAIL_LENGTH_TIER.CONCISE,
        max_exclamation_marks: 0,
      });
      assert.equal(g.tone, EMAIL_TONE.FORMAL);
      assert.equal(g.length_tier, EMAIL_LENGTH_TIER.CONCISE);
      assert.equal(g.max_exclamation_marks, 0);
    });
  });

  // -----------------------------------------------------------------------
  // validateGuardrailsConfig
  // -----------------------------------------------------------------------
  describe('validateGuardrailsConfig', () => {
    it('accepts valid config', () => {
      const result = validateGuardrailsConfig(buildDefaultGuardrails());
      assert.equal(result.valid, true);
      assert.equal(result.errors.length, 0);
    });

    it('rejects null', () => {
      const result = validateGuardrailsConfig(null);
      assert.equal(result.valid, false);
    });

    it('rejects invalid tone', () => {
      const result = validateGuardrailsConfig({ tone: 'sarcastic' });
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('tone')));
    });

    it('rejects invalid length_tier', () => {
      const result = validateGuardrailsConfig({ length_tier: 'novel' });
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('length_tier')));
    });

    it('rejects negative max_exclamation_marks', () => {
      const result = validateGuardrailsConfig({ max_exclamation_marks: -1 });
      assert.equal(result.valid, false);
    });

    it('rejects negative max_emoji_count', () => {
      const result = validateGuardrailsConfig({ max_emoji_count: -1 });
      assert.equal(result.valid, false);
    });

    it('accepts empty object (no fields required)', () => {
      const result = validateGuardrailsConfig({});
      assert.equal(result.valid, true);
    });
  });

  // -----------------------------------------------------------------------
  // countWords
  // -----------------------------------------------------------------------
  describe('countWords', () => {
    it('counts words in a normal sentence', () => {
      assert.equal(countWords('Hello world, this is a test.'), 6);
    });

    it('returns 0 for empty string', () => {
      assert.equal(countWords(''), 0);
    });

    it('returns 0 for null', () => {
      assert.equal(countWords(null), 0);
    });

    it('handles multiple spaces and newlines', () => {
      assert.equal(countWords('Hello   world\n\nfoo   bar'), 4);
    });
  });

  // -----------------------------------------------------------------------
  // evaluateDraft — length checks
  // -----------------------------------------------------------------------
  describe('evaluateDraft — length', () => {
    it('passes a draft within concise limit', () => {
      const body = Array(50).fill('word').join(' ');
      const result = evaluateDraft(body, { length_tier: 'concise' });
      assert.equal(result.pass, true);
      assert.equal(result.stats.word_count, 50);
    });

    it('warns when draft exceeds concise limit', () => {
      const body = Array(200).fill('word').join(' ');
      const result = evaluateDraft(body, { length_tier: 'concise' });
      assert.ok(result.violations.some((v) => v.rule === 'length_exceeded'));
    });

    it('errors on empty body', () => {
      const result = evaluateDraft('', {});
      assert.equal(result.pass, false);
      assert.ok(result.violations.some((v) => v.rule === 'empty_body'));
    });
  });

  // -----------------------------------------------------------------------
  // evaluateDraft — robotic patterns
  // -----------------------------------------------------------------------
  describe('evaluateDraft — robotic patterns', () => {
    it('detects "I hope this finds you well"', () => {
      const body = 'Hi Sarah, I hope this email finds you well. I wanted to discuss the project.';
      const result = evaluateDraft(body, {});
      assert.ok(result.violations.some((v) => v.rule === 'robotic_pattern'));
    });

    it('detects "Please don\'t hesitate to"', () => {
      const body = 'If you have questions, please don\'t hesitate to contact us.';
      const result = evaluateDraft(body, {});
      assert.ok(result.violations.some((v) => v.rule === 'robotic_pattern'));
    });

    it('detects "Feel free to reach out"', () => {
      const body = 'Feel free to reach out if you need anything else.';
      const result = evaluateDraft(body, {});
      assert.ok(result.violations.some((v) => v.rule === 'robotic_pattern'));
    });

    it('detects corporate buzzwords', () => {
      const body = 'Let us leverage our synergy and circle back on this next week.';
      const result = evaluateDraft(body, {});
      const roboticCount = result.violations.filter((v) => v.rule === 'robotic_pattern').length;
      assert.ok(roboticCount >= 3); // leverage, synergy, circle back
    });

    it('detects AI self-reference', () => {
      const body = 'As an AI assistant, I can help you with that request.';
      const result = evaluateDraft(body, {});
      assert.ok(result.violations.some((v) => v.message.includes('AI self-reference')));
    });

    it('passes clean human-sounding email', () => {
      const body =
        'Hi Sarah, Thanks for the great call yesterday. I pulled together the pricing proposal — see attached. Can we lock in a time Thursday to go over the details?';
      const result = evaluateDraft(body, {});
      assert.equal(
        result.violations.filter((v) => v.rule === 'robotic_pattern').length,
        0,
      );
    });

    it('skips robotic check when disabled', () => {
      const body = 'I hope this finds you well. Please don\'t hesitate to contact us.';
      const result = evaluateDraft(body, { check_robotic_patterns: false });
      assert.equal(
        result.violations.filter((v) => v.rule === 'robotic_pattern').length,
        0,
      );
    });
  });

  // -----------------------------------------------------------------------
  // evaluateDraft — exclamation marks and emoji
  // -----------------------------------------------------------------------
  describe('evaluateDraft — punctuation and emoji', () => {
    it('warns on excessive exclamation marks', () => {
      const body = 'Great news! Amazing opportunity! Can\'t wait! So excited!';
      const result = evaluateDraft(body, { max_exclamation_marks: 2 });
      assert.ok(result.violations.some((v) => v.rule === 'excessive_exclamation'));
      assert.equal(result.stats.exclamation_count, 4);
    });

    it('allows exclamation marks within limit', () => {
      const body = 'Great news! Looking forward to the call.';
      const result = evaluateDraft(body, { max_exclamation_marks: 2 });
      assert.ok(!result.violations.some((v) => v.rule === 'excessive_exclamation'));
    });

    it('warns on excessive emoji', () => {
      const body = 'Looking forward to this! 🚀🎉🔥';
      const result = evaluateDraft(body, { max_emoji_count: 1 });
      assert.ok(result.violations.some((v) => v.rule === 'excessive_emoji'));
    });
  });

  // -----------------------------------------------------------------------
  // evaluateDraft — personalization
  // -----------------------------------------------------------------------
  describe('evaluateDraft — personalization', () => {
    it('warns when recipient name is missing from draft', () => {
      const body = 'Hi there, just wanted to follow up on our proposal.';
      const result = evaluateDraft(
        body,
        { require_recipient_name: true },
        { recipient_name: 'Sarah' },
      );
      assert.ok(result.violations.some((v) => v.rule === 'missing_recipient_name'));
    });

    it('passes when recipient name is present', () => {
      const body = 'Hi Sarah, just wanted to follow up on our proposal.';
      const result = evaluateDraft(
        body,
        { require_recipient_name: true },
        { recipient_name: 'Sarah' },
      );
      assert.ok(!result.violations.some((v) => v.rule === 'missing_recipient_name'));
    });

    it('skips name check when no context provided', () => {
      const body = 'Hi there, just a quick note.';
      const result = evaluateDraft(body, { require_recipient_name: true });
      assert.ok(!result.violations.some((v) => v.rule === 'missing_recipient_name'));
    });
  });

  // -----------------------------------------------------------------------
  // evaluateDraft — tone alignment
  // -----------------------------------------------------------------------
  describe('evaluateDraft — tone', () => {
    it('warns on contractions in formal tone', () => {
      const body = "I'm writing to confirm our meeting. We don't have the details yet.";
      const result = evaluateDraft(body, { tone: 'formal' });
      assert.ok(result.violations.some((v) => v.rule === 'tone_formal_contractions'));
    });

    it('passes formal email without contractions', () => {
      const body =
        'I am writing to confirm our meeting scheduled for Thursday. The details are enclosed.';
      const result = evaluateDraft(body, { tone: 'formal' });
      assert.ok(!result.violations.some((v) => v.rule === 'tone_formal_contractions'));
    });

    it('warns on overly formal language in casual tone', () => {
      const body = 'Pursuant to our discussion, be advised that the timeline has changed.';
      const result = evaluateDraft(body, { tone: 'casual' });
      assert.ok(result.violations.some((v) => v.rule === 'tone_casual_too_formal'));
    });

    it('passes casual email without formal language', () => {
      const body = 'Hey, just a heads up — the timeline shifted a bit. Let me know your thoughts.';
      const result = evaluateDraft(body, { tone: 'casual' });
      assert.ok(!result.violations.some((v) => v.rule === 'tone_casual_too_formal'));
    });
  });

  // -----------------------------------------------------------------------
  // evaluateDraft — stats
  // -----------------------------------------------------------------------
  describe('evaluateDraft — stats', () => {
    it('returns complete stats object', () => {
      const body = 'Hello! World! 🎉';
      const result = evaluateDraft(body, {});
      assert.equal(result.stats.word_count, 3);
      assert.equal(result.stats.exclamation_count, 2);
      assert.ok(result.stats.emoji_count >= 1);
      assert.equal(typeof result.stats.robotic_pattern_count, 'number');
    });
  });

  // -----------------------------------------------------------------------
  // evaluateDraft — pass/fail logic
  // -----------------------------------------------------------------------
  describe('evaluateDraft — pass/fail', () => {
    it('passes with only warnings (no errors)', () => {
      const body = Array(400).fill('word').join(' '); // exceeds standard limit
      const result = evaluateDraft(body, { length_tier: 'standard' });
      assert.equal(result.pass, true); // length_exceeded is WARNING, not ERROR
    });

    it('fails with errors', () => {
      const result = evaluateDraft('', {});
      assert.equal(result.pass, false);
    });
  });

  // -----------------------------------------------------------------------
  // buildStyleDirective
  // -----------------------------------------------------------------------
  describe('buildStyleDirective', () => {
    it('returns a string with tone guidance', () => {
      const directive = buildStyleDirective({ tone: 'formal' });
      assert.ok(directive.includes('formal'));
      assert.ok(directive.includes('Avoid contractions'));
    });

    it('includes recipient name when provided', () => {
      const directive = buildStyleDirective({}, { recipient_name: 'Sarah' });
      assert.ok(directive.includes('Sarah'));
    });

    it('includes length tier guidance', () => {
      const directive = buildStyleDirective({ length_tier: 'concise' });
      assert.ok(directive.includes('150'));
      assert.ok(directive.includes('concise'));
    });

    it('includes robotic pattern avoidance', () => {
      const directive = buildStyleDirective({});
      assert.ok(directive.includes('finds you well'));
      assert.ok(directive.includes('synergy'));
    });

    it('wraps in delimiters', () => {
      const directive = buildStyleDirective({});
      assert.ok(directive.startsWith('--- EMAIL STYLE GUIDELINES ---'));
      assert.ok(directive.endsWith('--- END STYLE GUIDELINES ---'));
    });

    it('uses friendly defaults', () => {
      const directive = buildStyleDirective({});
      assert.ok(directive.includes('warm, professional'));
    });
  });
});
