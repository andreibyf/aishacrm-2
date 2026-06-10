/**
 * Growth — LLM scorer tests
 * Run: node --test backend/__tests__/growth.scorer.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createLlmScoreFn, parseScore, fallbackScore } from '../lib/growth/scorer.js';

function makeDeps({ call } = {}) {
  return { callLiteLLMVirtual: call };
}

const GOOD_JSON =
  '{"score": 82, "expected_impact": "high", "difficulty": "low", "title": "Target AC financing", "reason": "Interest appears to be rising for financing-related queries.", "recommended_action": "Add an AC financing page."}';

test('parseScore: parses valid JSON and clamps score to 0-100', () => {
  assert.equal(parseScore('{"score": 150}').score, 100);
  assert.equal(parseScore('{"score": -5}').score, 0);
  assert.equal(parseScore('garbage'), null);
  assert.equal(parseScore('{"no_score": 1}'), null);
});

test('parseScore: tolerates code fences / surrounding prose', () => {
  const parsed = parseScore('```json\n' + GOOD_JSON + '\n```');
  assert.equal(parsed.score, 82);
  assert.equal(parsed.expected_impact, 'high');
  assert.equal(parsed.title, 'Target AC financing');
});

test('parseScore: invalid enum values fall back to medium', () => {
  const parsed = parseScore('{"score": 50, "expected_impact": "huge", "difficulty": "nope"}');
  assert.equal(parsed.expected_impact, 'medium');
  assert.equal(parsed.difficulty, 'medium');
});

test('fallbackScore: trends vs non-trends defaults', () => {
  assert.equal(fallbackScore({ signal_type: 'trends' }).score, 70);
  assert.equal(fallbackScore({ signal_type: 'autocomplete' }).score, 55);
});

test('scoreFn: returns parsed score on success and routes via the aisha-summary alias', async () => {
  const seen = {};
  const call = async (args) => {
    seen.model = args.model;
    seen.tenantId = args.tenantId;
    return { status: 'success', content: GOOD_JSON };
  };
  const scoreFn = createLlmScoreFn({ tenantId: 't1', deps: makeDeps({ call }) });
  const out = await scoreFn({
    type: 'content',
    subject: 'ac financing',
    signal_type: 'autocomplete',
  });
  assert.equal(out.score, 82);
  assert.equal(out.reason, 'Interest appears to be rising for financing-related queries.');
  assert.equal(seen.model, 'aisha-summary'); // → vLLM/AI server via LiteLLM
  assert.equal(seen.tenantId, 't1'); // passed for LiteLLM spend metadata
});

test('scoreFn: LiteLLM error status → deterministic fallback', async () => {
  const call = async () => ({ status: 'error', error: 'LiteLLM HTTP 500' });
  const scoreFn = createLlmScoreFn({ tenantId: 't1', deps: makeDeps({ call }) });
  const out = await scoreFn({ signal_type: 'trends' });
  assert.equal(out.score, 70); // fallback
});

test('scoreFn: unparseable content → fallback', async () => {
  const call = async () => ({ status: 'success', content: 'sorry, no JSON here' });
  const scoreFn = createLlmScoreFn({ tenantId: 't1', deps: makeDeps({ call }) });
  const out = await scoreFn({ signal_type: 'autocomplete' });
  assert.equal(out.score, 55);
});

test('scoreFn: a thrown LiteLLM call is caught → fallback', async () => {
  const call = async () => {
    throw new Error('network');
  };
  const scoreFn = createLlmScoreFn({ tenantId: 't1', deps: makeDeps({ call }) });
  const out = await scoreFn({ signal_type: 'autocomplete' });
  assert.equal(out.score, 55);
});
