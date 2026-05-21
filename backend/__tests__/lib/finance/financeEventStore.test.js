import test from 'node:test';
import assert from 'node:assert/strict';
import createFinanceEventStore, {
  FinanceEventStoreError,
} from '../../../lib/finance/financeEventStore.js';
import createFinanceDomainService from '../../../lib/finance/financeDomainService.js';

const TENANT_A = '00000000-0000-4000-8000-aaaaaaaaaaaa';
const TENANT_B = '00000000-0000-4000-8000-bbbbbbbbbbbb';

// M-1: IDs must be bare v4 UUIDs — no evt_ prefix — so they are directly
// insertable into uuid-typed Postgres columns.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('append assigns id and created_at', () => {
  const store = createFinanceEventStore();
  const evt = store.append({
    tenant_id: TENANT_A,
    event_type: 'finance.test.created',
  });

  // M-1: generated id must be a bare v4 UUID with no prefix
  assert.ok(typeof evt.id === 'string', 'id should be a string');
  assert.match(evt.id, UUID_PATTERN, 'id must be a valid v4 UUID (no prefix)');
  assert.ok(typeof evt.created_at === 'string', 'created_at should be a string');
  assert.ok(!isNaN(Date.parse(evt.created_at)), 'created_at should be a valid ISO timestamp');
});

test('append throws FinanceEventStoreError if tenant_id is missing', () => {
  const store = createFinanceEventStore();
  assert.throws(
    () => store.append({ event_type: 'finance.test.created' }),
    (err) => {
      assert.ok(err instanceof FinanceEventStoreError, 'should be FinanceEventStoreError');
      assert.equal(err.code, 'FINANCE_EVENT_STORE_INVALID');
      return true;
    },
  );
});

test('append throws FinanceEventStoreError if event_type is missing', () => {
  const store = createFinanceEventStore();
  assert.throws(
    () => store.append({ tenant_id: TENANT_A }),
    (err) => {
      assert.ok(err instanceof FinanceEventStoreError, 'should be FinanceEventStoreError');
      assert.equal(err.code, 'FINANCE_EVENT_STORE_INVALID');
      return true;
    },
  );
});

test('appended events are frozen — mutation attempt throws in strict mode', () => {
  const store = createFinanceEventStore();
  const evt = store.append({
    tenant_id: TENANT_A,
    event_type: 'finance.test.created',
  });

  assert.ok(Object.isFrozen(evt), 'event object should be frozen');
  assert.throws(
    () => {
      'use strict';
      evt.event_type = 'tampered';
    },
    TypeError,
    'mutating a frozen event should throw TypeError',
  );
});

test('query filters by tenant_id — tenant A events not visible to tenant B', () => {
  const store = createFinanceEventStore();
  store.append({ tenant_id: TENANT_A, event_type: 'finance.test.a' });
  store.append({ tenant_id: TENANT_A, event_type: 'finance.test.a2' });
  store.append({ tenant_id: TENANT_B, event_type: 'finance.test.b' });

  const resultA = store.query({ tenant_id: TENANT_A });
  const resultB = store.query({ tenant_id: TENANT_B });

  assert.equal(resultA.length, 2);
  assert.equal(resultB.length, 1);
  assert.ok(
    resultA.every((e) => e.tenant_id === TENANT_A),
    'all results for A should belong to A',
  );
  assert.ok(
    resultB.every((e) => e.tenant_id === TENANT_B),
    'all results for B should belong to B',
  );
});

test('query filters by event_type', () => {
  const store = createFinanceEventStore();
  store.append({ tenant_id: TENANT_A, event_type: 'finance.invoice.draft_created' });
  store.append({ tenant_id: TENANT_A, event_type: 'finance.journal.draft_created' });
  store.append({ tenant_id: TENANT_A, event_type: 'finance.invoice.draft_created' });

  const invoiceEvents = store.query({
    tenant_id: TENANT_A,
    event_type: 'finance.invoice.draft_created',
  });
  assert.equal(invoiceEvents.length, 2);
  assert.ok(
    invoiceEvents.every((e) => e.event_type === 'finance.invoice.draft_created'),
    'all returned events should match event_type filter',
  );
});

test('query filters by aggregate_id', () => {
  const store = createFinanceEventStore();
  store.append({
    tenant_id: TENANT_A,
    event_type: 'finance.invoice.draft_created',
    aggregate_id: 'invoice_1',
  });
  store.append({
    tenant_id: TENANT_A,
    event_type: 'finance.invoice.draft_updated',
    aggregate_id: 'invoice_1',
  });
  store.append({
    tenant_id: TENANT_A,
    event_type: 'finance.invoice.draft_created',
    aggregate_id: 'invoice_2',
  });

  const result = store.query({ tenant_id: TENANT_A, aggregate_id: 'invoice_1' });
  assert.equal(result.length, 2);
  assert.ok(
    result.every((e) => e.aggregate_id === 'invoice_1'),
    'all returned events should match aggregate_id filter',
  );
});

