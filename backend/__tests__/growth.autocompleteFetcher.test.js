/**
 * Growth — autocompleteFetcher tests
 * Run: node --test backend/__tests__/growth.autocompleteFetcher.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fetchAutocomplete } from '../lib/growth/autocompleteFetcher.js';

function okResp(json) {
  return { ok: true, json: async () => json };
}

test('returns the classic suggest tuple on success', async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, opts });
    return okResp(['ac repair', ['ac repair near me', 'ac repair cost']]);
  };
  const out = await fetchAutocomplete('ac repair', 'Wellington', { fetchImpl });
  assert.deepEqual(out, ['ac repair', ['ac repair near me', 'ac repair cost']]);
  // hits the suggest endpoint with the query + a User-Agent
  assert.match(calls[0].url, /suggestqueries\.google\.com/);
  assert.match(calls[0].url, /q=ac\+repair/);
  assert.ok(calls[0].opts.headers['User-Agent']);
});

test('empty seed returns [seed, []] WITHOUT calling fetch', async () => {
  let called = 0;
  const fetchImpl = async () => {
    called += 1;
    return okResp(['x', ['y']]);
  };
  const out = await fetchAutocomplete('   ', 'NZ', { fetchImpl });
  assert.deepEqual(out, ['   ', []]);
  assert.equal(called, 0);
});

test('non-ok response is fail-soft → [seed, []]', async () => {
  const fetchImpl = async () => ({ ok: false, json: async () => ['x', ['y']] });
  const out = await fetchAutocomplete('plumbing', '', { fetchImpl });
  assert.deepEqual(out, ['plumbing', []]);
});

test('a thrown fetch is fail-soft → [seed, []]', async () => {
  const fetchImpl = async () => {
    throw new Error('network down');
  };
  const out = await fetchAutocomplete('roofing', '', { fetchImpl });
  assert.deepEqual(out, ['roofing', []]);
});

test('an unexpected shape is fail-soft → [seed, []]', async () => {
  const fetchImpl = async () => okResp({ not: 'an array' });
  const out = await fetchAutocomplete('hvac', '', { fetchImpl });
  assert.deepEqual(out, ['hvac', []]);
});
