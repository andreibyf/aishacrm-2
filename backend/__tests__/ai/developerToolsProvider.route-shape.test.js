import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { executeDeveloperCapability } from '../../lib/developerToolsProvider.js';

describe('developerToolsProvider route shape', () => {
  test('dev:read_file returns existing Developer AI error envelope for denied paths', async () => {
    const result = await executeDeveloperCapability('dev:read_file', {
      path: '../../../etc/passwd',
    });

    assert.ok(result);
    assert.equal(typeof result.error, 'string');
    assert.match(result.error, /Access denied/);
  });
});
