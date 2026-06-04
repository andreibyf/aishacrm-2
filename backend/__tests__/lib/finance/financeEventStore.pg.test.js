import test from 'node:test';
import assert from 'node:assert/strict';
import createFinancePgEventStore from '../../../lib/finance/financeEventStore.pg.js';
import { FinanceEventStoreError } from '../../../lib/finance/financeEventStore.js';

const TENANT_A = '00000000-0000-4000-8000-aaaaaaaaaaaa';
const TENANT_B = '00000000-0000-4000-8000-bbbbbbbbbbbb';

// M-1: IDs must be bare v4 UUIDs — no evt_ prefix — so they are directly
// insertable into the uuid-typed finance.audit_events.id column.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * Faithful in-memory test double for a `pg.Pool`.
 *
 * It is NOT the unit under test — it stands in for an unavailable Postgres
 * instance (no live DB in CI). It models finance.audit_events positionally,
 * the way Postgres does: INSERT columns are parsed from the SQL, params are
 * mapped by position, SELECT honours the adapter's ORDER BY / LIMIT, and
 * created_at is assigned by the "DB" (simulating `default now()`).
 *
 * Tests assert on the adapter's behaviour (returned events, thrown errors,
 * replay order) — never on this double's internals.
 */
function createFakePool() {
  const pool = {
    rows: [],
    calls: [],
    // When set, the next query() rejects with this error (then clears).
    failNext: null,
    // When set, INSERT uses this as the DB-assigned created_at.
    nowValue: null,
    async query(text, params = []) {
      pool.calls.push({ text, params });
      if (pool.failNext) {
        const err = pool.failNext;
        pool.failNext = null;
        throw err;
      }
      const lower = String(text).toLowerCase();

      if (lower.includes('insert into')) {
        const colMatch = String(text).match(/insert\s+into\s+[^(]+\(([^)]+)\)/i);
        const cols = colMatch[1].split(',').map((c) => c.trim());
        const row = {};
        cols.forEach((col, i) => {
          row[col] = params[i] === undefined ? null : params[i];
        });
        // jsonb columns: Postgres stores/returns objects.
        row.payload = normalizeJson(row.payload);
        row.policy_decision = normalizeJson(row.policy_decision);
        // created_at is DB-assigned (default now()) unless the column was
        // explicitly inserted (which the adapter must never do).
        if (!('created_at' in row)) {
          row.created_at = pool.nowValue || new Date().toISOString();
        }
        // finance.audit_events.id is a PRIMARY KEY. Reject duplicates the way
        // Postgres does (SQLSTATE 23505) so the adapter's conflict handling is
        // exercised against realistic database behaviour.
        if (pool.rows.some((r) => r.id === row.id)) {
          const err = new Error(
            'duplicate key value violates unique constraint "audit_events_pkey"',
          );
          err.code = '23505';
          throw err;
        }
        // The DB assigns a monotonic `seq` (identity) in append order — the
        // adapter never inserts it. Simulate so replay/query can tie-break by seq.
        row.seq = pool.seqCounter = (pool.seqCounter || 0) + 1;
        pool.rows.push(row);
        return { rows: [{ ...row }], rowCount: 1 };
      }

      if (lower.includes('count(')) {
        const n = pool.rows.filter((r) => r.tenant_id === params[0]).length;
        return { rows: [{ count: n }], rowCount: 1 };
      }

      // SELECT — tenant scope is always $1; optional equality filters follow.
      let result = pool.rows.filter((r) => r.tenant_id === params[0]);
      let pIdx = 1;
      for (const col of ['event_type', 'aggregate_type', 'aggregate_id']) {
        if (new RegExp(`${col}\\s*=\\s*\\$`).test(lower)) {
          result = result.filter((r) => r[col] === params[pIdx]);
          pIdx += 1;
        }
      }
      // Only sort when the adapter actually asks for the contract ordering.
      if (lower.includes('order by created_at asc, seq asc')) {
        result = result.slice().sort(compareByCreatedAtThenSeq);
      }
      const limitMatch = lower.match(/limit \$(\d+)/);
      if (limitMatch) {
        const limitVal = params[Number(limitMatch[1]) - 1];
        if (limitVal != null) result = result.slice(0, limitVal);
      }
      return { rows: result.map((r) => ({ ...r })), rowCount: result.length };
    },
  };
  return pool;
}

function normalizeJson(value) {
  if (value == null) return {};
  if (typeof value === 'string') return JSON.parse(value);
  return value;
}