test('replay returns events sorted by created_at ASC (oldest first)', () => {
  const store = createFinanceEventStore();
  const e1 = store.append({ tenant_id: TENANT_A, event_type: 'finance.test.first' });
  const e2 = store.append({ tenant_id: TENANT_A, event_type: 'finance.test.second' });
  const e3 = store.append({ tenant_id: TENANT_A, event_type: 'finance.test.third' });

  const replayed = store.replay(TENANT_A);
  assert.equal(replayed.length, 3);

  // Verify created_at ordering is non-decreasing (oldest-first)
  assert.ok(
    replayed[0].created_at <= replayed[1].created_at,
    'first event created_at should be <= second',
  );
  assert.ok(
    replayed[1].created_at <= replayed[2].created_at,
    'second event created_at should be <= third',
  );

  // Verify the events present are the three we appended (by id)
  const ids = new Set(replayed.map((e) => e.id));
  assert.ok(ids.has(e1.id), 'replay should include event 1');
  assert.ok(ids.has(e2.id), 'replay should include event 2');
  assert.ok(ids.has(e3.id), 'replay should include event 3');
});

test('getCount returns correct count per tenant', () => {
  const store = createFinanceEventStore();
  store.append({ tenant_id: TENANT_A, event_type: 'finance.test.one' });
  store.append({ tenant_id: TENANT_A, event_type: 'finance.test.two' });
  store.append({ tenant_id: TENANT_B, event_type: 'finance.test.one' });

  assert.equal(store.getCount(TENANT_A), 2);
  assert.equal(store.getCount(TENANT_B), 1);
  assert.equal(store.getCount('00000000-0000-4000-8000-cccccccccccc'), 0);
});

test('integration: createFinanceDomainService emits events through store after createDraftInvoice', () => {
  const eventStore = createFinanceEventStore();
  const service = createFinanceDomainService({ eventStore });

  const result = service.createDraftInvoice({
    tenantId: TENANT_A,
    actor: { id: 'user-1', type: 'human' },
    payload: {
      customer_id: 'cust-1',
      currency: 'usd',
      subtotal_cents: 10000,
      total_cents: 10000,
    },
  });

  assert.ok(result.invoice, 'should return invoice');

  const events = eventStore.query({
    tenant_id: TENANT_A,
    event_type: 'finance.invoice.draft_created',
  });

  assert.equal(events.length, 1, 'should have exactly one draft_created event');
  assert.equal(events[0].event_type, 'finance.invoice.draft_created');
  assert.equal(events[0].aggregate_type, 'invoice');
  assert.equal(events[0].aggregate_id, result.invoice.id);
  assert.equal(events[0].tenant_id, TENANT_A);
});

test('integration: getEventStore() returns the internal event store', () => {
  const service = createFinanceDomainService();

  service.createDraftInvoice({
    tenantId: TENANT_A,
    actor: { id: 'user-1', type: 'human' },
    payload: { currency: 'usd', subtotal_cents: 5000, total_cents: 5000 },
  });

  const store = service.getEventStore();
  assert.ok(store, 'getEventStore() should return a store');
  assert.ok(typeof store.query === 'function', 'store should have query method');
  assert.ok(typeof store.replay === 'function', 'store should have replay method');
  assert.ok(typeof store.getCount === 'function', 'store should have getCount method');

  const count = store.getCount(TENANT_A);
  assert.ok(count >= 1, 'store should have at least one event after createDraftInvoice');
});

// G1 — caller-supplied id and causation chain integrity

test('append honors caller-supplied id — stored event carries the same id', () => {
  const store = createFinanceEventStore();
  // M-1: caller-supplied IDs must be bare UUIDs — no prefix
  const callerSuppliedId = '00000000-0000-4000-8000-aaaaaaaaaaaa';

  const stored = store.append({
    id: callerSuppliedId,
    tenant_id: TENANT_A,
    event_type: 'finance.test.with_supplied_id',
  });

  assert.equal(stored.id, callerSuppliedId, 'stored event must carry the caller-supplied id');

  // Verify the event is retrievable by query (not a phantom)
  const found = store.query({ tenant_id: TENANT_A });
  assert.equal(found.length, 1);
  assert.equal(found[0].id, callerSuppliedId);
});

test('append generates id when none supplied — format is a bare v4 UUID', () => {
  const store = createFinanceEventStore();

  const stored = store.append({
    tenant_id: TENANT_A,
    event_type: 'finance.test.generated_id',
  });

  // M-1: no prefix — must be a valid v4 UUID directly
  assert.match(stored.id, UUID_PATTERN, 'generated id must be a valid v4 UUID (no evt_ prefix)');
});

