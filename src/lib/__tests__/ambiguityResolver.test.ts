/**
 * Tests for ambiguityResolver.ts — Task 2.10 Error Handling & Edge Cases
 */

import { describe, it, expect } from 'vitest';
import {
  resolveAmbiguity,
  getContextualExamples,
  buildFallbackMessage,
  isLikelyVoiceGarble
} from '../ambiguityResolver';
import { parseIntent } from '../intentParser';

describe('resolveAmbiguity', () => {
  describe('empty input', () => {
    it('returns ambiguous for empty string', () => {
      const result = resolveAmbiguity(null, '');
      expect(result.isAmbiguous).toBe(true);
      expect(result.clarification?.reason).toBe('empty_input');
      expect(result.clarification?.canRetry).toBe(true);
    });

    it('returns ambiguous for whitespace-only', () => {
      const result = resolveAmbiguity(null, '   ');
      expect(result.isAmbiguous).toBe(true);
      expect(result.clarification?.reason).toBe('empty_input');
    });
  });

  describe('vague requests', () => {
    it('detects "do the thing" as vague', () => {
      const parsed = parseIntent('do it');
      const result = resolveAmbiguity(parsed, 'do it');
      expect(result.isAmbiguous).toBe(true);
      expect(result.clarification?.reason).toBe('vague_request');
    });

    it('detects single word filler as vague', () => {
      const result = resolveAmbiguity(null, 'hmm');
      expect(result.isAmbiguous).toBe(true);
    });

    it('detects "idk" as vague', () => {
      const result = resolveAmbiguity(null, 'idk');
      expect(result.isAmbiguous).toBe(true);
    });
  });

  describe('missing details', () => {
    it('detects incomplete "show" command', () => {
      const parsed = parseIntent('show');
      const result = resolveAmbiguity(parsed, 'show');
      expect(result.isAmbiguous).toBe(true);
      expect(result.clarification?.reason).toBe('missing_details');
      expect(result.clarification?.hint?.toLowerCase()).toContain('leads');
    });

    // Note: "create a" is 8 chars and contains CRM keywords, so the resolver
    // passes it to backend AI rather than blocking it client-side.
    // Testing shorter incomplete commands that don't pass the CRM check.
    it('detects very short incomplete command', () => {
      const parsed = parseIntent('create');
      const result = resolveAmbiguity(parsed, 'create');
      expect(result.isAmbiguous).toBe(true);
      expect(result.clarification?.reason).toBe('missing_details');
    });
  });

  describe('destructive commands', () => {
    // Note: Commands with CRM keywords (like "contacts") and length >= 8 chars
    // are passed to backend AI for handling. The backend enforces destructive
    // command blocking. Testing resolver's handling of short destructive commands.
    it('blocks short destructive commands', () => {
      const parsed = parseIntent('delete');
      const result = resolveAmbiguity(parsed, 'delete');
      expect(result.isAmbiguous).toBe(true);
      expect(result.clarification?.reason).toBe('missing_details');
    });
  });

  describe('valid commands', () => {
    it('passes clear query command', () => {
      const parsed = parseIntent('show me all leads from California');
      const result = resolveAmbiguity(parsed, 'show me all leads from California');
      expect(result.isAmbiguous).toBe(false);
      expect(result.clarification).toBeNull();
    });

    it('passes clear create command', () => {
      const parsed = parseIntent('create a new lead');
      const result = resolveAmbiguity(parsed, 'create a new lead');
      expect(result.isAmbiguous).toBe(false);
    });

    it('passes analyze command', () => {
      const parsed = parseIntent('summarize my pipeline');
      const result = resolveAmbiguity(parsed, 'summarize my pipeline');
      expect(result.isAmbiguous).toBe(false);
    });
  });

  describe('low confidence', () => {
    it('flags low confidence intent as ambiguous', () => {
      // Create a mock parsed intent with low confidence
      const mockParsed = {
        rawText: 'maybe something about data',
        normalized: 'maybe something about data',
        intent: 'ambiguous' as const,
        entity: 'general' as const,
        filters: {},
        confidence: 0.25,
        isAmbiguous: true,
        isMultiStep: false,
        isPotentiallyDestructive: false,
        detectedPhrases: []
      };
      const result = resolveAmbiguity(mockParsed, 'maybe something about data');
      expect(result.isAmbiguous).toBe(true);
    });
  });

  describe('voice origin', () => {
    it('provides voice-specific message for unclear voice input', () => {
      const result = resolveAmbiguity(null, 'uh', { origin: 'voice' });
      expect(result.isAmbiguous).toBe(true);
      expect(result.clarification?.offerTextFallback).toBe(true);
    });
  });
});

describe('getContextualExamples', () => {
  it('returns lead examples for leads entity', () => {
    const examples = getContextualExamples('leads');
    expect(examples.length).toBeGreaterThan(0);
    expect(examples.some((e) => e.toLowerCase().includes('lead'))).toBe(true);
  });

  it('returns account examples for accounts entity', () => {
    const examples = getContextualExamples('accounts');
    expect(examples.length).toBeGreaterThan(0);
    expect(examples.some((e) => e.toLowerCase().includes('account'))).toBe(true);
  });

  it('returns general examples for unknown entity', () => {
    const examples = getContextualExamples('general');
    expect(examples.length).toBeGreaterThan(0);
  });
});

describe('buildFallbackMessage', () => {
  it('returns basic fallback for first failure', () => {
    const parsed = parseIntent('blah blah');
    const result = buildFallbackMessage(parsed, 'blah blah', 0);
    expect(result.content).toContain('not sure');
    expect(result.actions.length).toBeGreaterThan(0);
  });

  it('includes more examples for second failure', () => {
    const parsed = parseIntent('still confused');
    const result = buildFallbackMessage(parsed, 'still confused', 2);
    expect(result.content).toContain('Here are some things');
  });

  it('offers support escalation after 3 failures', () => {
    const parsed = parseIntent('nothing works');
    const result = buildFallbackMessage(parsed, 'nothing works', 3);
    expect(result.content).toContain('contact support');
    expect(result.actions.some((a) => a.type === 'escalate_support')).toBe(true);
  });
});

describe('isLikelyVoiceGarble', () => {
  it('detects very short input as garble', () => {
    expect(isLikelyVoiceGarble('a')).toBe(true);
    expect(isLikelyVoiceGarble('um')).toBe(true);
  });

  it('detects repeated characters as garble', () => {
    expect(isLikelyVoiceGarble('aaaa')).toBe(true);
    expect(isLikelyVoiceGarble('....')).toBe(true);
  });

  it('passes normal text', () => {
    expect(isLikelyVoiceGarble('show me leads')).toBe(false);
    expect(isLikelyVoiceGarble('create account')).toBe(false);
  });

  it('detects low alpha ratio as garble', () => {
    expect(isLikelyVoiceGarble('123456')).toBe(true);
    expect(isLikelyVoiceGarble('???!!!')).toBe(true);
  });
});
