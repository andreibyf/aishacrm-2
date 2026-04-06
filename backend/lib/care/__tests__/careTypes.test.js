import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  VALID_CARE_STATES,
  VALID_ENTITY_TYPES,
  VALID_SIGNAL_ENTITY_TYPES,
  OUTCOME_TYPES,
} from '../careTypes.js';

describe('careTypes', () => {
  it('exports canonical care states and entity type sets', () => {
    assert.ok(VALID_CARE_STATES.has('unaware'));
    assert.ok(VALID_CARE_STATES.has('active'));
    assert.ok(VALID_CARE_STATES.has('lost'));
    assert.equal(VALID_CARE_STATES.has('invalid_state'), false);

    assert.ok(VALID_ENTITY_TYPES.has('lead'));
    assert.ok(VALID_ENTITY_TYPES.has('opportunity'));
    assert.equal(VALID_ENTITY_TYPES.has('activity'), false);

    assert.ok(VALID_SIGNAL_ENTITY_TYPES.has('activity'));
    assert.ok(VALID_SIGNAL_ENTITY_TYPES.has('contact'));
  });

  it('exports immutable outcome types map with expected values', () => {
    assert.equal(OUTCOME_TYPES.suggestion_created, 'suggestion_created');
    assert.equal(OUTCOME_TYPES.low_confidence, 'low_confidence');
    assert.equal(OUTCOME_TYPES.error, 'error');
    assert.ok(Object.isFrozen(OUTCOME_TYPES));
  });
});
