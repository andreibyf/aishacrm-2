/**
 * Growth — trendsClient circuit-breaker tests (Task 3)
 *
 * Pure-unit coverage for backend/lib/growth/trendsClient.js. No live network,
 * no real Redis, no real timers: fetchImpl is a controllable stub, the cache is
 * a Map wrapped with async get/set, and now() is a closure over a mutable clock.
 *
 * Run: node --test backend/__tests__/growth.trendsClient.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createTrendsClient, normalizeTrend } from '../lib/growth/trendsClient.js';

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

/**
 * A Map wrapped with the async get/set interface the client expects.
 * Stores values structurally (clone) so callers can't mutate the cached row.
 */
function makeFakeCache(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    async get(key) {
      return map.has(key) ? map.get(key) : null;
    },
    async set(key, value, _ttlSeconds) {
      map.set(key, value);
    },
  };
}

/** A controllable clock. Advance via clock.advance(ms). */
function makeClock(start = 0) {
  const c = { t: start };
  c.now = () => c.t;
  c.advance = (ms) => {
    c.t += ms;
  };
  return c;
}

/**
 * A fetchImpl stub. By default returns canned widget data; flip `mode` to
 * 'throw' to make every call reject. Records every invocation.
 */
function makeFetchStub({ mode = 'ok', data } = {}) {
  // `data` lives on the stub so tests can mutate it after creation
  // (e.g. flip mode to 'ok' and set stub.data for the half-open trial).
  const stub = { calls: 0, mode, data };
  const fn = async (keyword, region) => {
    stub.calls += 1;
    stub.lastArgs = [keyword, region];
    if (stub.mode === 'throw') {
      throw new Error('upstream down');
    }
    return stub.data !== undefined ? stub.data : widget([10, 20, 30]);
  };
  fn.stub = stub;
  return fn;
}

/** Build Google-Trends-widget-style raw data from an interest series. */
function widget(values) {
  return {
    default: {
      timelineData: values.map((v) => ({ value: [v] })),
    },
  };
}

// ---------------------------------------------------------------------------
// normalizeTrend (pure)
// ---------------------------------------------------------------------------

test('normalizeTrend returns the directional shape with no absolute-volume keys', () => {
  const out = normalizeTrend('solar panels', 'NZ', widget([40, 60, 80]));

  assert.deepEqual(Object.keys(out).sort(), ['delta_pct', 'region', 'subject', 'value']);
  assert.equal(out.subject, 'solar panels');
  assert.equal(out.region, 'NZ');

  // value is the latest point, within the relative [0,100] range.
  assert.equal(out.value, 80);
  assert.ok(out.value >= 0 && out.value <= 100);

  // delta vs the first point: (80 - 40) / 40 * 100 = 100.
  assert.equal(out.delta_pct, 100);

  // NEVER expose absolute counts.
  assert.ok(!('volume' in out));
  assert.ok(!('count' in out));
  assert.ok(!('searches' in out));
});

test('normalizeTrend clamps value into [0,100] and handles a zero baseline', () => {
  const high = normalizeTrend('k', 'US', widget([10, 250]));
  assert.equal(high.value, 100); // clamped

  const fromZero = normalizeTrend('k', 'US', widget([0, 50]));
  assert.equal(fromZero.value, 50);
  assert.equal(fromZero.delta_pct, 0); // no baseline → 0, not Infinity
});

test('normalizeTrend handles empty / missing series', () => {
  const out = normalizeTrend('k', 'US', null);
  assert.equal(out.value, 0);
  assert.equal(out.delta_pct, 0);
  assert.ok(!('volume' in out));
});

// ---------------------------------------------------------------------------
// getTrend — happy path + last-good caching
// ---------------------------------------------------------------------------

test('getTrend normalizes a successful fetch (directional, no volume)', async () => {
  const fetchImpl = makeFetchStub({ data: widget([20, 40]) });
  const cache = makeFakeCache();
  const clock = makeClock();
  const client = createTrendsClient({ fetchImpl, cache, now: clock.now });

  const out = await client.getTrend('ev chargers', 'AU');

  assert.deepEqual(out, {
    subject: 'ev chargers',
    region: 'AU',
    value: 40,
    delta_pct: 100, // (40-20)/20*100
  });
  assert.ok(!('volume' in out));
  assert.equal(fetchImpl.stub.calls, 1);
});

