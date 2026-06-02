import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import createJournalEntriesProjectionWorker, {
  JOURNAL_ENTRIES_PROJECTION_NAME,
} from '../../../../lib/finance/projections/journalEntriesProjection.js';

const T = '00000000-0000-4000-8000-000000000011';

// Minimal store matching the runner's buffered-store surface (get/set/delete/keys/clear).
function memStore() {
  const m = new Map();
  return {
    get: (k) => m.get(k),
    set: (k, v) => m.set(k, v),
    delete: (k) => m.delete(k),
    keys: () => [...m.keys()],
    clear: () => m.clear(),
  };
}

const entry = (id, status, created_at, extra = {}) => ({
  id,
  tenant_id: T,
  status,
  created_at,
  updated_at: created_at,
  currency: 'usd',
  lines: [],
  ...extra,
});

const draftCreated = (id, created_at) => ({
  id: `evt_dc_${id}`,
  tenant_id: T,
  event_type: 'finance.journal.draft_created',
  created_at,
  payload: { journal_entry: entry(id, 'draft', created_at) },
});

const approvalRequested = (id, created_at) => ({
  id: `evt_ar_${id}`,
  tenant_id: T,
  event_type: 'finance.approval.requested',
  created_at,
  payload: {
    approval: { id: `appr_${id}`, target_type: 'journal_entry', target_id: id },
    adapter_job: { id: `aj_${id}` },
    journal_entry: entry(id, 'pending_approval', created_at, { updated_at: created_at }),
  },
});

const reversalRequested = (id, created_at) => ({
  id: `evt_rr_${id}`,
  tenant_id: T,
  event_type: 'finance.journal.reversal_requested',
  created_at,
  payload: { original_entry_id: 'orig', reversal_entry: entry(id, 'pending_approval', created_at) },
});

describe('journal_entries projection', () => {
  test('exposes its name', () => {
    assert.equal(
      createJournalEntriesProjectionWorker().projectionName,
      JOURNAL_ENTRIES_PROJECTION_NAME,
    );
  });

  test('replays draft + pending_approval + reversal entries into the snapshot', () => {
    const w = createJournalEntriesProjectionWorker();
    const store = memStore();
    w.replay(
      [
        draftCreated('j_draft', '2026-06-01T00:00:01Z'),
        approvalRequested('j_pending', '2026-06-01T00:00:02Z'),
        reversalRequested('j_rev', '2026-06-01T00:00:03Z'),
      ],
      store,
    );
    const out = w.getProjection(T, {}, store);
    const byId = Object.fromEntries(out.map((e) => [e.id, e]));
    assert.equal(byId.j_draft.status, 'draft');
    assert.equal(byId.j_pending.status, 'pending_approval');
    assert.equal(byId.j_rev.status, 'pending_approval');
    assert.equal(out.length, 3);
  });

  test('draft -> pending_approval for the same id updates in place (full-entry parity)', () => {
    const w = createJournalEntriesProjectionWorker();
    const store = memStore();
    w.handleEvent(draftCreated('j1', '2026-06-01T00:00:01Z'), store);
    const enriched = approvalRequested('j1', '2026-06-01T00:00:05Z');
    w.handleEvent(enriched, store);
    const out = w.getProjection(T, {}, store);
    assert.equal(out.length, 1);
    assert.equal(out[0].status, 'pending_approval');
    // Bit-for-bit: the snapshot equals the enriched event's journal_entry.
    assert.deepEqual(out[0], enriched.payload.journal_entry);
  });

  test('validation_failed and approval.approved do not create or mutate entries', () => {
    const w = createJournalEntriesProjectionWorker();
    const store = memStore();
    w.handleEvent(draftCreated('j1', '2026-06-01T00:00:01Z'), store);
    w.handleEvent(
      {
        id: 'e_vf',
        tenant_id: T,
        event_type: 'finance.journal.validation_failed',
        created_at: '2026-06-01T00:00:02Z',
        payload: { errors: ['x'] },
      },
      store,
    );
    w.handleEvent(
      {
        id: 'e_aa',
        tenant_id: T,
        event_type: 'finance.approval.approved',
        created_at: '2026-06-01T00:00:03Z',
        payload: { approval: { id: 'appr_j1', target_id: 'j1' } },
      },
      store,
    );
    const out = w.getProjection(T, {}, store);
    assert.equal(out.length, 1);
    assert.equal(out[0].status, 'draft');
  });

  test('fallback: pre-enrichment approval.requested (no journal_entry) still transitions status by target_id', () => {
    const w = createJournalEntriesProjectionWorker();
    const store = memStore();
    w.handleEvent(draftCreated('j1', '2026-06-01T00:00:01Z'), store);
    const legacy = {
      id: 'evt_ar_legacy',
      tenant_id: T,
      event_type: 'finance.approval.requested',
      created_at: '2026-06-01T00:00:05Z',
      payload: {
        approval: { id: 'appr_j1', target_type: 'journal_entry', target_id: 'j1' },
        adapter_job: { id: 'aj' },
      },
    };
    w.handleEvent(legacy, store);
    const out = w.getProjection(T, {}, store);
    assert.equal(out.length, 1);
    assert.equal(out[0].status, 'pending_approval');
  });
});
