import test from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

import { startJitteredInterval, mapWithConcurrency } from '../../lib/workerScheduling.js';

/**
 * These tests verify the scheduling primitives that dampen the worker
 * thundering-herd: startup jitter, backoff on failure, and in-tick
 * concurrency throttling. Prior to these helpers, 3+ workers fired on
 * aligned intervals and each fanned out 20+ concurrent Supabase calls,
 * saturating Node's libuv DNS thread pool and causing EAI_AGAIN bursts.
 */

test('startJitteredInterval does not fire immediately — waits for jitter window', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  try {
    let callCount = 0;
    const stop = startJitteredInterval(
      () => {
        callCount++;
      },
      { intervalMs: 10000, jitterMs: 2000, name: 'test' },
    );

    // Immediately after start — nothing fires synchronously
    assert.equal(callCount, 0, 'must not fire synchronously on start');

    // Advance past the max jitter window — first tick must have fired by now
    mock.timers.tick(2100);
    await new Promise((r) => setImmediate(r));
    assert.equal(callCount, 1, 'first tick fires within jitter window');

    stop();
  } finally {
    mock.timers.reset();
  }
});

test('startJitteredInterval skips next tick after failure (exponential backoff)', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  try {
    let callCount = 0;
    const stop = startJitteredInterval(
      async () => {
        callCount++;
        throw new Error('boom');
      },
      { intervalMs: 1000, jitterMs: 0, name: 'test' },
    );

    // Tick past initial jitter (0) → first call fires and fails
    mock.timers.tick(10);
    await new Promise((r) => setImmediate(r));
    assert.equal(callCount, 1, 'first tick fired');

    // Next interval — should be SKIPPED due to backoff (skip=1)
    mock.timers.tick(1000);
    await new Promise((r) => setImmediate(r));
    assert.equal(callCount, 1, 'second tick skipped by backoff');

    // Next interval — skip decrements, should fire
    mock.timers.tick(1000);
    await new Promise((r) => setImmediate(r));
    assert.equal(callCount, 2, 'third tick fires after backoff elapses');

    stop();
  } finally {
    mock.timers.reset();
  }
});

test('startJitteredInterval backoff grows exponentially on repeated failures', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  try {
    let callCount = 0;
    const stop = startJitteredInterval(
      async () => {
        callCount++;
        throw new Error('boom');
      },
      { intervalMs: 1000, jitterMs: 0, name: 'test' },
    );

    // Fire 1st call (fails → skip=1)
    mock.timers.tick(10);
    await new Promise((r) => setImmediate(r));

    // Tick 2 skipped
    mock.timers.tick(1000);
    await new Promise((r) => setImmediate(r));

    // Tick 3 fires (fails → skip=2)
    mock.timers.tick(1000);
    await new Promise((r) => setImmediate(r));

    // Ticks 4, 5 skipped
    mock.timers.tick(1000);
    await new Promise((r) => setImmediate(r));
    mock.timers.tick(1000);
    await new Promise((r) => setImmediate(r));

    // Tick 6 fires (fails → skip=4)
    mock.timers.tick(1000);
    await new Promise((r) => setImmediate(r));

    assert.equal(callCount, 3, 'exponential skip: 1, 2, 4 skips between fires');

    stop();
  } finally {
    mock.timers.reset();
  }
});

test('startJitteredInterval resets backoff after success', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  try {
    let callCount = 0;
    let shouldFail = true;
    const stop = startJitteredInterval(
      async () => {
        callCount++;
        if (shouldFail) throw new Error('boom');
      },
      { intervalMs: 1000, jitterMs: 0, name: 'test' },
    );

    // First call fails → skip=1
    mock.timers.tick(10);
    await new Promise((r) => setImmediate(r));
    assert.equal(callCount, 1);

    // Skip one tick
    mock.timers.tick(1000);
    await new Promise((r) => setImmediate(r));
    assert.equal(callCount, 1);

    // Next tick fires — make it succeed
    shouldFail = false;
    mock.timers.tick(1000);
    await new Promise((r) => setImmediate(r));
    assert.equal(callCount, 2);

    // After success, next tick should fire immediately (no skip)
    mock.timers.tick(1000);
    await new Promise((r) => setImmediate(r));
    assert.equal(callCount, 3, 'backoff reset after success');

    stop();
  } finally {
    mock.timers.reset();
  }
});

test('startJitteredInterval stop() halts execution', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  try {
    let callCount = 0;
    const stop = startJitteredInterval(
      () => {
        callCount++;
      },
      { intervalMs: 1000, jitterMs: 0, name: 'test' },
    );

    mock.timers.tick(10);
    await new Promise((r) => setImmediate(r));
    assert.equal(callCount, 1);

    stop();

    mock.timers.tick(10000);
    await new Promise((r) => setImmediate(r));
    assert.equal(callCount, 1, 'no additional ticks after stop()');
  } finally {
    mock.timers.reset();
  }
});

test('mapWithConcurrency runs at most N tasks in parallel', async () => {
  let inFlight = 0;
  let maxInFlight = 0;

  const worker = async (item) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight--;
    return item * 2;
  };

  const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const results = await mapWithConcurrency(items, worker, 3);

  assert.deepEqual(results, [2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
  assert.ok(maxInFlight <= 3, `maxInFlight should be <=3, was ${maxInFlight}`);
  assert.ok(maxInFlight >= 2, 'should actually run in parallel');
});

test('mapWithConcurrency returns errors per-item without throwing', async () => {
  const worker = async (item) => {
    if (item === 'bad') throw new Error('worker failed');
    return `ok-${item}`;
  };

  const results = await mapWithConcurrency(['a', 'bad', 'b'], worker, 2);

  assert.equal(results[0], 'ok-a');
  assert.ok(results[1] instanceof Error, 'failed item should be an Error');
  assert.equal(results[2], 'ok-b');
});
