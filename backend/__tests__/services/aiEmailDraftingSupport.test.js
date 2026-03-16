import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeEmailEntityType,
  buildEntityTableName,
} from '../../services/aiEmailDraftingSupport.js';

test('normalizeEmailEntityType maps plural opportunities to the canonical entity type', () => {
  assert.equal(normalizeEmailEntityType('opportunities'), 'opportunity');
  assert.equal(buildEntityTableName(normalizeEmailEntityType('opportunities')), 'opportunities');
});
