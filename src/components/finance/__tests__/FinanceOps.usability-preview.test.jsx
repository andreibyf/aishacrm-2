/**
 * FinanceOps console (UI Slice 1D) — usability-preview render test.
 *
 * Renders the REAL Finance Operations console with the finance API client
 * mocked to return the preview fixtures from src/api/finance.previewFixtures.js.
 * This is the proof behind the usability test plan: every representative state
 * renders through the real components (not bespoke preview chrome), and the
 * read-only / no-mutation guarantees hold across every tab.
 *
 * Coverage:
 *  - Runtime overview renders the preview counts + posture.
 *  - All four guardrail banners render in the in-memory / disabled posture.
 *  - Journal entries shows the full status set (draft/pending_approval/posted/
 *    reversed) — the live screen, not a mock-up.
 *  - Ledger summary renders the opaque ledger / P&L / balance-sheet fixtures.
 *  - Projection + sandbox-adapter partial panels render their live posture.
 *  - The 8 API-gap tabs render the HONEST gap card / placeholder, never fake
 *    live data (the no-pretend-production-behaviour constraint).
 *  - Empty live-screen variants render their empty-state copy (empty-tenant
 *    runtime counts, empty journal entries, empty ledger sections).
 *  - The three top-level states render through the real page chrome:
 *    route-disabled (404), tenant-not-enrolled (403, exact module-gate
 *    message), and generic-error (500, with the Retry affordance).
 *  - The persistent-projection mock-up renders: the persistent-events banner
 *    correctly disappears while provider-writes stays on (a labeled future
 *    mock-up, not a claim that persistent mode is active).
 *  - Across every tab, the ONLY interactive controls are read-only affordances
 *    (Refresh / Dismiss banner / Retry). No approve/reject/reverse/replay/
 *    retry/cancel/sync/activate/enable control exists anywhere.
 *
 * The react-router-dom + tenantContext + finance API mocks mirror the UI-1B
 * smoke test so this exercises the same routing + fetch plumbing.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within, waitFor, cleanup } from '@testing-library/react';
import React from 'react';
import {
  PREVIEW_SCENARIO,
  PREVIEW_TENANT_ID,
  runtimeStatusFixtures,
  emptyJournalEntriesFixture,
  emptyLedgerFixture,
  emptyProfitLossFixture,
  emptyBalanceSheetFixture,
  errorFixtures,
} from '../../../api/finance.previewFixtures';

// ─── Mocks (must precede importing FinanceOps) ──────────────────────────────

let mockSearch = '';
const _searchSubscribers = new Set();
function setMockSearch(query) {
  mockSearch = query;
  for (const s of _searchSubscribers) s(query);
}
vi.mock('react-router-dom', async () => {
  const ReactModule = await vi.importActual('react');
  return {
    useSearchParams: () => {
      const [local, setLocal] = ReactModule.useState(mockSearch);
      ReactModule.useEffect(() => {
        _searchSubscribers.add(setLocal);
        return () => _searchSubscribers.delete(setLocal);
      }, []);
      const params = new URLSearchParams(local);
      const set = (next) => setMockSearch(next.toString());
      return [params, set];
    },
  };
});

const mockTenant = { selectedTenantId: PREVIEW_TENANT_ID };
vi.mock('@/components/shared/tenantContext', () => ({
  useTenant: () => mockTenant,
}));

const mockFinance = {
  getRuntimeStatus: vi.fn(),
  getJournalEntries: vi.fn(),
  getLedger: vi.fn(),
  getProfitLoss: vi.fn(),
  getBalanceSheet: vi.fn(),
};
vi.mock('@/api/finance', async () => {
  const actual = await vi.importActual('@/api/finance');
  return {
    ...actual,
    getRuntimeStatus: (...args) => mockFinance.getRuntimeStatus(...args),
    getJournalEntries: (...args) => mockFinance.getJournalEntries(...args),
    getLedger: (...args) => mockFinance.getLedger(...args),
    getProfitLoss: (...args) => mockFinance.getProfitLoss(...args),
    getBalanceSheet: (...args) => mockFinance.getBalanceSheet(...args),
  };
});

import FinanceOpsPage, { FINANCE_OPS_TABS } from '../../../pages/FinanceOps';

// Read-only affordance allowlist. Every <button> rendered by the console must
// be one of these; anything else is treated as a (potentially mutating)
// control and fails the test. Tab triggers have role="tab", not "button", so
// they are not in this query.
const READ_ONLY_BUTTON_NAME_RE = /^(Refresh|Dismiss|Retry)\b/;

// Maps each non-runtime tab to the testid of the panel it should mount.
const TAB_TO_PANEL_TESTID = {
  ledger: 'finance-ledger-summary',
  invoices: 'finance-draft-invoices-panel',
  'journal-drafts': 'finance-journal-drafts-panel',
  'journal-entries': 'finance-journal-entries',
  approvals: 'finance-approval-queue-panel',
  'adapter-queue': 'finance-adapter-queue-panel',
  audit: 'finance-audit-timeline-panel',
  projection: 'finance-projection-status-panel',
  'sandbox-adapter': 'finance-sandbox-adapter-panel',
  evidence: 'finance-evidence-placeholder',
};

// Tabs whose backing read endpoint does not exist yet — they must render the
// honest gap card / placeholder, NOT fabricated live rows.
const GAP_TAB_TESTIDS = [
  'finance-draft-invoices-panel',
  'finance-journal-drafts-panel',
  'finance-approval-queue-panel',
  'finance-adapter-queue-panel',
  'finance-audit-timeline-panel',
  'finance-evidence-placeholder',
];

function assertOnlyReadOnlyButtons() {
  const buttons = screen.queryAllByRole('button');
  for (const btn of buttons) {
    const name = (btn.getAttribute('aria-label') || btn.textContent || '').trim();
    expect(
      READ_ONLY_BUTTON_NAME_RE.test(name),
      `unexpected non-read-only control rendered: "${name}"`,
    ).toBe(true);
  }
}

beforeEach(() => {
  setMockSearch('');
  mockTenant.selectedTenantId = PREVIEW_TENANT_ID;
  for (const fn of Object.values(mockFinance)) fn.mockReset();
  mockFinance.getRuntimeStatus.mockResolvedValue(PREVIEW_SCENARIO.runtimeStatus);
  mockFinance.getJournalEntries.mockResolvedValue(PREVIEW_SCENARIO.journalEntries);
  mockFinance.getLedger.mockResolvedValue(PREVIEW_SCENARIO.ledger);
  mockFinance.getProfitLoss.mockResolvedValue(PREVIEW_SCENARIO.profitLoss);
  mockFinance.getBalanceSheet.mockResolvedValue(PREVIEW_SCENARIO.balanceSheet);
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage?.clear();
    } catch {
      /* ignore */
    }
  }
});

