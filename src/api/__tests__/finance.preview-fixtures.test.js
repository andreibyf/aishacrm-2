/**
 * Finance Ops usability preview fixtures (UI Slice 1D) — unit test.
 *
 * Guards the safety + honesty invariants of src/api/finance.previewFixtures.js:
 *  - All fixtures are deeply frozen (read-only; no consumer can mutate them).
 *  - The module exports NO mutation affordance (no post/patch/delete/approve/
 *    reject/reverse/replay/retry/cancel/sync/activate/enable surface).
 *  - Live-endpoint fixtures match the real src/api/finance.js return shapes.
 *  - Journal entries cover the full status set (draft/pending_approval/posted/
 *    reversed).
 *  - Adapter-queue mock-up covers queued/succeeded/failed and uses only the
 *    migration-172 operation CHECK enum.
 *  - Error fixtures carry the correct status codes + exact module-gate message.
 *  - Gap (future-state) fixtures are tagged notYetBackedByApi and reference a
 *    real FINANCE_API_GAPS designRef.
 *  - The representative-state catalog covers every console tab.
 */

import { describe, it, expect } from 'vitest';
import { FINANCE_API_GAPS } from '../finance';
import * as fixtures from '../finance.previewFixtures';

// Canonical Finance Ops tab ids (design freeze §6.2). The source of truth is
// FINANCE_OPS_TABS in src/pages/FinanceOps.jsx — asserted exact + frozen by
// FinanceOps.smoke.test.jsx. Re-declared here so this pure-data test does not
// pull the React page (and its react-router dependency) into the vmForks
// runner. If the tab inventory changes, the smoke test fails first.
const CANONICAL_TAB_IDS = [
  'runtime-overview',
  'ledger',
  'invoices',
  'journal-drafts',
  'journal-entries',
  'approvals',
  'adapter-queue',
  'audit',
  'projection',
  'sandbox-adapter',
  'evidence',
];

// Mirror of the migration-172 finance.adapter_jobs operation CHECK enum
// (backend/migrations/172_finance_ops_runtime_scaffold.sql:160). Kept inline so
// a future enum change forces a deliberate update here.
const ALLOWED_ADAPTER_OPERATIONS = new Set([
  'pull',
  'pull_status',
  'push_draft',
  'push_final',
  'sync_status',
  'void',
  'void_record',
  'reconcile',
]);

// Status set the slice explicitly asked the adapter-queue preview to cover.
const ADAPTER_QUEUE_PREVIEW_STATUSES = ['queued', 'succeeded', 'failed'];

// Verbs that would indicate a mutation affordance leaking into the preview
// module. The whole point of the read-only preview is that none of these exist.
const MUTATION_VERB_RE =
  /(post|patch|delete|put|create|update|approve|reject|reverse|replay|retry|cancel|sync|activate|enable|disable|mutate|write|send|submit|save)/i;

function isDeeplyFrozen(value, seen = new Set()) {
  if (!value || typeof value !== 'object') return true;
  if (seen.has(value)) return true;
  seen.add(value);
  if (!Object.isFrozen(value)) return false;
  return Object.keys(value).every((k) => isDeeplyFrozen(value[k], seen));
}

