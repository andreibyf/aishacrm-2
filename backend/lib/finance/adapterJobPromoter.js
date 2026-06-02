/**
 * adapterJobPromoter.js
 *
 * Slice 2B — adapter job draft → queued promoter.
 *
 * Invoked by financeDomainService.approveFinanceAction() in the same call that
 * marks an approval `approved`. Finds all adapter_jobs linked to the approval's
 * target via shared aggregate_id and atomically promotes each from
 * `status='draft'` to `status='queued'`, emitting one
 * `finance.adapter.sync_queued` event per promoted job.
 *
 * Per Slice 2-0 design freeze §4.1 / §4.7:
 *   - `simulateDealWon` inserts the adapter_job in `status='draft'` with NO
 *     `sync_queued` event (the row is not yet runnable).
 *   - The `draft → queued` transition is THIS module's responsibility, and the
 *     `finance.adapter.sync_queued` event is emitted exclusively here.
 *   - The job processor (`adapterJobProcessor.js`) emits ONLY `sync_succeeded`
 *     and `sync_failed`; it never emits `sync_queued`.
 *
 * Per Phase 3-8 §5.7 contract: this module DOES NOT touch the journal entry.
 * The journal stays at `pending_approval`. Only the adapter_job transitions.
 * Journal posting is NOT a Slice 2 deliverable.
 *
 * Dual-mode operation:
 *   - In-memory mode (default for current HTTP runtime): pass `bucket`; the
 *     promoter walks `bucket.adapterJobs` and mutates row status in place.
 *   - Persistent mode (used when the persistent-events route lift lands in a
 *     later slice): pass `pool` (a pg.Pool); the promoter performs the atomic
 *     UPDATE via SQL.
 *
 * Idempotency: the `status='draft'` filter (in both modes) is the natural
 * idempotency guarantee. A job already at `status='queued'` (e.g., from a
 * concurrent or replayed approval) is skipped — no double-promotion, no
 * duplicate `sync_queued` event emitted by this module.
 */

import createFinanceEventEnvelope from './financeEventEnvelope.js';

function defaultNow() {
  return new Date().toISOString();
}

function buildSyncQueuedEvent({ tenantId, promotedJob, actor, requestId, braidTraceId, queuedAt }) {
  return createFinanceEventEnvelope({
    tenantId,
    eventType: 'finance.adapter.sync_queued',
    aggregateType: 'adapter_job',
    aggregateId: promotedJob.id,
    actorId: actor?.id ?? null,
    actorType: actor?.type ?? 'system',
    requestId,
    braidTraceId,
    payload: {
      job_id: promotedJob.id,
      provider: promotedJob.provider,
      object_type: promotedJob.aggregate_type,
      object_id: promotedJob.aggregate_id,
      operation: promotedJob.operation,
      mode: promotedJob.mode,
      queued_at: queuedAt,
      adapter_job: { ...promotedJob },
    },
  });
}

function findInMemoryDrafts({ bucket, tenantId, aggregateId }) {
  if (!bucket || !Array.isArray(bucket.adapterJobs)) return [];
  return bucket.adapterJobs.filter(
    (job) =>
      job.tenant_id === tenantId && job.aggregate_id === aggregateId && job.status === 'draft',
  );
}

async function findAndLockPersistentDrafts({ pool, tenantId, aggregateId }) {
  // FOR UPDATE SKIP LOCKED is the established Slice 2 claim/lock posture
  // (mirrors §4.1's job-claim semantics on a different status filter).
  // Returns rows ready for atomic status flip in the same transaction.
  const sql = `
    SELECT id, tenant_id, provider, aggregate_type, aggregate_id, operation, mode,
           status, attempts, created_at, updated_at, payload
      FROM finance.adapter_jobs
     WHERE tenant_id = $1
       AND aggregate_id = $2
       AND status = 'draft'
       FOR UPDATE SKIP LOCKED
  `;
  const { rows } = await pool.query(sql, [tenantId, aggregateId]);
  return rows;
}

async function markPersistentQueued({ pool, jobId, now }) {
  const sql = `
    UPDATE finance.adapter_jobs
       SET status = 'queued',
           updated_at = $2
     WHERE id = $1
       AND status = 'draft'
     RETURNING *
  `;
  const { rows } = await pool.query(sql, [jobId, now]);
  return rows[0] || null;
}

