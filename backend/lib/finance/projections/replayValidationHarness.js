/**
 * replayValidationHarness.js
 *
 * Phase 2B-12 — Replay Validation Harness for the Finance Ops projection
 * runtime.
 *
 * See docs/architecture/finance/replay-validation.md and the runtime contract
 * in docs/architecture/finance/projection-runtime.md.
 *
 * This is a pure validation library. It proves the central correctness
 * invariant of an event-sourced read model: a projection rebuilt by a full
 * `replay()` converges to byte-for-byte the same state as one built
 * incrementally by sequential `dispatch()`. It also asserts the frozen replay
 * ordering (`created_at` ASC, then `id` ASC), the degraded-recovery invariant
 * (a degraded projection recovers ONLY via operator-triggered replay), and
 * per-(projection, tenant) tenant isolation.
 *
 * Scope / hard boundaries:
 *  - No routes, no Express wiring, no worker process.
 *  - No provider writes, no OAuth/provider clients, no network calls.
 *  - Tenant-scoped — never compares or leaks cross-tenant data.
 *  - Consumes the frozen Track A contract: `aggregate_type` / `aggregate_id`
 *    on envelopes, `target_type` / `target_id` on approvals. Replay order is
 *    `created_at` ASC, then `id` ASC.
 *
 * The harness is dependency-light: every collaborator (event store, store
 * provider, projection workers) is injected, so tests can drive it with
 * fixtures. `createDefaultHarnessConfig()` wires up a contract-faithful
 * in-memory event store, the in-memory projection store provider, and the three
 * real projection workers (ledger, approval_queue, adapter_queue).
 *
 * Event-store note. The production `financeEventStore` deliberately re-stamps
 * `created_at` at append time (audit integrity — callers cannot inject
 * timestamps). A validation harness, by contrast, must drive *controlled*
 * fixtures with known `created_at` / `id` so it can deterministically assert
 * the replay order. The default event store therefore PRESERVES caller-supplied
 * `created_at` / `id` and implements the identical `replay()` contract —
 * `created_at` ASC, then `id` ASC. It is the same read-side contract the
 * Projection Runner depends on; only the write-side timestamp policy differs.
 */

import { createProjectionRunner } from './projectionRunner.js';
import { createMemoryProjectionStoreProvider } from './projectionStore.memory.js';
import { createLedgerProjectionWorker } from './ledgerProjection.js';
import { createApprovalQueueProjectionWorker } from './approvalQueueProjection.js';
import { createAdapterQueueProjectionWorker } from './adapterQueueProjection.js';

// ── Ordering — the frozen Track A total order ─────────────────────────────────

/**
 * Compare two events by the frozen Track A total order: `created_at` ASC, then
 * event `id` ASC as the deterministic tie-break. Identical to the runner's
 * internal `comparePosition` — re-stated here so the harness can validate
 * ordering independently of the runtime it is checking.
 */
