/**
 * Unit tests for backend/lib/opportunityStageNormalizer.js — 4VD-63.
 *
 * These are pure-logic tests; no DB, no HTTP. They lock down the
 * legacy↔canonical alias contract that the opportunities GET handlers
 * (V1 and V2) rely on to keep `stage='won'` records visible when the
 * UI sends `stage=closed_won`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  expandStageFilter,
  canonicalizeStage,
  STAGE_FILTER_BYPASS_VALUES,
} from '../../lib/opportunityStageNormalizer.js';

test('[4VD-63] expandStageFilter("closed_won") includes legacy "won"', () => {
  const stages = expandStageFilter('closed_won');
  assert.ok(Array.isArray(stages), 'should return an array');
  assert.ok(stages.includes('won'), 'must include legacy "won" so old rows match');
  assert.ok(stages.includes('closed_won'), 'must include canonical "closed_won"');
});

test('[4VD-63] expandStageFilter("closed_lost") includes legacy "lost"', () => {
  const stages = expandStageFilter('closed_lost');
  assert.ok(stages.includes('lost'));
  assert.ok(stages.includes('closed_lost'));
});

test('[4VD-63] expandStageFilter is symmetric — legacy input yields canonical match set', () => {
  // A caller (e.g. AI tool, legacy URL) that sends ?stage=won should
  // get the same row set as ?stage=closed_won.
  assert.deepEqual(
    [...expandStageFilter('won')].sort(),
    [...expandStageFilter('closed_won')].sort(),
    'won and closed_won must expand to the same set',
  );
  assert.deepEqual(
    [...expandStageFilter('lost')].sort(),
    [...expandStageFilter('closed_lost')].sort(),
    'lost and closed_lost must expand to the same set',
  );
});

test('expandStageFilter handles casing and whitespace', () => {
  assert.deepEqual(
    [...expandStageFilter('  Closed_Won  ')].sort(),
    [...expandStageFilter('closed_won')].sort(),
  );
});

test('expandStageFilter returns single-element array for non-aliased canonical stages', () => {
  assert.deepEqual(expandStageFilter('prospecting'), ['prospecting']);
  assert.deepEqual(expandStageFilter('qualification'), ['qualification']);
  assert.deepEqual(expandStageFilter('proposal'), ['proposal']);
  assert.deepEqual(expandStageFilter('negotiation'), ['negotiation']);
});

test('expandStageFilter falls back to [normalized] for unknown stages', () => {
  // Forward-compat: a new stage added to the constants enum should
  // still work as a filter without requiring this map to be updated.
  assert.deepEqual(expandStageFilter('on_hold'), ['on_hold']);
  assert.deepEqual(expandStageFilter('  On_Hold '), ['on_hold']);
});

test('expandStageFilter returns null for falsy / non-string input', () => {
  assert.equal(expandStageFilter(null), null);
  assert.equal(expandStageFilter(undefined), null);
  assert.equal(expandStageFilter(''), null);
  assert.equal(expandStageFilter('   '), null);
  assert.equal(expandStageFilter(42), null);
  assert.equal(expandStageFilter({}), null);
});

test('[4VD-63] canonicalizeStage maps legacy short forms to canonical', () => {
  assert.equal(canonicalizeStage('won'), 'closed_won');
  assert.equal(canonicalizeStage('lost'), 'closed_lost');
  assert.equal(canonicalizeStage('Won'), 'closed_won');
  assert.equal(canonicalizeStage('  LOST '), 'closed_lost');
  assert.equal(canonicalizeStage('closedwon'), 'closed_won');
  assert.equal(canonicalizeStage('closedlost'), 'closed_lost');
});

test('canonicalizeStage preserves already-canonical values', () => {
  assert.equal(canonicalizeStage('closed_won'), 'closed_won');
  assert.equal(canonicalizeStage('closed_lost'), 'closed_lost');
  assert.equal(canonicalizeStage('prospecting'), 'prospecting');
  assert.equal(canonicalizeStage('negotiation'), 'negotiation');
});

test('canonicalizeStage passes through null / undefined / non-strings unchanged', () => {
  assert.equal(canonicalizeStage(null), null);
  assert.equal(canonicalizeStage(undefined), undefined);
  // numbers / objects should not throw — POST/PUT handlers may receive odd input
  assert.equal(canonicalizeStage(42), 42);
  const obj = { foo: 'bar' };
  assert.equal(canonicalizeStage(obj), obj);
});

test('STAGE_FILTER_BYPASS_VALUES matches existing route guards', () => {
  // Route handlers historically use the literal set
  //   stage !== 'all' && stage !== 'any' && stage !== '' && stage !== 'undefined'
  // Keep the export in sync so refactors don't drift.
  assert.ok(STAGE_FILTER_BYPASS_VALUES.has('all'));
  assert.ok(STAGE_FILTER_BYPASS_VALUES.has('any'));
  assert.ok(STAGE_FILTER_BYPASS_VALUES.has(''));
  assert.ok(STAGE_FILTER_BYPASS_VALUES.has('undefined'));
});
