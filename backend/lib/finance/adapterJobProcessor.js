/**
 * adapterJobProcessor.js
 *
 * Slice 2B — adapter job processor.
 *
 * Drains `finance.adapter_jobs WHERE status = 'queued'` via optimistic-lock
 * claim, invokes the registered adapter for the job's provider, and emits
 * canonical `finance.adapter.sync_succeeded` or `finance.adapter.sync_failed`
 * events.
 *
 * Per Slice 2-0 design freeze §4.2 / §4.7:
 *   - This module emits ONLY `sync_succeeded` and `sync_failed`. It does NOT
 *     emit `sync_queued` — that's exclusively `adapterJobPromoter`'s job at
 *     the `draft → queued` transition.
 *   - This module NEVER processes jobs with `status='draft'` — only `'queued'`.
 *   - All emitted events use `aggregate_type='adapter_job'`,
 *     `aggregate_id=adapter_jobs.id` (no `object_type` / `object_id` drift).
 *
 * Per §4.6 two-layer safety contract:
 *   - `assertWritePermitted(operation, mode)` is the code-side gate; throws
 *     `AdapterPermissionError` if the operation is not permitted for the mode.
 *   - `FINANCE_PROVIDER_WRITES_ENABLED` is the dominant kill switch checked
 *     at processor level (NOT inside the adapter); when false, the HTTP call
 *     is skipped and the job is marked as a dry-run succeeded with
 *     `provider_id: null`.
 *
 * Per §4.8 retry/DLQ minimum posture:
 *   - `max_attempts = 5` (configurable via `FINANCE_ADAPTER_MAX_ATTEMPTS`).
 *   - Terminal failure (attempts >= max_attempts) emits a `sync_failed` event
 *     with `permanent: true` and creates a `finance.approvals` row with
 *     `target_type='adapter_job'` for operator review (deferred — see §4.8
 *     for the explicit list of out-of-scope-for-Slice-2 features).
 *
 * Dual-mode operation:
 *   - Persistent mode (production worker path): pass `pool` (a pg.Pool); the
 *     processor performs `SELECT ... FOR UPDATE SKIP LOCKED` per tenant and
 *     atomically transitions `queued → running → (succeeded|failed)`.
 *   - In-memory mode (testing / current HTTP runtime): pass `bucket` (the
 *     in-memory tenant bucket from financeDomainService); the processor walks
 *     `bucket.adapterJobs`.
 */

import createFinanceEventEnvelope from './financeEventEnvelope.js';

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_BASE_BACKOFF_MS = 15000;
const DEFAULT_CAP_BACKOFF_MS = 1800000;
const DEFAULT_JITTER_MS = 5000;

export class AdapterPermissionError extends Error {
  constructor(message, code = 'FINANCE_ADAPTER_PERMISSION_DENIED') {
    super(message);
    this.name = 'AdapterPermissionError';
    this.code = code;
  }
}

export class AdapterCapabilityError extends Error {
  constructor(message, code = 'FINANCE_ADAPTER_CAPABILITY_UNSUPPORTED') {
    super(message);
    this.name = 'AdapterCapabilityError';
    this.code = code;
  }
}

function defaultNow() {
  return new Date().toISOString();
}

/**
 * Code-side write-permission gate per adapter-runtime-contract §4.
 *
 * The behavior matrix below mirrors §4.6 of the Slice 2-0 design freeze:
 *
 *   operation         | mode          | allowed?
 *   ------------------|---------------|-------------------------------
 *   push_draft        | draft_only    | yes (Slice 2 default)
 *   push_draft        | sandbox_full  | yes
 *   push_draft        | production    | yes (requires writes_enabled)
 *   push_final        | draft_only    | NO (capability mismatch)
 *   push_final        | sandbox_full  | yes (requires writes_enabled)
 *   push_final        | production    | yes (requires writes_enabled)
 *   void_record       | draft_only    | NO
 *   void_record       | sandbox_full  | yes (requires writes_enabled)
 *   void_record       | production    | yes (requires writes_enabled)
 *   pull_status       | any           | yes (read-only)
 *   sync_status       | any           | yes (read-only)
 *   reconcile         | any           | yes (read-only)
 *
 * The provider-writes-enabled kill switch is checked separately by the
 * processor — this function only handles the operation × mode matrix.
 */
