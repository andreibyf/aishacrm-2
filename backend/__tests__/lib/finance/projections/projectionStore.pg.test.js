import test from 'node:test';
import assert from 'node:assert/strict';
import createPgProjectionStoreProvider, {
  FinanceProjectionStoreError,
} from '../../../../lib/finance/projections/projectionStore.pg.js';
import { createProjectionRunner } from '../../../../lib/finance/projections/projectionRunner.js';
import { createMemoryProjectionStoreProvider } from '../../../../lib/finance/projections/projectionStore.memory.js';
import {
  createLedgerProjectionWorker,
  LEDGER_PROJECTION_NAME,
} from '../../../../lib/finance/projections/ledgerProjection.js';

const TENANT_A = '00000000-0000-4000-8000-aaaaaaaaaaaa';
const TENANT_B = '00000000-0000-4000-8000-bbbbbbbbbbbb';

/**
 * Faithful in-memory test double for a `pg.Pool`.
 *
 * Models finance.projection_state positionally, the way Postgres does:
 *  - SELECT returns the row matching (projection_name, tenant_id) or empty.
 *  - INSERT ... ON CONFLICT (projection_name, tenant_id) DO UPDATE upserts a
 *    single row keyed by the PK. updated_at is trigger-maintained (the
 *    adapter must not name it in the column list).
 *  - When `failNext` is set, the next query rejects with that error and the
 *    fake clears the flag.
 */