describe('finance.previewFixtures — safety invariants', () => {
  it('exposes a self-describing preview tenant sentinel, never a real UUID', () => {
    expect(fixtures.PREVIEW_TENANT_ID).toMatch(/preview/i);
    expect(fixtures.PREVIEW_TENANT_ID).toMatch(/demo|do-not-use/i);
    // A real tenant id is a v4 UUID; the sentinel must NOT look like one.
    expect(fixtures.PREVIEW_TENANT_ID).not.toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('ships a PREVIEW_NOTICE that flags the data as demo/preview only', () => {
    expect(fixtures.PREVIEW_NOTICE).toMatch(/preview|demo/i);
    expect(fixtures.PREVIEW_NOTICE.length).toBeGreaterThan(20);
  });

  it('deeply freezes every exported object fixture', () => {
    for (const [name, value] of Object.entries(fixtures)) {
      if (value && typeof value === 'object') {
        expect(isDeeplyFrozen(value), `${name} must be deeply frozen`).toBe(true);
      }
    }
  });

  it('exports no function and no mutation-verb affordance', () => {
    for (const [name, value] of Object.entries(fixtures)) {
      // No callable export — this is a pure-data module.
      expect(typeof value, `${name} should not be a function`).not.toBe('function');
      // No export name implies a mutation. (Data keys named e.g. "created_at"
      // live INSIDE fixtures and are not export names, so they are not checked
      // here; this guards the module's public surface.)
      expect(name, `${name} export name must not imply mutation`).not.toMatch(MUTATION_VERB_RE);
    }
  });
});

describe('finance.previewFixtures — live-endpoint shapes match the real client', () => {
  it('runtime status fixtures match the getRuntimeStatus shape', () => {
    const variants = Object.values(fixtures.runtimeStatusFixtures);
    expect(variants.length).toBeGreaterThanOrEqual(2);
    for (const s of variants) {
      expect(s).toHaveProperty('tenant_id');
      expect(s.runtime).toEqual(
        expect.objectContaining({
          mode: expect.any(String),
          persistence: expect.any(String),
          provider_sync: expect.any(String),
          governance: expect.any(String),
        }),
      );
      expect(Object.keys(s.counts).sort()).toEqual(
        ['adapter_jobs', 'approvals', 'audit_events', 'invoices', 'journal_entries'].sort(),
      );
      for (const c of Object.values(s.counts)) {
        expect(typeof c).toBe('number');
      }
    }
  });

  it('healthyInMemory keeps the default Slice 1 fail-closed posture', () => {
    const { runtime } = fixtures.runtimeStatusFixtures.healthyInMemory;
    // in-memory persistence + disabled provider sync = all guardrail banners on.
    expect(runtime.persistence).not.toBe('postgres-projection');
    expect(runtime.provider_sync).not.toBe('enabled');
  });

  it('persistentProjectionFuture keeps provider writes disabled (separate gate)', () => {
    const { runtime } = fixtures.runtimeStatusFixtures.persistentProjectionFuture;
    expect(runtime.persistence).toBe('postgres-projection');
    // Even in the future projection mock-up, provider writes stay closed.
    expect(runtime.provider_sync).not.toBe('enabled');
  });

  it('journal entries fixture covers the full status set with required fields', () => {
    const rows = fixtures.journalEntriesFixture.journal_entries;
    const statuses = new Set(rows.map((r) => r.status));
    for (const s of ['draft', 'pending_approval', 'posted', 'reversed']) {
      expect(statuses.has(s), `journal entries must include a ${s} row`).toBe(true);
    }
    for (const row of rows) {
      // Fields the domain service guarantees on every row.
      expect(row).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          aggregate_id: expect.any(String),
          status: expect.any(String),
          created_at: expect.any(String),
        }),
      );
    }
  });

  it('provides an empty journal-entries fixture for empty-state copy', () => {
    expect(fixtures.emptyJournalEntriesFixture.journal_entries).toEqual([]);
  });

  it('ledger / P&L / balance-sheet fixtures are plain opaque objects', () => {
    for (const f of [
      fixtures.ledgerFixture,
      fixtures.profitLossFixture,
      fixtures.balanceSheetFixture,
    ]) {
      expect(f).toBeTypeOf('object');
      expect(Array.isArray(f)).toBe(false);
      expect(Object.keys(f).length).toBeGreaterThan(0);
    }
    for (const e of [
      fixtures.emptyLedgerFixture,
      fixtures.emptyProfitLossFixture,
      fixtures.emptyBalanceSheetFixture,
    ]) {
      expect(Object.keys(e)).toEqual([]);
    }
  });

  it('PREVIEW_SCENARIO only references the 5 live endpoints', () => {
    expect(Object.keys(fixtures.PREVIEW_SCENARIO).sort()).toEqual(
      ['balanceSheet', 'journalEntries', 'ledger', 'profitLoss', 'runtimeStatus'].sort(),
    );
  });
});