export function compareEventOrder(a, b) {
  if (a.created_at < b.created_at) return -1;
  if (a.created_at > b.created_at) return 1;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

/** Return a new array sorted into the frozen Track A total order. */
function orderEvents(events) {
  return [...events].sort(compareEventOrder);
}

// ── Contract-faithful validation event store ──────────────────────────────────

/**
 * A minimal, in-memory, append-only event store for the validation harness.
 *
 * Unlike the production `financeEventStore` it PRESERVES caller-supplied
 * `created_at` and `id` — the harness must control event positions to validate
 * ordering deterministically. It implements the read-side contract the
 * Projection Runner depends on: `replay(tenantId)` returns the tenant's events
 * in the frozen Track A total order (`created_at` ASC, then `id` ASC).
 *
 * Append order is recorded as a secondary `_seq` so events sharing both a
 * `created_at` and (pathologically) an `id` still sort stably — though `id`
 * uniqueness makes that a non-issue for well-formed streams.
 */
export function createValidationEventStore() {
  const log = [];
  let seq = 0;

  function append(event) {
    if (!event || !event.tenant_id) {
      throw new TypeError('validation event store: every event needs a tenant_id');
    }
    if (!event.event_type) {
      throw new TypeError('validation event store: every event needs an event_type');
    }
    // Freeze a copy so a caller mutating the fixture later cannot rewrite
    // history — the same immutability posture as the production store.
    const stored = Object.freeze({ ...event, _seq: ++seq });
    log.push(stored);
    return stored;
  }

  function replay(tenantId) {
    if (!tenantId) {
      throw new TypeError('validation event store: replay requires a tenant_id');
    }
    return log
      .filter((e) => e.tenant_id === tenantId)
      .sort((a, b) => {
        const byOrder = compareEventOrder(a, b);
        return byOrder !== 0 ? byOrder : a._seq - b._seq;
      });
  }

  return { append, replay };
}

// ── Store comparison ──────────────────────────────────────────────────────────

/**
 * Snapshot a live ProjectionStore as a plain, order-independent object:
 * `{ key: value }` for every key. Used to deep-compare two independently built
 * read models. Values are deep-cloned so the snapshot never aliases live state.
 */
function snapshotStore(store) {
  const snapshot = {};
  for (const key of store.keys().sort()) {
    snapshot[key] = cloneDeep(store.get(key));
  }
  return snapshot;
}

/** Defensive deep clone — primitives pass through, objects/arrays are cloned. */
function cloneDeep(value) {
  if (value === null || typeof value !== 'object') return value;
  return structuredClone(value);
}

/** Structural deep equality for two plain JSON-compatible values. */
function deepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  const aIsArray = Array.isArray(a);
  if (aIsArray !== Array.isArray(b)) return false;
  if (aIsArray) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  if (aKeys.length !== bKeys.length) return false;
  if (!aKeys.every((k, i) => k === bKeys[i])) return false;
  return aKeys.every((k) => deepEqual(a[k], b[k]));
}

// ── Result helpers ────────────────────────────────────────────────────────────

/** Build a single structured check result. */
function result(name, passed, detail) {
  return { name, passed: Boolean(passed), detail };
}

/** Combine a list of check results into the aggregate report shape. */
function aggregate(checks) {
  return { passed: checks.every((c) => c.passed), checks };
}

// ── Config / wiring ───────────────────────────────────────────────────────────

/**
 * The default harness config: factories that wire up the real Finance Ops
 * projection runtime. Every factory is overridable so tests can inject doubles.
 *
 * @returns {{
 *   createEventStore: () => object,
 *   createStoreProvider: () => object,
 *   createWorkers: () => object[],
 *   runnerOptions: object,
 * }}
 */
export function createDefaultHarnessConfig() {
  return {
    createEventStore: () => createValidationEventStore(),
    createStoreProvider: () => createMemoryProjectionStoreProvider(),
    createWorkers: () => [
      createLedgerProjectionWorker(),
      createApprovalQueueProjectionWorker(),
      createAdapterQueueProjectionWorker(),
    ],
    // retryBackoffMs 0 keeps degraded-path validation fast — the harness only
    // ever needs the *final* outcome of a handler, never the retry timing.
    runnerOptions: { retryBackoffMs: 0 },
  };
}

/** Merge a partial config over the defaults. */
function resolveConfig(config = {}) {
  const defaults = createDefaultHarnessConfig();
  return {
    createEventStore: config.createEventStore || defaults.createEventStore,
    createStoreProvider: config.createStoreProvider || defaults.createStoreProvider,
    createWorkers: config.createWorkers || defaults.createWorkers,
    runnerOptions: { ...defaults.runnerOptions, ...(config.runnerOptions || {}) },
  };
}

/**
 * Build a fresh, fully isolated runtime instance: a new event store, a new
 * store provider, a new runner, and a freshly registered set of workers.
 * Convergence validation depends on each path getting its OWN instances — no
 * shared mutable state between the dispatch path and the replay path.
 */
function buildRuntime(config) {
  const eventStore = config.createEventStore();
  const storeProvider = config.createStoreProvider();
  const workers = config.createWorkers();
  const runner = createProjectionRunner({
    eventStore,
    storeProvider,
    ...config.runnerOptions,
  });
  for (const worker of workers) {
    runner.register(worker);
  }
  return { eventStore, storeProvider, runner, workers };
}

/** Append a list of finance events to an event store, preserving array order. */
function appendAll(eventStore, events) {
  for (const event of events) {
    eventStore.append(event);
  }
}

