/**
 * persistentAdapterJobWriter.js
 *
 * Phase 4-1 (Codex PR #633 P1) — materialize `finance.adapter_jobs` ROWS in the
 * persistent write path.
 *
 * The problem: in persistent mode `runPersistentWrite` runs the command against
 * a per-request IN-MEMORY domain service (hydrated from the event stream). The
 * in-memory `promoteLinkedAdapterJobs` path emits `finance.adapter.sync_queued`
 * and mutates the in-memory bucket, but NOTHING ever inserts/updates a
 * `finance.adapter_jobs` row. The runtime adapter worker
 * (`adapterJobProcessor.claimPersistent`) only drains
 * `finance.adapter_jobs WHERE status = 'queued'`, so a job that exists only as an
 * event + projection is never claimed or processed — `/adapter-jobs` can show it
 * `queued` forever.
 *
 * The fix: after a durable write, UPSERT `finance.adapter_jobs` from the captured
 * adapter-job-bearing events so the canonical table mirrors the event stream and
 * the worker can claim the job. This is the authoritative table-of-record write
 * the in-memory path could never make.
 *
 * Idempotent by `ON CONFLICT (id)`; best-effort and NON-FATAL — the event is
 * already durably appended and the projection already reflects the job, so an
 * UPSERT failure is logged, not thrown (consistent with the projection-advance
 * posture in persistentWriteRunner.js).
 */

import defaultLogger from '../logger.js';

// The events that carry a `payload.adapter_job` snapshot to materialize. Mirrors
// the adapter_queue projection's consumed set: the draft from
// `finance.approval.requested` (simulateDealWon) plus the three sync events.
const ADAPTER_JOB_EVENTS = new Set([
  'finance.approval.requested',
  'finance.adapter.sync_queued',
  'finance.adapter.sync_succeeded',
  'finance.adapter.sync_failed',
]);

/**
 * Row status derived from the event TYPE — never trusted from the snapshot's
 * own `status` field. Mirrors `adapterQueueProjection.statusForEvent`: a
 * TRANSIENT `sync_failed` (`payload.permanent === false`) re-queues, so the
 * canonical row goes back to `queued` (matching the processor, which writes the
 * row back to `queued` with a `next_attempt_at`); only a PERMANENT failure is
 * terminal `failed`.
 */
export function adapterJobStatusForEvent(event) {
  switch (event?.event_type) {
    case 'finance.approval.requested':
      return 'draft';
    case 'finance.adapter.sync_queued':
      return 'queued';
    case 'finance.adapter.sync_succeeded':
      return 'succeeded';
    case 'finance.adapter.sync_failed':
      return event.payload && event.payload.permanent === false ? 'queued' : 'failed';
    default:
      return null;
  }
}

/**
 * Project one event into a `finance.adapter_jobs` row, or null if it carries no
 * usable adapter_job snapshot. The envelope `tenant_id` is authoritative (never
 * a stale snapshot tenant). `operation`/`mode` fall back to the schema-valid
 * defaults (`push_draft` / `draft_only`) so the CHECK constraints always pass.
 */
export function adapterJobRowFromEvent(event) {
  const job = event && event.payload && event.payload.adapter_job;
  if (!job || !job.id) return null;
  const status = adapterJobStatusForEvent(event);
  if (!status) return null;
  return {
    id: job.id,
    tenant_id: event.tenant_id ?? job.tenant_id ?? null,
    provider: job.provider ?? null,
    aggregate_type: job.aggregate_type ?? null,
    aggregate_id: job.aggregate_id ?? null,
    operation: job.operation ?? 'push_draft',
    mode: job.mode ?? 'draft_only',
    status,
    attempts: Number(job.attempts ?? event.payload?.attempts ?? 0),
    next_attempt_at:
      (event.payload && event.payload.next_attempt_at) ?? job.next_attempt_at ?? null,
    payload: job.payload ?? {},
  };
}

// NOTE (Codex PR #633 P1): `id` and `aggregate_id` are written as the app's
// PREFIXED string IDs (`adapter_job_<uuid>` / `journal_<uuid>`). Migration
// 177_finance_adapter_jobs_text_ids.sql widens those two columns from `uuid` to
// `text` so this insert is not rejected (22P02) — otherwise the per-row insert
// fails silently (non-fatal) and the SQL worker never gets a runnable row.
const UPSERT_SQL = `
  INSERT INTO finance.adapter_jobs
    (id, tenant_id, provider, aggregate_type, aggregate_id, operation, mode,
     status, attempts, next_attempt_at, payload, updated_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, now())
  ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status,
    attempts = EXCLUDED.attempts,
    next_attempt_at = EXCLUDED.next_attempt_at,
    payload = EXCLUDED.payload,
    updated_at = now()
`;

/**
 * UPSERT every adapter-job-bearing captured event into `finance.adapter_jobs` so
 * the SQL adapter worker can claim it. Scoped to `tenantId` (a captured event for
 * a foreign tenant is ignored — defence-in-depth). NON-FATAL per row.
 *
 * @param {object}   opts
 * @param {object}   opts.pool      pg Pool (or anything with `.query(sql, params)`).
 * @param {string}   opts.tenantId  authoritative tenant boundary.
 * @param {object[]} opts.events    the captured envelopes from the write.
 * @param {object}  [opts.logger]   injectable logger.
 * @returns {Promise<{ written: number }>}
 */
export async function materializeAdapterJobs({ pool, tenantId, events, logger = defaultLogger }) {
  if (!pool || typeof pool.query !== 'function') return { written: 0 };
  if (!Array.isArray(events) || events.length === 0) return { written: 0 };

  let written = 0;
  for (const event of events) {
    if (!ADAPTER_JOB_EVENTS.has(event?.event_type)) continue;
    const row = adapterJobRowFromEvent(event);
    if (!row || !row.id) continue;
    // Tenant boundary: never write a row for a tenant other than this write's.
    if (tenantId && row.tenant_id !== tenantId) continue;

    try {
      await pool.query(UPSERT_SQL, [
        row.id,
        row.tenant_id,
        row.provider,
        row.aggregate_type,
        row.aggregate_id,
        row.operation,
        row.mode,
        row.status,
        row.attempts,
        row.next_attempt_at,
        JSON.stringify(row.payload ?? {}),
      ]);
      written += 1;
    } catch (err) {
      // NON-FATAL: the event is durable and the projection already reflects the
      // job; surface the canonical-table write failure for the operator.
      logger.warn(
        {
          tenant_id: tenantId,
          adapter_job_id: row.id,
          status: row.status,
          err: err?.message ?? String(err),
        },
        'materializeAdapterJobs: finance.adapter_jobs upsert failed; event durable + projected — worker may not claim until re-driven',
      );
    }
  }
  return { written };
}

export default materializeAdapterJobs;