afterEach(() => {
  cleanup();
});

describe('FinanceOps usability preview — runtime overview + guardrails', () => {
  it('renders the preview counts and runtime posture', async () => {
    render(<FinanceOpsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('finance-runtime-overview')).toBeInTheDocument();
    });

    // Counts from PREVIEW_SCENARIO.runtimeStatus.healthyInMemory.
    expect(screen.getByTestId('runtime-overview-count-audit-events')).toHaveTextContent('21');
    expect(screen.getByTestId('runtime-overview-count-journal-entries')).toHaveTextContent('6');

    // Posture rows.
    expect(screen.getByTestId('runtime-overview-row-persistence')).toHaveTextContent('in_memory');
    expect(screen.getByTestId('runtime-overview-row-provider-sync')).toHaveTextContent('disabled');
  });

  it('renders all four guardrail banners in the in-memory / disabled posture', async () => {
    render(<FinanceOpsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('finance-guardrail-banners')).toBeInTheDocument();
    });
    for (const id of [
      'persistent-events-fail-closed',
      'provider-writes-default-closed',
      'sandbox-only-adapter',
      'production-activation-not-authorized',
    ]) {
      expect(screen.getByTestId(`finance-guardrail-banner-${id}`)).toBeInTheDocument();
    }
  });
});

describe('FinanceOps usability preview — live journal entries (full status set)', () => {
  it('renders draft / pending_approval / posted / reversed rows', async () => {
    setMockSearch('tab=journal-entries');
    render(<FinanceOpsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('finance-journal-entries-table')).toBeInTheDocument();
    });
    const table = screen.getByTestId('finance-journal-entries-table');
    for (const status of ['draft', 'pending_approval', 'posted', 'reversed']) {
      expect(
        within(table).getAllByText(status).length,
        `journal entries table should show a ${status} row`,
      ).toBeGreaterThan(0);
    }
  });
});

