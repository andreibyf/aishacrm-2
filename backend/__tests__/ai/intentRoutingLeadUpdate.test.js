/**
 * Intent Routing – Lead Update (Correction Phrasing)
 *
 * Verifies that correction-style messages for leads map to the
 * LEAD_UPDATE intent and route to the update_lead tool, and that
 * even when the intent is null, entity mentions ensure update_lead
 * is in the relevant tool set.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { classifyIntent, extractEntityMentions } from '../../lib/intentClassifier.js';
import { routeIntentToTool, getRelevantToolsForIntent } from '../../lib/intentRouter.js';

describe('Intent Routing – Lead Update (correction phrasing)', () => {

  test('phrases that explicitly mention correcting the lead map to update_lead', () => {
    const messages = [
      'please correct the lead',
      'can you fix the lead',
      'correct the lead for me',
      'please correct the name for this lead',
      'the lead name is wrong, please correct it'
    ];

    for (const message of messages) {
      const intent = classifyIntent(message);
      assert.equal(intent, 'LEAD_UPDATE', `Expected LEAD_UPDATE for: "${message}"`);

      const tool = routeIntentToTool(intent);
      assert.equal(tool, 'update_lead', `Expected update_lead for intent LEAD_UPDATE (message: "${message}")`);
    }
  });

  test('entity-based routing still surfaces update_lead when only lead is clearly referenced', () => {
    const message = "it's a lead, it should be Josh Johnson";

    const intent = classifyIntent(message);
    const entities = extractEntityMentions(message);

    // Intent may be null, but entityMentions.lead must be true
    assert.equal(entities.lead, true, 'Expected entityMentions.lead to be true');

    const relevantTools = getRelevantToolsForIntent(intent, entities);
    assert.ok(
      relevantTools.includes('update_lead'),
      `Relevant tools should include update_lead for message: "${message}" (got: ${relevantTools.join(', ')})`
    );
  });
});