/**
 * Promote all draft adapter_jobs linked to the given approval's target
 * (matched by shared aggregate_id) from `draft → queued`, emitting one
 * `finance.adapter.sync_queued` event per promoted job.
 *
 * @param {Object} opts
 * @param {import('pg').Pool} [opts.pool] - persistent-mode pool (mutually
 *   exclusive with `bucket`)
 * @param {Object} [opts.bucket] - in-memory tenant bucket from
 *   financeDomainService (mutually exclusive with `pool`)
 * @param {string} opts.tenantId
 * @param {string} opts.aggregateId - the approval's target_id (e.g., journal
 *   entry id); the promoter finds adapter_jobs sharing this aggregate_id
 * @param {Object} opts.eventStore - must expose `append(envelope)`
 * @param {Object} [opts.actor] - { id, type } for event actor attribution
 * @param {string} [opts.requestId]
 * @param {string} [opts.braidTraceId]
 * @param {Function} [opts.now] - clock injection for tests
 *
 * @returns {Promise<{ promoted_count: number, promoted_jobs: Array<{id, provider, operation, mode}> }>}
 */
export async function promoteLinkedAdapterJobs({
  pool = null,
  bucket = null,
  tenantId,
  aggregateId,
  eventStore,
  actor = { id: null, type: 'system' },
  requestId = null,
  braidTraceId = null,
  now = defaultNow,
}) {
  if (!tenantId) {
    const err = new Error('promoteLinkedAdapterJobs: tenantId is required');
    err.code = 'FINANCE_PROMOTER_INVALID';
    throw err;
  }
  if (!aggregateId) {
    const err = new Error('promoteLinkedAdapterJobs: aggregateId is required');
    err.code = 'FINANCE_PROMOTER_INVALID';
    throw err;
  }
  if (!eventStore || typeof eventStore.append !== 'function') {
    const err = new Error('promoteLinkedAdapterJobs: eventStore.append is required');
    err.code = 'FINANCE_PROMOTER_INVALID';
    throw err;
  }
  if (pool && bucket) {
    const err = new Error('promoteLinkedAdapterJobs: pass either `pool` or `bucket`, not both');
    err.code = 'FINANCE_PROMOTER_INVALID';
    throw err;
  }

  const promoted = [];

  if (pool) {
    // Persistent mode — single transaction guarantees the find + flip + emit
    // sequence is atomic per job. Connection-per-call keeps the implementation
    // simple and avoids requiring the caller to manage tx state.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const drafts = await findAndLockPersistentDrafts({
        pool: client,
        tenantId,
        aggregateId,
      });

      for (const draft of drafts) {
        const queuedAt = now();
        const promotedRow = await markPersistentQueued({
          pool: client,
          jobId: draft.id,
          now: queuedAt,
        });
        if (!promotedRow) {
          // Race: another transaction flipped the row first (the SKIP LOCKED
          // selector cleared our row before our UPDATE landed). Skip silently.
          continue;
        }
        await eventStore.append(
          buildSyncQueuedEvent({
            tenantId,
            promotedJob: promotedRow,
            actor,
            requestId,
            braidTraceId,
            queuedAt,
          }),
        );
        promoted.push(promotedRow);
      }

      await client.query('COMMIT');
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch (_) {
        /* ignore rollback failure on already-rolled-back tx */
      }
      throw err;
    } finally {
      client.release();
    }
  } else {
    // In-memory mode — current HTTP runtime path. Single-process / single-tick
    // mutation is trivially atomic. The `status === 'draft'` filter is the
    // natural idempotency guarantee.
    const drafts = findInMemoryDrafts({ bucket, tenantId, aggregateId });
    for (const job of drafts) {
      const queuedAt = now();
      // Append-before-mutate (PR #632 P2): emit sync_queued from a post-promotion
      // snapshot first; only flip the live job to 'queued' after the append
      // resolves, so a failed append never leaves a phantom-promoted job.
      const promotedJob = { ...job, status: 'queued', updated_at: queuedAt };
      await eventStore.append(
        buildSyncQueuedEvent({
          tenantId,
          promotedJob,
          actor,
          requestId,
          braidTraceId,
          queuedAt,
        }),
      );
      job.status = 'queued';
      job.updated_at = queuedAt;
      promoted.push(job);
    }
  }

  return {
    promoted_count: promoted.length,
    promoted_jobs: promoted.map((job) => ({
      id: job.id,
      provider: job.provider,
      operation: job.operation,
      mode: job.mode,
    })),
  };
}

export default promoteLinkedAdapterJobs;
