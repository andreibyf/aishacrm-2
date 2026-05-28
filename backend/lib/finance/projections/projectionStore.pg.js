/**
 * projectionStore.pg.js
 *
 * Phase 3 Slice 1 — Postgres-backed ProjectionStoreProvider for the Finance
 * Ops Projection Runtime. Backing table: `finance.projection_state`
 * (migration 174). One row per (projection_name, tenant_id) holds the
 * serialized read model (`state_json`) plus the runtime ProjectionState
 * metadata (cursor, status, schema_version, last_rebuilt_at, degraded_reason).
 *
 * This adapter implements the same provider interface as
 * `projectionStore.memory.js` — `getLiveStore / createShadowStore /
 * promoteShadow / discardShadow / getState / setState` — but hydrated from /
 * persisted to Postgres. The provider methods are async (DB I/O); the
 * snapshot store handed back from `getLiveStore` / `createShadowStore` is
 * **synchronous** (operates on an in-memory `Map`), preserving
 * `projectionRunner.js`'s `createBufferedStore` / `buffer.commit()` semantics
 * exactly (design §6 constraint 3).
 *
 * Error-wrapping choice. We introduce `FinanceProjectionStoreError` mirroring
 * `FinanceEventStoreError` rather than reuse `ProjectionRuntimeError`. The
 * existing `ProjectionRuntimeError` taxonomy is for runtime/orchestration
 * errors (INVALID, NOT_FOUND); a DB persistence failure is a distinct
 * concern with its own taxonomy (INVALID, DB_ERROR). Mirroring the
 * established `financeEventStore.pg.js` pattern keeps the two persistence
 * adapters consistent. One exception: `promoteShadow` with no pending shadow
 * remains a `FinanceProjectionStoreError(INVALID)` so the provider raises a
 * single error type to its caller.
 *
 * No partial persistence (design §6 constraint 4). `setState` and
 * `promoteShadow` each issue exactly ONE parametrized statement; on
 * `pool.query` rejection they rethrow wrapped — never catch-and-continue,
 * never fall back to a second statement. The shared private `persistRow`
 * helper guarantees both methods use the same all-or-nothing INSERT ... ON
 * CONFLICT upsert against the (projection_name, tenant_id) primary key.
 */

const PROJECTION_STATE_TABLE = 'finance.projection_state';

// INSERT column order. `updated_at` is intentionally absent — migration 174
// installs a BEFORE UPDATE trigger that stamps it on every mutation, and the
// column default `now()` fills it on INSERT. Naming it here would fight the
// trigger and risk drift.
const UPSERT_COLUMNS = [
  'projection_name',
  'tenant_id',
  'schema_version',
  'cursor_event_id',
  'cursor_created_at',
  'state_json',
  'status',
  'degraded_reason',
  'last_rebuilt_at',
];

// Columns to UPDATE on conflict. The PK (projection_name, tenant_id) must
// never be reassigned by the upsert.
const ON_CONFLICT_UPDATE_COLUMNS = UPSERT_COLUMNS.filter(
  (c) => c !== 'projection_name' && c !== 'tenant_id',
);

export class FinanceProjectionStoreError extends Error {
  constructor(message, code = 'FINANCE_PROJECTION_STORE_INVALID') {
    super(message);
    this.name = 'FinanceProjectionStoreError';
    this.code = code;
  }
}

function invalid(message) {
  return new FinanceProjectionStoreError(message, 'FINANCE_PROJECTION_STORE_INVALID');
}

function dbError(operation, cause) {
  return new FinanceProjectionStoreError(
    `Failed to ${operation} finance projection state: ${cause.message}`,
    'FINANCE_PROJECTION_STORE_DB_ERROR',
  );
}

/** A synchronous Map-backed snapshot store. Identical surface to the
 *  in-memory ProjectionStore (`projectionStore.memory.js`'s
 *  `createMemoryProjectionStore`). The runner's `createBufferedStore` and
 *  `buffer.commit()` operate on this surface — they must remain synchronous
 *  (design §6 constraint 3).
 */
function createSnapshotStore(seed = {}) {
  const data = new Map(Object.entries(seed));
  return {
    get(key) {
      return data.get(key);
    },
    set(key, value) {
      data.set(key, value);
    },
    delete(key) {
      data.delete(key);
    },
    keys() {
      return [...data.keys()];
    },
    clear() {
      data.clear();
    },
    /** Serialize the snapshot to a plain object for JSON persistence. */
    _toJson() {
      const out = {};
      for (const [key, value] of data) out[key] = value;
      return out;
    },
  };
}

/**
 * Hydrate a snapshot from a `state_json` jsonb value. Postgres returns jsonb
 * as a parsed object; we tolerate a string just in case the driver was
 * configured otherwise.
 */
