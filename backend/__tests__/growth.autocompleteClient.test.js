/**
 * Growth — autocompleteClient tests (Task 4)
 *
 * Pure-unit coverage for backend/lib/growth/autocompleteClient.js. No live
 * network, no real Redis: fetchImpl is a controllable stub and the cache is a
 * Map wrapped with async get/set.
 *
 * Run: node --test backend/__tests__/growth.autocompleteClient.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createAutocompleteClient,
  normalizeSuggestions,
} from '../lib/growth/autocompleteClient.js';

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

/** A Map wrapped with the async get/set interface the client expects. */
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

/**
 * A fetchImpl stub that returns canned data per seed. Records calls and tracks
 * concurrent in-flight invocations (peak). When `gate` is provided, every call
 * awaits the shared gate promise so multiple calls can be made to overlap.
 */
function makeFetchStub({ bySeed = {}, fallback, gate } = {}) {
  const stub = { calls: 0, inFlight: 0, peak: 0, seeds: [] };
  const fn = async (seed, region) => {
    stub.calls += 1;
    stub.seeds.push(seed);
    stub.inFlight += 1;
    if (stub.inFlight > stub.peak) stub.peak = stub.inFlight;
    try {
      if (gate) await gate.promise;
      return Object.prototype.hasOwnProperty.call(bySeed, seed) ? bySeed[seed] : fallback;
    } finally {
      stub.inFlight -= 1;
    }
  };
  fn.stub = stub;
  return fn;
}

/** A deferred promise the test can resolve on demand to release gated calls. */
function makeGate() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, release: () => resolve() };
}

/** Build the classic Google-suggest 2-tuple shape. */
function classic(seed, suggestions) {
  return [seed, suggestions];
}

// ---------------------------------------------------------------------------
// normalizeSuggestions (pure)
// ---------------------------------------------------------------------------

test('normalizeSuggestions maps the classic [seed,[...]] shape to keyword objects', () => {
  const out = normalizeSuggestions(
    'solar',
    classic('solar', ['solar panels', 'solar battery', 'solar nz']),
  );

  assert.deepEqual(out, [
    { keyword: 'solar panels', source: 'autocomplete', seed: 'solar' },
    { keyword: 'solar battery', source: 'autocomplete', seed: 'solar' },
    { keyword: 'solar nz', source: 'autocomplete', seed: 'solar' },
  ]);
});

test('normalizeSuggestions dedupes case-insensitively and drops the seed + empties', () => {
  const out = normalizeSuggestions(
    'Solar',
    classic('Solar', [
      'Solar Panels',
      'solar panels', // dup of above (case-insensitive) → dropped
      'solar', // equals seed (case-insensitive) → dropped
      '   SOLAR  ', // equals seed (trimmed, case-insensitive) → dropped
      '   ', // whitespace only → dropped
      '', // empty → dropped
      42, // non-string → dropped
      'solar battery',
    ]),
  );

  assert.deepEqual(out, [
    { keyword: 'Solar Panels', source: 'autocomplete', seed: 'Solar' },
    { keyword: 'solar battery', source: 'autocomplete', seed: 'Solar' },
  ]);
});

// ---------------------------------------------------------------------------
// expand — shapes + caching
// ---------------------------------------------------------------------------

test('expand normalizes the classic shape into {keyword,source,seed} objects', async () => {
  const fetchImpl = makeFetchStub({
    bySeed: { solar: classic('solar', ['solar panels', 'solar battery']) },
  });
  const cache = makeFakeCache();
  const client = createAutocompleteClient({ fetchImpl, cache });

  const out = await client.expand('solar', 'NZ');

  assert.deepEqual(out, [
    { keyword: 'solar panels', source: 'autocomplete', seed: 'solar' },
    { keyword: 'solar battery', source: 'autocomplete', seed: 'solar' },
  ]);
  assert.equal(fetchImpl.stub.calls, 1);
});

test('expand handles the bare-array and {suggestions} shapes', async () => {
  const bareFetch = makeFetchStub({ bySeed: { ev: ['ev chargers', 'ev cars'] } });
  const bareClient = createAutocompleteClient({
    fetchImpl: bareFetch,
    cache: makeFakeCache(),
  });
  const bare = await bareClient.expand('ev', 'AU');
  assert.deepEqual(bare, [
    { keyword: 'ev chargers', source: 'autocomplete', seed: 'ev' },
    { keyword: 'ev cars', source: 'autocomplete', seed: 'ev' },
  ]);

  const objFetch = makeFetchStub({
    bySeed: { heat: { suggestions: ['heat pumps', 'heat pump nz'] } },
  });
  const objClient = createAutocompleteClient({
    fetchImpl: objFetch,
    cache: makeFakeCache(),
  });
  const obj = await objClient.expand('heat', 'NZ');
  assert.deepEqual(obj, [
    { keyword: 'heat pumps', source: 'autocomplete', seed: 'heat' },
    { keyword: 'heat pump nz', source: 'autocomplete', seed: 'heat' },
  ]);
});

