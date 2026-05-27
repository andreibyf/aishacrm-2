/**
 * financePersistencePolicy.test.js
 *
 * Phase 2B-14 — Staging-safe RLS validation.
 *
 * Regression guard for the APPLICATION-LAYER no-hard-delete / append-only
 * posture of the Finance Ops event store. These assertions are testable
 * without a database; the DB-layer trigger guards (migration 173) are verified
 * separately on a dev Postgres — see
 * docs/architecture/finance/staging-rls-validation.md Section 5.
 *
 * What this locks in:
 *  - createFinanceEventStore() exposes exactly append/query/replay/getCount
 *    and NO mutation method (update/delete/clear/remove/truncate/upsert).
 *  - Appended events are frozen — they cannot be mutated after append.
 *  - replay() returns events in created_at ASC order.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import createFinanceEventStore from '../../../lib/finance/financeEventStore.js';

const TENANT_A = '00000000-0000-4000-8000-aaaaaaaaaaaa';

// The complete, intentional public interface of the event store.
const ALLOWED_METHODS = ['append', 'query', 'replay', 'getCount'];
// Mutation/removal methods that must NEVER exist — their presence would be a
// hard-delete / mutation escape hatch on the append-only store.
const FORBIDDEN_METHODS = [
  'update',
  'delete',
  'clear',
  'remove',
  'truncate',
  'upsert',
  'destroy',
  'reset',
];

test('event store exposes exactly the append-only interface', () => {
  const store = createFinanceEventStore();
  const keys = Object.keys(store).sort();

  assert.deepEqual(
    keys,
    [...ALLOWED_METHODS].sort(),
    'event store must expose exactly append/query/replay/getCount',
  );
  for (const method of ALLOWED_METHODS) {
    assert.equal(typeof store[method], 'function', `${method} must be a function`);
  }
});

test('event store exposes NO mutation or removal method', () => {
  const store = createFinanceEventStore();
  for (const method of FORBIDDEN_METHODS) {
    assert.equal(
      typeof store[method],
      'undefined',
      `event store must not expose a "${method}" method — append-only posture`,
    );
  }
});

test('appended events are frozen — cannot be mutated after append', () => {
  const store = createFinanceEventStore();
  const evt = store.append({
    tenant_id: TENANT_A,
    event_type: 'finance.test.persistence_policy',
    payload: { amount_cents: 100 },
  });

  assert.ok(Object.isFrozen(evt), 'appended event must be frozen');
  assert.throws(
    () => {
      'use strict';
      evt.event_type = 'tampered';
    },
    TypeError,
    'mutating a frozen event must throw in strict mode',
  );

  // The mutation must not have taken effect.
  assert.equal(evt.event_type, 'finance.test.persistence_policy');
});

test('replay() returns events in created_at ASC (oldest first) order', () => {
  const store = createFinanceEventStore();
  const COUNT = 12;
  const appended = [];
  for (let i = 0; i < COUNT; i++) {
    appended.push(
      store.append({
        tenant_id: TENANT_A,
        event_type: `finance.test.seq_${i}`,
      }),
    );
  }

  const replayed = store.replay(TENANT_A);
  assert.equal(replayed.length, COUNT, 'replay must return every appended event');

  // created_at must be non-decreasing across the whole stream.
  for (let i = 1; i < replayed.length; i++) {
    assert.ok(
      replayed[i - 1].created_at <= replayed[i].created_at,
      `created_at must be non-decreasing at index ${i}`,
    );
  }

  // Append order is preserved (deterministic tie-break for same-ms events).
  assert.deepEqual(
    replayed.map((e) => e.id),
    appended.map((e) => e.id),
    'replay must return events in append (created_at ASC) order',
  );
});