export function assertWritePermitted(operation, mode) {
  const readOnlyOps = new Set(['pull_status', 'sync_status', 'reconcile']);
  if (readOnlyOps.has(operation)) return; // read ops always permitted

  if (operation === 'push_draft') return; // permitted in every mode

  if (operation === 'push_final' || operation === 'void_record') {
    if (mode === 'draft_only') {
      throw new AdapterPermissionError(
        `Operation '${operation}' is not permitted under mode 'draft_only'`,
      );
    }
    return; // permitted in sandbox_full / production (subject to writes-enabled gate)
  }

  throw new AdapterPermissionError(
    `Unknown adapter operation '${operation}'; cannot evaluate permission`,
  );
}

function isProviderWritesEnabled() {
  return process.env.FINANCE_PROVIDER_WRITES_ENABLED === 'true';
}

function getMaxAttempts() {
  const v = Number.parseInt(process.env.FINANCE_ADAPTER_MAX_ATTEMPTS || '', 10);
  if (Number.isFinite(v) && v > 0) return v;
  return DEFAULT_MAX_ATTEMPTS;
}

/**
 * Compute next-attempt delay in ms per §4.8 exponential backoff with jitter.
 *
 *   delay = min(2^attempts * base_ms, cap_ms) + rand(0..jitter_ms)
 */
export function computeBackoffMs(attempts, opts) {
  const safe = opts || {};
  const base = Number.isFinite(safe.baseMs) ? safe.baseMs : DEFAULT_BASE_BACKOFF_MS;
  const cap = Number.isFinite(safe.capMs) ? safe.capMs : DEFAULT_CAP_BACKOFF_MS;
  const jitter = Number.isFinite(safe.jitterMs) ? safe.jitterMs : DEFAULT_JITTER_MS;
  const exp = Math.min(Math.pow(2, Math.max(0, attempts)) * base, cap);
  const rand = safe.random ? safe.random() : Math.random();
  return Math.floor(exp + rand * jitter);
}

function buildSyncSucceededEvent({
  tenantId,
  job,
  attempts,
  durationMs,
  providerId,
  canonicalSnapshot,
  now,
}) {
  return createFinanceEventEnvelope({
    tenantId,
    eventType: 'finance.adapter.sync_succeeded',
    aggregateType: 'adapter_job',
    aggregateId: job.id,
    payload: {
      job_id: job.id,
      provider: job.provider,
      object_type: job.aggregate_type,
      object_id: job.aggregate_id,
      operation: job.operation,
      attempts,
      duration_ms: durationMs,
      provider_id: providerId,
      canonical_snapshot: canonicalSnapshot || null,
      adapter_job: { ...job, status: 'succeeded', updated_at: now },
    },
  });
}

function buildSyncFailedEvent({
  tenantId,
  job,
  attempts,
  permanent,
  errorMessage,
  errorCode,
  nextAttemptAt,
  now,
}) {
  return createFinanceEventEnvelope({
    tenantId,
    eventType: 'finance.adapter.sync_failed',
    aggregateType: 'adapter_job',
    aggregateId: job.id,
    payload: {
      job_id: job.id,
      provider: job.provider,
      object_type: job.aggregate_type,
      object_id: job.aggregate_id,
      operation: job.operation,
      attempts,
      permanent: !!permanent,
      error: { message: errorMessage, code: errorCode || null },
      next_attempt_at: permanent ? null : nextAttemptAt,
      adapter_job: { ...job, status: 'failed', attempts, updated_at: now },
    },
  });
}

function claimInMemory({ bucket, tenantId, now }) {
  if (!bucket || !Array.isArray(bucket.adapterJobs)) return null;
  const job = bucket.adapterJobs.find((j) => j.tenant_id === tenantId && j.status === 'queued');
  if (!job) return null;
  job.status = 'running';
  job.attempts = (job.attempts || 0) + 1;
  job.updated_at = now;
  return job;
}