function createFakePool() {
  const pool = {
    rows: new Map(), // `${projection_name}::${tenant_id}` -> row
    calls: [],
    failNext: null,
    async query(text, params = []) {
      pool.calls.push({ text, params });
      if (pool.failNext) {
        const err = pool.failNext;
        pool.failNext = null;
        throw err;
      }
      const lower = String(text).toLowerCase();

      if (lower.includes('insert into') && lower.includes('on conflict')) {
        const colMatch = String(text).match(/insert\s+into\s+[^(]+\(([^)]+)\)/i);
        const cols = colMatch[1].split(',').map((c) => c.trim());
        const row = {};
        cols.forEach((col, i) => {
          row[col] = params[i] === undefined ? null : params[i];
        });
        // jsonb columns: Postgres stores/returns objects, not strings.
        if ('state_json' in row) row.state_json = normalizeJson(row.state_json);
        // The trigger stamps updated_at on every UPDATE; for INSERT, the
        // column default `now()` fills it. The adapter must never name it.
        row.updated_at = new Date().toISOString();
        pool.rows.set(`${row.projection_name}::${row.tenant_id}`, row);
        return { rows: [{ ...row }], rowCount: 1 };
      }

      if (lower.startsWith('select') || lower.includes('select ')) {
        // The adapter's two SELECT shapes:
        //   1. SELECT state_json FROM ... WHERE projection_name=$1 AND tenant_id=$2
        //   2. SELECT <metadata cols> FROM ... WHERE projection_name=$1 AND tenant_id=$2
        const row = pool.rows.get(`${params[0]}::${params[1]}`);
        if (!row) return { rows: [], rowCount: 0 };
        return { rows: [{ ...row }], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    },
  };
  return pool;
}

function normalizeJson(value) {
  if (value == null) return {};
  if (typeof value === 'string') return JSON.parse(value);
  return value;
}

function seedRow(pool, projectionName, tenantId, overrides = {}) {
  pool.rows.set(`${projectionName}::${tenantId}`, {
    projection_name: projectionName,
    tenant_id: tenantId,
    schema_version: 1,
    cursor_event_id: null,
    cursor_created_at: null,
    state_json: {},
    status: 'idle',
    degraded_reason: null,
    last_rebuilt_at: null,
    updated_at: new Date().toISOString(),
    ...overrides,
  });
}

// ── Factory guard ─────────────────────────────────────────────────────────────

test('factory throws FinanceProjectionStoreError when no pool is supplied', () => {
  assert.throws(
    () => createPgProjectionStoreProvider(),
    (err) => {
      assert.ok(err instanceof FinanceProjectionStoreError);
      assert.equal(err.code, 'FINANCE_PROJECTION_STORE_INVALID');
      return true;
    },
  );
});

// ── Spec 1: getLiveStore hydrates a synchronous snapshot from state_json ──────

test('getLiveStore hydrates a sync store from state_json (get/set/delete/keys/clear)', async () => {
  const pool = createFakePool();
  seedRow(pool, 'proj', TENANT_A, {
    state_json: { a: 1, nested: { count: 7 } },
  });
  const provider = createPgProjectionStoreProvider({ pool });

  const store = await provider.getLiveStore('proj', TENANT_A);

  // Synchronous mutations (constraint 3).
  assert.equal(store.get('a'), 1);
  assert.deepEqual(store.get('nested'), { count: 7 });
  assert.deepEqual(store.keys().sort(), ['a', 'nested']);

  store.set('b', 2);
  assert.equal(store.get('b'), 2);

  store.delete('a');
  assert.equal(store.get('a'), undefined);
  assert.deepEqual(store.keys().sort(), ['b', 'nested']);

  store.clear();
  assert.deepEqual(store.keys(), []);
});

test('getLiveStore returns an empty store when no row exists yet', async () => {
  const pool = createFakePool();
  const provider = createPgProjectionStoreProvider({ pool });

  const store = await provider.getLiveStore('proj', TENANT_A);

  assert.deepEqual(store.keys(), [], 'no row → empty snapshot');
  store.set('seeded', true);
  assert.equal(store.get('seeded'), true);
});

test('getLiveStore returns a stable cached instance per (projection, tenant)', async () => {
  const pool = createFakePool();
  const provider = createPgProjectionStoreProvider({ pool });

  const s1 = await provider.getLiveStore('proj', TENANT_A);
  const s2 = await provider.getLiveStore('proj', TENANT_A);
  assert.equal(s1, s2, 'same (projection, tenant) yields the same cached store');

  const other = await provider.getLiveStore('proj', TENANT_B);
  assert.notEqual(s1, other, 'a different tenant yields a different store');
});

// ── Spec 2: setState persists state_json + all metadata in ONE statement ──────

test('setState persists state_json AND all metadata columns in ONE upsert', async () => {
  const pool = createFakePool();
  const provider = createPgProjectionStoreProvider({ pool });

  // Seed the live snapshot in-memory so we can confirm it gets serialized.
  const store = await provider.getLiveStore('proj', TENANT_A);
  store.set('x', 42);

  pool.calls.length = 0; // clear hydrate SELECT

  await provider.setState('proj', TENANT_A, {
    state: 'idle',
    cursor: { created_at: '2026-05-22T10:00:00.000Z', id: 'e-99' },
    last_rebuilt_at: '2026-05-22T09:00:00.000Z',
    schema_version: 3,
    is_degraded: false,
    error_count: 0,
    degraded_reason: null,
  });

  // Exactly one statement — never two.
  assert.equal(pool.calls.length, 1, 'setState must issue exactly one DB statement');
  const call = pool.calls[0];
  assert.match(
    call.text,
    /insert into\s+finance\.projection_state/i,
    'must use INSERT ... ON CONFLICT upsert',
  );
  assert.match(call.text, /on conflict\s*\(projection_name,\s*tenant_id\)/i);
  // updated_at is trigger-maintained — the adapter must never name it.
  assert.doesNotMatch(call.text, /\bupdated_at\b/i);

  // Row reflects state_json (from the live snapshot) AND every metadata column.
  const row = pool.rows.get(`proj::${TENANT_A}`);
  assert.deepEqual(row.state_json, { x: 42 }, 'state_json carries the serialized snapshot');
  assert.equal(row.schema_version, 3);
  assert.equal(row.cursor_event_id, 'e-99');
  assert.equal(row.cursor_created_at, '2026-05-22T10:00:00.000Z');
  assert.equal(row.status, 'idle');
  assert.equal(row.degraded_reason, null);
  assert.equal(row.last_rebuilt_at, '2026-05-22T09:00:00.000Z');
});

test('setState writes null cursor columns when state.cursor is null', async () => {
  const pool = createFakePool();
  const provider = createPgProjectionStoreProvider({ pool });
  await provider.getLiveStore('proj', TENANT_A);

  await provider.setState('proj', TENANT_A, {
    state: 'idle',
    cursor: null,
    last_rebuilt_at: null,
    schema_version: 1,
    is_degraded: false,
    error_count: 0,
  });

  const row = pool.rows.get(`proj::${TENANT_A}`);
  assert.equal(row.cursor_event_id, null, 'null cursor → null cursor_event_id');
  assert.equal(row.cursor_created_at, null, 'null cursor → null cursor_created_at');
});

test('setState maps a degraded state and degraded_reason', async () => {
  const pool = createFakePool();
  const provider = createPgProjectionStoreProvider({ pool });
  await provider.getLiveStore('proj', TENANT_A);

  await provider.setState('proj', TENANT_A, {
    state: 'degraded',
    cursor: null,
    last_rebuilt_at: null,
    schema_version: 1,
    is_degraded: true,
    error_count: 4,
    degraded_reason: 'handler exhausted retries',
  });

  const row = pool.rows.get(`proj::${TENANT_A}`);
  assert.equal(row.status, 'degraded');
  assert.equal(row.degraded_reason, 'handler exhausted retries');
});

// ── Spec 3: getState reads back into the runtime ProjectionState shape ────────

test('getState returns null when no row exists', async () => {
  const pool = createFakePool();
  const provider = createPgProjectionStoreProvider({ pool });

  const result = await provider.getState('proj', TENANT_A);

  assert.equal(result, null);
});

test('getState reads the row back into the ProjectionState runtime shape', async () => {
  const pool = createFakePool();
  seedRow(pool, 'proj', TENANT_A, {
    schema_version: 2,
    cursor_event_id: 'e-42',
    cursor_created_at: '2026-05-22T10:00:00.000Z',
    status: 'idle',
    degraded_reason: null,
    last_rebuilt_at: '2026-05-22T09:00:00.000Z',
  });
  const provider = createPgProjectionStoreProvider({ pool });

  const state = await provider.getState('proj', TENANT_A);

  assert.deepEqual(state, {
    state: 'idle',
    cursor: { created_at: '2026-05-22T10:00:00.000Z', id: 'e-42' },
    last_rebuilt_at: '2026-05-22T09:00:00.000Z',
    schema_version: 2,
    is_degraded: false,
    error_count: 0, // not persisted; operational telemetry only — design §3 note
  });
});

test('getState maps a degraded row to is_degraded=true', async () => {
  const pool = createFakePool();
  seedRow(pool, 'proj', TENANT_A, {
    status: 'degraded',
    degraded_reason: 'replay failed',
  });
  const provider = createPgProjectionStoreProvider({ pool });

  const state = await provider.getState('proj', TENANT_A);

  assert.equal(state.state, 'degraded');
  assert.equal(state.is_degraded, true);
});

test('getState returns cursor=null when the cursor columns are null', async () => {
  const pool = createFakePool();
  seedRow(pool, 'proj', TENANT_A, {
    cursor_event_id: null,
    cursor_created_at: null,
  });
  const provider = createPgProjectionStoreProvider({ pool });

  const state = await provider.getState('proj', TENANT_A);

  assert.equal(state.cursor, null);
});

// ── Spec 4: shadow store isolation, atomic promotion, discard ────────────────

test('createShadowStore returns an empty store isolated from the live store', async () => {
  const pool = createFakePool();
  seedRow(pool, 'proj', TENANT_A, { state_json: { live: 'value' } });
  const provider = createPgProjectionStoreProvider({ pool });

  const live = await provider.getLiveStore('proj', TENANT_A);
  const shadow = await provider.createShadowStore('proj', TENANT_A);

  assert.deepEqual(shadow.keys(), [], 'shadow starts empty');
  shadow.set('rebuilt', 'shadow-value');
  assert.equal(
    live.get('rebuilt'),
    undefined,
    'shadow writes never touch the live store before promotion',
  );
  assert.equal(live.get('live'), 'value', 'live store remains its pre-replay self');
});

test('promoteShadow persists the shadow as the new live state_json in ONE UPDATE', async () => {
  const pool = createFakePool();
  seedRow(pool, 'proj', TENANT_A, { state_json: { stale: true } });
  const provider = createPgProjectionStoreProvider({ pool });

  await provider.getLiveStore('proj', TENANT_A); // hydrate cache
  const shadow = await provider.createShadowStore('proj', TENANT_A);
  shadow.set('a', 1);
  shadow.set('b', 2);

  pool.calls.length = 0;
  await provider.promoteShadow('proj', TENANT_A);

  // Exactly one DB write.
  assert.equal(pool.calls.length, 1, 'promoteShadow must issue exactly one DB statement');
  assert.match(pool.calls[0].text, /insert into\s+finance\.projection_state/i);
  assert.match(pool.calls[0].text, /on conflict/i);

  const row = pool.rows.get(`proj::${TENANT_A}`);
  assert.deepEqual(row.state_json, { a: 1, b: 2 }, 'persisted state_json is the serialized shadow');

  // The cached live store now reflects the shadow.
  const newLive = await provider.getLiveStore('proj', TENANT_A);
  assert.deepEqual(newLive.keys().sort(), ['a', 'b']);
  assert.equal(newLive.get('a'), 1);
});

test('discardShadow drops the pending shadow and writes nothing', async () => {
  const pool = createFakePool();
  const provider = createPgProjectionStoreProvider({ pool });

  await provider.getLiveStore('proj', TENANT_A);
  await provider.createShadowStore('proj', TENANT_A);

  pool.calls.length = 0;
  await provider.discardShadow('proj', TENANT_A);

  assert.equal(pool.calls.length, 0, 'discardShadow must not touch the DB');

  // No shadow left to promote.
  await assert.rejects(provider.promoteShadow('proj', TENANT_A), (err) => {
    assert.ok(err instanceof FinanceProjectionStoreError);
    assert.equal(err.code, 'FINANCE_PROJECTION_STORE_INVALID');
    return true;
  });
});

// ── Spec 5: no partial persistence on a failed DB query ──────────────────────

test('setState surfaces a DB failure as FinanceProjectionStoreError; no partial write', async () => {
  const pool = createFakePool();
  const provider = createPgProjectionStoreProvider({ pool });
  await provider.getLiveStore('proj', TENANT_A);

  pool.failNext = new Error('connection terminated unexpectedly');
  pool.calls.length = 0;

  await assert.rejects(
    provider.setState('proj', TENANT_A, {
      state: 'idle',
      cursor: null,
      last_rebuilt_at: null,
      schema_version: 1,
      is_degraded: false,
      error_count: 0,
    }),
    (err) => {
      assert.ok(err instanceof FinanceProjectionStoreError);
      assert.equal(err.code, 'FINANCE_PROJECTION_STORE_DB_ERROR');
      return true;
    },
  );

  // The failed query was the ONLY statement attempted — no follow-up retry,
  // no second/partial statement, no fallback INSERT, no row was written.
  assert.equal(pool.calls.length, 1, 'failed setState must not issue a second statement');
  assert.equal(pool.rows.size, 0, 'failed setState must persist nothing');
});

test('promoteShadow surfaces a DB failure as FinanceProjectionStoreError; no partial write', async () => {
  const pool = createFakePool();
  seedRow(pool, 'proj', TENANT_A, { state_json: { original: true } });
  const provider = createPgProjectionStoreProvider({ pool });

  await provider.getLiveStore('proj', TENANT_A);
  const shadow = await provider.createShadowStore('proj', TENANT_A);
  shadow.set('rebuilt', 'value');

  pool.failNext = new Error('write timeout');
  pool.calls.length = 0;

  await assert.rejects(provider.promoteShadow('proj', TENANT_A), (err) => {
    assert.ok(err instanceof FinanceProjectionStoreError);
    assert.equal(err.code, 'FINANCE_PROJECTION_STORE_DB_ERROR');
    return true;
  });

  assert.equal(pool.calls.length, 1, 'failed promoteShadow must not issue a second statement');
  // The seeded row is untouched (still { original: true }).
  const row = pool.rows.get(`proj::${TENANT_A}`);
  assert.deepEqual(row.state_json, { original: true });
});

test('getState surfaces a DB failure as FinanceProjectionStoreError', async () => {
  const pool = createFakePool();
  const provider = createPgProjectionStoreProvider({ pool });

  pool.failNext = new Error('boom');
  await assert.rejects(provider.getState('proj', TENANT_A), (err) => {
    assert.ok(err instanceof FinanceProjectionStoreError);
    assert.equal(err.code, 'FINANCE_PROJECTION_STORE_DB_ERROR');
    return true;
  });
});

test('getLiveStore surfaces a DB failure as FinanceProjectionStoreError', async () => {
  const pool = createFakePool();
  const provider = createPgProjectionStoreProvider({ pool });

  pool.failNext = new Error('boom');
  await assert.rejects(provider.getLiveStore('proj', TENANT_A), (err) => {
    assert.ok(err instanceof FinanceProjectionStoreError);
    assert.equal(err.code, 'FINANCE_PROJECTION_STORE_DB_ERROR');
    return true;
  });
});

// ── Spec 6: parity — pg provider drives the runner identically to memory ─────

function line({ name, classification, debit = 0, credit = 0 }) {
  return {
    account_id: null,
    account_name: name,
    classification,
    debit_cents: debit,
    credit_cents: credit,
  };
}

function journalPosted(id, lines, { tenant = TENANT_A, createdAt } = {}) {
  return {
    id,
    tenant_id: tenant,
    event_type: 'finance.journal.posted',
    created_at: createdAt || `2026-05-22T00:00:0${id.slice(-1)}.000Z`,
    aggregate_type: 'journal_entry',
    aggregate_id: `je-${id}`,
    payload: {
      journal_entry: {
        id: `je-${id}`,
        lines,
      },
    },
  };
}

function balancedPosting(id, amount, opts) {
  return journalPosted(
    id,
    [
      line({ name: 'Cash', classification: 'Asset', debit: amount }),
      line({ name: 'Revenue', classification: 'Revenue', credit: amount }),
    ],
    opts,
  );
}

function fakeEventStore(events) {
  return {
    async replay(tenantId) {
      return events.filter((e) => e.tenant_id === tenantId);
    },
  };
}

async function ledgerFrom(provider, worker, tenantId) {
  const store = await provider.getLiveStore(LEDGER_PROJECTION_NAME, tenantId);
  return worker.getProjection(tenantId, {}, store);
}

test('pg provider drives a full runner dispatch+replay identically to memory (parity)', async () => {
  const events = [
    balancedPosting('e1', 1000),
    balancedPosting('e2', 250),
    balancedPosting('e3', 750),
  ];

  // — Memory provider baseline —
  const memProvider = createMemoryProjectionStoreProvider();
  const memRunner = createProjectionRunner({
    eventStore: fakeEventStore(events),
    storeProvider: memProvider,
    retryBackoffMs: 0,
  });
  const memWorker = createLedgerProjectionWorker();
  memRunner.register(memWorker);
  for (const event of events) {
    await memRunner.dispatch(event);
  }
  const memLedgerAfterDispatch = await ledgerFrom(memProvider, memWorker, TENANT_A);
  await memRunner.replay(LEDGER_PROJECTION_NAME, TENANT_A);
  const memLedgerAfterReplay = await ledgerFrom(memProvider, memWorker, TENANT_A);

  // — Pg provider —
  const pool = createFakePool();
  const pgProvider = createPgProjectionStoreProvider({ pool });
  const pgRunner = createProjectionRunner({
    eventStore: fakeEventStore(events),
    storeProvider: pgProvider,
    retryBackoffMs: 0,
  });
  const pgWorker = createLedgerProjectionWorker();
  pgRunner.register(pgWorker);
  for (const event of events) {
    await pgRunner.dispatch(event);
  }
  const pgLedgerAfterDispatch = await ledgerFrom(pgProvider, pgWorker, TENANT_A);
  await pgRunner.replay(LEDGER_PROJECTION_NAME, TENANT_A);
  const pgLedgerAfterReplay = await ledgerFrom(pgProvider, pgWorker, TENANT_A);

  // Parity — both providers produce the same ledger after both dispatch and
  // replay, proving in-memory behavioral semantics are preserved end-to-end.
  assert.deepEqual(pgLedgerAfterDispatch, memLedgerAfterDispatch, 'dispatch parity');
  assert.deepEqual(pgLedgerAfterReplay, memLedgerAfterReplay, 'replay parity');

  // The pg provider also persisted the row.
  const row = pool.rows.get(`${LEDGER_PROJECTION_NAME}::${TENANT_A}`);
  assert.ok(row, 'pg provider must have persisted projection_state for the ledger');
  assert.equal(row.status, 'idle');
  assert.equal(row.cursor_event_id, 'e3', 'cursor advances to the last applied event');
});
