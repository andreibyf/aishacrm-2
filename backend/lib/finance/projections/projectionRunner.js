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

/** Total-order position of an event: { created_at, id }. */
function positionOf(event) {
  return { created_at: event.created_at, id: event.id };
}

/** Compare two positions — created_at ASC, then id ASC (frozen Track A order). */
function comparePosition(a, b) {
  if (a.created_at < b.created_at) return -1;
  if (a.created_at > b.created_at) return 1;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

/** Is this event strictly after the cursor? (null cursor = nothing applied yet) */
function isAfterCursor(event, cursor) {
  if (!cursor) return true;
  return comparePosition(positionOf(event), cursor) > 0;
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

  function getState(worker, tenantId) {
    return (
      storeProvider.getState(worker.projectionName, tenantId) || defaultState(worker.schemaVersion)
    );
  }

  async function applyWithRetry(worker, event, store) {
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await worker.handleEvent(event, store);
        return;
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
    const state = getState(worker, tenantId);

    // Cursor guard — once-delivery: apply only events strictly after the cursor.
    if (!isAfterCursor(event, state.cursor)) {
      return { projectionName: worker.projectionName, outcome: 'skipped' };
    }

    const store = storeProvider.getLiveStore(worker.projectionName, tenantId);
    try {
      await applyWithRetry(worker, event, store);
    } catch {
      // Failed handler -> degraded; the cursor is NOT advanced (runtime §11).
      storeProvider.setState(worker.projectionName, tenantId, {
        ...state,
        state: 'degraded',
        is_degraded: true,
        error_count: state.error_count + 1,
      });
      return { projectionName: worker.projectionName, outcome: 'degraded' };
    }

    // Success -> the Runner advances the cursor. A later success does NOT clear
    // an existing degraded flag — only an operator-triggered replay does.
    storeProvider.setState(worker.projectionName, tenantId, {
      ...state,
      state: state.is_degraded ? 'degraded' : 'idle',
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

  async function doReplay(worker, tenantId) {
    const prior = getState(worker, tenantId);
    storeProvider.setState(worker.projectionName, tenantId, { ...prior, state: 'replaying' });

    try {
      const all = await eventStore.replay(tenantId);
      // Enforce the frozen Track A order regardless of the event store backend.
      const ordered = [...all].sort((a, b) => comparePosition(positionOf(a), positionOf(b)));
      const filtered = ordered.filter((event) => workerConsumes(worker, event));

      const shadow = storeProvider.createShadowStore(worker.projectionName, tenantId);
      await worker.replay(filtered, shadow);

      const cursor = filtered.length ? positionOf(filtered[filtered.length - 1]) : null;
      // Atomic promotion — the live store is replaced wholesale.
      storeProvider.promoteShadow(worker.projectionName, tenantId);

      storeProvider.setState(worker.projectionName, tenantId, {
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
        storeProvider.discardShadow(worker.projectionName, tenantId);
      }
      storeProvider.setState(worker.projectionName, tenantId, {
        ...prior,
        state: 'degraded',
        is_degraded: true,
        error_count: prior.error_count + 1,
      });
      return { projectionName: worker.projectionName, outcome: 'degraded' };
    }
  }

  async function replay(projectionName, tenantId) {
    const worker = workers.get(projectionName);
    if (!worker) {
      throw new ProjectionRuntimeError(`projection not registered: ${projectionName}`, NOT_FOUND);
    }
    return runExclusive(keyOf(projectionName, tenantId), () => doReplay(worker, tenantId));
  }

  async function replayAll(tenantId) {
    const results = [];
    for (const worker of workers.values()) {
      results.push(await replay(worker.projectionName, tenantId));
    }
    return results;
  }

  function status(projectionName, tenantId) {
    const worker = workers.get(projectionName);
    if (!worker) {
      throw new ProjectionRuntimeError(`projection not registered: ${projectionName}`, NOT_FOUND);
    }
    return getState(worker, tenantId);
  }

  return { register, dispatch, replay, replayAll, status };
}

export default createProjectionRunner;