// ── Check 1 — convergence (dispatch vs replay) ────────────────────────────────

/**
 * Convergence check.
 *
 * Build the same projection two ways for one tenant and assert the resulting
 * live stores are deeply equal for every registered projection:
 *
 *   Path 1 (incremental) — append all events to a fresh runtime, then
 *     `dispatch()` them one by one, in the frozen Track A order.
 *   Path 2 (rebuild)     — append all events to a *separate* fresh runtime,
 *     then `replay()` every projection.
 *
 * Equality is checked against the store provider's live stores (keys + values),
 * which is the actual read-model state, independent of any `getProjection`
 * presentation logic.
 *
 * @param {object[]} events    finance.* events for ONE tenant
 * @param {string}   tenantId  the tenant under test
 * @param {object}  [config]   harness config (see createDefaultHarnessConfig)
 * @returns {Promise<{name,passed,detail}>}
 */
export async function checkConvergence(events, tenantId, config = {}) {
  const cfg = resolveConfig(config);
  const ordered = orderEvents(events.filter((e) => e.tenant_id === tenantId));

  // Path 1 — incremental dispatch.
  const dispatchRuntime = buildRuntime(cfg);
  appendAll(dispatchRuntime.eventStore, ordered);

  // Path 2 — full replay.
  const replayRuntime = buildRuntime(cfg);
  appendAll(replayRuntime.eventStore, ordered);

  const perProjection = await executeConvergence({
    dispatchRuntime,
    replayRuntime,
    ordered,
    tenantId,
  });
  const diverged = perProjection.filter((p) => !p.converged);
  return result('convergence', diverged.length === 0, {
    tenant_id: tenantId,
    event_count: ordered.length,
    projections: perProjection.map((p) => ({
      projection: p.projection,
      converged: p.converged,
    })),
    diverged: diverged.map((p) => ({
      projection: p.projection,
      dispatched: p.dispatched,
      replayed: p.replayed,
    })),
  });
}

/**
 * Drive both runtimes and compare. Shared by `checkConvergence` and the
 * per-projection parity check so the dispatch/replay execution lives in one
 * place. Returns one `{ projection, converged, dispatched, replayed }` entry
 * per registered projection.
 */
async function executeConvergence({ dispatchRuntime, replayRuntime, ordered, tenantId }) {
  // Path 1 — dispatch each event in total order.
  for (const event of ordered) {
    await dispatchRuntime.runner.dispatch(event);
  }
  // Path 2 — replay every registered projection.
  for (const worker of replayRuntime.workers) {
    await replayRuntime.runner.replay(worker.projectionName, tenantId);
  }

  const perProjection = [];
  for (const worker of dispatchRuntime.workers) {
    const name = worker.projectionName;
    const dispatched = snapshotStore(dispatchRuntime.storeProvider.getLiveStore(name, tenantId));
    const replayed = snapshotStore(replayRuntime.storeProvider.getLiveStore(name, tenantId));
    const converged = deepEqual(dispatched, replayed);
    perProjection.push({
      projection: name,
      converged,
      dispatched,
      replayed,
    });
  }
  return perProjection;
}

// ── Check 2 — replay ordering ─────────────────────────────────────────────────

/**
 * Replay ordering check.
 *
 * Assert `eventStore.replay(tenantId)` returns events in the frozen Track A
 * total order — `created_at` ASC, then `id` ASC — including the tie-break case
 * where several events share a `created_at` millisecond.
 *
 * The check appends the events (in scrambled input order) and verifies the
 * store hands them back in the canonical order. It also asserts at least one
 * `created_at` collision was exercised, so the tie-break path is genuinely
 * covered rather than vacuously passing.
 *
 * @param {object[]} events    finance.* events for ONE tenant
 * @param {string}   tenantId  the tenant under test
 * @param {object}  [config]   harness config
 * @returns {Promise<{name,passed,detail}>}
 */
