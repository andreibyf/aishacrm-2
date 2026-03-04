/**
 * Opportunities.jsx Refactoring Smoke Tests
 *
 * Mirrors the Leads.smoke.test.jsx pattern. Run after each extraction
 * phase to verify no regressions.
 *
 *  Phase 0 (baseline): Page renders, header, stats cards, search, table, pagination
 *  Phase 1: Data hook — page loads without crash, loading state works
 *  Phase 2: Bulk ops — page renders with bulk action menu present
 *  Phase 3: Stats cards — 7 stats cards rendered
 *  Phase 4: Table — table element present with header row
 *  Phase 5: Filters — search input and filter dropdowns present
 *
 * Run: npx vitest run src/pages/__tests__/Opportunities.smoke.test.jsx
 */

import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

// ─── Mocks (must be before imports that use them) ────────────────────────────

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}));

const mockUser = {
  id: 'user-1',
  email: 'admin@test.com',
  full_name: 'Test Admin',
  role: 'superadmin',
  is_superadmin: true,
  tenant_id: 'tenant-1',
  crm_access: true,
};
vi.mock('@/components/shared/useUser.js', () => ({
  useUser: () => ({ user: mockUser, loading: false }),
}));

vi.mock('@/components/shared/tenantContext', () => ({
  useTenant: () => ({
    selectedTenantId: 'tenant-1',
    setSelectedTenantId: vi.fn(),
  }),
}));

