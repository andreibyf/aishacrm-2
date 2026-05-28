/**
 * projectionStore.memory.js
 *
 * In-memory implementation of the Projection Runtime's store abstraction
 * (Phase 2B-7). See docs/architecture/finance/projection-runtime.md §3.
 *
 * Two factories:
 *  - createMemoryProjectionStore()         — one read-model store
 *  - createMemoryProjectionStoreProvider() — the provider the runner depends on
 *
 * The backend is a plain Map. Redis / Postgres providers are out of scope for
 * Phase 2B-7; the runner depends only on the provider interface, never on this
 * backend.
 */

import {
  ProjectionRuntimeError,
  PROJECTION_RUNTIME_ERROR_CODES,
} from './projectionRuntimeErrors.js';

/**
 * A mutable key-value read-model store scoped to exactly one
 * (projectionName, tenantId) pair.
 */
export function createMemoryProjectionStore() {
  const data = new Map();
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
  };
}

/**
 * The store provider. Hands out tenant-scoped live stores, supports
 * shadow-store creation + atomic promotion for replay, and persists the
 * per-(projection, tenant) ProjectionState record.
 */
export function createMemoryProjectionStoreProvider() {
  const liveStores = new Map(); // key -> ProjectionStore
  const shadowStores = new Map(); // key -> ProjectionStore (pending promotion)
  const states = new Map(); // key -> ProjectionState

  const keyOf = (projectionName, tenantId) => `${projectionName}::${tenantId}`;

  function getLiveStore(projectionName, tenantId) {
    const key = keyOf(projectionName, tenantId);
    if (!liveStores.has(key)) {
      liveStores.set(key, createMemoryProjectionStore());
    }
    return liveStores.get(key);
  }

  function createShadowStore(projectionName, tenantId) {
    const shadow = createMemoryProjectionStore();
    shadowStores.set(keyOf(projectionName, tenantId), shadow);
    return shadow;
  }

  /**
   * Atomically swap the pending shadow store in as the live store. From a
   * reader's perspective this is a single synchronous reference swap — readers
   * see either the whole pre-replay model or the whole rebuilt model.
   */
  function promoteShadow(projectionName, tenantId) {
    const key = keyOf(projectionName, tenantId);
    const shadow = shadowStores.get(key);
    if (!shadow) {
      throw new ProjectionRuntimeError(
        `No shadow store to promote for ${key}`,
        PROJECTION_RUNTIME_ERROR_CODES.INVALID,
      );
    }
    liveStores.set(key, shadow);
    shadowStores.delete(key);
  }

  /** Drop a pending shadow store (e.g. after a failed replay). */
  function discardShadow(projectionName, tenantId) {
    shadowStores.delete(keyOf(projectionName, tenantId));
  }

  /** Returns the stored ProjectionState, or null when none exists yet. */
  function getState(projectionName, tenantId) {
    return states.get(keyOf(projectionName, tenantId)) || null;
  }

  /** Persists a copy of the ProjectionState for (projectionName, tenantId). */
  function setState(projectionName, tenantId, state) {
    states.set(keyOf(projectionName, tenantId), { ...state });
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

export default createMemoryProjectionStoreProvider;