async function claimPersistent({ client, tenantId, now }) {
  const sql = `
    UPDATE finance.adapter_jobs
       SET status = 'running',
           attempts = COALESCE(attempts, 0) + 1,
           updated_at = $2
     WHERE id = (
       SELECT id FROM finance.adapter_jobs
        WHERE tenant_id = $1
          AND status = 'queued'
          AND (next_attempt_at IS NULL OR next_attempt_at <= $2)
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
     )
     RETURNING *
  `;
  const { rows } = await client.query(sql, [tenantId, now]);
  return rows[0] || null;
}

function applyTerminalInMemory({ bucket, jobId, status, now, attempts }) {
  const job = bucket.adapterJobs.find((j) => j.id === jobId);
  if (job) {
    job.status = status;
    job.updated_at = now;
    if (Number.isFinite(attempts)) job.attempts = attempts;
  }
  return job;
}

async function applyTerminalPersistent({ client, jobId, status, now, attempts, nextAttemptAt }) {
  const sql = `
    UPDATE finance.adapter_jobs
       SET status = $2,
           attempts = $3,
           updated_at = $4,
           next_attempt_at = $5
     WHERE id = $1
     RETURNING *
  `;
  const { rows } = await client.query(sql, [jobId, status, attempts, now, nextAttemptAt]);
  return rows[0] || null;
}

function applyRequeueInMemory({ bucket, jobId, now, attempts, nextAttemptAt }) {
  const job = bucket.adapterJobs.find((j) => j.id === jobId);
  if (job) {
    job.status = 'queued';
    job.attempts = attempts;
    job.updated_at = now;
    job.next_attempt_at = nextAttemptAt;
  }
  return job;
}

/**
 * Process a single claimed job through the 7-step sequence per §4.2.
 * Returns one of:
 *   { outcome: 'succeeded', event, durationMs }
 *   { outcome: 'failed', event, permanent, nextAttemptAt }
 *   { outcome: 'skipped', reason }   // e.g., adapter not registered
 */