test('getTrend caches last-good on success (retrievable from the fake cache)', async () => {
  const fetchImpl = makeFetchStub({ data: widget([30, 30]) });
  const cache = makeFakeCache();
  const client = createTrendsClient({ fetchImpl, cache, now: makeClock().now });

  const out = await client.getTrend('heat pumps', 'NZ');

  const cached = await cache.get('trends:heat pumps:NZ');
  assert.deepEqual(cached, out);
  assert.deepEqual(cached, { subject: 'heat pumps', region: 'NZ', value: 30, delta_pct: 0 });
});

// ---------------------------------------------------------------------------
// Circuit breaker
// ---------------------------------------------------------------------------

test('breaker opens after failureThreshold consecutive failures; 4th call serves last-good without calling fetchImpl', async () => {
  // Seed the cache via an initial SUCCESS, then flip the stub to throwing.
  const fetchImpl = makeFetchStub({ data: widget([50, 100]) });
  const cache = makeFakeCache();
  const clock = makeClock();
  const client = createTrendsClient({
    fetchImpl,
    cache,
    now: clock.now,
    failureThreshold: 3,
    cooldownMs: 60_000,
  });

  // Initial success seeds last-good. (stub.calls === 1)
  const good = await client.getTrend('solar', 'NZ');
  assert.deepEqual(good, { subject: 'solar', region: 'NZ', value: 100, delta_pct: 100 });
  assert.equal(fetchImpl.stub.calls, 1);

  // Now upstream goes down.
  fetchImpl.stub.mode = 'throw';

  // Failure #1: CLOSED, below threshold → re-throws to caller.
  await assert.rejects(() => client.getTrend('solar', 'NZ'));
  // Failure #2: CLOSED, below threshold → re-throws.
  await assert.rejects(() => client.getTrend('solar', 'NZ'));
  // Failure #3: reaches threshold → OPEN; getTrend swallows + returns last-good.
  const onTrip = await client.getTrend('solar', 'NZ');
  assert.deepEqual(onTrip, good);

  // Three throwing fetches happened (calls went 1 → 4 total: 1 seed + 3 throws).
  assert.equal(fetchImpl.stub.calls, 4);

  // 4th throwing-intent call: breaker is OPEN, cooldown not elapsed →
  // MUST NOT invoke fetchImpl; serves cached last-good.
  const whileOpen = await client.getTrend('solar', 'NZ');
  assert.deepEqual(whileOpen, good);
  assert.equal(fetchImpl.stub.calls, 4); // unchanged — fetchImpl was NOT called
});

test('breaker returns null when OPEN and no cached value exists', async () => {
  const fetchImpl = makeFetchStub({ mode: 'throw' });
  const cache = makeFakeCache();
  const clock = makeClock();
  const client = createTrendsClient({
    fetchImpl,
    cache,
    now: clock.now,
    failureThreshold: 3,
    cooldownMs: 60_000,
  });

  // Three failures with no successful seed → breaker trips, nothing cached.
  await assert.rejects(() => client.getTrend('q', 'US'));
  await assert.rejects(() => client.getTrend('q', 'US'));
  const tripped = await client.getTrend('q', 'US'); // 3rd → OPEN, no cache
  assert.equal(tripped, null);
  assert.equal(fetchImpl.stub.calls, 3);

  // Still OPEN, no cache → null, and fetchImpl still untouched.
  const again = await client.getTrend('q', 'US');
  assert.equal(again, null);
  assert.equal(fetchImpl.stub.calls, 3);
});

