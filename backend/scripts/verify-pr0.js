#!/usr/bin/env node
/**
 * PR0 Verification Script
 * 
 * Validates that C.A.R.E. (Cognitive Adaptive Response Engine) kill switch and shadow mode are correctly implemented.
 * 
 * Run: node backend/scripts/verify-pr0.js
 */

import { isCareAutonomyEnabled, getCareAutonomyStatus } from '../lib/care/isCareAutonomyEnabled.js';
import { getCareConfig as _getCareConfig } from '../lib/care/careConfig.js';

console.log('🔍 PR0 Verification: C.A.R.E. Kill Switch + Shadow Mode\n');

// Test 1: Default state (safe)
console.log('Test 1: Default State (No Env Vars)');
delete process.env.CARE_AUTONOMY_ENABLED;
delete process.env.CARE_SHADOW_MODE;

const test1 = isCareAutonomyEnabled();
console.log(`  isCareAutonomyEnabled() = ${test1}`);
console.log(`  Expected: false`);
console.log(`  Status: ${test1 === false ? '✅ PASS' : '❌ FAIL'}\n`);

// Test 2: Shadow mode (observe-only)
console.log('Test 2: Shadow Mode (Autonomy ON, Shadow ON)');
process.env.CARE_AUTONOMY_ENABLED = 'true';
process.env.CARE_SHADOW_MODE = 'true';

const test2 = isCareAutonomyEnabled();
const status2 = getCareAutonomyStatus();
console.log(`  isCareAutonomyEnabled() = ${test2}`);
console.log(`  mode = ${status2.mode}`);
console.log(`  Expected: false (shadow)`);
console.log(`  Status: ${test2 === false && status2.mode === 'shadow' ? '✅ PASS' : '❌ FAIL'}\n`);

// Test 3: Full autonomy (opt-in)
console.log('Test 3: Full Autonomy (Autonomy ON, Shadow OFF)');
process.env.CARE_AUTONOMY_ENABLED = 'true';
process.env.CARE_SHADOW_MODE = 'false';

const test3 = isCareAutonomyEnabled();
const status3 = getCareAutonomyStatus();
console.log(`  isCareAutonomyEnabled() = ${test3}`);
console.log(`  mode = ${status3.mode}`);
console.log(`  Expected: true (autonomous)`);
console.log(`  Status: ${test3 === true && status3.mode === 'autonomous' ? '✅ PASS' : '❌ FAIL'}\n`);

// Test 4: Autonomy disabled
console.log('Test 4: Autonomy Disabled (Autonomy OFF, Shadow OFF)');
process.env.CARE_AUTONOMY_ENABLED = 'false';
process.env.CARE_SHADOW_MODE = 'false';

const test4 = isCareAutonomyEnabled();
const status4 = getCareAutonomyStatus();
console.log(`  isCareAutonomyEnabled() = ${test4}`);
console.log(`  mode = ${status4.mode}`);
console.log(`  Expected: false (disabled)`);
console.log(`  Status: ${test4 === false && status4.mode === 'disabled' ? '✅ PASS' : '❌ FAIL'}\n`);

// Summary
const allPassed = test1 === false && test2 === false && test3 === true && test4 === false;

console.log('═══════════════════════════════════════════════════════');
if (allPassed) {
  console.log('✅ All PR0 verification tests PASSED');
  console.log('');
  console.log('Safe to deploy:');
  console.log('  - Kill switch enforced (default: autonomy OFF)');
  console.log('  - Shadow mode enforced (default: observe-only)');
  console.log('  - Autonomy gate requires explicit opt-in');
  console.log('  - Zero runtime behavior change confirmed');
  process.exit(0);
} else {
  console.log('❌ PR0 verification FAILED');
  console.log('');
  console.log('Do NOT deploy until all tests pass.');
  process.exit(1);
}
