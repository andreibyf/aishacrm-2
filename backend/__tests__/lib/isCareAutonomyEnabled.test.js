import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  isCareAutonomyEnabled,
  getCareAutonomyStatus,
} from '../../lib/care/isCareAutonomyEnabled.js';

const ORIGINAL_ENV = { ...process.env };

function resetEnv() {
  process.env = { ...ORIGINAL_ENV };
  delete process.env.CARE_AUTONOMY_ENABLED;
  delete process.env.CARE_SHADOW_MODE;
}

describe('isCareAutonomyEnabled', () => {
  beforeEach(() => resetEnv());
  afterEach(() => resetEnv());

  it('defaults to false when env vars are unset', () => {
    assert.equal(isCareAutonomyEnabled(), false);
    const status = getCareAutonomyStatus();
    assert.equal(status.is_autonomous, false);
    assert.equal(status.mode, 'disabled');
  });

  it('returns false when autonomy enabled but shadow mode enabled', () => {
    process.env.CARE_AUTONOMY_ENABLED = 'true';
    process.env.CARE_SHADOW_MODE = 'true';

    assert.equal(isCareAutonomyEnabled(), false);
    const status = getCareAutonomyStatus();
    assert.equal(status.autonomy_enabled, true);
    assert.equal(status.shadow_mode, true);
    assert.equal(status.mode, 'shadow');
  });

  it('returns true only when autonomy enabled and shadow mode disabled', () => {
    process.env.CARE_AUTONOMY_ENABLED = 'true';
    process.env.CARE_SHADOW_MODE = 'false';

    assert.equal(isCareAutonomyEnabled(), true);
    const status = getCareAutonomyStatus();
    assert.equal(status.is_autonomous, true);
    assert.equal(status.mode, 'autonomous');
  });
});
