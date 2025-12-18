// Client-side system log batching utility
// Reduces network overhead by aggregating INFO/WARN logs and sending periodic bulk POSTs.
// ERROR logs flush immediately to preserve diagnostic fidelity.

import { callBackendAPI } from '@/api/entities.js';

const DEFAULT_INTERVAL = parseInt(import.meta.env.VITE_SYSTEM_LOG_BATCH_INTERVAL_MS || '2000', 10); // 2s
const MAX_BATCH = parseInt(import.meta.env.VITE_SYSTEM_LOG_MAX_BATCH || '25', 10);

let queue = [];
let timer = null;
let lastFlush = Date.now();

function startTimer() {
  if (timer) return;
  timer = setInterval(() => {
    tryFlush('interval');
  }, DEFAULT_INTERVAL);
}

function stopTimer() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

async function flush(entries) {
  if (!entries.length) return;
  try {
    await callBackendAPI('system-logs/bulk', 'POST', { entries });
    lastFlush = Date.now();
  } catch (e) {
    // CRITICAL: Detect rate limiting to prevent infinite loop
    const isRateLimited = e.message?.includes('RateLimit') || e.message?.includes('429');
    
    if (isRateLimited) {
      // Silently drop logs during rate limit cooldown to prevent death spiral
      console.warn('[systemLogBatcher] Rate limit detected, dropping', entries.length, 'logs to prevent cascade');
      return;
    }
    
    // On bulk failure (non-rate-limit), fallback to individual posts for ERROR level only
    const criticalEntries = entries.filter(e => (e.level || '').toUpperCase() === 'ERROR');
    if (criticalEntries.length > 0) {
      console.warn('[systemLogBatcher] Bulk flush failed, retrying', criticalEntries.length, 'ERROR logs');
      for (const entry of criticalEntries) {
        try {
          await callBackendAPI('system-logs', 'POST', entry);
        } catch (singleErr) {
          // Silently fail - don't log errors about logging errors
          if (import.meta.env.DEV) {
            console.error('[systemLogBatcher] Single log fallback failed:', singleErr.message);
          }
        }
      }
    }
  }
}

function shouldBatch(level) {
  const critical = (level || '').toUpperCase() === 'ERROR';
  return !critical; // ERROR bypasses batching
}

async function tryFlush(trigger) {
  if (!queue.length) return;
  const slice = queue.splice(0, queue.length); // take all
  await flush(slice, trigger);
  if (!queue.length) stopTimer();
}

export async function enqueueSystemLog(entry) {
  const level = (entry.level || 'INFO').toUpperCase();
  if (!shouldBatch(level)) {
    // Immediate flush for ERROR
    return flush([entry], 'error-immediate');
  }

  queue.push(entry);
  if (queue.length >= MAX_BATCH) {
    await tryFlush('max-batch');
    return;
  }
  startTimer();
}

export async function flushSystemLogs() {
  await tryFlush('manual');
}

export function getSystemLogBatchStats() {
  return {
    queued: queue.length,
    intervalMs: DEFAULT_INTERVAL,
    maxBatch: MAX_BATCH,
    timeSinceLastFlushMs: Date.now() - lastFlush,
  };
}
