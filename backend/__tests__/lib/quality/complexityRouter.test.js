/**
 * Tests for the complexity router + tier ladder (tool-aligned entry selection
 * and the 3B→7B→14B-GPU escalation topology).
 * [2026-06-12 Claude] Task-dependent, graduated model selection.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  routeEntryTier,
  aliasForTier,
  escalationTarget,
  CPU_TIERS,
  TIER_ALIAS,
} from '../../../lib/quality/complexityRouter.js';

describe('tier ladder topology', () => {
  it('maps every tier to its LiteLLM alias', () => {
    assert.equal(aliasForTier('lite'), 'aisha-task-lite'); // qwen2.5:3b
    assert.equal(aliasForTier('mid'), 'aisha-lite-7b'); // qwen2.5:7b
    assert.equal(aliasForTier('coder'), 'aisha-task-lite-plus'); // qwen2.5-coder:7b
    assert.equal(aliasForTier('full'), 'aisha-task'); // qwen-14b GPU
    assert.equal(aliasForTier('unknown'), 'aisha-task'); // defaults to ceiling
  });

  it('escalates 3B→7B→GPU and coder→GPU', () => {
    assert.equal(escalationTarget('lite'), 'mid');
    assert.equal(escalationTarget('mid'), 'full');
    assert.equal(escalationTarget('coder'), 'full');
    assert.equal(escalationTarget('full'), 'full');
  });

  it('CPU tiers run the pipeline; full (GPU) does not', () => {
    assert.ok(CPU_TIERS.has('lite') && CPU_TIERS.has('mid') && CPU_TIERS.has('coder'));
    assert.ok(!CPU_TIERS.has('full'));
    assert.deepEqual(Object.keys(TIER_ALIAS).sort(), ['coder', 'full', 'lite', 'mid']);
  });
});

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

  it('routes a note creation to lite (3B) regardless of a full-tier role', () => {
    // The exact failing case: "add note ..." on ops_manager (full) → lite.
    const r = route('add note customer is away on vacation', 'full');
    assert.equal(r.tier, 'lite');
    assert.match(r.reason, /^tooled:.*note/);
  });

  it('routes other concrete tool actions to lite', () => {
    assert.equal(route('create a meeting tomorrow at 3pm').tier, 'lite');
    assert.equal(route('draft an intro email to Acme').tier, 'lite');
    assert.equal(route('log a call with the customer').tier, 'lite');
  });

  it('keeps parallel actions joined by "and" on lite (difficulty handled by escalation)', () => {
    const r = route('create an appointment and add a note');
    assert.equal(r.tier, 'lite');
    assert.ok(r.intents.includes('note'));
    assert.ok(r.intents.includes('activity'));
  });

  it('routes structured / JSON output to the coder model', () => {
    assert.equal(route('export a CSV of all leads').tier, 'coder');
    assert.equal(route('return the contacts as JSON with id and email fields').tier, 'coder');
    assert.equal(route('build a table of opportunities by stage').tier, 'coder');
    assert.match(route('export a CSV of leads').reason, /structured/);
  });

  it('routes a multi-step / sequenced task to full (GPU) up front', () => {
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