test('half-open recovery: after cooldown the next call retries, and success closes the breaker', async () => {
  const fetchImpl = makeFetchStub({ mode: 'throw' });
  const cache = makeFakeCache();
  const clock = makeClock(1_000);
  const client = createTrendsClient({
    fetchImpl,
    cache,
    now: clock.now,
    failureThreshold: 3,
    cooldownMs: 60_000,
  });

  // Trip the breaker (3 failures).
  await assert.rejects(() => client.getTrend('wind', 'NZ'));
  await assert.rejects(() => client.getTrend('wind', 'NZ'));
  const tripped = await client.getTrend('wind', 'NZ');
  assert.equal(tripped, null);
  assert.equal(fetchImpl.stub.calls, 3);

  // Still cooling down → no fetch.
  clock.advance(30_000);
  await client.getTrend('wind', 'NZ');
  assert.equal(fetchImpl.stub.calls, 3); // breaker still OPEN, fetchImpl untouched

  // Advance past the cooldown and recover the upstream.
  clock.advance(31_000); // total +61_000 ms > cooldownMs
  fetchImpl.stub.mode = 'ok';
  fetchImpl.stub.data = widget([10, 20]);

  // HALF-OPEN trial: this call DOES invoke fetchImpl again.
  const recovered = await client.getTrend('wind', 'NZ');
  assert.equal(fetchImpl.stub.calls, 4); // trial fetch happened
  assert.deepEqual(recovered, { subject: 'wind', region: 'NZ', value: 20, delta_pct: 100 });

  // Breaker is now CLOSED with the failure counter reset: prove it by allowing
  // TWO more failures WITHOUT tripping (would need 3 from a reset counter).
  fetchImpl.stub.mode = 'throw';
  await assert.rejects(() => client.getTrend('wind', 'NZ')); // count 1 (CLOSED, throws)
  await assert.rejects(() => client.getTrend('wind', 'NZ')); // count 2 (CLOSED, throws)
  // If the counter had NOT reset, the breaker would already be OPEN and this
  // would have returned last-good instead of throwing — the rejects above prove
  // it is still CLOSED, i.e. the counter was reset on recovery.
  assert.equal(fetchImpl.stub.calls, 6); // both attempts hit fetchImpl
});

test('half-open recovery: a failed trial re-opens the breaker and restarts cooldown', async () => {
  const fetchImpl = makeFetchStub({ mode: 'throw', data: widget([5, 5]) });
  const cache = makeFakeCache();
  const clock = makeClock(0);
  const client = createTrendsClient({
    fetchImpl,
    cache,
    now: clock.now,
    failureThreshold: 2,
    cooldownMs: 10_000,
  });

  // Seed a last-good first via a one-off success.
  fetchImpl.stub.mode = 'ok';
  const good = await client.getTrend('tidal', 'NZ'); // calls = 1
  assert.deepEqual(good, { subject: 'tidal', region: 'NZ', value: 5, delta_pct: 0 });
  fetchImpl.stub.mode = 'throw';

  // Trip with failureThreshold = 2.
  await assert.rejects(() => client.getTrend('tidal', 'NZ')); // count 1
  const tripped = await client.getTrend('tidal', 'NZ'); // count 2 → OPEN, last-good
  assert.deepEqual(tripped, good);
  assert.equal(fetchImpl.stub.calls, 3);

  // Cooldown elapses → HALF-OPEN trial, but upstream still down.
  clock.advance(10_000);
  const stillDown = await client.getTrend('tidal', 'NZ'); // trial fetch, throws
  assert.equal(fetchImpl.stub.calls, 4); // trial DID call fetchImpl
  assert.deepEqual(stillDown, good); // falls back to last-good

  // Trial failed → OPEN again with a fresh cooldown clock. An immediate call
  // must NOT fetch.
  const immediate = await client.getTrend('tidal', 'NZ');
  assert.deepEqual(immediate, good);
  assert.equal(fetchImpl.stub.calls, 4); // unchanged — cooldown restarted
});

test('a success in CLOSED state resets the failure counter (no premature trip)', async () => {
  const fetchImpl = makeFetchStub({ mode: 'ok', data: widget([10, 10]) });
  const cache = makeFakeCache();
  const client = createTrendsClient({
    fetchImpl,
    cache,
    now: makeClock().now,
    failureThreshold: 3,
  });

  // Two failures (count → 2), then a success resets the counter to 0.
  fetchImpl.stub.mode = 'throw';
  await assert.rejects(() => client.getTrend('geo', 'NZ')); // count 1
  await assert.rejects(() => client.getTrend('geo', 'NZ')); // count 2
  fetchImpl.stub.mode = 'ok';
  await client.getTrend('geo', 'NZ'); // success → reset

  // Two more failures should NOT trip (counter restarted from 0).
  fetchImpl.stub.mode = 'throw';
  await assert.rejects(() => client.getTrend('geo', 'NZ')); // count 1
  await assert.rejects(() => client.getTrend('geo', 'NZ')); // count 2 — still CLOSED
});
