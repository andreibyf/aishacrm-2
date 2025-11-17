// Request-scoped context using AsyncLocalStorage to accumulate DB timing
import { AsyncLocalStorage } from 'node:async_hooks';

const als = new AsyncLocalStorage();

export function attachRequestContext(req, _res, next) {
  // Initialize store with a per-request accumulator
  als.run({ dbTimeMs: 0, req }, () => {
    req.dbTimeMs = 0;
    next();
  });
}

export function addDbTime(ms) {
  try {
    const store = als.getStore();
    if (!store) return;
    const inc = Number(ms) || 0;
    store.dbTimeMs = (store.dbTimeMs || 0) + inc;
    if (store.req) store.req.dbTimeMs = store.dbTimeMs;
  } catch {
    // noop
  }
}

export function getRequestDbTime(req) {
  try {
    if (req && typeof req.dbTimeMs === 'number') return Math.max(0, Math.ceil(req.dbTimeMs));
    const store = als.getStore();
    return Math.max(0, Math.ceil(store?.dbTimeMs || 0));
  } catch {
    return 0;
  }
}

export default { attachRequestContext, addDbTime, getRequestDbTime };
