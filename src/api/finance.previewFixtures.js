/**
 * Finance Ops Usability Preview Fixtures (UI Slice 1D / UX Preview)
 *
 * Safe, read-only demo data for evaluating the Finance Operations console
 * end-user / operator experience WITHOUT a live backend, without enabling
 * persistent events, without provider writes, and without any production or
 * staging action.
 *
 * What this module IS:
 *   - A pure-data module. Every export is frozen demo data or a frozen
 *     descriptor. There are NO network calls, NO side effects, and NO
 *     functions that mutate anything.
 *   - The canonical reference of "representative states" the usability test
 *     plan (docs/architecture/finance/finance-ux-preview-usability-test-plan.md)
 *     asks Andrei to evaluate.
 *   - The data source the usability-preview render test
 *     (src/components/finance/__tests__/FinanceOps.usability-preview.test.jsx)
 *     feeds into the REAL console via a mocked finance API client, so the
 *     screens render with the real components — not bespoke preview chrome.
 *
 * What this module is NOT (hard constraints — UI Slice 1D):
 *   - It does NOT modify src/api/finance.js and does NOT call any of its fetch
 *     helpers. The ONLY thing it imports from the live client is the read-only
 *     `FINANCE_API_GAPS` constant — a frozen data table kept as the single
 *     source of truth for the API-gap refs (see the import below). The live
 *     API client keeps talking to the real backend; this module never wires
 *     fake data into the production fetch path. (See the usability test plan
 *     for why an in-app fake-data toggle is deliberately omitted: it would be
 *     "pretending production behavior exists", which the slice forbids.)
 *   - It does NOT add any POST / PATCH / DELETE helper, nor any
 *     approve / reject / reverse / replay / retry / cancel / sync / activate /
 *     enable affordance. There is nothing here a UI could call to mutate state.
 *   - It does NOT flip ENABLE_FINANCE_PERSISTENT_EVENTS or
 *     FINANCE_PROVIDER_WRITES_ENABLED, and it does NOT apply migrations.
 *
 * Two honesty rules govern the fixtures:
 *   1. The 5 LIVE Finance v2 GET endpoints (runtime/status, journal-entries,
 *      ledger, profit-loss, balance-sheet) get demo payloads whose SHAPE
 *      matches what the real client returns today, so the real panels render
 *      them faithfully. The journal-entries fixture intentionally includes
 *      draft / pending_approval / posted / reversed rows — that mirrors the
 *      current in-memory `service.listJournalEntries()` (which returns the full
 *      bucket, not posted-only) and the Phase 4-1 `journal_entries` projection
 *      target.
 *   2. Screens whose backend read endpoint does NOT exist yet (the 8 gaps in
 *      FINANCE_API_GAPS) are NOT given live payloads. The real components for
 *      those tabs render the honest GapStateCard regardless of any data. The
 *      "future-state" fixtures below exist ONLY so Andrei can evaluate the
 *      proposed columns / labels / wording for when those endpoints land —
 *      they are tagged `notYetBackedByApi: true` and carry the gap ref, and
 *      the usability test plan presents them as mock-ups, never as live data.
 */

// Read-only constant only. This is the single import from the live client and
// it is a frozen data table — NOT a fetch helper. No production fetch path is
// touched by importing it (see the module header's hard-constraints note).
import { FINANCE_API_GAPS } from './finance';

/**
 * Recursively freeze an object graph so the fixtures cannot be mutated by a
 * consumer (or accidentally by a test). Returns the same reference.
 */
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) {
      deepFreeze(value[key]);
    }
  }
  return value;
}

/**
 * Clearly-fake tenant id. Deliberately NOT a real UUID and self-describing so
 * it can never be mistaken for a production tenant in logs or screenshots.
 */
export const PREVIEW_TENANT_ID = 'preview-tenant-DEMO-0000-DO-NOT-USE';

export const PREVIEW_NOTICE =
  'PREVIEW / DEMO DATA — synthetic fixtures for usability testing only. ' +
  'Not sourced from any live tenant or backend. No mutating action is possible from this data.';

// ============================================================================
// LIVE-ENDPOINT FIXTURES
// Shapes match src/api/finance.js return values so the real panels render them.
// ============================================================================

/**
 * GET /runtime/status fixtures. Shape per getRuntimeStatus():
 *   { tenant_id, runtime: { mode, persistence, provider_sync, governance },
 *     counts: { journal_entries, invoices, approvals, audit_events, adapter_jobs } }
 */
