/**
 * journalEntriesProjection.js
 *
 * Phase 4-1 slice #2 — the one new projection the persistent-events route lift
 * introduces. Backs the persistent-mode `GET /journal-entries` so reads match
 * the in-memory `service.listJournalEntries()` (clone of `bucket.journalEntries`)
 * bit-for-bit, including draft and pending_approval entries.
 *
 * Design: docs/architecture/finance/phase-4-1-persistent-events-projection-reads-design.md
 * §4 (read-source mapping) + §4.1 Amendment A (the `finance.approval.requested`
 * write-path enrichment that makes full-entry parity possible).
 *
 * Status reachability today: entries are only ever `draft` (after
 * draft_created) or `pending_approval` (after the approval-request flow / a
 * reversal draft). `posted` / `reversed` are defined in the vocabulary but
 * unreachable until a separate journal-posting slice adds a
 * `finance.journal.posted` emit-site — this projection already handles them so
 * that slice needs no projection change.
 */

export const JOURNAL_ENTRIES_PROJECTION_NAME = 'finance.projection.journal_entries';

// The full journal-entry lifecycle vocabulary. validation_failed and
// approval.approved are consumed as no-ops (they do not create or mutate the
// journal entry in the in-memory bucket — approval.approved explicitly keeps
// the journal at pending_approval per financeDomainService.js:691-694).
const CONSUMED_EVENTS = [
  'finance.journal.draft_created',
  'finance.journal.validation_failed',
  'finance.approval.requested',
  'finance.approval.approved',
  'finance.journal.reversal_requested',
  'finance.journal.posted',
  'finance.journal.reversed',
];

// Events whose payload carries the authoritative post-transition entry. The key
// differs for reversals (`reversal_entry`) vs everything else (`journal_entry`).
function entryFromEvent(event) {
  const payload = event?.payload || {};
  if (event.event_type === 'finance.journal.reversal_requested') {
    return payload.reversal_entry || null;
  }
  return payload.journal_entry || null;
}

function applyEvent(event, store) {
  const type = event?.event_type;

  // No-op events: no journal entry created or mutated in the bucket.
  if (type === 'finance.journal.validation_failed' || type === 'finance.approval.approved') {
    return;
  }

  const entry = entryFromEvent(event);
  if (entry && entry.id) {
    // Upsert the full entry snapshot — Map.set on an existing key updates in
    // place, preserving insertion order to mirror the in-memory array.
    store.set(entry.id, entry);
    return;
  }

  // Fallback for pre-Amendment-A `approval.requested` events that predate the
  // journal_entry enrichment (design §4.1 migration-of-meaning): transition the
  // referenced entry's status by the approval's target_id, leaving other fields
  // as last seen. No real historical corpus exists (persistent events are
  // fail-closed), so this is defensiveness for old fixtures only.
  if (type === 'finance.approval.requested') {
    const targetId = event.payload?.approval?.target_id;
    const prev = targetId ? store.get(targetId) : null;
    if (prev) {
      store.set(targetId, { ...prev, status: 'pending_approval' });
    }
  }
}

export function createJournalEntriesProjectionWorker() {
  return {
    projectionName: JOURNAL_ENTRIES_PROJECTION_NAME,
    consumedEvents: CONSUMED_EVENTS,
    schemaVersion: 1,

    handleEvent(event, store) {
      applyEvent(event, store);
    },

    replay(events, store) {
      for (const event of events) {
        applyEvent(event, store);
      }
    },

    // Returns the journal-entry list in insertion order, mirroring
    // `service.listJournalEntries()` (a clone of `bucket.journalEntries`).
    getProjection(_tenantId, _opts, store) {
      return store.keys().map((key) => store.get(key));
    },
  };
}

export default createJournalEntriesProjectionWorker;
