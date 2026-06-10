/**
 * Growth — etaEstimator tests (Task 6)
 *
 * Pure-unit coverage for backend/lib/growth/etaEstimator.js.
 * Run: node --test backend/__tests__/growth.etaEstimator.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { estimate } from '../lib/growth/etaEstimator.js';

test('heuristic: base + per service×region pair', () => {
  // 60 + 15*(2*3) = 150
  const r = estimate({ serviceCount: 2, regionCount: 3 });
  assert.equal(r.eta_seconds, 150);
  assert.equal(r.low, Math.round(150 * 0.7)); // 105
  assert.equal(r.high, Math.round(150 * 1.3)); // 195
});

test('heuristic: zero work → base only', () => {
  assert.equal(estimate({}).eta_seconds, 60);
  assert.equal(estimate({ serviceCount: 0, regionCount: 5 }).eta_seconds, 60);
});

test('rolling median is used once there are >= 3 recent durations', () => {
  const r = estimate({ serviceCount: 9, regionCount: 9, recentDurations: [100, 200, 300] });
  assert.equal(r.eta_seconds, 200); // median, NOT the heuristic (which would be huge)
  assert.equal(r.low, 140);
  assert.equal(r.high, 260);
});

test('median of an even number of samples averages the two middles', () => {
  const r = estimate({ recentDurations: [100, 200, 300, 400] });
  assert.equal(r.eta_seconds, 250);
});

test('fewer than 3 durations falls back to the heuristic', () => {
  // only 2 samples → ignored; heuristic = 60 + 15*(1*1) = 75
  const r = estimate({ serviceCount: 1, regionCount: 1, recentDurations: [1000, 2000] });
  assert.equal(r.eta_seconds, 75);
});

test('non-finite / non-positive durations are ignored', () => {
  // [0, -5, NaN] are dropped → fewer than 3 valid → heuristic (base only)
  const r = estimate({ recentDurations: [0, -5, NaN] });
  assert.equal(r.eta_seconds, 60);
});

test('returns a {eta_seconds, low, high} shape with low <= eta <= high', () => {
  const r = estimate({ serviceCount: 4, regionCount: 2 });
  assert.ok(r.low <= r.eta_seconds && r.eta_seconds <= r.high);
  assert.deepEqual(Object.keys(r).sort(), ['eta_seconds', 'high', 'low']);
});