function hydrateSnapshot(stateJson) {
  if (stateJson == null) return createSnapshotStore({});
  if (typeof stateJson === 'string') {
    try {
      return createSnapshotStore(JSON.parse(stateJson));
    } catch {
      // Malformed jsonb shouldn't happen with the jsonb column type; if it
      // does, start from empty rather than crash — the runner's replay path
      // can rebuild from the event stream.
      return createSnapshotStore({});
    }
  }
  if (typeof stateJson === 'object') return createSnapshotStore(stateJson);
  return createSnapshotStore({});
}

/**
 * Map a row from `finance.projection_state` into the runtime ProjectionState
 * shape used by `projectionRunner.js`. `error_count` is operational telemetry
 * only (design §3 note) — it is not a column and defaults to 0 on every read.
 */
function rowToProjectionState(row) {
  const cursor =
    row.cursor_event_id == null && row.cursor_created_at == null
      ? null
      : { created_at: row.cursor_created_at, id: row.cursor_event_id };
  return {
    state: row.status,
    cursor,
    last_rebuilt_at: row.last_rebuilt_at,
    schema_version: row.schema_version,
    is_degraded: row.status === 'degraded',
    error_count: 0,
  };
}

/**
 * @param {object} deps
 * @param {{ query: Function }} deps.pool  A pg Pool (or anything exposing query()).
 */