export const runtimeStatusFixtures = deepFreeze({
  // Default Slice 1 posture: in-memory, provider writes disabled. This is the
  // posture an operator sees today — all 4 guardrail banners active.
  healthyInMemory: {
    tenant_id: PREVIEW_TENANT_ID,
    runtime: {
      mode: 'mock_read_only',
      persistence: 'in_memory',
      provider_sync: 'disabled',
      governance: 'enabled',
    },
    counts: {
      journal_entries: 6,
      invoices: 4,
      approvals: 3,
      audit_events: 21,
      adapter_jobs: 5,
    },
  },
  // Brand-new / empty tenant: exercises the zero-count + empty-list copy.
  emptyTenant: {
    tenant_id: PREVIEW_TENANT_ID,
    runtime: {
      mode: 'mock_read_only',
      persistence: 'in_memory',
      provider_sync: 'disabled',
      governance: 'enabled',
    },
    counts: {
      journal_entries: 0,
      invoices: 0,
      approvals: 0,
      audit_events: 0,
      adapter_jobs: 0,
    },
  },
  // Future posture for evaluating the projection-backed "healthy" note +
  // banner-off state. persistence flips to postgres-projection; provider_sync
  // STAYS disabled (provider writes are a separate, later gate). This is a
  // mock-up of a future state, NOT a claim that persistent mode is active.
  persistentProjectionFuture: {
    tenant_id: PREVIEW_TENANT_ID,
    runtime: {
      mode: 'persistent',
      persistence: 'postgres-projection',
      provider_sync: 'disabled',
      governance: 'enabled',
    },
    counts: {
      journal_entries: 6,
      invoices: 4,
      approvals: 3,
      audit_events: 21,
      adapter_jobs: 5,
    },
  },
});

/**
 * GET /journal-entries fixture. Shape per getJournalEntries():
 *   { journal_entries: Array<{ id, aggregate_id, status, created_at, ... }> }
 *
 * Includes the full status set (draft / pending_approval / posted / reversed)
 * so the Journal entries tab exercises every status label. Matches the current
 * in-memory `listJournalEntries()` behaviour and the Phase 4-1 projection
 * target. Extra fields (account_code, amount, currency) are forwarded as-is by
 * the real component and let Andrei evaluate richer row wording.
 */
export const journalEntriesFixture = deepFreeze({
  journal_entries: [
    {
      id: 'je-preview-0006',
      aggregate_id: 'agg-deal-1042',
      status: 'reversed',
      created_at: '2026-05-27T14:05:00.000Z',
      account_code: '4000-REV',
      amount: -1200.0,
      currency: 'USD',
    },
    {
      id: 'je-preview-0005',
      aggregate_id: 'agg-deal-1042',
      status: 'posted',
      created_at: '2026-05-27T13:58:00.000Z',
      account_code: '4000-REV',
      amount: 1200.0,
      currency: 'USD',
    },
    {
      id: 'je-preview-0004',
      aggregate_id: 'agg-deal-1039',
      status: 'pending_approval',
      created_at: '2026-05-27T11:20:00.000Z',
      account_code: '5200-COGS',
      amount: 875.5,
      currency: 'USD',
    },
    {
      id: 'je-preview-0003',
      aggregate_id: 'agg-deal-1037',
      status: 'draft',
      created_at: '2026-05-27T09:02:00.000Z',
      account_code: '6100-OPEX',
      amount: 430.0,
      currency: 'USD',
    },
    {
      id: 'je-preview-0002',
      aggregate_id: 'agg-deal-1031',
      status: 'posted',
      created_at: '2026-05-26T16:44:00.000Z',
      account_code: '1100-AR',
      amount: 5400.0,
      currency: 'USD',
    },
    {
      id: 'je-preview-0001',
      aggregate_id: 'agg-deal-1031',
      status: 'draft',
      created_at: '2026-05-26T16:40:00.000Z',
      account_code: '1100-AR',
      amount: 5400.0,
      currency: 'USD',
    },
  ],
});

export const emptyJournalEntriesFixture = deepFreeze({ journal_entries: [] });

/**
 * GET /ledger, /profit-loss, /balance-sheet fixtures. Shapes mirror the REAL
 * backend accountingEngine output (integer cents + account arrays), so the
 * operator-facing LedgerSummary panel formats them exactly as it would live
 * data. See backend/lib/finance/accountingEngine.js (buildLedger /
 * buildProfitAndLoss / buildBalanceSheet).
 */