function compareByCreatedAtThenSeq(a, b) {
  if (a.created_at < b.created_at) return -1;
  if (a.created_at > b.created_at) return 1;
  // Append-order tie-break on the monotonic DB seq (NOT the random id UUID).
  return (a.seq ?? 0) - (b.seq ?? 0);
}

function validEvent(overrides = {}) {
  return {
    tenant_id: TENANT_A,
    event_type: 'finance.journal.posted',
    aggregate_type: 'journal_entry',
    aggregate_id: '00000000-0000-4000-8000-00000000a001',
    ...overrides,
  };
}

// ── Factory ───────────────────────────────────────────────────────────────────

test('factory throws FinanceEventStoreError when no pool is supplied', () => {
  assert.throws(
    () => createFinancePgEventStore(),
    (err) => {
      assert.ok(err instanceof FinanceEventStoreError);
      assert.equal(err.code, 'FINANCE_EVENT_STORE_INVALID');
      return true;
    },
  );
});

// ── Acceptance: append inserts exactly one immutable event row ─────────────────

test('append inserts exactly one event row', async () => {
  const pool = createFakePool();
  const store = createFinancePgEventStore({ pool });

  const event = await store.append(validEvent());

  const insertCalls = pool.calls.filter((c) => /insert into/i.test(c.text));
  assert.equal(insertCalls.length, 1, 'exactly one INSERT must be issued');
  assert.equal(pool.rows.length, 1, 'exactly one row must be persisted');
  assert.equal(event.event_type, 'finance.journal.posted');
  assert.equal(event.tenant_id, TENANT_A);
});

test('append returns a frozen (immutable) event object', async () => {
  const pool = createFakePool();
  const store = createFinancePgEventStore({ pool });

  const event = await store.append(validEvent());

  assert.ok(Object.isFrozen(event), 'returned event must be frozen');
  assert.throws(
    () => {
      'use strict';
      event.event_type = 'tampered';
    },
    TypeError,
    'mutating a frozen event must throw',
  );
});

// ── Acceptance: caller-supplied id is preserved ───────────────────────────────

test('append preserves a caller-supplied id', async () => {
  const pool = createFakePool();
  const store = createFinancePgEventStore({ pool });
  const callerId = '00000000-0000-4000-8000-cccccccccccc';

  const event = await store.append(validEvent({ id: callerId }));

  assert.equal(event.id, callerId, 'caller-supplied id must be preserved');
  assert.equal(pool.rows[0].id, callerId, 'persisted row must carry the caller-supplied id');
});

// ── Acceptance: generated id is a bare UUID ───────────────────────────────────

test('append generates a bare v4 UUID when no id is supplied', async () => {
  const pool = createFakePool();
  const store = createFinancePgEventStore({ pool });

  const event = await store.append(validEvent());

  assert.match(event.id, UUID_PATTERN, 'generated id must be a bare v4 UUID (no prefix)');
});

// ── Acceptance: created_at is DB-assigned ─────────────────────────────────────

test('append does not supply created_at — it is DB-assigned', async () => {
  const pool = createFakePool();
  pool.nowValue = '2026-05-20T08:00:00.000Z';
  const store = createFinancePgEventStore({ pool });

  const event = await store.append(validEvent({ created_at: '1999-01-01T00:00:00.000Z' }));

  const insertCall = pool.calls.find((c) => /insert into/i.test(c.text));
  assert.ok(
    !/created_at/i.test(insertCall.text),
    'INSERT must not name created_at — the DB default now() is the ordering source of truth',
  );
  assert.equal(
    event.created_at,
    '2026-05-20T08:00:00.000Z',
    'created_at must come from the DB, not from caller input',
  );
});

// ── Acceptance: replay orders by created_at ASC, then id ASC ───────────────────

test('replay returns events ordered by created_at ASC', async () => {
  const pool = createFakePool();
  const store = createFinancePgEventStore({ pool });

  // Append out of chronological order to prove the adapter sorts.
  pool.nowValue = '2026-05-20T12:00:00.000Z';
  await store.append(validEvent({ event_type: 'finance.journal.posted' }));
  pool.nowValue = '2026-05-20T10:00:00.000Z';
  await store.append(validEvent({ event_type: 'finance.journal.draft_created' }));
  pool.nowValue = '2026-05-20T11:00:00.000Z';
  await store.append(validEvent({ event_type: 'finance.journal.post_requested' }));

  const replayed = await store.replay(TENANT_A);

  assert.equal(replayed.length, 3);
  assert.equal(replayed[0].created_at, '2026-05-20T10:00:00.000Z');
  assert.equal(replayed[1].created_at, '2026-05-20T11:00:00.000Z');
  assert.equal(replayed[2].created_at, '2026-05-20T12:00:00.000Z');
});