describe('finance.previewFixtures — top-level error fixtures', () => {
  it('routeDisabled is a 404', () => {
    expect(fixtures.errorFixtures.routeDisabled.status).toBe(404);
  });

  it('tenantNotEnrolled is a 403 with the exact module-gate message', () => {
    expect(fixtures.errorFixtures.tenantNotEnrolled.status).toBe(403);
    expect(fixtures.errorFixtures.tenantNotEnrolled.message).toBe(
      'Finance Ops is not enabled for this tenant',
    );
  });

  it('wrongTenant is a 403 that is NOT the module-gate message', () => {
    expect(fixtures.errorFixtures.wrongTenant.status).toBe(403);
    expect(fixtures.errorFixtures.wrongTenant.message).not.toBe(
      'Finance Ops is not enabled for this tenant',
    );
  });

  it('serverError is a 5xx', () => {
    expect(fixtures.errorFixtures.serverError.status).toBeGreaterThanOrEqual(500);
  });
});

describe('finance.previewFixtures — future-state (gap) fixtures are honest mock-ups', () => {
  it('every future-state fixture is tagged notYetBackedByApi and cites a real gap', () => {
    const knownDesignRefs = new Set(Object.values(FINANCE_API_GAPS).map((g) => g.designRef));
    for (const [name, f] of Object.entries(fixtures.futureStateFixtures)) {
      expect(f.notYetBackedByApi, `${name} must be tagged notYetBackedByApi`).toBe(true);
      expect(knownDesignRefs.has(f.gapRef), `${name}.gapRef must exist in FINANCE_API_GAPS`).toBe(
        true,
      );
      expect(Array.isArray(f.rows)).toBe(true);
      expect(f.rows.length).toBeGreaterThan(0);
    }
  });

  it('adapter-queue mock-up covers queued/succeeded/failed with valid operations', () => {
    const rows = fixtures.futureStateFixtures.adapterQueue.rows;
    const statuses = new Set(rows.map((r) => r.status));
    for (const s of ADAPTER_QUEUE_PREVIEW_STATUSES) {
      expect(statuses.has(s), `adapter queue must include a ${s} job`).toBe(true);
    }
    for (const row of rows) {
      expect(
        ALLOWED_ADAPTER_OPERATIONS.has(row.operation),
        `operation ${row.operation} must be in the migration-172 CHECK enum`,
      ).toBe(true);
    }
  });

  it('journal-drafts mock-up shows draft + pending_approval', () => {
    const statuses = new Set(fixtures.futureStateFixtures.journalDrafts.rows.map((r) => r.status));
    expect(statuses.has('draft')).toBe(true);
    expect(statuses.has('pending_approval')).toBe(true);
  });
});

describe('finance.previewFixtures — representative-state catalog', () => {
  it('covers every Finance Ops tab screen', () => {
    const catalogTabIds = new Set(
      fixtures.PREVIEW_STATE_CATALOG.map((e) => e.tabId).filter(Boolean),
    );
    for (const tabId of CANONICAL_TAB_IDS) {
      expect(catalogTabIds.has(tabId), `catalog missing tab ${tabId}`).toBe(true);
    }
  });

  it('labels each entry with an honest dataSource (live | gap | partial)', () => {
    for (const entry of fixtures.PREVIEW_STATE_CATALOG) {
      expect(['live', 'gap', 'partial']).toContain(entry.dataSource);
      expect(Array.isArray(entry.representativeStates)).toBe(true);
      expect(entry.representativeStates.length).toBeGreaterThan(0);
    }
  });

  it('includes non-tab entries for guardrail banners and top-level states', () => {
    const screens = fixtures.PREVIEW_STATE_CATALOG.map((e) => e.screen);
    expect(screens).toContain('Guardrail banners');
    expect(screens).toContain('Top-level states');
  });
});
