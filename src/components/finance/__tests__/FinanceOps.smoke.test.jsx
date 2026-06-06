/**
 * FinanceOps page (UI-1B) — smoke test.
 *
 * Verifies:
 *  - The page mounts and resolves to the runtime-overview tab by default.
 *  - The 4 guardrail banners render above the tab strip.
 *  - The 11 tabs from FINANCE_OPS_TABS are rendered with stable testids.
 *  - The 10 non-runtime tabs render the UI-1C placeholder (so UI-1C's PR
 *    can verify replacement).
 *  - 404 from /runtime/status -> "Finance Ops is not enabled in this env"
 *  - 403 from /runtime/status -> "Tenant not enrolled" state
 *  - Missing tenant id -> "No tenant selected" state
 *
 * react-router-dom is fully mocked because react-router 7 ships modules
 * that the vmForks module runner cannot import without project-wide config
 * changes. The mock implements just enough to drive the page's tab routing
 * (useSearchParams).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import React from 'react';

// ─── Mocks (must be before importing FinanceOps) ────────────────────────────

// react-router-dom mock: only the surfaces FinanceOps consumes.
// useSearchParams must round-trip writes so clicking a tab actually flips
// the rendered tab. Each useSearchParams() call registers a local React
// state hook; the module-level setMockSearch fans out to every active hook
// instance so re-renders fire.
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

const mockTenant = {
  selectedTenantId: 'a11dfb63-4b18-4eb8-872e-747af2e37c46',
};
vi.mock('@/components/shared/tenantContext', () => ({
  useTenant: () => mockTenant,
}));

const mockFinance = {
  getRuntimeStatus: vi.fn(),
  getJournalEntries: vi.fn(),
  getLedger: vi.fn(),
  getProfitLoss: vi.fn(),
  getBalanceSheet: vi.fn(),
  // Read API Slice 1 — the panels now fetch these on mount.
  getDraftInvoices: vi.fn(),
  getJournalDrafts: vi.fn(),
  getApprovals: vi.fn(),
  getAdapterJobs: vi.fn(),
  getAuditEvents: vi.fn(),
  getAdapters: vi.fn(),
  getEvidencePack: vi.fn(),
  getAccounts: vi.fn(),
  getCashFlow: vi.fn(),
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
    getDraftInvoices: (...args) => mockFinance.getDraftInvoices(...args),
    getJournalDrafts: (...args) => mockFinance.getJournalDrafts(...args),
    getApprovals: (...args) => mockFinance.getApprovals(...args),
    getAdapterJobs: (...args) => mockFinance.getAdapterJobs(...args),
    getAuditEvents: (...args) => mockFinance.getAuditEvents(...args),
    getAdapters: (...args) => mockFinance.getAdapters(...args),
    getEvidencePack: (...args) => mockFinance.getEvidencePack(...args),
    getAccounts: (...args) => mockFinance.getAccounts(...args),
    getCashFlow: (...args) => mockFinance.getCashFlow(...args),
  };
});

import FinanceOpsPage, { FINANCE_OPS_TABS } from '../../../pages/FinanceOps';

const HEALTHY_STATUS = {
  tenant_id: 'a11dfb63-4b18-4eb8-872e-747af2e37c46',
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
};

beforeEach(() => {
  setMockSearch('');
  mockTenant.selectedTenantId = 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
  for (const fn of Object.values(mockFinance)) fn.mockReset();
  mockFinance.getRuntimeStatus.mockResolvedValue(HEALTHY_STATUS);
  mockFinance.getJournalEntries.mockResolvedValue({ journal_entries: [] });
  mockFinance.getLedger.mockResolvedValue({});
  mockFinance.getProfitLoss.mockResolvedValue({});
  mockFinance.getBalanceSheet.mockResolvedValue({});
  mockFinance.getDraftInvoices.mockResolvedValue({ invoices: [], total: 0 });
  mockFinance.getJournalDrafts.mockResolvedValue({ journal_drafts: [], total: 0 });
  mockFinance.getApprovals.mockResolvedValue({ approvals: [], total: 0 });
  mockFinance.getAdapterJobs.mockResolvedValue({ adapter_jobs: [], total: 0 });
  mockFinance.getAuditEvents.mockResolvedValue({ events: [], next_cursor: null });
  mockFinance.getAdapters.mockResolvedValue({ adapters: [] });
  mockFinance.getEvidencePack.mockResolvedValue({ pack: null });
  mockFinance.getAccounts.mockResolvedValue({ accounts: [] });
  mockFinance.getCashFlow.mockResolvedValue({
    cash_flow: { cash_account_codes: [], periods: [], totals: { inflow_cents: 0, outflow_cents: 0, net_cents: 0 } },
  });
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

describe('FinanceOps — tab inventory and structure', () => {
  it('exports a frozen FINANCE_OPS_TABS list with the 13 design-freeze tabs in order', () => {
    expect(FINANCE_OPS_TABS.map((t) => t.id)).toEqual([
      'runtime-overview',
      'ledger',
      'accounts',
      'cash-flow',
      'invoices',
      'journal-drafts',
      'journal-entries',
      'approvals',
      'adapter-queue',
      'audit',
      'projection',
      'sandbox-adapter',
      'evidence',
    ]);
    expect(Object.isFrozen(FINANCE_OPS_TABS)).toBe(true);
  });
});

describe('FinanceOps — happy path (healthy runtime status)', () => {
  it('mounts the page chrome (header + banners + tab strip + runtime overview)', async () => {
    render(<FinanceOpsPage />);

    expect(screen.getByTestId('finance-ops-page')).toBeInTheDocument();
    await waitFor(() => {
      expect(mockFinance.getRuntimeStatus).toHaveBeenCalledWith(
        'a11dfb63-4b18-4eb8-872e-747af2e37c46',
        expect.objectContaining({ signal: expect.anything() }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('finance-guardrail-banners')).toBeInTheDocument();
    });

    for (const tab of FINANCE_OPS_TABS) {
      expect(screen.getByTestId(`finance-ops-tab-${tab.id}`)).toBeInTheDocument();
    }

    expect(screen.getByTestId('finance-runtime-overview')).toBeInTheDocument();
  });

  it('every non-runtime tab renders its UI-1C panel', async () => {
    // Radix Tabs.Content only mounts the active tab's content. Render the
    // page once per tab with the URL pre-set so the panel for that specific
    // tab is the one materialised in the DOM.
    const TAB_TO_PANEL_TESTID = {
      ledger: 'finance-ledger-summary',
      accounts: 'finance-chart-of-accounts-panel',
      'cash-flow': 'finance-cash-flow-panel',
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
    for (const tab of FINANCE_OPS_TABS) {
      if (tab.id === 'runtime-overview') continue;
      setMockSearch(`tab=${tab.id}`);
      const { unmount } = render(<FinanceOpsPage />);
      const expectedTestId = TAB_TO_PANEL_TESTID[tab.id];
      expect(expectedTestId, `missing test mapping for ${tab.id}`).toBeDefined();
      await waitFor(() => {
        expect(screen.getByTestId(expectedTestId)).toBeInTheDocument();
      });
      unmount();
    }
  });
});

describe('FinanceOps — top-level error states', () => {
  it('shows the "Route disabled" state when getRuntimeStatus returns 404', async () => {
    mockFinance.getRuntimeStatus.mockRejectedValueOnce(
      Object.assign(new Error('HTTP 404'), { status: 404, code: null }),
    );
    render(<FinanceOpsPage />);

    await waitFor(() => {
      expect(screen.getByTestId('finance-ops-route-disabled')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('finance-guardrail-banners')).not.toBeInTheDocument();
    expect(screen.queryByTestId('finance-ops-tabs-list')).not.toBeInTheDocument();
  });

  it('shows the "Tenant not enrolled" state only when the 403 message is the financeOps module-gate message', async () => {
    mockFinance.getRuntimeStatus.mockRejectedValueOnce(
      Object.assign(new Error('Finance Ops is not enabled for this tenant'), {
        status: 403,
        code: null,
      }),
    );
    render(<FinanceOpsPage />);

    await waitFor(() => {
      expect(screen.getByTestId('finance-ops-tenant-not-enrolled')).toBeInTheDocument();
    });
  });

  it('does NOT collapse a validateTenantAccess 403 ("Access denied: ...") into tenant-not-enrolled', async () => {
    mockFinance.getRuntimeStatus.mockRejectedValueOnce(
      Object.assign(
        new Error("Access denied: You do not have permission to access this tenant's data."),
        { status: 403, code: null },
      ),
    );
    render(<FinanceOpsPage />);

    await waitFor(() => {
      expect(screen.getByTestId('finance-ops-generic-error')).toBeInTheDocument();
    });
    // Crucially, the wrong-tenant 403 must NOT be misrendered as a module-
    // enrolment problem (would point the operator at the wrong fix path).
    expect(screen.queryByTestId('finance-ops-tenant-not-enrolled')).not.toBeInTheDocument();
  });

  it('does NOT collapse a "User not assigned to any tenant" 403 into tenant-not-enrolled', async () => {
    mockFinance.getRuntimeStatus.mockRejectedValueOnce(
      Object.assign(new Error('User not assigned to any tenant. Contact administrator.'), {
        status: 403,
        code: null,
      }),
    );
    render(<FinanceOpsPage />);

    await waitFor(() => {
      expect(screen.getByTestId('finance-ops-generic-error')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('finance-ops-tenant-not-enrolled')).not.toBeInTheDocument();
  });

  it('shows the "No tenant selected" state when selectedTenantId is null', () => {
    mockTenant.selectedTenantId = null;
    render(<FinanceOpsPage />);

    expect(screen.getByTestId('finance-ops-missing-tenant')).toBeInTheDocument();
    expect(mockFinance.getRuntimeStatus).not.toHaveBeenCalled();
  });

  it('shows the generic error state with retry when fetch fails with 5xx', async () => {
    mockFinance.getRuntimeStatus.mockRejectedValueOnce(
      Object.assign(new Error('Unexpected finance route error'), {
        status: 500,
        code: null,
      }),
    );
    render(<FinanceOpsPage />);

    await waitFor(() => {
      expect(screen.getByTestId('finance-ops-generic-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('finance-guardrail-banners')).toBeInTheDocument();
    expect(screen.getByTestId('finance-ops-tabs-list')).toBeInTheDocument();
  });

  it('refresh callback re-issues getRuntimeStatus', async () => {
    render(<FinanceOpsPage />);
    await waitFor(() => expect(screen.getByTestId('finance-runtime-overview')).toBeInTheDocument());

    expect(mockFinance.getRuntimeStatus).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('finance-runtime-overview-refresh'));

    await waitFor(() => {
      expect(mockFinance.getRuntimeStatus).toHaveBeenCalledTimes(2);
    });
  });
});

describe('FinanceOps — tab routing via query param', () => {
  it('respects ?tab=ledger when present in the URL on mount', async () => {
    setMockSearch('tab=ledger');
    render(<FinanceOpsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('finance-ledger-summary')).toBeInTheDocument();
    });
  });

  it('falls back to runtime-overview when ?tab= value is unknown', async () => {
    setMockSearch('tab=does-not-exist');
    render(<FinanceOpsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('finance-runtime-overview')).toBeInTheDocument();
    });
  });
});