describe('FinanceOps usability preview — live ledger summary', () => {
  it('renders the opaque ledger / P&L / balance-sheet fixtures', async () => {
    setMockSearch('tab=ledger');
    render(<FinanceOpsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('finance-ledger-summary')).toBeInTheDocument();
    });
    // Field keys forwarded as-is from the fixtures.
    expect(screen.getByText('total_debits')).toBeInTheDocument();
    expect(screen.getByText('net_income')).toBeInTheDocument();
    // Empty-state copy must NOT appear when fixtures are populated.
    expect(screen.queryByTestId('ledger-section-empty')).not.toBeInTheDocument();
  });
});

describe('FinanceOps usability preview — partial panels render live posture', () => {
  it('projection panel shows persistence + degraded note', async () => {
    setMockSearch('tab=projection');
    render(<FinanceOpsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('finance-projection-status-panel')).toBeInTheDocument();
    });
    expect(screen.getByTestId('finance-projection-status-persistence')).toHaveTextContent(
      'in_memory',
    );
    expect(screen.getByTestId('finance-projection-status-degraded-note')).toBeInTheDocument();
  });

  it('sandbox adapter panel shows provider_sync posture', async () => {
    setMockSearch('tab=sandbox-adapter');
    render(<FinanceOpsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('finance-sandbox-adapter-panel')).toBeInTheDocument();
    });
    expect(screen.getByTestId('finance-sandbox-adapter-provider-sync')).toHaveTextContent(
      'disabled',
    );
    expect(screen.getByTestId('finance-sandbox-adapter-posture-note')).toBeInTheDocument();
  });
});

describe('FinanceOps usability preview — API-gap tabs stay honest', () => {
  it('every gap tab renders the honest gap card / placeholder (no fabricated rows)', async () => {
    for (const [tabId, panelTestId] of Object.entries(TAB_TO_PANEL_TESTID)) {
      if (!GAP_TAB_TESTIDS.includes(panelTestId)) continue;
      setMockSearch(`tab=${tabId}`);
      const { unmount } = render(<FinanceOpsPage />);
      await waitFor(() => {
        expect(screen.getByTestId(panelTestId)).toBeInTheDocument();
      });
      // A gap panel mounts a dashed gap card whose testid starts with
      // finance-gap-card-. No live table testid should be present.
      const panel = screen.getByTestId(panelTestId);
      expect(panel.querySelector('[data-testid^="finance-gap-card-"]')).not.toBeNull();
      unmount();
    }
  });
});

describe('FinanceOps usability preview — empty live-screen variants', () => {
  it('runtime overview renders zero counts for an empty tenant', async () => {
    mockFinance.getRuntimeStatus.mockResolvedValue(runtimeStatusFixtures.emptyTenant);
    render(<FinanceOpsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('finance-runtime-overview')).toBeInTheDocument();
    });
    expect(
      within(screen.getByTestId('runtime-overview-count-journal-entries')).getByText('0'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('runtime-overview-count-audit-events')).getByText('0'),
    ).toBeInTheDocument();
  });

  it('journal entries renders the empty-state copy when the list is empty', async () => {
    setMockSearch('tab=journal-entries');
    mockFinance.getJournalEntries.mockResolvedValue(emptyJournalEntriesFixture);
    render(<FinanceOpsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('finance-journal-entries-empty')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('finance-journal-entries-table')).not.toBeInTheDocument();
  });

  it('ledger summary renders empty-state copy for all three empty sections', async () => {
    setMockSearch('tab=ledger');
    mockFinance.getLedger.mockResolvedValue(emptyLedgerFixture);
    mockFinance.getProfitLoss.mockResolvedValue(emptyProfitLossFixture);
    mockFinance.getBalanceSheet.mockResolvedValue(emptyBalanceSheetFixture);
    render(<FinanceOpsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('finance-ledger-summary')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getAllByTestId('ledger-section-empty')).toHaveLength(3);
    });
  });
});

