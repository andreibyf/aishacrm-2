import test from 'node:test';
import assert from 'node:assert/strict';

import buildAudienceFromPrompt from '../../lib/campaigns/buildAudienceFromPrompt.js';

test('buildAudienceFromPrompt parses spaced inactivity units', () => {
  const result = buildAudienceFromPrompt('email warm leads inactive for 14 days');
  assert.equal(result.target_type, 'lead');
  assert.equal(result.required_channel, 'email');
  assert.equal(result.temperature, 'warm');
  assert.equal(result.inactivity_days, 14);
});

test('buildAudienceFromPrompt parses compact inactivity units', () => {
  assert.equal(buildAudienceFromPrompt('call contacts inactive 3w').inactivity_days, 21);
  assert.equal(buildAudienceFromPrompt('email sources inactive 2mo').inactivity_days, 60);
  assert.equal(buildAudienceFromPrompt('text contacts inactive 30d').inactivity_days, 30);
});

test('buildAudienceFromPrompt falls back safely on oversized prompts', () => {
  const longNoise = '0'.repeat(10000);
  const result = buildAudienceFromPrompt(`${longNoise} leads inactive 10 days by email`);

  assert.equal(result.target_type, 'contact');
  assert.equal(result.inactivity_days, null);
  assert.equal(result.required_channel, 'email');
});

test('buildAudienceFromPrompt still detects business development sources', () => {
  const spaced = buildAudienceFromPrompt('email biz dev contacts inactive 7 days');
  const compact = buildAudienceFromPrompt('email bizdev contacts inactive 7 days');

  assert.equal(spaced.target_type, 'source');
  assert.equal(compact.target_type, 'source');
});