test('expand dedupes case-insensitively and drops the seed itself + empties', async () => {
  const fetchImpl = makeFetchStub({
    bySeed: {
      Solar: classic('Solar', ['Solar Panels', 'solar panels', 'solar', '', '  ']),
    },
  });
  const client = createAutocompleteClient({ fetchImpl, cache: makeFakeCache() });

  const out = await client.expand('Solar', 'NZ');
  assert.deepEqual(out, [{ keyword: 'Solar Panels', source: 'autocomplete', seed: 'Solar' }]);
});

test('expand caches: a second call for the same seed/region does NOT call fetchImpl again', async () => {
  const fetchImpl = makeFetchStub({
    bySeed: { solar: classic('solar', ['solar panels']) },
  });
  const cache = makeFakeCache();
  const client = createAutocompleteClient({ fetchImpl, cache });

  const first = await client.expand('solar', 'NZ');
  assert.equal(fetchImpl.stub.calls, 1);

  // Cached value is retrievable under the documented key.
  assert.deepEqual(await cache.get('autocomplete:solar:NZ'), first);

  const second = await client.expand('solar', 'NZ');
  assert.deepEqual(second, first);
  assert.equal(fetchImpl.stub.calls, 1); // unchanged — served from cache

  // A different region is a different key → fetchImpl IS called again.
  await client.expand('solar', 'AU');
  assert.equal(fetchImpl.stub.calls, 2);
});

// ---------------------------------------------------------------------------
// expandMany — concurrency + cross-seed dedupe
// ---------------------------------------------------------------------------

test('expandMany respects the concurrency cap (peak in-flight never exceeds limit)', async () => {
  const gate = makeGate();
  const fetchImpl = makeFetchStub({
    fallback: classic('x', []),
    gate,
  });
  const cache = makeFakeCache();
  const client = createAutocompleteClient({ fetchImpl, cache });

  const seeds = ['a', 'b', 'c', 'd', 'e'];
  const promise = client.expandMany(seeds, 'NZ', { concurrency: 2 });

  // Let the microtask queue settle so the initially-launched runners have
  // started their (gated) fetch and incremented inFlight. Each runner needs a
  // couple of microtask hops (await store.get → await fetchImpl) before it is
  // parked on the gate, so spin the queue generously. The gate is still closed,
  // so no call can complete — inFlight only rises, capped by `run()`'s loop.
  for (let i = 0; i < 20; i += 1) {
    await Promise.resolve();
  }

  // Only `concurrency` (2) fetches may be in-flight at once.
  assert.equal(fetchImpl.stub.inFlight, 2, 'exactly 2 should be in-flight while gated');
  assert.ok(
    fetchImpl.stub.peak <= 2,
    `peak in-flight ${fetchImpl.stub.peak} exceeded concurrency 2`,
  );

  // Release the gate so every gated call resolves and the queue drains.
  gate.release();
  await promise;

  // Every seed was eventually fetched, but never more than 2 concurrently.
  assert.equal(fetchImpl.stub.calls, seeds.length);
  assert.ok(fetchImpl.stub.peak <= 2);
});

test('expandMany dedupes across seeds (overlapping suggestion yields one entry)', async () => {
  const fetchImpl = makeFetchStub({
    bySeed: {
      solar: classic('solar', ['solar panels', 'Renewable Energy']),
      wind: classic('wind', ['wind turbines', 'renewable energy']), // dup (case)
    },
  });
  const client = createAutocompleteClient({ fetchImpl, cache: makeFakeCache() });

  const out = await client.expandMany(['solar', 'wind'], 'NZ', { concurrency: 2 });

  // First occurrence wins: "Renewable Energy" (from solar) is kept; the
  // case-variant from wind is dropped.
  assert.deepEqual(out, [
    { keyword: 'solar panels', source: 'autocomplete', seed: 'solar' },
    { keyword: 'Renewable Energy', source: 'autocomplete', seed: 'solar' },
    { keyword: 'wind turbines', source: 'autocomplete', seed: 'wind' },
  ]);

  const keywords = out.map((o) => o.keyword.toLowerCase());
  assert.equal(new Set(keywords).size, keywords.length); // no dupes
});