export const ledgerFixture = deepFreeze({
  accounts: [
    {
      account_name: 'Accounts Receivable',
      classification: 'Asset',
      debit_cents: 540000,
      credit_cents: 0,
      balance_cents: 540000,
    },
    {
      account_name: 'Sales Revenue',
      classification: 'Revenue',
      debit_cents: 0,
      credit_cents: 660000,
      balance_cents: -660000,
    },
    {
      account_name: 'Cost of Goods Sold',
      classification: 'Expense',
      debit_cents: 87550,
      credit_cents: 0,
      balance_cents: 87550,
    },
  ],
  totals: { debit_cents: 627550, credit_cents: 660000 },
});

export const profitLossFixture = deepFreeze({
  revenue_accounts: [{ account_name: 'Sales Revenue', amount_cents: 660000 }],
  expense_accounts: [
    { account_name: 'Cost of Goods Sold', amount_cents: 87550 },
    { account_name: 'Operating Expenses', amount_cents: 43000 },
  ],
  totals: { revenue_cents: 660000, expense_cents: 130550, net_income_cents: 529450 },
});

export const balanceSheetFixture = deepFreeze({
  assets: [{ account_name: 'Accounts Receivable', amount_cents: 540000 }],
  liabilities: [],
  equity: [{ account_name: 'Retained Earnings', amount_cents: 540000 }],
  totals: { assets_cents: 540000, liabilities_cents: 0, equity_cents: 540000, is_balanced: true },
});

export const emptyLedgerFixture = deepFreeze({});
export const emptyProfitLossFixture = deepFreeze({});
export const emptyBalanceSheetFixture = deepFreeze({});

// ============================================================================
// TOP-LEVEL ERROR / EMPTY FIXTURES
// Shapes match the structured errors src/api/finance.js throws on non-2xx, so
// the console's route-disabled / not-enrolled / generic-error states can be
// exercised in the preview and evaluated for operator comprehension.
// ============================================================================

export const errorFixtures = deepFreeze({
  // 404 -> ENABLE_FINANCE_OPS not 'true' in this environment ("Route disabled").
  routeDisabled: { status: 404, code: null, message: 'HTTP 404', details: null },
  // 403 with the EXACT per-tenant module-gate message ("Tenant not enrolled").
  tenantNotEnrolled: {
    status: 403,
    code: null,
    message: 'Finance Ops is not enabled for this tenant',
    details: null,
  },
  // 403 from validateTenantAccess — must NOT be collapsed into not-enrolled.
  wrongTenant: {
    status: 403,
    code: null,
    message: "Access denied: You do not have permission to access this tenant's data.",
    details: null,
  },
  // 5xx -> generic error state with retry.
  serverError: {
    status: 500,
    code: null,
    message: 'Unexpected finance route error',
    details: null,
  },
});

// ============================================================================
// FUTURE-STATE (GAP) FIXTURES
// These screens have NO backend read endpoint today (FINANCE_API_GAPS). The
// real tabs render the honest GapStateCard. The fixtures below are mock-ups of
// the proposed future data shape so Andrei can evaluate columns / labels /
// wording for when each endpoint lands. They are NEVER rendered as live data
// by the current console — see the usability test plan.
// ============================================================================