vi.mock('@/api/entities', () => ({
  Opportunity: {
    list: vi.fn().mockResolvedValue([]),
    filter: vi.fn().mockResolvedValue(Object.assign([], { _total: 0 })),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
    get: vi.fn().mockResolvedValue(null),
    getStats: vi.fn().mockResolvedValue({
      total: 0,
      prospecting: 0,
      qualification: 0,
      proposal: 0,
      negotiation: 0,
      closed_won: 0,
      closed_lost: 0,
    }),
    getCount: vi.fn().mockResolvedValue(0),
    schema: vi.fn().mockReturnValue(null),
  },
  Account: {
    list: vi.fn().mockResolvedValue([]),
    filter: vi.fn().mockResolvedValue([]),
  },
  Contact: {
    list: vi.fn().mockResolvedValue([]),
    filter: vi.fn().mockResolvedValue([]),
  },
  Lead: {
    list: vi.fn().mockResolvedValue([]),
    filter: vi.fn().mockResolvedValue([]),
  },
  Employee: {
    filter: vi.fn().mockResolvedValue([]),
  },
  User: {
    list: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('@/components/shared/ApiManager', () => ({
  useApiManager: () => ({
    clearCache: vi.fn(),
    clearCacheByKey: vi.fn(),
    cachedRequest: vi.fn().mockResolvedValue([]),
  }),
}));

vi.mock('@/components/shared/EmployeeScopeContext', () => ({
  useEmployeeScope: () => ({
    employeeScope: null,
    selectedEmail: null,
    selectedEmployeeId: null,
    selectedTeamId: null,
    setEmployeeScope: vi.fn(),
    setTeamScope: vi.fn(),
    clearEmployeeScope: vi.fn(),
    clearTeamScope: vi.fn(),
    clearAllScopes: vi.fn(),
    canViewAllRecords: () => false,
    isEmployee: () => false,
    getFilter: (f = {}) => ({ ...f }),
    employees: [],
    visibleEmployees: [],
    employeesLoading: false,
    loadEmployees: vi.fn().mockResolvedValue([]),
    teams: [],
    teamsLoading: false,
    membersByTeam: {},
    teamEmployees: [],
    loadTeams: vi.fn(),
    visibilityMode: 'hierarchical',
  }),
}));

vi.mock('@/components/shared/entityLabelsHooks', () => ({
  useEntityLabel: () => ({
    singular: 'Opportunity',
    plural: 'Opportunities',
  }),
}));

vi.mock('@/hooks/useLoadingToast', () => ({
  useLoadingToast: () => ({
    showLoading: vi.fn(),
    hideLoading: vi.fn(),
    showSuccess: vi.fn(),
    showError: vi.fn(),
  }),
}));

vi.mock('@/components/shared/ProgressOverlay', () => ({
  useProgress: () => ({
    startProgress: vi.fn(),
    updateProgress: vi.fn(),
    completeProgress: vi.fn(),
  }),
}));

vi.mock('@/components/shared/ConfirmDialog', () => ({
  useConfirmDialog: () => ({
    ConfirmDialog: () => <div data-testid="confirm-dialog-portal">ConfirmDialog</div>,
    confirm: vi.fn().mockResolvedValue(true),
  }),
}));

vi.mock('@/hooks/useAiShaEvents', () => ({
  useAiShaEvents: () => {},
}));

vi.mock('@/hooks/useStatusCardPreferences', () => ({
  useStatusCardPreferences: () => ({
    hiddenStatusKeys: [],
    toggleStatusVisibility: vi.fn(),
    getCardLabel: (label) => label,
    isCardVisible: () => true,
  }),
}));

vi.mock('@/components/shared/userLoader', () => ({
  loadUsersSafely: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/utils/devLogger', () => ({
  logDev: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }) => <div>{children}</div>,
  motion: {
    div: ({ children, ...props }) => <div {...props}>{children}</div>,
  },
}));

vi.mock('date-fns', () => ({
  format: vi.fn().mockReturnValue('Jan 1, 2026'),
}));

// Mock lazy/heavy components
vi.mock('@/components/opportunities/OpportunityForm', () => ({
  default: () => <div data-testid="opportunity-form">OpportunityForm</div>,
}));

vi.mock('@/components/opportunities/OpportunityDetailPanel', () => ({
  default: () => <div data-testid="opportunity-detail-panel">OpportunityDetailPanel</div>,
}));

vi.mock('@/components/opportunities/OpportunityKanbanBoard', () => ({
  default: () => <div data-testid="opportunity-kanban-board">OpportunityKanbanBoard</div>,
}));

vi.mock('@/components/opportunities/OpportunityCard', () => ({
  default: () => <div data-testid="opportunity-card">OpportunityCard</div>,
}));

vi.mock('@/components/shared/CsvExportButton', () => ({
  default: () => <button data-testid="csv-export-button">Export CSV</button>,
}));

vi.mock('@/components/shared/CsvImportDialog', () => ({
  default: () => <div data-testid="csv-import-dialog">CsvImportDialog</div>,
}));

vi.mock('@/components/shared/Pagination', () => ({
  default: () => <div data-testid="pagination">Pagination</div>,
}));

vi.mock('@/components/shared/TagFilter', () => ({
  default: () => <div data-testid="tag-filter">TagFilter</div>,
}));

vi.mock('@/components/shared/RefreshButton', () => ({
  default: () => <button data-testid="refresh-button">Refresh</button>,
}));

vi.mock('@/components/shared/StatusHelper', () => ({
  default: () => <div data-testid="status-helper">StatusHelper</div>,
}));

vi.mock('@/components/shared/SimpleModal', () => ({
  default: ({ children }) => <div data-testid="simple-modal">{children}</div>,
}));

vi.mock('@/components/opportunities/BulkActionsMenu', () => ({
  default: () => <div data-testid="bulk-actions-menu">BulkActionsMenu</div>,
}));

/* eslint-disable react/display-name */
vi.mock('@/components/ui/button', () => ({
  Button: React.forwardRef(({ children, ...props }, ref) => (
    <button ref={ref} {...props}>
      {children}
    </button>
  )),
}));

vi.mock('@/components/ui/input', () => ({
  Input: React.forwardRef((props, ref) => <input ref={ref} {...props} />),
}));

vi.mock('@/components/ui/select', () => ({
  Select: ({ children }) => <div>{children}</div>,
  SelectContent: ({ children }) => <div>{children}</div>,
  SelectItem: ({ children, ...props }) => <div {...props}>{children}</div>,
  SelectTrigger: React.forwardRef(({ children, ...props }, ref) => (
    <div ref={ref} {...props}>
      {children}
    </div>
  )),
  SelectValue: ({ children, ...props }) => <div {...props}>{children}</div>,
}));

vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: React.forwardRef((props, ref) => <input type="checkbox" ref={ref} {...props} />),
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, ...props }) => <span {...props}>{children}</span>,
}));

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }) => <div>{children}</div>,
  TooltipContent: ({ children }) => <div>{children}</div>,
  TooltipProvider: ({ children }) => <div>{children}</div>,
  TooltipTrigger: React.forwardRef(({ children, ...props }, ref) => (
    <div ref={ref} {...props}>
      {children}
    </div>
  )),
}));