test('replay tie-breaks identical created_at by APPEND ORDER (seq), not id (Codex PR #633)', async () => {
  const pool = createFakePool();
  const store = createFinancePgEventStore({ pool });

  // All three share created_at. The ids are appended in DESCENDING order, so an
  // `id ASC` tie-break would REVERSE the append order — proving the seq tie-break
  // preserves the order a command actually wrote (e.g. draft before approval).
  pool.nowValue = '2026-05-20T12:00:00.000Z';
  await store.append(validEvent({ id: '00000000-0000-4000-8000-00000000000c' }));
  await store.append(validEvent({ id: '00000000-0000-4000-8000-00000000000b' }));
  await store.append(validEvent({ id: '00000000-0000-4000-8000-00000000000a' }));

  const replayed = await store.replay(TENANT_A);

  assert.deepEqual(
    replayed.map((e) => e.id),
    [
      '00000000-0000-4000-8000-00000000000c',
      '00000000-0000-4000-8000-00000000000b',
      '00000000-0000-4000-8000-00000000000a',
    ],
    'tied timestamps must replay in APPEND order (seq), not id ASC',
  );
  // And the SELECT must order by seq, not id.
  const replaySql = pool.calls.find((c) => /select .* order by/i.test(c.text));
  assert.match(replaySql.text.toLowerCase(), /order by created_at asc, seq asc/);
});

test('replay is tenant-scoped — tenant A events are not visible to tenant B', async () => {
  const pool = createFakePool();
  const store = createFinancePgEventStore({ pool });

  await store.append(validEvent({ tenant_id: TENANT_A }));
  await store.append(validEvent({ tenant_id: TENANT_A }));
  await store.append(validEvent({ tenant_id: TENANT_B }));

  assert.equal((await store.replay(TENANT_A)).length, 2);
  assert.equal((await store.replay(TENANT_B)).length, 1);
});

// ── Acceptance: tenant_id is required ─────────────────────────────────────────

test('append rejects a missing tenant_id', async () => {
  const store = createFinancePgEventStore({ pool: createFakePool() });
  await assert.rejects(store.append({ event_type: 'finance.journal.posted' }), (err) => {
    assert.ok(err instanceof FinanceEventStoreError);
    assert.equal(err.code, 'FINANCE_EVENT_STORE_INVALID');
    return true;
  });
});

test('query, replay and getCount reject a missing tenant_id', async () => {
  const store = createFinancePgEventStore({ pool: createFakePool() });
  for (const call of [() => store.query({}), () => store.replay(), () => store.getCount()]) {
    await assert.rejects(call(), (err) => {
      assert.ok(err instanceof FinanceEventStoreError);
      assert.equal(err.code, 'FINANCE_EVENT_STORE_INVALID');
      return true;
    });
  }
});

// ── Acceptance: only canonical finance.* event_type values are accepted ───────

test('append rejects a missing event_type', async () => {
  const store = createFinancePgEventStore({ pool: createFakePool() });
  await assert.rejects(store.append({ tenant_id: TENANT_A }), (err) => {
    assert.ok(err instanceof FinanceEventStoreError);
    assert.equal(err.code, 'FINANCE_EVENT_STORE_INVALID');
    return true;
  });
});

test('append rejects an event_type outside the finance.* taxonomy', async () => {
  const store = createFinancePgEventStore({ pool: createFakePool() });
  await assert.rejects(store.append(validEvent({ event_type: 'journal.posted' })), (err) => {
    assert.ok(err instanceof FinanceEventStoreError);
    assert.equal(err.code, 'FINANCE_EVENT_STORE_INVALID');
    return true;
  });
});

// ── Acceptance: command names are rejected as event_type ──────────────────────

test('append rejects a command name used as event_type', async () => {
  const store = createFinancePgEventStore({ pool: createFakePool() });
  await assert.rejects(
    store.append(validEvent({ event_type: 'PostJournalEntryCommand' })),
    (err) => {
      assert.ok(err instanceof FinanceEventStoreError);
      assert.equal(err.code, 'FINANCE_EVENT_STORE_INVALID');
      assert.match(err.message, /command/i, 'error must call out the command-name mistake');
      return true;
    },
  );
});

