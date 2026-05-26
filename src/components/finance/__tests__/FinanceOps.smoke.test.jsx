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
};
vi.mock('@/api/finance', async () => {
  const actual = await vi.importActual('@/api/finance');
  return {
    ...actual,
    getRuntimeStatus: (...args) => mockFinance.getRuntimeStatus(...args),
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
  mockFinance.getRuntimeStatus.mockReset();
  mockFinance.getRuntimeStatus.mockResolvedValue(HEALTHY_STATUS);
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
  it('exports a frozen FINANCE_OPS_TABS list with the 11 design-freeze tabs in order', () => {
    expect(FINANCE_OPS_TABS.map((t) => t.id)).toEqual([
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

  it('every non-runtime tab has a corresponding placeholder for UI-1C to replace', async () => {
    // Radix Tabs.Content only mounts the active tab's content. Render the
    // page once per tab with the URL pre-set so the placeholder for that
    // specific tab is the one materialised in the DOM. This proves UI-1B
    // ships a placeholder for every non-runtime tab without relying on a
    // click-driven state update inside a single render.
    for (const tab of FINANCE_OPS_TABS) {
      if (tab.id === 'runtime-overview') continue;
      setMockSearch(`tab=${tab.id}`);
      const { unmount } = render(<FinanceOpsPage />);
      await waitFor(() => {
        expect(screen.getByTestId(`finance-tab-content-placeholder-${tab.id}`)).toBeInTheDocument();
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

  it('shows the "Tenant not enrolled" state when getRuntimeStatus returns 403', async () => {
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
      expect(screen.getByTestId('finance-tab-content-placeholder-ledger')).toBeInTheDocument();
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
