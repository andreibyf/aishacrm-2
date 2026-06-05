/**
 * projectionRunner.js
 *
 * The Finance Ops Projection Runtime harness (Phase 2B-7).
 * See docs/architecture/finance/projection-runtime.md.
 *
 * The Runner manages registered projection workers, dispatches events to them,
 * tracks each projection's per-(projection, tenant) cursor and state, and
 * rebuilds projections by replaying the event stream into a shadow store that
 * is atomically promoted.
 *
 * Initial scope (Phase 2B-7): register, dispatch, replay, replayAll, status.
 * Not yet implemented: getProjection, polling loops, persistence snapshots.
 */

import {
  ProjectionRuntimeError,
  PROJECTION_RUNTIME_ERROR_CODES,
} from './projectionRuntimeErrors.js';

const INVALID = PROJECTION_RUNTIME_ERROR_CODES.INVALID;
const NOT_FOUND = PROJECTION_RUNTIME_ERROR_CODES.NOT_FOUND;

// Reserved internal infrastructure event types. Never delivered to business
// projections; never advance a business-projection cursor. See projection-
// runtime.md §13.
const INFRASTRUCTURE_EVENT_TYPES = new Set(['finance.audit.event_appended']);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Total-order position of an event — the persisted cursor shape.
 *
 * Cursor identity intentionally excludes the in-memory event store's `_seq`
 * insertion index: `_seq` is store-local bookkeeping that is not invariant
 * across runtimes, so propagating it into the persisted cursor would break the
 * replay-validation harness's cross-rebuild cursor-parity invariant. Same-
 * millisecond ordering is handled internally by `compareEvents` during replay
 * sort — `_seq` stays out of the persisted shape.
 */
function positionOf(event) {
  return {
    created_at: event.created_at,
    id: event.id,
  };
}

/**
 * Compare two events for replay sort. Uses a monotonic APPEND-order index as the
 * tie-break between events sharing the exact same `created_at` — preserving the
 * order a single command wrote dependent events (draft before approval) even when
 * many land in the same millisecond. Two stores provide that index: the in-memory
 * store stamps `_seq` (a number), and the Postgres store provides the `seq`
 * identity column (Codex PR #633 — pg returns `bigint` as a string, so coerce).
 * Without consulting `seq`, the runner re-sorted PG-replayed rows by the random
 * `id` UUID and discarded the store's `(created_at, seq)` ordering. The tie-break
 * is runner-internal; it never enters the persisted cursor (see `positionOf`).
 */
function appendIndexOf(event) {
  if (Number.isFinite(event?._seq)) return event._seq;
  const seq = Number(event?.seq);
  return Number.isFinite(seq) ? seq : null;
}