export const futureStateFixtures = deepFreeze({
  draftInvoices: {
    notYetBackedByApi: true,
    gapRef: FINANCE_API_GAPS.draftInvoices.designRef,
    affectedScreen: FINANCE_API_GAPS.draftInvoices.affectedScreen,
    rows: [
      {
        id: 'inv-preview-0004',
        status: 'draft',
        customer: 'Northwind Trading',
        amount: 5400.0,
        currency: 'USD',
        created_at: '2026-05-27T15:10:00.000Z',
      },
      {
        id: 'inv-preview-0003',
        status: 'draft',
        customer: 'Globex Logistics',
        amount: 1200.0,
        currency: 'USD',
        created_at: '2026-05-27T12:30:00.000Z',
      },
    ],
  },
  journalDrafts: {
    notYetBackedByApi: true,
    gapRef: FINANCE_API_GAPS.journalDrafts.designRef,
    affectedScreen: FINANCE_API_GAPS.journalDrafts.affectedScreen,
    rows: [
      {
        id: 'jd-preview-0002',
        status: 'pending_approval',
        aggregate_id: 'agg-deal-1039',
        amount: 875.5,
        currency: 'USD',
        created_at: '2026-05-27T11:20:00.000Z',
      },
      {
        id: 'jd-preview-0001',
        status: 'draft',
        aggregate_id: 'agg-deal-1037',
        amount: 430.0,
        currency: 'USD',
        created_at: '2026-05-27T09:02:00.000Z',
      },
    ],
  },
  approvalQueue: {
    notYetBackedByApi: true,
    gapRef: FINANCE_API_GAPS.approvals.designRef,
    affectedScreen: FINANCE_API_GAPS.approvals.affectedScreen,
    rows: [
      {
        id: 'apr-preview-0003',
        status: 'pending',
        subject_type: 'journal_entry',
        subject_id: 'jd-preview-0002',
        requested_by: 'operator.demo',
        requested_at: '2026-05-27T11:21:00.000Z',
      },
      {
        id: 'apr-preview-0002',
        status: 'pending',
        subject_type: 'draft_invoice',
        subject_id: 'inv-preview-0004',
        requested_by: 'operator.demo',
        requested_at: '2026-05-27T15:11:00.000Z',
      },
      {
        id: 'apr-preview-0001',
        status: 'approved',
        subject_type: 'journal_entry',
        subject_id: 'je-preview-0005',
        requested_by: 'operator.demo',
        requested_at: '2026-05-27T13:50:00.000Z',
      },
    ],
  },
  adapterQueue: {
    notYetBackedByApi: true,
    gapRef: FINANCE_API_GAPS.adapterJobs.designRef,
    affectedScreen: FINANCE_API_GAPS.adapterJobs.affectedScreen,
    // status set requested by the slice: queued / succeeded / failed.
    // operation values are constrained to the migration 172 CHECK enum.
    rows: [
      {
        id: 'job-preview-0005',
        operation: 'push_draft',
        status: 'queued',
        attempts: 0,
        next_attempt_at: '2026-05-27T16:00:00.000Z',
        created_at: '2026-05-27T15:55:00.000Z',
      },
      {
        id: 'job-preview-0004',
        operation: 'pull_status',
        status: 'succeeded',
        attempts: 1,
        next_attempt_at: null,
        created_at: '2026-05-27T15:40:00.000Z',
      },
      {
        id: 'job-preview-0003',
        operation: 'push_final',
        status: 'failed',
        attempts: 3,
        next_attempt_at: null,
        last_error: 'sandbox endpoint refused connection (demo)',
        created_at: '2026-05-27T15:20:00.000Z',
      },
      {
        id: 'job-preview-0002',
        operation: 'sync_status',
        status: 'succeeded',
        attempts: 1,
        next_attempt_at: null,
        created_at: '2026-05-27T14:30:00.000Z',
      },
      {
        id: 'job-preview-0001',
        operation: 'reconcile',
        status: 'queued',
        attempts: 0,
        next_attempt_at: '2026-05-27T16:05:00.000Z',
        created_at: '2026-05-27T14:10:00.000Z',
      },
    ],
  },
  auditTimeline: {
    notYetBackedByApi: true,
    gapRef: FINANCE_API_GAPS.auditEvents.designRef,
    affectedScreen: FINANCE_API_GAPS.auditEvents.affectedScreen,
    rows: [
      {
        id: 'evt-preview-0004',
        event_type: 'finance.journal.reversal_requested',
        aggregate_id: 'agg-deal-1042',
        occurred_at: '2026-05-27T14:05:00.000Z',
        actor: 'operator.demo',
      },
      {
        id: 'evt-preview-0003',
        event_type: 'finance.approval.approved',
        aggregate_id: 'agg-deal-1042',
        occurred_at: '2026-05-27T13:57:00.000Z',
        actor: 'approver.demo',
      },
      {
        id: 'evt-preview-0002',
        event_type: 'finance.approval.requested',
        aggregate_id: 'agg-deal-1039',
        occurred_at: '2026-05-27T11:21:00.000Z',
        actor: 'operator.demo',
      },
      {
        id: 'evt-preview-0001',
        event_type: 'finance.journal.draft_created',
        aggregate_id: 'agg-deal-1037',
        occurred_at: '2026-05-27T09:02:00.000Z',
        actor: 'operator.demo',
      },
    ],
  },
});

// ============================================================================
// PREVIEW SCENARIO
// The bundle the usability-preview render test feeds the mocked finance API
// client. Only the 5 LIVE endpoints are represented here, because those are
// the only calls the real console makes. Gap tabs render their honest cards.
// ============================================================================

