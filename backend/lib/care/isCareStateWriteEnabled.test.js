/**
 * Tests for C.A.R.E. State Write Gate
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { isCareStateWriteEnabled } from './isCareStateWriteEnabled.js';

describe('isCareStateWriteEnabled', () => {
  let originalEnv;

  before(() => {
    // Save original env
    originalEnv = process.env.CARE_STATE_WRITE_ENABLED;
  });

  after(() => {
    // Restore original env
    if (originalEnv !== undefined) {
      process.env.CARE_STATE_WRITE_ENABLED = originalEnv;
    } else {
      delete process.env.CARE_STATE_WRITE_ENABLED;
    }
  });

  it('should return false when env var is unset', () => {
    delete process.env.CARE_STATE_WRITE_ENABLED;
    assert.equal(isCareStateWriteEnabled(), false);
  });

  it('should return false when env var is empty string', () => {
    process.env.CARE_STATE_WRITE_ENABLED = '';
    assert.equal(isCareStateWriteEnabled(), false);
  });

  it('should return false when env var is "false"', () => {
    process.env.CARE_STATE_WRITE_ENABLED = 'false';
    assert.equal(isCareStateWriteEnabled(), false);
  });

  it('should return true when env var is "true"', () => {
    process.env.CARE_STATE_WRITE_ENABLED = 'true';
    assert.equal(isCareStateWriteEnabled(), true);
  });

  it('should return false for any other value', () => {
    process.env.CARE_STATE_WRITE_ENABLED = 'yes';
    assert.equal(isCareStateWriteEnabled(), false);
  });
});
