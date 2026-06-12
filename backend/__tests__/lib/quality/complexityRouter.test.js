/**
 * Tests for the pre-flight complexity router (tool-aligned entry-tier selection).
 * [2026-06-12 Claude] Makes model selection task-dependent, keyed off the same
 * tool-facet taxonomy (detectIntents/TOOL_FACETS) the monitor uses.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { routeEntryTier } from '../../../lib/quality/complexityRouter.js';

describe('routeEntryTier — disabled', () => {
  it('returns the role tier unchanged when disabled (no behavioral change)', () => {
    assert.equal(routeEntryTier({ description: 'add a note', roleTier: 'full' }).tier, 'full');
    assert.equal(routeEntryTier({ description: 'add a note', roleTier: 'lite' }).tier, 'lite');
    assert.equal(
      routeEntryTier({ description: 'anything', roleTier: 'full' }).reason,
      'role_default',
    );
  });
});

describe('routeEntryTier — enabled (task-dependent)', () => {
  const route = (description, roleTier = 'full') =>
    routeEntryTier({ description, roleTier, enabled: true });

  it('routes a note creation to lite regardless of a full-tier role', () => {
    // The exact failing case: "add note ..." on ops_manager (full) → should be lite.
    const r = route('add note customer is away on vacation', 'full');
    assert.equal(r.tier, 'lite');
    assert.match(r.reason, /^tooled:.*note/);
  });

  it('routes other concrete tool actions to lite', () => {
    assert.equal(route('create a meeting tomorrow at 3pm').tier, 'lite');
    assert.equal(route('draft an intro email to Acme').tier, 'lite');
    assert.equal(route('log a call with the customer').tier, 'lite');
  });

  it('keeps parallel actions joined by "and" on lite (still simple)', () => {
    const r = route('create an appointment and add a note');
    assert.equal(r.tier, 'lite');
    assert.ok(r.intents.includes('note'));
    assert.ok(r.intents.includes('activity'));
  });

  it('routes a multi-step / sequenced task to full up front', () => {
    const r = route('schedule a call then once they reply send a reminder', 'lite');
    assert.equal(r.tier, 'full');
    assert.equal(r.reason, 'multi_step');
  });

  it('falls back to the role tier when the task maps to no tool action', () => {
    const r = route('update the pipeline forecast', 'full');
    assert.equal(r.tier, 'full');
    assert.equal(r.reason, 'untooled_role_default');
    assert.deepEqual(r.intents, []);
  });

  it('an untooled task on a lite role stays lite (role default)', () => {
    assert.equal(route('think about our strategy', 'lite').tier, 'lite');
  });
});