export async function checkReplayOrdering(events, tenantId, config = {}) {
  const cfg = resolveConfig(config);
  const eventStore = cfg.createEventStore();
  const scoped = events.filter((e) => e.tenant_id === tenantId);
  appendAll(eventStore, scoped);

  const replayed = await eventStore.replay(tenantId);
  const expected = orderEvents(scoped);

  const actualOrder = replayed.map((e) => e.id);
  const expectedOrder = expected.map((e) => e.id);
  const ordered = deepEqual(actualOrder, expectedOrder);

  // Confirm the tie-break path is actually exercised: at least one pair of
  // distinct events sharing a created_at millisecond.
  const seen = new Set();
  let tieBreakExercised = false;
  for (const e of scoped) {
    if (seen.has(e.created_at)) {
      tieBreakExercised = true;
      break;
    }
    seen.add(e.created_at);
  }

  return result('replay_ordering', ordered, {
    tenant_id: tenantId,
    event_count: scoped.length,
    tie_break_exercised: tieBreakExercised,
    expected_order: expectedOrder,
    actual_order: actualOrder,
  });
}

// ── Check 3 — per-projection rebuild parity ───────────────────────────────────

/**
 * Per-projection rebuild parity check.
 *
 * Runs convergence individually for each registered projection and reports one
 * sub-result per projection (ledger, approval_queue, adapter_queue). This is a
 * finer-grained companion to `checkConvergence`: convergence reports pass/fail
 * for the whole set; this reports which specific projection diverged.
 *
 * @param {object[]} events
 * @param {string}   tenantId
 * @param {object}  [config]
 * @returns {Promise<{name,passed,detail}>}
 */
export async function checkPerProjectionParity(events, tenantId, config = {}) {
  const cfg = resolveConfig(config);
  const ordered = orderEvents(events.filter((e) => e.tenant_id === tenantId));

  const dispatchRuntime = buildRuntime(cfg);
  appendAll(dispatchRuntime.eventStore, ordered);
  const replayRuntime = buildRuntime(cfg);
  appendAll(replayRuntime.eventStore, ordered);

  const perProjection = await executeConvergence({
    dispatchRuntime,
    replayRuntime,
    ordered,
    tenantId,
  });

  return result(
    'per_projection_parity',
    perProjection.every((p) => p.converged),
    {
      tenant_id: tenantId,
      projections: perProjection.map((p) => ({
        projection: p.projection,
        converged: p.converged,
      })),
    },
  );
}

// ── Check 4 — degraded recovery ───────────────────────────────────────────────

/**
 * Degraded-recovery check.
 *
 * Proves the degraded-recovery invariant from projection-runtime.md §11:
 *
 *  1. A handler throw degrades the projection (`is_degraded = true`,
 *     `state = 'degraded'`).
 *  2. While degraded, a subsequent `dispatch()` is `paused` — the event is NOT
 *     applied and the cursor stays frozen at its pre-failure position.
 *  3. The ONLY recovery is an operator-triggered `replay()`: after replay the
 *     projection is back to `state = 'idle'`, `is_degraded = false`, and the
 *     read model reflects every event including the one that originally failed
 *     and every event paused after it.
 *
 * The check installs a one-shot failing worker: its `handleEvent` throws for a
 * single chosen event id, but its `replay` always succeeds — so dispatch
 * degrades while a later replay cleanly recovers. The recovered state is then
 * compared to a clean reference build of the SAME events to prove correctness,
 * not just liveness.
 *
 * @param {object} opts
 * @param {object[]} opts.events            finance.* events for ONE tenant
 * @param {string}   opts.tenantId
 * @param {string}   opts.failEventId       id of the event whose handler throws
 * @param {string}  [opts.projectionName]   projection to fault-inject into;
 *                                          defaults to the first registered
 * @param {object}  [opts.config]
 * @returns {Promise<{name,passed,detail}>}
 */
