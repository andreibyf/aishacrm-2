import test from 'node:test';
import assert from 'node:assert/strict';
import createFinanceEventStore, {
  FinanceEventStoreError,
} from '../../../lib/finance/financeEventStore.js';
import createFinanceDomainService from '../../../lib/finance/financeDomainService.js';

const TENANT_A = '00000000-0000-4000-8000-aaaaaaaaaaaa';
const TENANT_B = '00000000-0000-4000-8000-bbbbbbbbbbbb';

test('append assigns id and created_at', () => {
  const store = createFinanceEventStore();
  const evt = store.append({
    tenant_id: TENANT_A,
    event_type: 'finance.test.created',
  });

  assert.ok(typeof evt.id === 'string', 'id should be a string');
  assert.ok(evt.id.startsWith('evt_'), 'id should start with evt_');
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
  store.append({ tenant_id: TENANT_A, event_type: 'finance.invoice.draft_created', aggregate_id: 'invoice_1' });
  store.append({ tenant_id: TENANT_A, event_type: 'finance.invoice.draft_updated', aggregate_id: 'invoice_1' });
  store.append({ tenant_id: TENANT_A, event_type: 'finance.invoice.draft_created', aggregate_id: 'invoice_2' });

  const result = store.query({ tenant_id: TENANT_A, aggregate_id: 'invoice_1' });
  assert.equal(result.length, 2);
  assert.ok(
    result.every((e) => e.aggregate_id === 'invoice_1'),
    'all returned events should match aggregate_id filter',
  );
});

test('replay returns events oldest-first in append order', () => {
  const store = createFinanceEventStore();
  store.append({ tenant_id: TENANT_A, event_type: 'finance.test.first' });
  store.append({ tenant_id: TENANT_A, event_type: 'finance.test.second' });
  store.append({ tenant_id: TENANT_A, event_type: 'finance.test.third' });

  const replayed = store.replay(TENANT_A);
  assert.equal(replayed.length, 3);
  assert.equal(replayed[0].event_type, 'finance.test.first');
  assert.equal(replayed[1].event_type, 'finance.test.second');
  assert.equal(replayed[2].event_type, 'finance.test.third');
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