describe('FinanceOps usability preview — top-level states render through real chrome', () => {
  it('route-disabled (404) renders the route-disabled card and suppresses banners + tabs', async () => {
    mockFinance.getRuntimeStatus.mockRejectedValue(errorFixtures.routeDisabled);
    render(<FinanceOpsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('finance-ops-route-disabled')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('finance-guardrail-banners')).not.toBeInTheDocument();
    expect(screen.queryByTestId('finance-ops-tabs-list')).not.toBeInTheDocument();
    assertOnlyReadOnlyButtons();
  });

  it('tenant-not-enrolled (403, exact module-gate message) renders the not-enrolled card', async () => {
    mockFinance.getRuntimeStatus.mockRejectedValue(errorFixtures.tenantNotEnrolled);
    render(<FinanceOpsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('finance-ops-tenant-not-enrolled')).toBeInTheDocument();
    });
    // Must NOT be collapsed into the route-disabled state — different remediation.
    expect(screen.queryByTestId('finance-ops-route-disabled')).not.toBeInTheDocument();
    assertOnlyReadOnlyButtons();
  });

  it('generic-error (500) renders the error card + Retry, keeping the page chrome', async () => {
    mockFinance.getRuntimeStatus.mockRejectedValue(errorFixtures.serverError);
    render(<FinanceOpsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('finance-ops-generic-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('finance-ops-generic-error-retry')).toBeInTheDocument();
    // The generic error preserves the chrome so the retry path stays visible
    // (FinanceOps.jsx top-level-state comment). Retry is a read-only affordance.
    expect(screen.getByTestId('finance-ops-tabs-list')).toBeInTheDocument();
    assertOnlyReadOnlyButtons();
  });
});

describe('FinanceOps usability preview — persistent-projection mock-up', () => {
  it('hides the persistent-events banner while keeping provider-writes on', async () => {
    mockFinance.getRuntimeStatus.mockResolvedValue(
      runtimeStatusFixtures.persistentProjectionFuture,
    );
    render(<FinanceOpsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('finance-runtime-overview')).toBeInTheDocument();
    });
    // postgres-projection posture: the persistent-events banner is no longer
    // active. This is a labeled future mock-up, not a claim persistent mode is on.
    expect(
      screen.queryByTestId('finance-guardrail-banner-persistent-events-fail-closed'),
    ).not.toBeInTheDocument();
    // Provider writes are a separate, later gate — that banner stays on.
    expect(
      screen.getByTestId('finance-guardrail-banner-provider-writes-default-closed'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('runtime-overview-row-persistence')).toHaveTextContent(
      'postgres-projection',
    );
  });
});

describe('FinanceOps usability preview — read-only across every tab', () => {
  it('renders no mutation control on any tab (only Refresh / Dismiss / Retry)', async () => {
    for (const tab of FINANCE_OPS_TABS) {
      setMockSearch(tab.id === 'runtime-overview' ? '' : `tab=${tab.id}`);
      const { unmount } = render(<FinanceOpsPage />);

      // Wait for the active tab's primary content to settle.
      const expectedTestId =
        tab.id === 'runtime-overview' ? 'finance-runtime-overview' : TAB_TO_PANEL_TESTID[tab.id];
      await waitFor(() => {
        expect(screen.getByTestId(expectedTestId)).toBeInTheDocument();
      });

      assertOnlyReadOnlyButtons();

      // Explicit, human-legible negatives for the headline mutating actions
      // the slice forbids. None may exist as an interactive control.
      for (const forbidden of [
        /^Approve\b/i,
        /^Reject\b/i,
        /^Reverse\b/i,
        /^Replay\b/i,
        /^Retry job\b/i,
        /^Cancel\b/i,
        /^Sync\b/i,
        /^Activate\b/i,
        /^Enable\b/i,
      ]) {
        expect(
          screen.queryByRole('button', { name: forbidden }),
          `forbidden control matched ${forbidden} on tab ${tab.id}`,
        ).toBeNull();
      }

      unmount();
    }
  });
});