async function processSingleJob({
  job,
  tenantId,
  adapters,
  buildProviderPayload,
  now,
  attempts,
  maxAttempts,
  backoffOpts,
}) {
  // Step 1: Adapter lookup
  const adapter = adapters?.get?.(job.provider);
  if (!adapter) {
    // No adapter registered for this provider — skip without consuming an attempt.
    return {
      outcome: 'skipped',
      reason: `No adapter registered for provider '${job.provider}'`,
    };
  }

  // Step 2: assertWritePermitted (code-side gate per §4.6)
  try {
    assertWritePermitted(job.operation, job.mode);
  } catch (permErr) {
    // Permission denial is a permanent failure — does not retry.
    return {
      outcome: 'failed',
      permanent: true,
      errorMessage: permErr.message,
      errorCode: permErr.code,
      attempts,
    };
  }

  // Step 3: buildProviderPayload (E6 boundary — strips internal metadata)
  let providerPayload = null;
  if (typeof buildProviderPayload === 'function') {
    try {
      providerPayload = buildProviderPayload(job.payload || {}, {
        provider: job.provider,
        mode: job.mode,
      });
    } catch (payloadErr) {
      return {
        outcome: 'failed',
        permanent: true,
        errorMessage: `Payload boundary build failed: ${payloadErr.message}`,
        errorCode: payloadErr.code || 'FINANCE_PAYLOAD_BUILD_FAILED',
        attempts,
      };
    }
  } else {
    // No payload builder injected (test / future wiring) — pass-through.
    providerPayload = job.payload || {};
  }

  // Step 4: FINANCE_PROVIDER_WRITES_ENABLED dominant kill switch
  //
  // For Slice 2 the default is false. When false, we skip the HTTP call
  // and record a dry-run succeeded outcome with provider_id: null. This
  // proves the full lifecycle works end-to-end without touching the
  // provider. The §5.3.c "draft-write proof" in 2C-9 is the only step
  // that flips this to true (against sandbox ERPNext, reverted immediately
  // after).
  const writesEnabled = isProviderWritesEnabled();
  const startedAt = Date.now();

  if (!writesEnabled) {
    return {
      outcome: 'succeeded',
      providerId: null,
      canonicalSnapshot: providerPayload,
      durationMs: 0,
      attempts,
      dryRun: true,
    };
  }

  // Step 5+6: Call adapter
  try {
    const adapterMethod = adapterMethodForOperation(job.operation);
    if (!adapter[adapterMethod] || typeof adapter[adapterMethod] !== 'function') {
      throw new AdapterCapabilityError(
        `Adapter '${job.provider}' does not implement '${adapterMethod}'`,
      );
    }
    // Map Track A's snake_case aggregate_type vocabulary to the provider's
    // PascalCase objectType vocabulary (per AGGREGATE_TYPE_TO_OBJECT_TYPE
    // above). The two vocabularies are intentionally separate; the
    // aggregate_type is the event-stream entity name (stable across
    // providers) and the objectType is the per-adapter doc-type lookup key
    // (e.g., 'journal_entry' → 'JournalEntry' for the ERPNext adapter).
    //
    // If the mapping is missing, throw AdapterConfigError — the processor
    // catches it below and classifies it as a PERMANENT failure (no retry).
    let objectType;
    try {
      objectType = aggregateTypeToObjectType(job.aggregate_type);
    } catch (mapErr) {
      throw mapErr; // bubbles to the outer try/catch which classifies as permanent
    }

    // ctx shape aligns with Slice 2A's createErpnextSandboxAdapter contract:
    // ctx accepts either a bare objectType string OR { objectType, runtimePolicy }
    // per the subagent's design call documented in the 2A report. We pass the
    // rich object form so the adapter can use mode + provider when needed.
    const result = await adapter[adapterMethod](providerPayload, {
      objectType,
      runtimePolicy: { provider: job.provider, mode: job.mode },
      tenantId,
      jobId: job.id,
      now,
    });
    const durationMs = Date.now() - startedAt;
    return {
      outcome: 'succeeded',
      providerId: result?.provider_id || result?.id || null,
      canonicalSnapshot: providerPayload,
      durationMs,
      attempts,
    };
  } catch (callErr) {
    // Capability errors are permanent (the adapter cannot do this operation).
    if (callErr instanceof AdapterCapabilityError) {
      return {
        outcome: 'failed',
        permanent: true,
        errorMessage: callErr.message,
        errorCode: callErr.code,
        attempts,
      };
    }
    // Config errors (missing aggregate_type → objectType mapping, adapter
    // misconfiguration like a non-sandbox base URL) are permanent too —
    // retrying with the same job and code state will deterministically fail
    // the same way. The named error class lives in
    // accountingAdapters/erpnextSandboxAdapter.js (`AdapterConfigError`);
    // we match by `code` to avoid coupling the processor to a specific
    // adapter import.
    if (callErr?.code === 'FINANCE_ADAPTER_CONFIG_INVALID') {
      return {
        outcome: 'failed',
        permanent: true,
        errorMessage: callErr.message,
        errorCode: callErr.code,
        attempts,
      };
    }
    // All other errors are transient and may retry.
    const isPermanent = attempts >= maxAttempts;
    const nextAttemptAt = isPermanent
      ? null
      : new Date(Date.now() + computeBackoffMs(attempts, backoffOpts)).toISOString();
    return {
      outcome: 'failed',
      permanent: isPermanent,
      errorMessage: callErr?.message || 'unknown adapter error',
      errorCode: callErr?.code || null,
      nextAttemptAt,
      attempts,
    };
  }
}

/**
 * Map the Track A `aggregate_type` vocabulary (snake_case domain entity
 * names — see `simulateDealWon`, `createDraftInvoice`, etc.) onto the
 * provider-facing `objectType` vocabulary (PascalCase per
 * `ERPNEXT_PROVIDER_OBJECT_MAP` keys). The two vocabularies are intentionally
 * separate: `aggregate_type` is the AiSHA event-stream entity name and stays
 * stable across all providers; `objectType` is the per-adapter doc-type
 * lookup key.
 *
 * Slice 2 ships `journal_entry → JournalEntry` and `account → Account`.
 * Future entity types (invoice, customer, payment) are added here as their
 * canonical mappers and adapter object maps land.
 *
 * Throws AdapterConfigError if the aggregate_type has no provider object-type
 * mapping — caller (the processor) classifies that as a permanent failure
 * (the job will not be retried; an operator must add the mapping).
 */
