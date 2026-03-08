/**
 * Accounts.jsx Refactoring Smoke Tests
 *
 * Run: npx vitest run src/pages/__tests__/Accounts.smoke.test.jsx
 */

import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
  Link: ({ children, ...props }) => <a {...props}>{children}</a>,
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
  useTenant: () => ({ selectedTenantId: 'tenant-1', setSelectedTenantId: vi.fn() }),
}));

vi.mock('@/api/entities', () => {
  const mockFilterResult = [];
  mockFilterResult._total = 0;
  return {
    Account: {
      list: vi.fn().mockResolvedValue([]),
      filter: vi.fn().mockResolvedValue(mockFilterResult),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
      get: vi.fn().mockResolvedValue(null),
      schema: vi.fn().mockReturnValue(null),
    },
    Contact: { filter: vi.fn().mockResolvedValue([]) },
    Employee: { filter: vi.fn().mockResolvedValue([]) },
  };
});

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
  useEntityLabel: () => ({ singular: 'Account', plural: 'Accounts' }),
}));

vi.mock('@/hooks/useLoadingToast', () => ({
  useLoadingToast: () => ({
    showLoading: vi.fn(),
    dismiss: vi.fn(),
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
    ConfirmDialog: <div data-testid="confirm-dialog-portal">ConfirmDialog</div>,
    confirm: vi.fn().mockResolvedValue(true),
  }),
}));

vi.mock('@/hooks/useAiShaEvents', () => ({ useAiShaEvents: () => {} }));

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

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }) => <div>{children}</div>,
  motion: { div: ({ children, ...props }) => <div {...props}>{children}</div> },
}));

// Mock heavy components
vi.mock('@/components/accounts/AccountForm', () => ({
  default: () => <div data-testid="account-form">AccountForm</div>,
}));
vi.mock('@/components/accounts/AccountDetailPanel', () => ({
  default: () => <div data-testid="account-detail-panel">AccountDetailPanel</div>,
}));
vi.mock('@/components/accounts/AccountCard', () => ({
  default: () => <div data-testid="account-card">AccountCard</div>,
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
vi.mock('@/components/shared/ComponentHelp', () => ({
  ComponentHelp: () => <div data-testid="component-help">Help</div>,
}));
vi.mock('@/components/accounts/BulkActionsMenu', () => ({
  default: () => <div data-testid="bulk-actions-menu">BulkActionsMenu</div>,
}));
vi.mock('@/utils/industryUtils', () => ({ formatIndustry: (v) => v }));

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
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }) => <div>{children}</div>,
  DialogContent: ({ children }) => <div>{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <div>{children}</div>,
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
/* eslint-enable react/display-name */

vi.mock('lucide-react', () => {
  const Icon = ({ 'data-testid': testId, ...props }) => <span data-testid={testId} {...props} />;
  return {
    AlertCircle: (props) => <Icon data-testid="alert-circle-icon" {...props} />,
    Edit: (props) => <Icon data-testid="edit-icon" {...props} />,
    Eye: (props) => <Icon data-testid="eye-icon" {...props} />,
    Globe: (props) => <Icon data-testid="globe-icon" {...props} />,
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

// ─── Import AccountsPage (AFTER all mocks) ──────────────────────────────────

const { default: AccountsPage } = await import('../Accounts.jsx');
const { Account } = await import('@/api/entities');

// Minimal fake account for tests that need non-empty data
const FAKE_ACCOUNTS = (() => {
  const arr = [
    {
      id: 'acct-1',
      name: 'Acme Corp',
      type: 'customer',
      industry: 'Technology',
      website: 'https://acme.com',
      phone: '555-1234',
      assigned_to: 'user-1',
      tenant_id: 'tenant-1',
      created_at: '2025-01-01T00:00:00Z',
    },
  ];
  arr._total = 1;
  return arr;
})();

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('[CRM] Phase 0: Baseline render', () => {
  it('renders without crashing', async () => {
    const { container } = render(<AccountsPage />);
    expect(container).toBeTruthy();
  });

  it('renders header with Accounts title', async () => {
    render(<AccountsPage />);
    await waitFor(
      () => {
        expect(screen.getByText('Accounts')).toBeTruthy();
      },
      { timeout: 3000 },
    );
  });
});

describe('[CRM] Phase 1: Data hook', () => {
  it('page renders after data hook extraction', async () => {
    const { container } = render(<AccountsPage />);
    await waitFor(() => {
      expect(container).toBeTruthy();
    });
  });
});

describe('[CRM] Phase 2: Bulk operations', () => {
  it('page renders with bulk ops extracted', async () => {
    const { container } = render(<AccountsPage />);
    await waitFor(
      () => {
        expect(container).toBeTruthy();
      },
      { timeout: 3000 },
    );
  });
});

describe('[CRM] Phase 3: Stats cards', () => {
  it('stats cards include Total Accounts label', async () => {
    render(<AccountsPage />);
    await waitFor(() => {
      expect(screen.getByText(/Total Accounts/i)).toBeTruthy();
    });
  });
});

describe('[CRM] Phase 4: Table view', () => {
  it('empty state renders when no accounts', async () => {
    render(<AccountsPage />);
    await waitFor(
      () => {
        expect(screen.getByText(/No accounts found/i)).toBeTruthy();
      },
      { timeout: 3000 },
    );
  });
});

describe('[CRM] Phase 5: Filters', () => {
  it('search input present', async () => {
    render(<AccountsPage />);
    await waitFor(() => {
      const inputs = screen.getAllByRole('textbox');
      expect(inputs.length).toBeGreaterThan(0);
    });
  });
});

describe('[CRM] Full regression', () => {
  it('AccountsPage renders with all child areas', async () => {
    const { container } = render(<AccountsPage />);
    await waitFor(
      () => {
        expect(container.firstChild).toBeTruthy();
        expect(screen.getByText('Accounts')).toBeTruthy();
      },
      { timeout: 3000 },
    );
  });

  it('Add Account button is present', async () => {
    render(<AccountsPage />);
    await waitFor(() => {
      expect(screen.getByText(/Add Account/i)).toBeTruthy();
    });
  });

  it('Refresh button is present', async () => {
    render(<AccountsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('refresh-button')).toBeTruthy();
    });
  });

  it('CSV export button is present', async () => {
    render(<AccountsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('csv-export-button')).toBeTruthy();
    });
  });

  it('ComponentHelp is present', async () => {
    render(<AccountsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('component-help')).toBeTruthy();
    });
  });

  it('Pagination is present', async () => {
    Account.filter.mockResolvedValue(FAKE_ACCOUNTS);
    render(<AccountsPage />);
    await waitFor(() => {
      expect(screen.getByTestId('pagination')).toBeTruthy();
    });
  });
});