export const PREVIEW_SCENARIO = deepFreeze({
  runtimeStatus: runtimeStatusFixtures.healthyInMemory,
  journalEntries: journalEntriesFixture,
  ledger: ledgerFixture,
  profitLoss: profitLossFixture,
  balanceSheet: balanceSheetFixture,
});

// ============================================================================
// REPRESENTATIVE-STATE CATALOG
// One row per console screen the usability test plan walks Andrei through.
// `dataSource` is honest: 'live' = backed by a real GET endpoint today;
// 'gap' = renders the honest GapStateCard (future-state fixture is a mock-up);
// 'partial' = some fields live (from runtime/status), deeper detail is a gap.
// `tabId` cross-references FINANCE_OPS_TABS so the test can prove full coverage.
// ============================================================================

export const PREVIEW_STATE_CATALOG = deepFreeze([
  {
    tabId: 'runtime-overview',
    screen: 'Runtime overview',
    dataSource: 'live',
    representativeStates: ['healthy in-memory', 'empty tenant', 'persistent (future mock-up)'],
    fixtureRef: 'runtimeStatusFixtures',
  },
  {
    tabId: 'ledger',
    screen: 'Ledger summary',
    dataSource: 'live',
    representativeStates: ['populated ledger / P&L / balance-sheet', 'empty sections'],
    fixtureRef: 'ledgerFixture / profitLossFixture / balanceSheetFixture',
  },
  {
    tabId: 'invoices',
    screen: 'Draft invoices',
    dataSource: 'gap',
    representativeStates: ['honest gap card (no GET /draft-invoices yet)'],
    fixtureRef: 'futureStateFixtures.draftInvoices (mock-up only)',
  },
  {
    tabId: 'journal-drafts',
    screen: 'Journal drafts',
    dataSource: 'gap',
    representativeStates: ['honest gap card (no GET /journal-drafts yet)'],
    fixtureRef: 'futureStateFixtures.journalDrafts (mock-up only)',
  },
  {
    tabId: 'journal-entries',
    screen: 'Journal entries',
    dataSource: 'live',
    representativeStates: ['draft', 'pending_approval', 'posted', 'reversed', 'empty'],
    fixtureRef: 'journalEntriesFixture / emptyJournalEntriesFixture',
  },
  {
    tabId: 'approvals',
    screen: 'Approval queue',
    dataSource: 'gap',
    representativeStates: ['honest gap card (no GET /approvals yet)'],
    fixtureRef: 'futureStateFixtures.approvalQueue (mock-up only)',
  },
  {
    tabId: 'adapter-queue',
    screen: 'Adapter queue',
    dataSource: 'gap',
    representativeStates: ['honest gap card (no GET /adapter-jobs yet)'],
    fixtureRef: 'futureStateFixtures.adapterQueue (mock-up: queued/succeeded/failed)',
  },
  {
    tabId: 'audit',
    screen: 'Audit timeline',
    dataSource: 'gap',
    representativeStates: ['honest gap card (no GET /audit-events yet)'],
    fixtureRef: 'futureStateFixtures.auditTimeline (mock-up only)',
  },
  {
    tabId: 'projection',
    screen: 'Projection / degraded',
    dataSource: 'partial',
    representativeStates: ['in-memory degraded note (live persistence) + cursor gap card'],
    fixtureRef: 'runtimeStatusFixtures (persistence field)',
  },
  {
    tabId: 'sandbox-adapter',
    screen: 'Sandbox adapter',
    dataSource: 'partial',
    representativeStates: ['provider_sync posture (live) + registered-adapters gap card'],
    fixtureRef: 'runtimeStatusFixtures (provider_sync field)',
  },
  {
    tabId: 'evidence',
    screen: 'Evidence',
    dataSource: 'gap',
    representativeStates: ['honest placeholder (no GET /evidence-packs yet)'],
    fixtureRef: 'FINANCE_API_GAPS.evidencePacks',
  },
  {
    tabId: null,
    screen: 'Guardrail banners',
    dataSource: 'live',
    representativeStates: [
      'persistent-events fail-closed',
      'provider-writes default-closed',
      'sandbox-only',
      'production-not-authorized',
    ],
    fixtureRef: 'runtimeStatusFixtures (drives banner predicates)',
  },
  {
    tabId: null,
    screen: 'Top-level states',
    dataSource: 'live',
    representativeStates: [
      'route disabled (404)',
      'tenant not enrolled (403)',
      'generic error (500)',
    ],
    fixtureRef: 'errorFixtures',
  },
]);
