/**
 * financeDomainReplay.js
 *
 * Phase 4-1 Task 5 — durable bucket hydration.
 *
 * Folds an ordered list of finance event envelopes into a domain-service tenant
 * bucket:
 *
 *   { journalEntries, invoices, approvals, adapterJobs, commands: [] }
 *
 * Purpose (used in Task 7): in persistent mode, replay a tenant's PG event store
 * into this bucket so the existing domain-service command logic (lookups +
 * duplicate/state guards) sees the FULL durable state — the same view it would
 * have in pure in-memory mode.
 *
 * Approach — ordered upsert-by-id from the authoritative record (mirrors the
 * projection workers). Every state-bearing finance event payload carries the
 * FULL post-transition record for its aggregate. So the fold is: for each event,
 * take the authoritative record from its payload and UPSERT it by `id` into the
 * right collection, preserving first-insertion order. A `Map` per collection
 * (keyed by id) gives us "update in place, preserve insertion order" for free —
 * `Map.set` on an existing key updates the value without changing iteration
 * order — exactly reproducing the in-memory bucket array, because the live
 * commands carry these same full records into the events.
 *
 * Records are deep-cloned on store so a later mutation of a shared event object
 * cannot leak into the rebuilt bucket (and vice-versa).
 *
 * `commands` is always `[]`: command envelopes are not events, and the
 * historical command log is not needed for guards/lookups.
 *
 * Verified against the emit sites in financeDomainService.js and
 * adapterJobPromoter.js (and mirrored against invoiceProjection.js /
 * journalEntriesProjection.js / approvalQueueProjection.js / adapterQueueProjection.js).
 */

function clone(value) {
  // structuredClone is available in Node 17+. JSON round-trip would also work,
  // but structuredClone preserves a wider value set and is the documented
  // contract for this fold.
  return structuredClone(value);
}

// Upsert the authoritative `record` (by `record.id`) into `map`, deep-cloning so
// the stored value never aliases the source event payload. No-ops when the
// record or its id is absent (some historical events omit an enrichment record).
function upsert(map, record) {
  if (record && record.id) {
    map.set(record.id, clone(record));
  }
}

/**
 * Fold an ordered list of finance event envelopes into a domain-service tenant
 * bucket. The caller is responsible for passing events for a SINGLE tenant in
 * append (replay) order.
 *
 * @param {Array<Object>} events - ordered finance event envelopes (each with
 *   `event_type` and `payload`).
 * @returns {{ journalEntries: Array, invoices: Array, approvals: Array,
 *   adapterJobs: Array, commands: Array }}
 */