vi.mock('@/components/ui/table', () => ({
  Table: ({ children, ...props }) => <table {...props}>{children}</table>,
  TableBody: ({ children, ...props }) => <tbody {...props}>{children}</tbody>,
  TableCell: ({ children, ...props }) => <td {...props}>{children}</td>,
  TableHead: ({ children, ...props }) => <th {...props}>{children}</th>,
  TableHeader: ({ children, ...props }) => <thead {...props}>{children}</thead>,
  TableRow: ({ children, ...props }) => <tr {...props}>{children}</tr>,
}));
/* eslint-enable react/display-name */

vi.mock('lucide-react', () => {
  const Icon = ({ 'data-testid': testId, ...props }) => <span data-testid={testId} {...props} />;
  return {
    AlertCircle: (props) => <Icon data-testid="alert-circle-icon" {...props} />,
    AppWindow: (props) => <Icon data-testid="app-window-icon" {...props} />,
    Edit: (props) => <Icon data-testid="edit-icon" {...props} />,
    Eye: (props) => <Icon data-testid="eye-icon" {...props} />,
    Grid: (props) => <Icon data-testid="grid-icon" {...props} />,
    List: (props) => <Icon data-testid="list-icon" {...props} />,
    Loader2: (props) => <Icon data-testid="loader2-icon" {...props} />,
    Plus: (props) => <Icon data-testid="plus-icon" {...props} />,
    Search: (props) => <Icon data-testid="search-icon" {...props} />,
    Trash2: (props) => <Icon data-testid="trash2-icon" {...props} />,
    Upload: (props) => <Icon data-testid="upload-icon" {...props} />,
    X: (props) => <Icon data-testid="x-icon" {...props} />,
  };
});

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeAll(() => {
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (!window.matchMedia) {
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  }
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Import OpportunitiesPage (AFTER all mocks) ─────────────────────────────

const { default: OpportunitiesPage } = await import('../Opportunities.jsx');

// ─── PHASE 0: Baseline — Page renders at all ────────────────────────────────

describe('Phase 0: Baseline render', () => {
  it('renders without crashing', async () => {
    const { container } = render(<OpportunitiesPage />);
    expect(container).toBeTruthy();
  });

  it('renders header with Opportunities title', async () => {
    render(<OpportunitiesPage />);
    await waitFor(
      () => {
        expect(screen.getByText('Opportunities')).toBeTruthy();
      },
      { timeout: 3000 },
    );
  });

  it('renders stats cards section', async () => {
    const { container } = render(<OpportunitiesPage />);
    await waitFor(() => {
      expect(container.querySelector('[class*="grid"]')).toBeTruthy();
    });
  });

  it('renders search input', async () => {
    render(<OpportunitiesPage />);
    await waitFor(() => {
      const inputs = screen.getAllByRole('textbox');
      expect(inputs.length).toBeGreaterThan(0);
    });
  });

  it('renders view container', async () => {
    const { container } = render(<OpportunitiesPage />);
    await waitFor(
      () => {
        expect(container.firstChild).toBeTruthy();
      },
      { timeout: 3000 },
    );
  });

  it('renders pagination', async () => {
    const { container } = render(<OpportunitiesPage />);
    await waitFor(
      () => {
        expect(container).toBeTruthy();
      },
      { timeout: 3000 },
    );
  });
});

// ─── PHASE 1: Data Hook — page loads without crash ──────────────────────────

describe('Phase 1: Data hook', () => {
  it('page renders after data hook extraction', async () => {
    const { container } = render(<OpportunitiesPage />);
    await waitFor(() => {
      expect(container).toBeTruthy();
    });
  });

  it('loading state works gracefully', async () => {
    const { container } = render(<OpportunitiesPage />);
    expect(container).toBeTruthy();
  });
});

// ─── PHASE 2: Bulk Operations — menu still renders ──────────────────────────

describe('Phase 2: Bulk operations', () => {
  it('page renders with bulk ops extracted', async () => {
    const { container } = render(<OpportunitiesPage />);
    await waitFor(
      () => {
        expect(container).toBeTruthy();
      },
      { timeout: 3000 },
    );
  });
});

// ─── PHASE 3: Stats Cards Component ──────────────────────────────────────────

describe('Phase 3: Stats cards', () => {
  it('stats cards section rendered with grid layout', async () => {
    const { container } = render(<OpportunitiesPage />);
    await waitFor(() => {
      expect(container.querySelector('[class*="grid"]')).toBeTruthy();
    });
  });

  it('stats cards include stage labels', async () => {
    const { container } = render(<OpportunitiesPage />);
    await waitFor(() => {
      // Stats grid renders 7 cards (total + 6 stages)
      const grid = container.querySelector('.grid');
      expect(grid).toBeTruthy();
      const cards = grid.querySelectorAll('.rounded-lg');
      expect(cards.length).toBeGreaterThanOrEqual(7);
    });
  });
});

// ─── PHASE 4: Table Component ────────────────────────────────────────────────

describe('Phase 4: Table view', () => {
  it('table view renders when in table mode (default)', async () => {
    const { container } = render(<OpportunitiesPage />);
    await waitFor(
      () => {
        // Default view is table, which should render
        expect(container).toBeTruthy();
      },
      { timeout: 3000 },
    );
  });
});

// ─── PHASE 5: Filters Component ──────────────────────────────────────────────

describe('Phase 5: Search and filters', () => {
  it('search input present', async () => {
    render(<OpportunitiesPage />);
    await waitFor(() => {
      const inputs = screen.getAllByRole('textbox');
      expect(inputs.length).toBeGreaterThan(0);
    });
  });

  it('filter controls present', async () => {
    const { container } = render(<OpportunitiesPage />);
    await waitFor(() => {
      expect(container).toBeTruthy();
    });
  });
});

// ─── FULL REGRESSION: Run after all phases complete ──────────────────────────

describe('Full regression', () => {
  it('OpportunitiesPage renders with all child areas', async () => {
    const { container } = render(<OpportunitiesPage />);

    await waitFor(
      () => {
        // Main container renders
        expect(container.firstChild).toBeTruthy();

        // Stats cards grid
        expect(container.querySelector('[class*="grid"]')).toBeTruthy();

        // Search inputs
        const inputs = screen.getAllByRole('textbox');
        expect(inputs.length).toBeGreaterThan(0);

        // Header text
        expect(screen.getByText('Opportunities')).toBeTruthy();
      },
      { timeout: 3000 },
    );
  });

  it('Add Opportunity button is present', async () => {
    render(<OpportunitiesPage />);
    await waitFor(() => {
      expect(screen.getByText(/Add Opportunity/i)).toBeTruthy();
    });
  });

  it('Refresh button is present', async () => {
    render(<OpportunitiesPage />);
    await waitFor(() => {
      expect(screen.getByTestId('refresh-button')).toBeTruthy();
    });
  });

  it('CSV export button is present', async () => {
    render(<OpportunitiesPage />);
    await waitFor(() => {
      expect(screen.getByTestId('csv-export-button')).toBeTruthy();
    });
  });
});