export const AGGREGATE_TYPE_TO_OBJECT_TYPE = Object.freeze({
  journal_entry: 'JournalEntry',
  account: 'Account',
});

export function aggregateTypeToObjectType(aggregateType) {
  const mapped = AGGREGATE_TYPE_TO_OBJECT_TYPE[aggregateType];
  if (!mapped) {
    const err = new Error(
      `No provider objectType mapping for aggregate_type '${aggregateType}' — add an entry to AGGREGATE_TYPE_TO_OBJECT_TYPE`,
    );
    err.code = 'FINANCE_ADAPTER_CONFIG_INVALID';
    throw err;
  }
  return mapped;
}

function adapterMethodForOperation(operation) {
  switch (operation) {
    case 'push_draft':
      return 'pushDraft';
    case 'push_final':
      return 'pushFinal';
    case 'void_record':
      return 'voidRecord';
    case 'pull_status':
      return 'pullStatus';
    case 'sync_status':
      return 'syncStatus';
    case 'reconcile':
      return 'reconcile';
    default:
      throw new AdapterCapabilityError(`Unknown adapter operation '${operation}'`);
  }
}

/**
 * Run one adapter poll cycle across all configured tenants.
 *
 * @param {Object} opts
 * @param {import('pg').Pool} [opts.pool] - persistent-mode pool (mutually
 *   exclusive with `bucket`)
 * @param {Object} [opts.bucket] - in-memory tenant bucket (testing)
 * @param {Map<string, Object>} opts.adapters - registry: provider name → adapter
 * @param {string[]} opts.tenantIds - allow-list of tenants to process this cycle
 * @param {Object} opts.eventStore - must expose `append(envelope)`
 * @param {Function} [opts.now] - clock injection for tests
 * @param {Function} [opts.buildProviderPayload] - 2A's payload boundary; pass
 *   through `job.payload` if absent
 * @param {Object} [opts.backoffOpts] - { baseMs, capMs, jitterMs, random } for
 *   deterministic test backoff
 *
 * @returns {Promise<{
 *   claimed_count: number,
 *   succeeded_count: number,
 *   failed_count: number,
 *   skipped_count: number,
 *   summary: Array<{tenant_id, job_id, provider, operation, outcome, attempts, ...}>
 * }>}
 */