test('causation chain: stored event id is stable and usable as causation_id for next event', () => {
  const store = createFinanceEventStore();

  // Simulate: envelope builder pre-assigns id, then caller uses that same id for causation
  const parentId = '00000000-0000-4000-8000-bbbbbbbbbbbb';
  const parent = store.append({
    id: parentId,
    tenant_id: TENANT_A,
    event_type: 'finance.journal.draft_created',
  });

  const child = store.append({
    tenant_id: TENANT_A,
    event_type: 'finance.approval.requested',
    causation_id: parent.id, // must equal parentId, not some generated id
  });

  assert.equal(parent.id, parentId, 'parent stored id must match the caller-supplied id');
  assert.equal(
    child.causation_id,
    parentId,
    'child causation_id must point to the actual stored parent id',
  );

  // Traversal: find all events caused by parent
  const caused = store.query({ tenant_id: TENANT_A }).filter((e) => e.causation_id === parentId);
  assert.equal(caused.length, 1, 'exactly one event should cite the parent as its cause');
  assert.equal(caused[0].event_type, 'finance.approval.requested');
});

test('replay still orders by created_at ASC after caller-supplied ids are honored', () => {
  const store = createFinanceEventStore();

  const e1 = store.append({
    id: '00000000-0000-4000-8001-000000000001',
    tenant_id: TENANT_A,
    event_type: 'finance.test.first',
  });
  const e2 = store.append({
    id: '00000000-0000-4000-8001-000000000002',
    tenant_id: TENANT_A,
    event_type: 'finance.test.second',
  });
  const e3 = store.append({
    id: '00000000-0000-4000-8001-000000000003',
    tenant_id: TENANT_A,
    event_type: 'finance.test.third',
  });

  const replayed = store.replay(TENANT_A);
  assert.equal(replayed.length, 3);

  // created_at ordering must be non-decreasing
  assert.ok(replayed[0].created_at <= replayed[1].created_at, 'first created_at <= second');
  assert.ok(replayed[1].created_at <= replayed[2].created_at, 'second created_at <= third');

  // All three events must be present
  const ids = new Set(replayed.map((e) => e.id));
  assert.ok(ids.has(e1.id));
  assert.ok(ids.has(e2.id));
  assert.ok(ids.has(e3.id));
});

// T-11 — CF-5: deterministic tie-break for events with identical created_at timestamps
test('T-11: replay is deterministic when events share identical created_at — _seq preserves insertion order', () => {
  const store = createFinanceEventStore();

  // Append many events in rapid succession. In fast test environments multiple
  // events will share the same millisecond timestamp. The _seq tie-breaker must
  // ensure replay() returns them in insertion order regardless.
  const COUNT = 20;
  const appended = [];
  for (let i = 0; i < COUNT; i++) {
    appended.push(
      store.append({
        tenant_id: TENANT_A,
        event_type: `finance.test.burst_${i}`,
      }),
    );
  }

  const replayed = store.replay(TENANT_A);
  assert.equal(replayed.length, COUNT, 'all appended events must appear in replay');

  // Verify non-decreasing created_at across all pairs
  for (let i = 1; i < replayed.length; i++) {
    assert.ok(
      replayed[i - 1].created_at <= replayed[i].created_at,
      `created_at must be non-decreasing at index ${i}`,
    );
  }

  // For any pair that shares the same timestamp, insertion order (_seq) must be preserved.
  // We verify this by checking that the replayed order matches the appended order.
  const appendedIds = appended.map((e) => e.id);
  const replayedIds = replayed.map((e) => e.id);
  assert.deepEqual(
    replayedIds,
    appendedIds,
    'replay must return events in insertion order (tie-broken by _seq)',
  );
});

// A-3 — Idempotency posture: append-always (no dedup on caller-supplied id)
test('A-3: append-always — two calls with the same id produce two records (no dedup)', () => {
  const store = createFinanceEventStore();
  const SHARED_ID = '00000000-0000-4000-8000-eeeeeeeeeeee';

  store.append({
    id: SHARED_ID,
    tenant_id: TENANT_A,
    event_type: 'finance.test.first',
  });

  store.append({
    id: SHARED_ID,
    tenant_id: TENANT_A,
    event_type: 'finance.test.second',
  });

  const results = store.query({ tenant_id: TENANT_A });
  assert.equal(
    results.length,
    2,
    'append-always: two appends with the same id must produce two records',
  );
  assert.ok(
    results.every((e) => e.id === SHARED_ID),
    'both records carry the caller-supplied id',
  );
  assert.notEqual(
    results[0].event_type,
    results[1].event_type,
    'both records are independently stored with their own event_type',
  );
});