function compareEvents(a, b) {
  if (a.created_at < b.created_at) return -1;
  if (a.created_at > b.created_at) return 1;
  const aSeq = appendIndexOf(a);
  const bSeq = appendIndexOf(b);
  if (aSeq !== null && bSeq !== null && aSeq !== bSeq) {
    return aSeq - bSeq;
  }
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

/**
 * Is this event strictly after the cursor? (null cursor = nothing applied yet)
 *
 * Dispatch cursoring intentionally avoids UUID lexical ordering for same-
 * millisecond events: event IDs are non-monotonic, so `(created_at, id)` can
 * classify a later sibling event as "older" and incorrectly skip it. We only
 * treat an event as duplicate at the same timestamp when both `created_at`
 * and `id` match the cursor.
 */
function isAfterCursor(event, cursor) {
  if (!cursor) return true;
  if (event.created_at > cursor.created_at) return true;
  if (event.created_at < cursor.created_at) return false;
  return event.id !== cursor.id;
}

function defaultState(schemaVersion) {
  return {
    state: 'idle',
    cursor: null,
    last_rebuilt_at: null,
    schema_version: schemaVersion ?? 0,
    is_degraded: false,
    error_count: 0,
  };
}

/**
 * Defensive deep clone for projection-store values. Primitive values (and
 * `null`) pass through unchanged; arrays and objects are deep-cloned so the
 * projection runtime never shares a mutable reference between the live store,
 * the per-event buffer, and a handler.
 */
function cloneValue(value) {
  if (value === null || typeof value !== 'object') return value;
  return structuredClone(value);
}

/**
 * Wraps a live ProjectionStore so one event's writes are isolated. Reads fall
 * through to the live store; writes accumulate in a buffer and reach the live
 * store only on commit(). If the handler throws, the buffer is discarded and
 * the live store is left untouched — no partial state is ever visible.
 *
 * Rollback isolation: get() never returns a live-store reference and set()
 * never stores a caller-held reference — both deep-clone object/array values.
 * So even a badly-written handler that mutates a returned value in place
 * cannot corrupt the live store when its event later fails.
 */
function createBufferedStore(liveStore) {
  let cleared = false;
  const writes = new Map(); // key -> { op: 'set', value } | { op: 'delete' }
  return {
    get(key) {
      if (writes.has(key)) {
        const write = writes.get(key);
        return write.op === 'delete' ? undefined : cloneValue(write.value);
      }
      // Clone the live value — never hand the handler a live-store reference.
      return cleared ? undefined : cloneValue(liveStore.get(key));
    },
    set(key, value) {
      // Store an independent clone so a reference the caller still holds
      // cannot mutate the buffered value.
      writes.set(key, { op: 'set', value: cloneValue(value) });
    },
    delete(key) {
      writes.set(key, { op: 'delete' });
    },
    keys() {
      const result = new Set(cleared ? [] : liveStore.keys());
      for (const [key, write] of writes) {
        if (write.op === 'delete') result.delete(key);
        else result.add(key);
      }
      return [...result];
    },
    clear() {
      cleared = true;
      writes.clear();
    },
    /** Apply the buffered writes to the live store. */
    commit() {
      if (cleared) liveStore.clear();
      for (const [key, write] of writes) {
        if (write.op === 'delete') liveStore.delete(key);
        // Clone on apply too — the live store must not share a reference with
        // the buffer that is about to be discarded.
        else liveStore.set(key, cloneValue(write.value));
      }
    },
  };
}

/**
 * @param {object} deps
 * @param {{ replay: Function }} deps.eventStore     finance event store (read side)
 * @param {object}               deps.storeProvider  projection store provider
 * @param {number}              [deps.maxAttempts=3] handler attempts before degrading
 * @param {number}           [deps.retryBackoffMs=50] base exponential back-off
 */
export function createProjectionRunner({
  eventStore,
  storeProvider,
  maxAttempts = 3,
  retryBackoffMs = 50,
} = {}) {
  if (!eventStore || typeof eventStore.replay !== 'function') {
    throw new ProjectionRuntimeError(
      'createProjectionRunner requires an eventStore with a replay() method',
      INVALID,
    );
  }
  if (!storeProvider || typeof storeProvider.getLiveStore !== 'function') {
    throw new ProjectionRuntimeError('createProjectionRunner requires a storeProvider', INVALID);
  }

  const workers = new Map(); // projectionName -> worker
  const chains = new Map(); // (projection::tenant) -> Promise — per-key serialization

  const keyOf = (projectionName, tenantId) => `${projectionName}::${tenantId}`;

  // Serialize work per (projection, tenant): dispatch is sequential per
  // (projection, tenant) and a replay blocks its own pair (runtime §4, §9).
  function runExclusive(key, fn) {
    const prev = chains.get(key) || Promise.resolve();
    const next = prev.then(fn, fn);
    // Stored tail never rejects, so a failure never poisons the chain.
    chains.set(
      key,
      next.then(
        () => {},
        () => {},
      ),
    );
    return next;
  }

  function register(worker) {
    if (!worker || typeof worker.projectionName !== 'string' || !worker.projectionName) {
      throw new ProjectionRuntimeError('worker.projectionName is required', INVALID);
    }
    if (!Array.isArray(worker.consumedEvents) || worker.consumedEvents.length === 0) {
      throw new ProjectionRuntimeError(
        `worker ${worker.projectionName}: consumedEvents must be a non-empty array`,
        INVALID,
      );
    }
    if (typeof worker.handleEvent !== 'function' || typeof worker.replay !== 'function') {
      throw new ProjectionRuntimeError(
        `worker ${worker.projectionName}: handleEvent and replay must be functions`,
        INVALID,
      );
    }
    if (workers.has(worker.projectionName)) {
      throw new ProjectionRuntimeError(
        `projection already registered: ${worker.projectionName}`,
        INVALID,
      );
    }
    workers.set(worker.projectionName, worker);
  }

  // Does this worker receive this event? consumedEvents match, then the
  // infrastructure-event filter (non-overridable for business projections).
  function workerConsumes(worker, event) {
    if (!worker.consumedEvents.includes(event.event_type)) return false;
    if (INFRASTRUCTURE_EVENT_TYPES.has(event.event_type)) {
      return worker.includeInfrastructureEvents === true;
    }
    return true;
  }

  async function getState(worker, tenantId) {
    return (
      (await storeProvider.getState(worker.projectionName, tenantId)) ||
      defaultState(worker.schemaVersion)
    );
  }

  // Apply one event to an isolated per-event buffer, retrying on failure.
  // Returns the buffer to commit on success; throws after the last attempt.
  async function applyEvent(worker, event, liveStore) {
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // A fresh buffer per attempt — a retried handler never sees a prior
      // attempt's partial writes.
      const buffer = createBufferedStore(liveStore);
      try {
        await worker.handleEvent(event, buffer);
        return buffer;
      } catch (err) {
        lastError = err;
        if (attempt < maxAttempts) {
          await sleep(retryBackoffMs * 2 ** (attempt - 1));
        }
      }
    }
    throw lastError;
  }

  async function dispatchToWorker(worker, event) {
    const tenantId = event.tenant_id;
    const state = await getState(worker, tenantId);

    // A degraded projection PAUSES dispatch. Later events may depend on the
    // missing state, so continuing risks compounding divergence. The event
    // stays unapplied and the cursor is frozen until an operator-triggered
    // replay recovers the projection (runtime §11).
    if (state.is_degraded) {
      return { projectionName: worker.projectionName, outcome: 'paused' };
    }

    // Cursor guard — once-delivery: apply only events strictly after the cursor.
    if (!isAfterCursor(event, state.cursor)) {
      return { projectionName: worker.projectionName, outcome: 'skipped' };
    }

    const liveStore = await storeProvider.getLiveStore(worker.projectionName, tenantId);
    let buffer;
    try {
      // The handler writes into an isolated per-event buffer, never the live
      // store — a handler that mutates then throws leaves no partial state.
      buffer = await applyEvent(worker, event, liveStore);
    } catch {
      // Failed handler -> degraded; the cursor is NOT advanced and the live
      // store is untouched (the buffer is discarded).
      await storeProvider.setState(worker.projectionName, tenantId, {
        ...state,
        state: 'degraded',
        is_degraded: true,
        error_count: state.error_count + 1,
      });
      return { projectionName: worker.projectionName, outcome: 'degraded' };
    }

    // The handler fully succeeded — commit its writes to the live store
    // all-or-nothing, then the Runner advances the cursor.
    buffer.commit();
    await storeProvider.setState(worker.projectionName, tenantId, {
      ...state,
      state: 'idle',
      cursor: positionOf(event),
      error_count: 0,
    });
    return { projectionName: worker.projectionName, outcome: 'applied' };
  }

  async function dispatch(event) {
    if (!event || !event.id || !event.tenant_id || !event.event_type || !event.created_at) {
      throw new ProjectionRuntimeError(
        'dispatch requires an event with id, tenant_id, event_type, created_at',
        INVALID,
      );
    }
    const targets = [...workers.values()].filter((worker) => workerConsumes(worker, event));
    const dispatched = [];
    for (const worker of targets) {
      const key = keyOf(worker.projectionName, event.tenant_id);
      dispatched.push(await runExclusive(key, () => dispatchToWorker(worker, event)));
    }
    return { event_id: event.id, dispatched };
  }

  async function doReplay(worker, tenantId, isTestData = null) {
    const prior = await getState(worker, tenantId);
    // Hydrate the live store before transitioning to 'replaying' so the provider's
    // setState write preserves the existing state_json. Without this, a Postgres
    // provider whose cache is cold for this (projection, tenant) would fall back
    // to an empty snapshot and durably blank state_json — violating the
    // no-partial-persistence constraint.
    await storeProvider.getLiveStore(worker.projectionName, tenantId);
    await storeProvider.setState(worker.projectionName, tenantId, {
      ...prior,
      state: 'replaying',
    });

    try {
      // Slice 6b-1: replay only the active data-mode's partition (test ⇒ true,
      // live ⇒ false). `isTestData = null` ⇒ no filter = all events (unchanged).
      const all = await eventStore.replay(tenantId, isTestData);
      // Defensively scope to the target tenant — never trust the event store to
      // be perfect about tenant isolation. A foreign-tenant row must never be
      // replayed into another tenant's projection state.
      const tenantScoped = all.filter((event) => event.tenant_id === tenantId);
      // Enforce the frozen Track A order regardless of the event store backend.
      const ordered = [...tenantScoped].sort(compareEvents);
      const filtered = ordered.filter((event) => workerConsumes(worker, event));

      const shadow = await storeProvider.createShadowStore(worker.projectionName, tenantId);
      await worker.replay(filtered, shadow);

      const cursor = filtered.length ? positionOf(filtered[filtered.length - 1]) : null;
      // Atomic promotion — the live store is replaced wholesale.
      await storeProvider.promoteShadow(worker.projectionName, tenantId);

      await storeProvider.setState(worker.projectionName, tenantId, {
        state: 'idle',
        cursor,
        last_rebuilt_at: new Date().toISOString(),
        schema_version: worker.schemaVersion ?? 0,
        is_degraded: false,
        error_count: 0,
      });
      return { projectionName: worker.projectionName, outcome: 'rebuilt', cursor };
    } catch {
      // Failed rebuild -> discard the shadow (the live store is untouched) and
      // mark degraded. Recovery is operator-triggered only.
      if (typeof storeProvider.discardShadow === 'function') {
        await storeProvider.discardShadow(worker.projectionName, tenantId);
      }
      await storeProvider.setState(worker.projectionName, tenantId, {
        ...prior,
        state: 'degraded',
        is_degraded: true,
        error_count: prior.error_count + 1,
      });
      return { projectionName: worker.projectionName, outcome: 'degraded' };
    }
  }

  async function replay(projectionName, tenantId, isTestData = null) {
    const worker = workers.get(projectionName);
    if (!worker) {
      throw new ProjectionRuntimeError(`projection not registered: ${projectionName}`, NOT_FOUND);
    }
    return runExclusive(keyOf(projectionName, tenantId), () =>
      doReplay(worker, tenantId, isTestData),
    );
  }

  async function replayAll(tenantId, isTestData = null) {
    const results = [];
    for (const worker of workers.values()) {
      results.push(await replay(worker.projectionName, tenantId, isTestData));
    }
    return results;
  }

  async function status(projectionName, tenantId) {
    const worker = workers.get(projectionName);
    if (!worker) {
      throw new ProjectionRuntimeError(`projection not registered: ${projectionName}`, NOT_FOUND);
    }
    return getState(worker, tenantId);
  }

  return { register, dispatch, replay, replayAll, status };
}

export default createProjectionRunner;