export async function runAdapterPollCycle({
  pool = null,
  bucket = null,
  adapters,
  tenantIds = [],
  eventStore,
  now = defaultNow,
  buildProviderPayload = null,
  backoffOpts = null,
} = {}) {
  if (!eventStore || typeof eventStore.append !== 'function') {
    const err = new Error('runAdapterPollCycle: eventStore.append is required');
    err.code = 'FINANCE_PROCESSOR_INVALID';
    throw err;
  }
  if (pool && bucket) {
    const err = new Error('runAdapterPollCycle: pass either `pool` or `bucket`, not both');
    err.code = 'FINANCE_PROCESSOR_INVALID';
    throw err;
  }

  const maxAttempts = getMaxAttempts();

  const summary = [];
  let claimedCount = 0;
  let succeededCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  for (const tenantId of tenantIds) {
    if (!tenantId) continue;

    const tickNow = now();

    // Claim one job per tenant per cycle (single-row claim per §4.2).
    let claimedJob = null;
    let client = null;

    if (pool) {
      client = await pool.connect();
      try {
        await client.query('BEGIN');
        claimedJob = await claimPersistent({ client, tenantId, now: tickNow });
        if (!claimedJob) {
          await client.query('COMMIT');
          client.release();
          client = null;
          continue;
        }
        await client.query('COMMIT'); // claim is committed; outcome update is its own tx
      } catch (err) {
        try {
          await client.query('ROLLBACK');
        } catch (_) {
          /* ignore */
        }
        client.release();
        client = null;
        throw err;
      }
    } else {
      claimedJob = claimInMemory({ bucket, tenantId, now: tickNow });
      if (!claimedJob) continue;
    }

    claimedCount += 1;
    const attempts = claimedJob.attempts || 1;

    const result = await processSingleJob({
      job: claimedJob,
      tenantId,
      adapters,
      buildProviderPayload,
      now: tickNow,
      attempts,
      maxAttempts,
      backoffOpts,
    });

    if (result.outcome === 'succeeded') {
      succeededCount += 1;
      const completedAt = now();
      if (pool) {
        const c = await pool.connect();
        try {
          await applyTerminalPersistent({
            client: c,
            jobId: claimedJob.id,
            status: 'succeeded',
            now: completedAt,
            attempts,
            nextAttemptAt: null,
          });
        } finally {
          c.release();
        }
      } else {
        applyTerminalInMemory({
          bucket,
          jobId: claimedJob.id,
          status: 'succeeded',
          now: completedAt,
          attempts,
        });
      }
      await eventStore.append(
        buildSyncSucceededEvent({
          tenantId,
          job: claimedJob,
          attempts,
          durationMs: result.durationMs,
          providerId: result.providerId,
          canonicalSnapshot: result.canonicalSnapshot,
          now: completedAt,
        }),
      );
      summary.push({
        tenant_id: tenantId,
        job_id: claimedJob.id,
        provider: claimedJob.provider,
        operation: claimedJob.operation,
        outcome: 'succeeded',
        attempts,
        dry_run: !!result.dryRun,
      });
    } else if (result.outcome === 'failed') {
      failedCount += 1;
      const completedAt = now();
      if (result.permanent) {
        if (pool) {
          const c = await pool.connect();
          try {
            await applyTerminalPersistent({
              client: c,
              jobId: claimedJob.id,
              status: 'failed',
              now: completedAt,
              attempts,
              nextAttemptAt: null,
            });
          } finally {
            c.release();
          }
        } else {
          applyTerminalInMemory({
            bucket,
            jobId: claimedJob.id,
            status: 'failed',
            now: completedAt,
            attempts,
          });
        }
      } else {
        // Transient failure — requeue with next_attempt_at; row goes back to
        // 'queued' so a future poll cycle can claim it after the backoff.
        if (pool) {
          const c = await pool.connect();
          try {
            await applyTerminalPersistent({
              client: c,
              jobId: claimedJob.id,
              status: 'queued',
              now: completedAt,
              attempts,
              nextAttemptAt: result.nextAttemptAt,
            });
          } finally {
            c.release();
          }
        } else {
          applyRequeueInMemory({
            bucket,
            jobId: claimedJob.id,
            now: completedAt,
            attempts,
            nextAttemptAt: result.nextAttemptAt,
          });
        }
      }
      await eventStore.append(
        buildSyncFailedEvent({
          tenantId,
          job: claimedJob,
          attempts,
          permanent: !!result.permanent,
          errorMessage: result.errorMessage,
          errorCode: result.errorCode,
          nextAttemptAt: result.nextAttemptAt,
          now: completedAt,
        }),
      );
      summary.push({
        tenant_id: tenantId,
        job_id: claimedJob.id,
        provider: claimedJob.provider,
        operation: claimedJob.operation,
        outcome: 'failed',
        attempts,
        permanent: !!result.permanent,
        error: result.errorMessage,
      });
    } else if (result.outcome === 'skipped') {
      skippedCount += 1;
      // Skipped: requeue the job back to 'queued' without consuming an attempt
      // (no event emitted — skipping is operational, not a domain event).
      const completedAt = now();
      const restoredAttempts = Math.max(0, attempts - 1);
      if (pool) {
        const c = await pool.connect();
        try {
          await applyTerminalPersistent({
            client: c,
            jobId: claimedJob.id,
            status: 'queued',
            now: completedAt,
            attempts: restoredAttempts,
            nextAttemptAt: null,
          });
        } finally {
          c.release();
        }
      } else {
        applyRequeueInMemory({
          bucket,
          jobId: claimedJob.id,
          now: completedAt,
          attempts: restoredAttempts,
          nextAttemptAt: null,
        });
      }
      summary.push({
        tenant_id: tenantId,
        job_id: claimedJob.id,
        provider: claimedJob.provider,
        operation: claimedJob.operation,
        outcome: 'skipped',
        reason: result.reason,
      });
    }
  }

  return {
    claimed_count: claimedCount,
    succeeded_count: succeededCount,
    failed_count: failedCount,
    skipped_count: skippedCount,
    summary,
  };
}

export default runAdapterPollCycle;
