/**
 * Growth — business_profiles service tests (Task 2)
 *
 * Pure-unit coverage for backend/lib/growth/profileService.js.
 * No live DB / network: a hand-rolled fake supabase client records the
 * builder/filter args so we can assert tenant isolation and the
 * seed-from-tenant + whitelist behaviour.
 *
 * Run: node --test backend/__tests__/growth.profile.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildSeedProfile, getOrSeedProfile, saveProfile } from '../lib/growth/profileService.js';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';

/**
 * Build a fake supabase client whose `.from(table)` returns a thenable
 * query builder. Each terminal call (`.single()` / `.maybeSingle()`) and
 * `await` resolves to the next queued result for that table. Every call
 * records its arguments on `calls` for assertions.
 *
 * @param {Record<string, Array<{data:any,error:any}>>} resultsByTable
 */
function makeFakeSupabase(resultsByTable = {}) {
  const calls = [];
  const queues = {};
  for (const [table, results] of Object.entries(resultsByTable)) {
    queues[table] = [...results];
  }

  function nextResult(table) {
    const q = queues[table];
    const r = (q && q.length ? q.shift() : null) || { data: null, error: null };
    return r;
  }

  function makeBuilder(table) {
    const builder = {
      table,
      eqArgs: [],
      _resolve() {
        return nextResult(table);
      },
    };
    const chain =
      (name) =>
      (...args) => {
        calls.push({ table, method: name, args });
        if (name === 'eq') builder.eqArgs.push(args);
        return builder;
      };
    builder.select = chain('select');
    builder.insert = chain('insert');
    builder.update = chain('update');
    builder.eq = chain('eq');
    builder.single = (...args) => {
      calls.push({ table, method: 'single', args });
      return Promise.resolve(builder._resolve());
    };
    builder.maybeSingle = (...args) => {
      calls.push({ table, method: 'maybeSingle', args });
      return Promise.resolve(builder._resolve());
    };
    // Allow `await builder` to resolve directly (no terminal selector).
    builder.then = (onF, onR) => Promise.resolve(builder._resolve()).then(onF, onR);
    return builder;
  }

  return {
    calls,
    from(table) {
      calls.push({ table, method: 'from', args: [table] });
      return makeBuilder(table);
    },
  };
}

// ---------------------------------------------------------------------------
// buildSeedProfile (pure)
// ---------------------------------------------------------------------------

test('buildSeedProfile derives defaults from a tenant row (city)', () => {
  const seed = buildSeedProfile({
    industry: 'green_energy_and_solar',
    geographic_focus: 'oceania',
    country: 'New Zealand',
    major_city: 'Wellington',
  });

  assert.deepEqual(seed.service_catalog, []);
  assert.deepEqual(seed.target_regions, [{ type: 'city', name: 'Wellington, New Zealand' }]);
  assert.deepEqual(seed.tracked_keywords, []);
  assert.deepEqual(seed.competitors, []);
  assert.equal(seed.settings.industry, 'green_energy_and_solar');
  assert.equal(seed.settings.geographic_focus, 'oceania');
  assert.equal(seed.settings.business_model, undefined);
});

test('buildSeedProfile with only country → country region', () => {
  const seed = buildSeedProfile({ country: 'Canada' });
  assert.deepEqual(seed.target_regions, [{ type: 'country', name: 'Canada' }]);
});

test('buildSeedProfile with neither city nor country → empty regions', () => {
  const seed = buildSeedProfile({ industry: 'consulting' });
  assert.deepEqual(seed.target_regions, []);
  assert.deepEqual(seed.settings, { industry: 'consulting' });
});

test('buildSeedProfile only includes truthy settings keys', () => {
  const seed = buildSeedProfile({ business_model: 'b2b' });
  assert.deepEqual(seed.settings, { business_model: 'b2b' });
});

test('buildSeedProfile needs both city AND country for a city region', () => {
  const seed = buildSeedProfile({ major_city: 'Wellington' });
  assert.deepEqual(seed.target_regions, []);
});

// ---------------------------------------------------------------------------
// getOrSeedProfile
// ---------------------------------------------------------------------------