export function rebuildBucketFromEvents(events = []) {
  const journalEntries = new Map();
  const invoices = new Map();
  const approvals = new Map();
  const adapterJobs = new Map();
  const accounts = new Map();

  for (const event of events || []) {
    const payload = (event && event.payload) || {};

    switch (event && event.event_type) {
      // COA Slice 1: an auto-created chart-of-accounts account. Audit-only event
      // (no business projection consumes it), but folded into the bucket so the
      // tenant chart is durable across restarts in persistent mode. The baseline
      // system accounts are NOT events — getTenantCoa re-seeds those on access.
      case 'finance.account.created':
        if (payload.account_id) {
          accounts.set(payload.account_id, {
            id: payload.account_id,
            tenant_id: event.tenant_id,
            account_code: payload.account_code,
            name: payload.name,
            classification: payload.classification,
            account_type: payload.account_type,
            parent_account_id: null,
            is_system: false,
            is_active: true,
            // Phase 2: provenance of the account. Pre-source events (auto-create
            // only existed before the manager) default to 'auto_resolution'.
            source: payload.source || 'auto_resolution',
          });
        }
        break;

      // Phase 2: COA FIELD edit. The COA manager emits the FULL post-edit account
      // snapshot under payload.account. Upsert/replace by account.id — preserving
      // first-insertion order (Map.set on an existing key updates in place).
      // Activation state is PRESERVED from the existing folded value, NOT taken from
      // the snapshot (Codex PR #651 P2): an ordinary edit's hydrated snapshot can
      // carry a STALE is_active that raced ahead of a concurrent deactivate, which
      // would silently reactivate. Activation changes ONLY via created / deactivated /
      // reactivated. `source` is carried from the snapshot, then existing, then 'manual'.
      case 'finance.account.updated':
        if (payload.account && payload.account.id) {
          const incoming = payload.account;
          const existing = accounts.get(incoming.id);
          accounts.set(incoming.id, {
            id: incoming.id,
            tenant_id: incoming.tenant_id ?? event.tenant_id,
            account_code: incoming.account_code,
            name: incoming.name,
            classification: incoming.classification,
            account_type: incoming.account_type,
            parent_account_id: incoming.parent_account_id ?? null,
            is_system: incoming.is_system ?? existing?.is_system ?? false,
            is_active: existing?.is_active ?? incoming.is_active ?? true,
            source: incoming.source ?? existing?.source ?? 'manual',
          });
        }
        break;

      // Phase 2: COA deactivation. Flip the existing account's is_active to
      // false in place (no-op if the id is absent — e.g. a deactivation that
      // races ahead of its create in a malformed stream).
      case 'finance.account.deactivated':
        if (payload.account_id && accounts.has(payload.account_id)) {
          const target = accounts.get(payload.account_id);
          accounts.set(payload.account_id, { ...target, is_active: false });
        }
        break;

      // COA reactivation — a DEDICATED event (symmetric with deactivated), so an
      // ordinary field edit can never carry activation. Flip is_active:true in place
      // (no-op if the id is absent). (Codex PR #651 P2)
      case 'finance.account.reactivated':
        if (payload.account_id && accounts.has(payload.account_id)) {
          const target = accounts.get(payload.account_id);
          accounts.set(payload.account_id, { ...target, is_active: true });
        }
        break;
      // Invoices — both create and update carry the full post-transition invoice
      // under payload.invoice. Mirrors invoiceProjection.js.
      case 'finance.invoice.draft_created':
      case 'finance.invoice.draft_updated':
        upsert(invoices, payload.invoice);
        break;

      // Standalone journal draft — full entry under payload.journal_entry.
      case 'finance.journal.draft_created':
        upsert(journalEntries, payload.journal_entry);
        break;

      // No record — validation failure does not create or mutate a journal entry.
      case 'finance.journal.validation_failed':
        break;

      // Approval requested (simulateDealWon flow) carries THREE post-transition
      // records: the journal_entry promoted to pending_approval, the approval,
      // and the draft adapter_job. Each is guarded (historical events may omit
      // the journal_entry / adapter_job enrichment). Mirrors
      // journalEntriesProjection.js Amendment A. Note: unlike that projection, the
      // fold does NOT reproduce its legacy `target_id` status-transition fallback
      // for pre-Amendment-A events — the live command path always emits the full
      // journal_entry (financeDomainService.js), so the fallback is unnecessary
      // here and a future maintainer should not "fix" its absence.
      case 'finance.approval.requested':
        upsert(journalEntries, payload.journal_entry);
        upsert(approvals, payload.approval);
        upsert(adapterJobs, payload.adapter_job);
        break;

      // Approval resolutions — the live bucket Object.assign's the full
      // post-transition approval over the pending one. Each carries the full
      // approval record under payload.approval, so the upsert replaces the
      // pending record in place (preserving order). rejected/cancelled have no
      // domain emit-site today; they are handled here for replay completeness
      // and mirror approvalQueueProjection.js's resolution semantics.
      case 'finance.approval.approved':
      case 'finance.approval.rejected':
      case 'finance.approval.cancelled':
        upsert(approvals, payload.approval);
        break;

      // Reversal request — full reversal entry under payload.reversal_entry, plus
      // a new approval. Mirrors journalEntriesProjection.js (reversal_entry key).
      case 'finance.journal.reversal_requested':
        upsert(journalEntries, payload.reversal_entry);
        upsert(approvals, payload.approval);
        break;

      // Adapter job promoted draft → queued. The promoter emits the full queued
      // job under payload.adapter_job; the upsert replaces the draft in place.
      // Mirrors adapterQueueProjection.js's payload.adapter_job contract.
      case 'finance.adapter.sync_queued':
        upsert(adapterJobs, payload.adapter_job);
        break;

      // Cash Flow Slice 2 — journal posting now HAS an emit-site
      // (approveFinanceAction). The posted event carries the full post-transition
      // entry under payload.journal_entry, so the upsert replaces the
      // pending_approval entry in place with status 'posted'. finance.journal.reversed
      // still has no emit-site (reversal is request → approval today); kept here
      // for replay completeness when a reversal-posting slice lands.
      case 'finance.journal.posted':
      case 'finance.journal.reversed':
        upsert(journalEntries, payload.journal_entry);
        break;
      //
      // Everything else (sync_succeeded/sync_failed, infrastructure, unknown
      // types) carries no bucket-state record — no-op.
      default:
        break;
    }
  }

  return {
    journalEntries: [...journalEntries.values()],
    invoices: [...invoices.values()],
    approvals: [...approvals.values()],
    adapterJobs: [...adapterJobs.values()],
    accounts: [...accounts.values()],
    commands: [],
  };
}

export default rebuildBucketFromEvents;