export function createPgProjectionStoreProvider({ pool } = {}) {
  if (!pool || typeof pool.query !== 'function') {
    throw invalid('createPgProjectionStoreProvider requires a pg pool with a query() method');
  }

  // In-memory caches mirroring the structure of
  // `createMemoryProjectionStoreProvider`. Live snapshot stores are hydrated
  // from `state_json` on first access and persisted back on every setState /
  // promoteShadow call. Shadow snapshots are held pending promotion (never
  // persisted until promoteShadow runs). lastState caches the last metadata
  // we persisted so `promoteShadow` can issue exactly one statement (no
  // pre-read SELECT) and `setState` does not need to re-read either —
  // critical for the no-partial-persistence guarantee (design §6 #4).
  const liveStores = new Map(); // `${projection}::${tenant}` -> snapshot store
  const shadowStores = new Map(); // `${projection}::${tenant}` -> snapshot store
  const lastState = new Map(); // `${projection}::${tenant}` -> last persisted ProjectionState

  // Per-(projection, tenant) hydration locks. Two concurrent getLiveStore
  // calls for the same key must see the SAME instance (the memory provider
  // returns a stable cached instance). Without a lock, two callers could
  // both miss the cache, both issue a SELECT, and the second would overwrite
  // the first — handing two different store references to two callers and
  // breaking buffered-isolation semantics. The lock serializes hydration so
  // the cache fills exactly once.
  const hydrating = new Map(); // key -> Promise<snapshot store>

  const keyOf = (projectionName, tenantId) => `${projectionName}::${tenantId}`;

  async function getLiveStore(projectionName, tenantId) {
    const key = keyOf(projectionName, tenantId);
    if (liveStores.has(key)) return liveStores.get(key);
    if (hydrating.has(key)) return hydrating.get(key);

    // Hydrate state_json AND the metadata in one SELECT so subsequent
    // `promoteShadow` calls have the last-persisted metadata cached and
    // can write in a single statement (no pre-read SELECT in the hot path).
    const text =
      `select state_json, schema_version, cursor_event_id, cursor_created_at, ` +
      `status, degraded_reason, last_rebuilt_at ` +
      `from ${PROJECTION_STATE_TABLE} ` +
      `where projection_name = $1 and tenant_id = $2`;
    const hydration = (async () => {
      let result;
      try {
        result = await pool.query(text, [projectionName, tenantId]);
      } catch (err) {
        throw dbError('hydrate', err);
      }
      const row = result.rows.length ? result.rows[0] : null;
      const stateJson = row ? row.state_json : null;
      const store = hydrateSnapshot(stateJson);
      liveStores.set(key, store);
      if (row) lastState.set(key, rowToProjectionState(row));
      return store;
    })();

    hydrating.set(key, hydration);
    try {
      return await hydration;
    } finally {
      hydrating.delete(key);
    }
  }

  async function createShadowStore(projectionName, tenantId) {
    const shadow = createSnapshotStore({});
    shadowStores.set(keyOf(projectionName, tenantId), shadow);
    return shadow;
  }

  /**
   * The shared write path. INSERT ... ON CONFLICT ... DO UPDATE — one
   * parametrized statement per call. On failure, rethrow wrapped: no
   * fallback, no retry, no second statement. This is the no-partial-
   * persistence guarantee (design §6 constraint 4).
   *
   * The caller has already updated the in-memory state we will write:
   *  - `setState` updates the metadata (via the `state` argument) and reads
   *    state_json from the cached live snapshot.
   *  - `promoteShadow` updates state_json (from the shadow) and reads
   *    metadata from the prior persisted row (we re-fetch to avoid drift).
   *
   * To keep the contract simple, the caller passes the snapshot to persist
   * and the metadata to persist explicitly.
   */
  async function persistRow(projectionName, tenantId, snapshotStore, state) {
    const cursorEventId = state.cursor ? state.cursor.id : null;
    const cursorCreatedAt = state.cursor ? state.cursor.created_at : null;

    const values = [
      projectionName,
      tenantId,
      state.schema_version ?? 1,
      cursorEventId,
      cursorCreatedAt,
      // jsonb: pg accepts either a JSON string or a plain object; stringify
      // for explicit control over serialization.
      JSON.stringify(snapshotStore._toJson()),
      state.state ?? 'idle',
      state.degraded_reason ?? null,
      state.last_rebuilt_at ?? null,
    ];

    const placeholders = UPSERT_COLUMNS.map((_, i) => `$${i + 1}`).join(', ');
    const setClause = ON_CONFLICT_UPDATE_COLUMNS.map((c) => `${c} = excluded.${c}`).join(', ');
    const text =
      `insert into ${PROJECTION_STATE_TABLE} (${UPSERT_COLUMNS.join(', ')}) ` +
      `values (${placeholders}) ` +
      `on conflict (projection_name, tenant_id) do update set ${setClause}`;

    try {
      await pool.query(text, values);
    } catch (err) {
      // Rethrow wrapped — never catch-and-continue, never attempt a fallback
      // INSERT or UPDATE. The row remains at its last consistent state.
      throw dbError('persist', err);
    }
  }

  // Known runtime concern (operator-visible): the runner sets status='replaying'
  // before promoteShadow and only flips to 'idle' in a subsequent setState.
  // If that final setState fails, the row is durably stuck at 'replaying' until
  // an operator-triggered replay re-runs. The provider correctly persists what
  // the runner asks for; hardening the runner's failure path (e.g. wrapping the
  // post-promote setState in a try/catch that marks degraded on failure) is a
  // follow-up at the runner layer, not the provider layer. Tracked as I-2 in the
  // Task 4 code review.
  async function promoteShadow(projectionName, tenantId) {
    const key = keyOf(projectionName, tenantId);
    const shadow = shadowStores.get(key);
    if (!shadow) {
      throw invalid(`No shadow store to promote for ${key}`);
    }

    // Carry forward the last-persisted metadata (cached on hydrate/setState)
    // so this write is ONE parametrized statement — no pre-read SELECT.
    // The runner calls setState immediately after promoteShadow with fresh
    // cursor / status / last_rebuilt_at, so the carried metadata is
    // transient — but the upsert still needs values for those columns.
    const carry = lastState.get(key) || {
      state: 'idle',
      cursor: null,
      schema_version: 1,
      degraded_reason: null,
      last_rebuilt_at: null,
    };

    // One parametrized statement — same upsert as setState.
    await persistRow(projectionName, tenantId, shadow, carry);

    // Persistence succeeded — only now swap the cached live store and drop
    // the shadow. If persistRow throws, the cache is untouched and the
    // shadow can be re-promoted by a retry.
    liveStores.set(key, shadow);
    shadowStores.delete(key);
  }

  async function discardShadow(projectionName, tenantId) {
    shadowStores.delete(keyOf(projectionName, tenantId));
  }

  async function fetchRow(projectionName, tenantId) {
    const text =
      `select schema_version, cursor_event_id, cursor_created_at, ` +
      `status, degraded_reason, last_rebuilt_at ` +
      `from ${PROJECTION_STATE_TABLE} ` +
      `where projection_name = $1 and tenant_id = $2`;
    let result;
    try {
      result = await pool.query(text, [projectionName, tenantId]);
    } catch (err) {
      throw dbError('read', err);
    }
    return result.rows.length ? result.rows[0] : null;
  }

  async function getState(projectionName, tenantId) {
    const row = await fetchRow(projectionName, tenantId);
    return row ? rowToProjectionState(row) : null;
  }

  async function setState(projectionName, tenantId, state) {
    // Use the cached live snapshot if present; otherwise materialize an
    // empty one so the upsert always carries a state_json value. We do NOT
    // re-hydrate from the DB here — the runner's contract is that setState
    // follows a getLiveStore / buffer.commit() sequence, so the cache is
    // already authoritative for the in-memory snapshot.
    const key = keyOf(projectionName, tenantId);
    const snapshot = liveStores.get(key) || createSnapshotStore({});
    await persistRow(projectionName, tenantId, snapshot, state);
    // Cache only AFTER successful persistence — a failed setState must not
    // make the in-memory `lastState` drift from what is durably written.
    lastState.set(key, { ...state });
  }

  return {
    getLiveStore,
    createShadowStore,
    promoteShadow,
    discardShadow,
    getState,
    setState,
  };
}

export default createPgProjectionStoreProvider;
