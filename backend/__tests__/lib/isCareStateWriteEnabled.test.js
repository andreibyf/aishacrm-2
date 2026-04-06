import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { isCareStateWriteEnabled } from '../../lib/care/isCareStateWriteEnabled.js';

const ORIGINAL_ENV = { ...process.env };

function resetEnv() {
  process.env = { ...ORIGINAL_ENV };
  delete process.env.CARE_STATE_WRITE_ENABLED;
}

describe('isCareStateWriteEnabled', () => {
  beforeEach(() => resetEnv());
  afterEach(() => resetEnv());

  it('defaults to false when env var is not set', () => {
    assert.equal(isCareStateWriteEnabled(), false);
  });

  it('returns true only when env var is exactly true', () => {
    process.env.CARE_STATE_WRITE_ENABLED = 'true';
    assert.equal(isCareStateWriteEnabled(), true);

    process.env.CARE_STATE_WRITE_ENABLED = 'TRUE';
    assert.equal(isCareStateWriteEnabled(), false);

    process.env.CARE_STATE_WRITE_ENABLED = '1';
    assert.equal(isCareStateWriteEnabled(), false);
  });
});