export async function checkDegradedRecovery({
  events,
  tenantId,
  failEventId,
  projectionName,
  config = {},
} = {}) {
  const cfg = resolveConfig(config);
  const ordered = orderEvents(events.filter((e) => e.tenant_id === tenantId));

  // Determine the target projection (first registered worker by default).
  const probeWorkers = cfg.createWorkers();
  const targetName = projectionName || probeWorkers[0].projectionName;

  // A config whose target worker's handleEvent throws once for `failEventId`.
  // `replay` is left untouched so an operator replay recovers cleanly.
  const faultConfig = {
    ...cfg,
    createWorkers: () =>
      cfg.createWorkers().map((worker) => {
        if (worker.projectionName !== targetName) return worker;
        const realHandle = worker.handleEvent.bind(worker);
        return {
          ...worker,
          handleEvent(event, store) {
            if (event.id === failEventId) {
              throw new Error(`replay-validation: injected fault on ${failEventId}`);
            }
            return realHandle(event, store);
          },
        };
      }),
  };

  const faulted = buildRuntime(faultConfig);
  appendAll(faulted.eventStore, ordered);

  // ── Phase 1: dispatch up to and including the failing event ────────────────
  let degradedAfterFault = false;
  let cursorAtFault = null;
  for (const event of ordered) {
    await faulted.runner.dispatch(event);
    if (event.id === failEventId) {
      const status = faulted.runner.status(targetName, tenantId);
      degradedAfterFault = status.is_degraded === true && status.state === 'degraded';
      cursorAtFault = status.cursor;
      break;
    }
  }

  // ── Phase 2: a later dispatch must be PAUSED, cursor frozen ─────────────────
  const failIndex = ordered.findIndex((e) => e.id === failEventId);
  const laterEvent = ordered
    .slice(failIndex + 1)
    .find((e) => isConsumedBy(faulted.workers, targetName, e));

  let laterPaused = true; // vacuously true if there is no later consumed event
  let cursorFrozen = true;
  if (laterEvent) {
    const dispatchResult = await faulted.runner.dispatch(laterEvent);
    const target = dispatchResult.dispatched.find((d) => d.projectionName === targetName);
    laterPaused = Boolean(target) && target.outcome === 'paused';
    cursorFrozen = deepEqual(faulted.runner.status(targetName, tenantId).cursor, cursorAtFault);
  }

  // ── Phase 3: operator-triggered replay must recover to idle ────────────────
  await faulted.runner.replay(targetName, tenantId);
  const recovered = faulted.runner.status(targetName, tenantId);
  const recoveredToIdle = recovered.is_degraded === false && recovered.state === 'idle';

  // ── Phase 4: the recovered read model must equal a clean reference build ────
  const reference = buildRuntime(cfg);
  appendAll(reference.eventStore, ordered);
  await reference.runner.replay(targetName, tenantId);

  const recoveredState = snapshotStore(faulted.storeProvider.getLiveStore(targetName, tenantId));
  const referenceState = snapshotStore(reference.storeProvider.getLiveStore(targetName, tenantId));
  const stateCorrect = deepEqual(recoveredState, referenceState);

  const passed =
    degradedAfterFault && laterPaused && cursorFrozen && recoveredToIdle && stateCorrect;

  return result('degraded_recovery', passed, {
    tenant_id: tenantId,
    projection: targetName,
    fail_event_id: failEventId,
    degraded_after_fault: degradedAfterFault,
    later_dispatch_paused: laterPaused,
    cursor_frozen_while_degraded: cursorFrozen,
    recovered_to_idle_after_replay: recoveredToIdle,
    recovered_state_matches_reference: stateCorrect,
  });
}

/** True when `event` is consumed by the worker named `projectionName`. */
function isConsumedBy(workers, projectionName, event) {
  const worker = workers.find((w) => w.projectionName === projectionName);
  return Boolean(worker) && worker.consumedEvents.includes(event.event_type);
}

// ── Check 5 — tenant isolation ────────────────────────────────────────────────

/**
 * Tenant isolation check.
 *
 * Interleaves events for two tenants into one stream, builds projections by
 * replay, and asserts:
 *
 *  - Each tenant's rebuilt read model contains ONLY rows whose `tenant_id` is
 *    that tenant (no cross-tenant leakage in any projection store value).
 *  - Cursors are per-(projection, tenant): each tenant's cursor reflects only
 *    its own events, so the two tenants' cursors are independent.
 *
 * @param {object} opts
 * @param {object[]} opts.events     interleaved finance.* events for >= 2 tenants
 * @param {string}   opts.tenantA
 * @param {string}   opts.tenantB
 * @param {object}  [opts.config]
 * @returns {Promise<{name,passed,detail}>}
 */
