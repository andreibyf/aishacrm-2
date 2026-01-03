/**
 * Performance Log Batcher
 * Reduces per-request overhead by buffering log records and inserting in batches.
 */
import { getSupabaseClient } from './supabase-db.js';
import { sanitizeUuidInput } from './uuidValidator.js';
import logger from './logger.js';

let queue = [];
let flushing = false;
let initialized = false;
let pgFallback = null;
let lastFlushAt = null;

const FLUSH_INTERVAL_MS = parseInt(process.env.PERF_LOG_FLUSH_MS || '2000', 10); // 2s default
const BATCH_MAX = parseInt(process.env.PERF_LOG_BATCH_MAX || '25', 10);

function safeTenantId(raw) {
  // Performance logs require tenant_id in production
  // Map system/unknown/empty to SYSTEM_TENANT_ID if available, otherwise null
  const sanitized = sanitizeUuidInput(raw, { systemAliases: ['system', 'unknown', 'anonymous'] });
  // Fallback to system tenant if null and env is set
  if (!sanitized && process.env.SYSTEM_TENANT_ID) {
    return sanitizeUuidInput(process.env.SYSTEM_TENANT_ID);
  }
  return sanitized;
}

function sanitizeRecord(rec) {
  const r = { ...rec };
  r.tenant_id = safeTenantId(rec?.tenant_id);
  if (r.tenantId && !r.tenant_id) {
    r.tenant_id = safeTenantId(r.tenantId);
    delete r.tenantId;
  }
  return r;
}

export function initializePerformanceLogBatcher(pgPool) {
  if (initialized) return; // idempotent
  pgFallback = pgPool || null;
  setInterval(() => flush().catch(e => logger.error({ err: e }, '[PerfLogBatcher] Interval flush error')), FLUSH_INTERVAL_MS).unref();
  // Flush on shutdown
  for (const sig of ['SIGINT','SIGTERM','beforeExit']) {
    process.on(sig, async () => {
      try { await flush(); } catch {/* noop */}
    });
  }
  initialized = true;
  logger.info({ intervalMs: FLUSH_INTERVAL_MS, batchMax: BATCH_MAX }, '✓ Performance log batcher initialized');
}

export function enqueuePerformanceLog(record) {
  if (!initialized) {
    // If not initialized, fall back to direct insert attempt immediately
    return directInsert(record);
  }
  // Normalize tenant id
  record.tenant_id = safeTenantId(record.tenant_id);
  queue.push(record);
  if (queue.length >= BATCH_MAX) {
    flush().catch(e => logger.error({ err: e }, '[PerfLogBatcher] Flush error'));
  }
}

async function directInsert(rec) {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase.from('performance_logs').insert(sanitizeRecord(rec));
    if (error) throw error;
  } catch (e) {
    if (pgFallback) {
      try {
        const s = sanitizeRecord(rec);
        await pgFallback.query(
          `INSERT INTO performance_logs (tenant_id, method, endpoint, status_code, duration_ms, response_time_ms, db_query_time_ms, user_email, ip_address, user_agent, error_message, error_stack)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [s.tenant_id, s.method, s.endpoint, s.status_code, s.duration_ms, s.response_time_ms, s.db_query_time_ms, s.user_email, s.ip_address, s.user_agent, s.error_message, s.error_stack]
        );
      } catch (fallbackErr) {
        logger.error({ err: fallbackErr }, '[PerfLogBatcher] Direct fallback insert failed');
      }
    } else {
      logger.error({ err: e }, '[PerfLogBatcher] Direct insert failed');
    }
  }
}

export async function flush() {
  if (!initialized || flushing || queue.length === 0) return;
  flushing = true;
  const batch = queue;
  queue = [];
  try {
    const supabase = getSupabaseClient();
    // Bulk insert
    const sanitizedBatch = batch.map(sanitizeRecord);
    const { error } = await supabase.from('performance_logs').insert(sanitizedBatch);
    if (error) throw error;
    if (process.env.NODE_ENV !== 'production') {
      logger.debug({ count: batch.length }, '[PerfLogBatcher] Flushed performance logs');
    }
    lastFlushAt = new Date();
  } catch (e) {
    logger.error({ err: e }, '[PerfLogBatcher] Batch insert failed');
    // Fallback: attempt sequential pg inserts if available
    if (pgFallback) {
      for (const rec of batch) {
        const s = sanitizeRecord(rec);
        try {
          await pgFallback.query(
            `INSERT INTO performance_logs (tenant_id, method, endpoint, status_code, duration_ms, response_time_ms, db_query_time_ms, user_email, ip_address, user_agent, error_message, error_stack)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
            [s.tenant_id, s.method, s.endpoint, s.status_code, s.duration_ms, s.response_time_ms, s.db_query_time_ms, s.user_email, s.ip_address, s.user_agent, s.error_message, s.error_stack]
          );
        } catch (fallbackErr) {
          logger.error({ err: fallbackErr }, '[PerfLogBatcher] Fallback pgPool insert failed');
        }
      }
    }
  } finally {
    flushing = false;
  }
}

export function getPerformanceLogBatchStatus() {
  return {
    initialized,
    flushing,
    queueDepth: queue.length,
    batchMax: BATCH_MAX,
    flushIntervalMs: FLUSH_INTERVAL_MS,
    lastFlushAt,
  };
}