// ── Acceptance: append is insert-only; no update/delete/upsert API exists ──────

test('store exposes only append, query, replay, getCount — no mutation API', () => {
  const store = createFinancePgEventStore({ pool: createFakePool() });

  assert.deepEqual(Object.keys(store).sort(), ['append', 'getCount', 'query', 'replay']);
  for (const forbidden of ['update', 'delete', 'upsert', 'clear', 'remove', 'truncate']) {
    assert.equal(store[forbidden], undefined, `store must not expose ${forbidden}()`);
  }
});

test('append issues only INSERT statements — never UPDATE/DELETE/UPSERT', async () => {
  const pool = createFakePool();
  const store = createFinancePgEventStore({ pool });

  await store.append(validEvent());

  for (const call of pool.calls) {
    assert.doesNotMatch(call.text, /\bupdate\b|\bdelete\b|on conflict|upsert/i);
  }
});

// ── Acceptance: the event store does not deduplicate duplicate ids ────────────

test('append does not deduplicate — a duplicate id is surfaced, never silently merged', async () => {
  const pool = createFakePool();
  const store = createFinancePgEventStore({ pool });
  const sharedId = '00000000-0000-4000-8000-eeeeeeeeeeee';

  const first = await store.append(
    validEvent({ id: sharedId, event_type: 'finance.journal.draft_created' }),
  );

  // finance.audit_events.id is a PRIMARY KEY. A second append with the same id
  // is rejected by the database — the store does not deduplicate, upsert, or
  // swallow it. The conflict is surfaced for the domain layer to handle.
  await assert.rejects(
    store.append(validEvent({ id: sharedId, event_type: 'finance.journal.posted' })),
    (err) => {
      assert.ok(err instanceof FinanceEventStoreError);
      assert.equal(err.code, 'FINANCE_EVENT_STORE_DUPLICATE_EVENT_ID');
      return true;
    },
  );

  // The original event is intact — nothing was overwritten or merged.
  assert.equal(pool.rows.length, 1);
  assert.equal(pool.rows[0].id, sharedId);
  assert.equal(pool.rows[0].event_type, 'finance.journal.draft_created');
  assert.equal(first.event_type, 'finance.journal.draft_created');
});

// ── DB error handling ─────────────────────────────────────────────────────────

test('append surfaces a DB failure as a FinanceEventStoreError (no silent retry)', async () => {
  const pool = createFakePool();
  pool.failNext = new Error('connection terminated unexpectedly');
  const store = createFinancePgEventStore({ pool });

  await assert.rejects(store.append(validEvent()), (err) => {
    assert.ok(err instanceof FinanceEventStoreError);
    assert.equal(err.code, 'FINANCE_EVENT_STORE_DB_ERROR');
    return true;
  });
  assert.equal(pool.rows.length, 0, 'a failed append must not persist a row');
});

// ── query / getCount basics ───────────────────────────────────────────────────

test('query returns tenant-scoped events and getCount counts them', async () => {
  const pool = createFakePool();
  const store = createFinancePgEventStore({ pool });

  await store.append(validEvent({ event_type: 'finance.invoice.draft_created' }));
  await store.append(validEvent({ event_type: 'finance.journal.posted' }));
  await store.append(validEvent({ tenant_id: TENANT_B, event_type: 'finance.journal.posted' }));

  const tenantAEvents = await store.query({ tenant_id: TENANT_A });
  assert.equal(tenantAEvents.length, 2);
  assert.ok(tenantAEvents.every((e) => e.tenant_id === TENANT_A));
  assert.equal(await store.getCount(TENANT_A), 2);
  assert.equal(await store.getCount(TENANT_B), 1);
});

test('query filters by event_type', async () => {
  const pool = createFakePool();
  const store = createFinancePgEventStore({ pool });

  await store.append(validEvent({ event_type: 'finance.invoice.draft_created' }));
  await store.append(validEvent({ event_type: 'finance.journal.posted' }));
  await store.append(validEvent({ event_type: 'finance.invoice.draft_created' }));

  const invoiceEvents = await store.query({
    tenant_id: TENANT_A,
    event_type: 'finance.invoice.draft_created',
  });
  assert.equal(invoiceEvents.length, 2);
  assert.ok(invoiceEvents.every((e) => e.event_type === 'finance.invoice.draft_created'));
});
