/**
 * Customer C.A.R.E. Autonomy Gate - Tests
 * 
 * Validates that isCareAutonomyEnabled() enforces strict safety rules.
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { isCareAutonomyEnabled, getCareAutonomyStatus } from '../isCareAutonomyEnabled.js';

// Helper to set env vars for test
function setEnv(autonomy, shadow) {
  if (autonomy !== undefined) {
    process.env.CARE_AUTONOMY_ENABLED = String(autonomy);
  } else {
    delete process.env.CARE_AUTONOMY_ENABLED;
  }
  
  if (shadow !== undefined) {
    process.env.CARE_SHADOW_MODE = String(shadow);
  } else {
    delete process.env.CARE_SHADOW_MODE;
  }
}

// Helper to clear env vars
function clearEnv() {
  delete process.env.CARE_AUTONOMY_ENABLED;
  delete process.env.CARE_SHADOW_MODE;
}

test('isCareAutonomyEnabled - Safe Defaults', async (t) => {
  await t.test('returns false when env vars are unset', () => {
    clearEnv();
    assert.strictEqual(isCareAutonomyEnabled(), false, 'Should be false with no env vars');
  });
  
  await t.test('returns false when env vars are empty strings', () => {
    setEnv('', '');
    assert.strictEqual(isCareAutonomyEnabled(), false, 'Should be false with empty env vars');
  });
});

test('isCareAutonomyEnabled - Shadow Mode (Observe-Only)', async (t) => {
  await t.test('returns false when autonomy=true but shadow=true', () => {
    setEnv('true', 'true');
    assert.strictEqual(isCareAutonomyEnabled(), false, 'Shadow mode should prevent autonomy');
  });
  
  await t.test('returns false when autonomy=1 but shadow=1', () => {
    setEnv('1', '1');
    assert.strictEqual(isCareAutonomyEnabled(), false, 'Shadow mode should prevent autonomy (numeric)');
  });
  
  await t.test('returns false when autonomy=yes but shadow=yes', () => {
    setEnv('yes', 'yes');
    assert.strictEqual(isCareAutonomyEnabled(), false, 'Shadow mode should prevent autonomy (yes)');
  });
});

test('isCareAutonomyEnabled - Autonomy Disabled', async (t) => {
  await t.test('returns false when autonomy=false and shadow=false', () => {
    setEnv('false', 'false');
    assert.strictEqual(isCareAutonomyEnabled(), false, 'Autonomy disabled should be false even without shadow');
  });
  
  await t.test('returns false when autonomy=false and shadow=true', () => {
    setEnv('false', 'true');
    assert.strictEqual(isCareAutonomyEnabled(), false, 'Autonomy disabled should be false');
  });
  
  await t.test('returns false when autonomy=0 and shadow=0', () => {
    setEnv('0', '0');
    assert.strictEqual(isCareAutonomyEnabled(), false, 'Autonomy disabled (numeric) should be false');
  });
});

test('isCareAutonomyEnabled - Full Autonomy (Opt-In Required)', async (t) => {
  await t.test('returns true ONLY when autonomy=true AND shadow=false', () => {
    setEnv('true', 'false');
    assert.strictEqual(isCareAutonomyEnabled(), true, 'Should enable autonomy when both flags are correct');
  });
  
  await t.test('returns true with numeric flags: autonomy=1 AND shadow=0', () => {
    setEnv('1', '0');
    assert.strictEqual(isCareAutonomyEnabled(), true, 'Should enable autonomy with numeric flags');
  });
  
  await t.test('returns true with alternative truthy values', () => {
    setEnv('yes', 'no');
    assert.strictEqual(isCareAutonomyEnabled(), true, 'Should enable autonomy with yes/no');
    
    setEnv('on', 'off');
    assert.strictEqual(isCareAutonomyEnabled(), true, 'Should enable autonomy with on/off');
    
    setEnv('enabled', 'disabled');
    assert.strictEqual(isCareAutonomyEnabled(), true, 'Should enable autonomy with enabled/disabled');
  });
});

test('getCareAutonomyStatus - Debugging Helper', async (t) => {
  await t.test('returns detailed status for disabled state', () => {
    clearEnv();
    const status = getCareAutonomyStatus();
    
    assert.strictEqual(status.autonomy_enabled, false);
    assert.strictEqual(status.shadow_mode, true);
    assert.strictEqual(status.is_autonomous, false);
    assert.strictEqual(status.mode, 'disabled');
  });
  
  await t.test('returns detailed status for shadow mode', () => {
    setEnv('true', 'true');
    const status = getCareAutonomyStatus();
    
    assert.strictEqual(status.autonomy_enabled, true);
    assert.strictEqual(status.shadow_mode, true);
    assert.strictEqual(status.is_autonomous, false);
    assert.strictEqual(status.mode, 'shadow');
  });
  
  await t.test('returns detailed status for autonomous mode', () => {
    setEnv('true', 'false');
    const status = getCareAutonomyStatus();
    
    assert.strictEqual(status.autonomy_enabled, true);
    assert.strictEqual(status.shadow_mode, false);
    assert.strictEqual(status.is_autonomous, true);
    assert.strictEqual(status.mode, 'autonomous');
  });
});

// Clean up after all tests
test.after(() => {
  clearEnv();
});
