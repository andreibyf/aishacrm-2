import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMemoryProjectionStore,
  createMemoryProjectionStoreProvider,
} from '../../../../lib/finance/projections/projectionStore.memory.js';
import { ProjectionRuntimeError } from '../../../../lib/finance/projections/projectionRuntimeErrors.js';

// ── ProjectionStore ───────────────────────────────────────────────────────────

test('store supports get / set / delete / keys / clear', () => {
  const store = createMemoryProjectionStore();

  store.set('a', 1);
  store.set('b', 2);
  assert.equal(store.get('a'), 1);
  assert.deepEqual(store.keys().sort(), ['a', 'b']);

  store.delete('a');
  assert.equal(store.get('a'), undefined);
  assert.deepEqual(store.keys(), ['b']);

  store.clear();
  assert.deepEqual(store.keys(), []);
  assert.equal(store.get('b'), undefined);
});

// ── Provider: live stores ─────────────────────────────────────────────────────

test('getLiveStore returns a stable instance per (projection, tenant)', () => {
  const provider = createMemoryProjectionStoreProvider();

  const a1 = provider.getLiveStore('finance.projection.ledger', 'tenant-1');
  const a2 = provider.getLiveStore('finance.projection.ledger', 'tenant-1');
  assert.equal(a1, a2, 'same (projection, tenant) yields the same store instance');

  const other = provider.getLiveStore('finance.projection.ledger', 'tenant-2');
  assert.notEqual(a1, other, 'a different tenant yields a different store');
});

// ── Provider: shadow + atomic promotion ───────────────────────────────────────

test('createShadowStore yields an empty store isolated from the live store', () => {
  const provider = createMemoryProjectionStoreProvider();
  const live = provider.getLiveStore('proj', 'tenant-1');
  live.set('x', 'live-value');

  const shadow = provider.createShadowStore('proj', 'tenant-1');
  assert.deepEqual(shadow.keys(), [], 'shadow starts empty');

  shadow.set('x', 'shadow-value');
  assert.equal(live.get('x'), 'live-value', 'shadow writes never touch the live store');
});

test('promoteShadow atomically swaps the shadow store in as live', () => {
  const provider = createMemoryProjectionStoreProvider();
  const live = provider.getLiveStore('proj', 'tenant-1');
  live.set('x', 'old');

  const shadow = provider.createShadowStore('proj', 'tenant-1');
  shadow.set('x', 'rebuilt');

  provider.promoteShadow('proj', 'tenant-1');

  assert.equal(
    provider.getLiveStore('proj', 'tenant-1').get('x'),
    'rebuilt',
    'after promotion the live store reflects the shadow wholesale',
  );
});

test('promoteShadow throws a ProjectionRuntimeError when there is no shadow', () => {
  const provider = createMemoryProjectionStoreProvider();
  assert.throws(
    () => provider.promoteShadow('proj', 'tenant-1'),
    (err) => {
      assert.ok(err instanceof ProjectionRuntimeError);
      assert.equal(err.code, 'PROJECTION_RUNTIME_INVALID');
      return true;
    },
  );
});

test('discardShadow drops a pending shadow so it is never promoted', () => {
  const provider = createMemoryProjectionStoreProvider();
  provider.createShadowStore('proj', 'tenant-1');
  provider.discardShadow('proj', 'tenant-1');
  assert.throws(() => provider.promoteShadow('proj', 'tenant-1'), ProjectionRuntimeError);
});

// ── Provider: projection state persistence contract ───────────────────────────

test('getState returns null until a state is set', () => {
  const provider = createMemoryProjectionStoreProvider();
  assert.equal(provider.getState('proj', 'tenant-1'), null);
});

test('setState then getState round-trips the projection state', () => {
  const provider = createMemoryProjectionStoreProvider();
  const state = {
    state: 'idle',
    cursor: { created_at: '2026-05-21T00:00:00.000Z', id: 'e1' },
    last_rebuilt_at: null,
    schema_version: 1,
    is_degraded: false,
    error_count: 0,
  };
  provider.setState('proj', 'tenant-1', state);
  assert.deepEqual(provider.getState('proj', 'tenant-1'), state);
});

test('projection state is scoped per (projection, tenant)', () => {
  const provider = createMemoryProjectionStoreProvider();
  provider.setState('proj', 'tenant-1', { state: 'idle' });

  assert.equal(provider.getState('proj', 'tenant-2'), null, 'different tenant has its own state');
  assert.equal(
    provider.getState('other', 'tenant-1'),
    null,
    'different projection has its own state',
  );
});

test('setState stores a copy — later mutation of the input does not leak in', () => {
  const provider = createMemoryProjectionStoreProvider();
  const input = { state: 'idle', error_count: 0 };
  provider.setState('proj', 'tenant-1', input);
  input.error_count = 99;
  assert.equal(provider.getState('proj', 'tenant-1').error_count, 0);
});
