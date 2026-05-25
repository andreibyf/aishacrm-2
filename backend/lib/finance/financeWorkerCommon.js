/**
 * financeWorkerCommon.js
 *
 * Slice 2C deliverable — shared process-lifecycle helpers for the family of
 * `finance-*-worker` processes (`finance-projection-worker`,
 * `finance-adapter-worker`, and any later worker that follows the same
 * disabled-by-default + heartbeat-file + SIGINT/SIGTERM pattern).
 *
 * Why this exists (per slice-2-adapter-runtime-design.md §5.3):
 *
 *   The Slice 1 projection worker (backend/workers/financeProjectionWorker.js)
 *   established the disabled-by-default contract — three-tier strict-`'true'`
 *   env gate, controlled-tenant allow-list, JSON heartbeat file written on
 *   every poll cycle, SIGINT/SIGTERM clean shutdown, fail-fast at startup if
 *   neither FINANCE_DB_URL nor DATABASE_URL is set. Slice 2C delivers a
 *   second worker (finance-adapter-worker) that follows the EXACT same
 *   pattern — copy-pasting that infrastructure would create two divergent
 *   forks of the contract that drift the moment one worker gains a feature
 *   the other doesn't. So the shared bits live here.
 *
 * Hard constraint (per §7 + Slice 2-0 Q4): this extraction must be a pure
 * mechanical refactor — the projection worker's externally observable
 * behavior is byte-identical after migrating to these helpers. The existing
 * 13 projection-worker tests must continue to pass unchanged. If a test
 * would fail because a helper's behavior differs from the inlined version,
 * the helper is wrong, not the test.
 *
 * Helpers exported:
 *
 *   parseControlledTenantIds(env)
 *     Comma-separated UUID-list parser for FINANCE_CONTROLLED_TENANT_IDS.
 *     Empty / unset / whitespace-only → []. NO implicit "process all tenants"
 *     fall-through (tenants must be explicitly listed).
 *
 *   writeWorkerHeartbeat({ path, workerName, extra, log })
 *     Atomic-ish JSON heartbeat file writer. Adds `status` / `updated_at` /
 *     `pid` automatically and merges `extra` over them. Logs and swallows
 *     write errors so a transient filesystem hiccup never kills the worker.
 *
 *   installSignalHandlers(stop, { signals })
 *     Attach a single shutdown function to SIGINT + SIGTERM. Returns an
 *     uninstaller so tests can clean up after themselves. The handler is
 *     async-tolerant.
 */

import fs from 'node:fs';

/**
 * Parse FINANCE_CONTROLLED_TENANT_IDS into a trimmed, non-empty UUID list.
 *
 * Rules (must match the existing projection-worker behavior at
 * financeProjectionWorker.js:89 prior to refactor):
 *   - comma-separated string
 *   - trim each entry
 *   - drop empty entries (so trailing commas / extra spaces are tolerated)
 *   - empty / unset / non-string → []
 *
 * NOTE: UUID format is NOT validated here — the contract is "whatever the
 * operator put in the env, pass through". The downstream `WHERE tenant_id =
 * ANY($1::uuid[])` will reject malformed UUIDs at the DB layer, which gives
 * a clearer operator-facing error than silently filtering them out here.
 */
export function parseControlledTenantIds(env = process.env) {
  const raw = env.FINANCE_CONTROLLED_TENANT_IDS;
  if (!raw || typeof raw !== 'string') return [];
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/**
 * Write a JSON heartbeat file at `path`. Returns true on success, false on
 * failure (with a warn-level log via the supplied `log` interface).
 *
 * `workerName` is used purely for the log message prefix when a write
 * fails — keep it short ("finance-projection-worker" /
 * "finance-adapter-worker") so the existing operator log-scraping regexes
 * keep matching.
 *
 * Heartbeat schema (the consumers — the Docker healthcheck and the
 * Phase 3-x runbooks — depend on these field names):
 *   {
 *     status: 'ok' | 'starting' | 'stopping' | <whatever `extra.status` says>,
 *     updated_at: ISO timestamp,
 *     pid: <process pid>,
 *     ...extra
 *   }
 *
 * `extra` is shallow-merged AFTER the defaults, so a caller can override
 * `status` for the starting / stopping transitions.
 */
export function writeWorkerHeartbeat({ path, workerName, extra = {}, log } = {}) {
  const tag = workerName || 'finance-worker';
  if (!path) {
    if (log?.warn) {
      log.warn({ worker: tag }, `[${tag}] heartbeat path missing — skipping write`);
    }
    return false;
  }

  const heartbeat = {
    status: 'ok',
    updated_at: new Date().toISOString(),
    pid: process.pid,
    ...extra,
  };

  try {
    // codeql[js/insecure-temporary-file] — fixed, well-known path for non-sensitive process heartbeat metadata
    fs.writeFileSync(path, JSON.stringify(heartbeat));
    return true;
  } catch (error) {
    if (log?.warn) {
      log.warn(
        {
          worker: tag,
          path,
          error: error?.message || String(error),
        },
        `[${tag}] failed to write heartbeat`,
      );
    }
    return false;
  }
}

/**
 * Install a single shutdown handler on SIGINT + SIGTERM (configurable via
 * `signals`). Returns an `uninstall()` that removes the handlers — useful
 * for tests that want to verify install/uninstall pairing without bleeding
 * listeners across cases.
 *
 * `stop` may be sync or async; either way we await it and then schedule a
 * 50 ms process.exit(0) so any pending log flush / pool cleanup has a
 * window to complete (matches the projection worker's existing shutdown
 * timing at financeProjectionWorker.js:411).
 *
 * `onAfterStop` is an optional async hook the caller supplies for
 * worker-specific teardown (e.g. closing the pg.Pool) before the
 * process.exit. The worker's entry block uses this for `pool.end()`.
 *
 * `exit` is injected so tests can assert it was called without actually
 * exiting the test process.
 */
export function installSignalHandlers(
  stop,
  {
    signals = ['SIGINT', 'SIGTERM'],
    onAfterStop = null,
    exit = (code) => process.exit(code),
    exitDelayMs = 50,
  } = {},
) {
  if (typeof stop !== 'function') {
    throw new TypeError('installSignalHandlers requires a stop function');
  }

  const handler = async () => {
    try {
      await stop();
    } catch (_err) {
      // Stop is documented to swallow its own errors; defense-in-depth.
    }
    if (typeof onAfterStop === 'function') {
      try {
        await onAfterStop();
      } catch (_err) {
        // After-stop cleanup is best-effort.
      }
    }
    setTimeout(() => exit(0), exitDelayMs);
  };

  for (const signal of signals) {
    process.on(signal, handler);
  }

  return function uninstall() {
    for (const signal of signals) {
      process.off(signal, handler);
    }
  };
}

export default {
  parseControlledTenantIds,
  writeWorkerHeartbeat,
  installSignalHandlers,
};