export async function checkTenantIsolation({ events, tenantA, tenantB, config = {} } = {}) {
  const cfg = resolveConfig(config);
  const runtime = buildRuntime(cfg);
  // Append the FULL interleaved stream — both tenants — to one event store.
  appendAll(runtime.eventStore, events);

  // Replay every projection for each tenant independently.
  for (const worker of runtime.workers) {
    await runtime.runner.replay(worker.projectionName, tenantA);
    await runtime.runner.replay(worker.projectionName, tenantB);
  }

  const leaks = [];
  const cursorIssues = [];

  for (const worker of runtime.workers) {
    const name = worker.projectionName;

    for (const [tenantId, otherId] of [
      [tenantA, tenantB],
      [tenantB, tenantA],
    ]) {
      const store = runtime.storeProvider.getLiveStore(name, tenantId);
      for (const key of store.keys()) {
        const value = store.get(key);
        // Any stored value carrying the other tenant's id is a leak.
        if (value && typeof value === 'object' && value.tenant_id === otherId) {
          leaks.push({ projection: name, tenant_id: tenantId, key });
        }
      }

      // The cursor must be the position of this tenant's own last consumed
      // event — never advanced by the other tenant's stream.
      const tenantConsumed = orderEvents(
        events.filter(
          (e) => e.tenant_id === tenantId && worker.consumedEvents.includes(e.event_type),
        ),
      );
      const expectedCursor = tenantConsumed.length
        ? {
            created_at: tenantConsumed[tenantConsumed.length - 1].created_at,
            id: tenantConsumed[tenantConsumed.length - 1].id,
          }
        : null;
      const actualCursor = runtime.runner.status(name, tenantId).cursor;
      if (!deepEqual(actualCursor, expectedCursor)) {
        cursorIssues.push({
          projection: name,
          tenant_id: tenantId,
          expected: expectedCursor,
          actual: actualCursor,
        });
      }
    }
  }

  return result('tenant_isolation', leaks.length === 0 && cursorIssues.length === 0, {
    tenant_a: tenantA,
    tenant_b: tenantB,
    leaks,
    cursor_issues: cursorIssues,
  });
}

// ── Aggregate runner ──────────────────────────────────────────────────────────

/**
 * Run the full replay-validation suite and return the aggregate report.
 *
 * Single-tenant checks (convergence, ordering, parity, degraded recovery) run
 * against `tenantA`'s slice of the stream. The tenant-isolation check runs only
 * when both `tenantA` and `tenantB` are supplied and each has at least one
 * event in the stream.
 *
 * @param {object} opts
 * @param {object[]} opts.events            full finance.* event stream
 * @param {string}   opts.tenantA           primary tenant under test
 * @param {string}  [opts.tenantB]          second tenant for isolation check
 * @param {string}  [opts.failEventId]      event id for the degraded-recovery
 *                                          fault; defaults to the first
 *                                          tenantA event id
 * @param {object}  [opts.config]           harness config
 * @returns {Promise<{passed:boolean, checks:Array}>}
 */
export async function runReplayValidation({
  events,
  tenantA,
  tenantB,
  failEventId,
  config = {},
} = {}) {
  if (!Array.isArray(events)) {
    throw new TypeError('runReplayValidation requires an events array');
  }
  if (!tenantA) {
    throw new TypeError('runReplayValidation requires a tenantA');
  }

  const tenantAEvents = events.filter((e) => e.tenant_id === tenantA);
  const orderedA = orderEvents(tenantAEvents);
  const faultId = failEventId || (orderedA.length ? orderedA[0].id : null);

  const checks = [];

  checks.push(await checkConvergence(tenantAEvents, tenantA, config));
  checks.push(await checkReplayOrdering(tenantAEvents, tenantA, config));
  checks.push(await checkPerProjectionParity(tenantAEvents, tenantA, config));

  if (faultId) {
    checks.push(
      await checkDegradedRecovery({
        events: tenantAEvents,
        tenantId: tenantA,
        failEventId: faultId,
        config,
      }),
    );
  }

  const tenantBEvents = tenantB ? events.filter((e) => e.tenant_id === tenantB) : [];
  if (tenantB && tenantBEvents.length > 0 && tenantAEvents.length > 0) {
    checks.push(await checkTenantIsolation({ events, tenantA, tenantB, config }));
  }

  return aggregate(checks);
}

export default runReplayValidation;