test('getOrSeedProfile returns the existing row when present', async () => {
  const existing = { id: 'p1', tenant_id: TENANT_ID, service_catalog: [{ name: 'X' }] };
  const supabase = makeFakeSupabase({
    business_profiles: [{ data: existing, error: null }],
  });

  const row = await getOrSeedProfile(supabase, TENANT_ID);

  assert.deepEqual(row, existing);
  // Filtered by the passed tenantId, never seeded (no tenant fetch / insert).
  const eqCall = supabase.calls.find((c) => c.method === 'eq');
  assert.deepEqual(eqCall.args, ['tenant_id', TENANT_ID]);
  assert.ok(!supabase.calls.some((c) => c.table === 'tenant'));
  assert.ok(!supabase.calls.some((c) => c.method === 'insert'));
});

test('getOrSeedProfile seeds + inserts when no row exists', async () => {
  const tenantRow = {
    id: TENANT_ID,
    industry: 'green_energy_and_solar',
    geographic_focus: 'oceania',
    country: 'New Zealand',
    major_city: 'Wellington',
  };
  const inserted = {
    id: 'new1',
    tenant_id: TENANT_ID,
    service_catalog: [],
    target_regions: [{ type: 'city', name: 'Wellington, New Zealand' }],
    settings: { industry: 'green_energy_and_solar', geographic_focus: 'oceania' },
  };

  const supabase = makeFakeSupabase({
    business_profiles: [
      { data: null, error: null }, // initial lookup → none
      { data: inserted, error: null }, // insert ... returning
    ],
    tenant: [{ data: tenantRow, error: null }],
  });

  const row = await getOrSeedProfile(supabase, TENANT_ID);

  assert.deepEqual(row, inserted);

  // The tenant row was fetched by id for seeding.
  const tenantEq = supabase.calls.find((c) => c.table === 'tenant' && c.method === 'eq');
  assert.deepEqual(tenantEq.args, ['id', TENANT_ID]);

  // An insert happened with tenant_id stamped from the request context.
  const insertCall = supabase.calls.find((c) => c.method === 'insert');
  assert.ok(insertCall, 'insert should have been called');
  assert.equal(insertCall.args[0].tenant_id, TENANT_ID);
  assert.deepEqual(insertCall.args[0].target_regions, [
    { type: 'city', name: 'Wellington, New Zealand' },
  ]);
});

// ---------------------------------------------------------------------------
// saveProfile
// ---------------------------------------------------------------------------

test('saveProfile drops unknown keys and persists only the whitelist', async () => {
  const updated = { id: 'p1', tenant_id: TENANT_ID, tracked_keywords: [{ keyword: 'solar' }] };
  const supabase = makeFakeSupabase({
    business_profiles: [{ data: updated, error: null }],
  });

  const row = await saveProfile(supabase, TENANT_ID, {
    tracked_keywords: [{ keyword: 'solar' }],
    competitors: [{ name: 'Acme' }],
    tenant_id: 'spoofed-tenant', // must be dropped
    evil: 'haxor', // must be dropped
    id: 'spoofed-id', // must be dropped
  });

  assert.deepEqual(row, updated);

  const updateCall = supabase.calls.find((c) => c.method === 'update');
  assert.ok(updateCall, 'update should have been called');
  const patch = updateCall.args[0];
  assert.deepEqual(patch.tracked_keywords, [{ keyword: 'solar' }]);
  assert.deepEqual(patch.competitors, [{ name: 'Acme' }]);
  assert.ok(!('tenant_id' in patch), 'tenant_id must not be persisted from client');
  assert.ok(!('evil' in patch), 'unknown keys must be dropped');
  assert.ok(!('id' in patch), 'id must not be persisted from client');
});

test('saveProfile filters by the passed tenantId (isolation)', async () => {
  const supabase = makeFakeSupabase({
    business_profiles: [{ data: { id: 'p1', tenant_id: TENANT_ID }, error: null }],
  });

  await saveProfile(supabase, TENANT_ID, { settings: { tone: 'friendly' } });

  const eqCall = supabase.calls.find((c) => c.method === 'eq');
  assert.deepEqual(eqCall.args, ['tenant_id', TENANT_ID]);
});

test('saveProfile only sends whitelisted keys that are present in the patch', async () => {
  const supabase = makeFakeSupabase({
    business_profiles: [{ data: { id: 'p1' }, error: null }],
  });

  await saveProfile(supabase, TENANT_ID, { settings: { x: 1 } });

  const updateCall = supabase.calls.find((c) => c.method === 'update');
  assert.deepEqual(Object.keys(updateCall.args[0]), ['settings']);
});
