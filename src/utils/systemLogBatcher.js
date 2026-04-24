// Client-side system log batching utility
// Reduces network overhead by aggregating INFO/WARN/ERROR logs and sending
// periodic bulk POSTs. Hardened against the Cloudflare 403 death spiral:
//   - ERROR does NOT bypass batching anymore; it shortens the next flush
//     window to 500ms so diagnostic info still arrives quickly.
//   - 403 (firewall/WAF block) and 429 (rate limit) put the batcher into
//     cooldown — subsequent logs are silently dropped until cooldown ends,
//     so we stop hammering the edge.
//   - No per-ERROR retry fallback. When a bulk POST fails we keep the error
//     signal; we never multiply the request count at the exact moment the
//     infrastructure is saying "slow down".
//   - Minimum inter-flush interval and a consecutive-failure circuit breaker
//     prevent rapid re-flushing from a noisy source.
//
// Import directly from the implementation module rather than the barrel
// re-export in entities.js. Equivalent function, but the narrower import
// graph sidesteps a vitest dep-scan failure and keeps test isolation tight.
import { callBackendAPI } from '@/api/core/httpClient';

const DEFAULT_INTERVAL = parseInt(import.meta.env?.VITE_SYSTEM_LOG_BATCH_INTERVAL_MS || '2000', 10); // 2s
const ERROR_FLUSH_INTERVAL = 500; // on ERROR, schedule a flush within 500ms
const MIN_INTER_FLUSH_MS = 500; // refuse to flush more often than 2/s
const COOLDOWN_MS = 30000; // 30s after a firewall/rate-limit signal
const CIRCUIT_BREAKER_TRIP_AT = 3; // consecutive non-cooldown failures
const CIRCUIT_BREAKER_OPEN_MS = 30000;
const MAX_BATCH = parseInt(import.meta.env?.VITE_SYSTEM_LOG_MAX_BATCH || '25', 10);

let queue = [];
let timer = null;
let lastFlush = 0;
let cooldownUntil = 0;
let consecutiveFailures = 0;
let circuitOpenUntil = 0;

function scheduleFlush(delayMs) {
  if (timer) return; // a flush is already scheduled
  timer = setTimeout(() => {
    timer = null;
    tryFlush();
  }, delayMs);
}

function isSuppressed() {
  const now = Date.now();
  return now < cooldownUntil || now < circuitOpenUntil;
}

function extractStatus(err) {
  // Errors from callBackendAPI may carry status on the error object OR be
  // plain `new Error("HTTP 403 ...")`. We sniff both.
  if (!err) return 0;
  if (typeof err.status === 'number') return err.status;
  const msg = String(err.message || err);
  const m = msg.match(/\b(4\d\d|5\d\d)\b/);
  return m ? parseInt(m[1], 10) : 0;
}

function isFirewallOrRateLimit(err) {
  const status = extractStatus(err);
  if (status === 403 || status === 429) return true;
  const msg = String(err?.message || err);
  return /RateLimit|Forbidden/i.test(msg);
}

function isNetworkError(err) {
  const msg = String(err?.message || err);
  const name = err?.name || '';
  return (
    /Failed to fetch|Network Error|NetworkError/i.test(msg) ||
    (name === 'TypeError' && /fetch/i.test(msg))
  );
}

async function flush() {
  if (!queue.length) return;
  if (isSuppressed()) {
    // Drop whatever is queued; keeping it would just grow memory while the
    // backend is refusing us anyway.
    queue = [];
    return;
  }

  // Min-interval guard: if we flushed very recently, push the flush out.
  const sinceLast = Date.now() - lastFlush;
  if (lastFlush > 0 && sinceLast < MIN_INTER_FLUSH_MS) {
    scheduleFlush(MIN_INTER_FLUSH_MS - sinceLast);
    return;
  }

  const entries = queue.splice(0, queue.length);
  lastFlush = Date.now();

  try {
    await callBackendAPI('system-logs/bulk', 'POST', { entries });
    consecutiveFailures = 0;
  } catch (err) {
    if (isFirewallOrRateLimit(err)) {
      // Don't retry, don't log noisily, don't fall back to per-entry POSTs.
      // Enter cooldown so the next ~30s of logs are silently dropped and we
      // give the edge/firewall a chance to stop blocking.
      cooldownUntil = Date.now() + COOLDOWN_MS;
      consecutiveFailures = 0; // firewall is a distinct signal; don't trip the breaker on top
      return;
    }

    if (isNetworkError(err)) {
      // Transient network flake — drop this batch, keep state, caller-level
      // retries can republish on next flush.
      consecutiveFailures += 1;
    } else {
      consecutiveFailures += 1;
    }

    if (consecutiveFailures >= CIRCUIT_BREAKER_TRIP_AT) {
      circuitOpenUntil = Date.now() + CIRCUIT_BREAKER_OPEN_MS;
      // Clear the counter so that after the breaker closes we start fresh.
      consecutiveFailures = 0;
    }
  }
}

async function tryFlush() {
  if (!queue.length) return;
  await flush();
}

export async function enqueueSystemLog(entry) {
  if (isSuppressed()) {
    // Drop on the floor. We're either in firewall/rate-limit cooldown or the
    // circuit breaker is open; queuing would just grow unbounded.
    return;
  }

  queue.push(entry);

  const level = (entry?.level || 'INFO').toUpperCase();
  const isError = level === 'ERROR';

  if (queue.length >= MAX_BATCH) {
    // Max-batch flush, but still respect the min-interval guard inside flush().
    await tryFlush();
    return;
  }

  // ERROR uses a shorter flush delay so important diagnostics still arrive
  // promptly, but a single ERROR does NOT produce an immediate standalone POST.
  scheduleFlush(isError ? ERROR_FLUSH_INTERVAL : DEFAULT_INTERVAL);
}

export async function flushSystemLogs() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  await tryFlush();
}

export function getSystemLogBatchStats() {
  return {
    queued: queue.length,
    intervalMs: DEFAULT_INTERVAL,
    maxBatch: MAX_BATCH,
    timeSinceLastFlushMs: lastFlush ? Date.now() - lastFlush : 0,
    cooldownMsRemaining: Math.max(0, cooldownUntil - Date.now()),
    circuitOpenMsRemaining: Math.max(0, circuitOpenUntil - Date.now()),
    consecutiveFailures,
  };
}

// Test-only helper. Resets module-level state so tests can start clean without
// needing to reload the module. Not part of the public runtime API.
export function __resetBatcherForTest() {
  queue = [];
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  lastFlush = 0;
  cooldownUntil = 0;
  consecutiveFailures = 0;
  circuitOpenUntil = 0;
}
