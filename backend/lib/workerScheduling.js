/**
 * Worker Scheduling Primitives
 *
 * Dampens the worker thundering-herd that saturated Node's libuv DNS thread
 * pool and caused EAI_AGAIN bursts + Cloudflare blocks. Two helpers:
 *
 *   startJitteredInterval — setInterval replacement with startup jitter and
 *     exponential-backoff skipping on consecutive failures.
 *   mapWithConcurrency   — semaphore-style concurrency cap for in-tick fan-out.
 */

import logger from './logger.js';

/**
 * Start a jittered, backoff-aware interval loop.
 *
 * @param {() => (void|Promise<void>)} fn           Work to run each tick.
 * @param {object} opts
 * @param {number} opts.intervalMs                  Base interval between ticks.
 * @param {number} [opts.jitterMs=0]                Random 0..jitterMs added to first fire.
 * @param {number} [opts.maxSkips=8]                Cap on exponential backoff skip count.
 * @param {string} [opts.name='worker']             Name used in backoff log lines.
 * @returns {() => void}                            Stop function.
 */
export function startJitteredInterval(fn, opts) {
  const { intervalMs, jitterMs = 0, maxSkips = 8, name = 'worker' } = opts || {};
  let stopped = false;
  let timer = null;
  let skipsRemaining = 0;
  let nextSkipOnFailure = 1;

  const tick = async () => {
    if (stopped) return;

    if (skipsRemaining > 0) {
      skipsRemaining -= 1;
      scheduleNext(intervalMs);
      return;
    }

    try {
      await fn();
      nextSkipOnFailure = 1;
    } catch (err) {
      logger.warn(
        { err, name, nextSkip: nextSkipOnFailure },
        `[${name}] tick failed — backing off for ${nextSkipOnFailure} tick(s)`,
      );
      skipsRemaining = nextSkipOnFailure;
      nextSkipOnFailure = Math.min(nextSkipOnFailure * 2, maxSkips);
    }

    scheduleNext(intervalMs);
  };

  const scheduleNext = (ms) => {
    if (stopped) return;
    timer = setTimeout(tick, ms);
    if (typeof timer.unref === 'function') timer.unref();
  };

  const initialDelay = jitterMs > 0 ? Math.floor(Math.random() * jitterMs) : 0;
  scheduleNext(initialDelay);

  return function stop() {
    stopped = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
}

/**
 * Run `items` through `worker` with at most `limit` concurrent tasks.
 * If a worker throws, the thrown Error appears in that slot of the result
 * array instead of being rethrown, so one bad item cannot abort a tick.
 *
 * @template T,R
 * @param {T[]} items
 * @param {(item: T, index: number) => Promise<R>} worker
 * @param {number} limit
 * @returns {Promise<(R|Error)[]>}
 */
export async function mapWithConcurrency(items, worker, limit) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const effectiveLimit = Math.max(1, Math.min(limit | 0, items.length));
  const results = new Array(items.length);
  let nextIndex = 0;

  const runOne = async () => {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) return;
      try {
        results[i] = await worker(items[i], i);
      } catch (err) {
        results[i] = err instanceof Error ? err : new Error(String(err));
      }
    }
  };

  const runners = [];
  for (let i = 0; i < effectiveLimit; i++) runners.push(runOne());
  await Promise.all(runners);
  return results;
}
