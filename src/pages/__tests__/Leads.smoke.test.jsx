/**
 * Leads.jsx Refactoring Smoke Tests
 *
 * Pre-written before refactoring begins. Run after EACH phase to verify
 * no regressions. Tests cover:
 *
 *  Phase 0 (baseline): Page renders, header, stats, table
 *  Phase 1: Data loading hook — page renders with empty state
 *  Phase 2: Bulk operations — bulk actions menu present
 *  Phase 3: Stats cards — stat cards rendered
 *  Phase 4: Table view — table structure present
 *  Phase 5: Filters — search input and filter elements present
 *
 * Run: npx vitest run src/pages/__tests__/Leads.smoke.test.jsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Mock react-router
vi.mock('react-router-dom', () => ({
  Link: ({ children, to, ...props }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
  useLocation: () => ({ pathname: '/leads', search: '', hash: '' }),
}));

// Mock useUser
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

// Mock tenant context
vi.mock('@/components/shared/tenantContext', () => ({
  useTenant: () => ({
    selectedTenantId: 'tenant-1',
    setSelectedTenantId: vi.fn(),
  }),
}));

// Mock employee scope
vi.mock('@/components/shared/EmployeeScopeContext', () => ({
  useEmployeeScope: () => ({
    selectedEmail: null,
    employeeScope: null,
  }),
}));

// Mock API entities
vi.mock('@/api/entities', () => ({
  Lead: {
    list: vi.fn().mockResolvedValue([]),
    filter: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  },
  Account: {
    list: vi.fn().mockResolvedValue([]),
    filter: vi.fn().mockResolvedValue([]),
  },
  Employee: {
    list: vi.fn().mockResolvedValue([]),
    filter: vi.fn().mockResolvedValue([]),
  },
}));

// Mock API dashboard
vi.mock('@/api/dashboard', () => ({
  clearDashboardResultsCache: vi.fn(),
}));
vi.mock('@/api/dashboardCache', () => ({
  clearAllDashboardCaches: vi.fn(),
}));

// Mock ApiManager
vi.mock('@/components/shared/ApiManager', () => ({
  useApiManager: () => ({
    cachedRequest: vi.fn().mockResolvedValue([]),
    clearCache: vi.fn(),
    clearCacheByKey: vi.fn(),
  }),
}));

// Mock entity labels
vi.mock('@/components/shared/entityLabelsHooks', () => ({
  useEntityLabel: () => ({ plural: 'Leads', singular: 'Lead' }),
}));

// Mock status card preferences
vi.mock('@/hooks/useStatusCardPreferences', () => ({
  useStatusCardPreferences: () => ({
    getCardLabel: (label) => label,
    isCardVisible: () => true,
  }),
}));

// Mock loading toast
vi.mock('@/hooks/useLoadingToast', () => {
  return {
    useLoadingToast: () => {
      return {
        showLoading: vi.fn(),
        showSuccess: vi.fn(),
        showError: vi.fn(),
        dismiss: vi.fn(),
      };
    },
  };
});

// Mock progress overlay
vi.mock('@/components/shared/ProgressOverlay', () => ({
  useProgress: () => ({
    startProgress: vi.fn(),
    updateProgress: vi.fn(),
    completeProgress: vi.fn(),
  }),
}));

// Mock confirm dialog
vi.mock('@/components/shared/ConfirmDialog', () => ({
  useConfirmDialog: () => ({
    ConfirmDialog: () => null,
    confirm: vi.fn().mockResolvedValue(true),
  }),
}));

// Mock AiSha events
vi.mock('@/hooks/useAiShaEvents', () => ({
  useAiShaEvents: vi.fn(),
}));

// Mock userLoader
vi.mock('@/components/shared/userLoader', () => ({
  loadUsersSafely: vi.fn().mockResolvedValue([]),
}));

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
  },
}));

// Mock framer-motion
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }) => <div>{children}</div>,
  motion: {
    div: ({ children, ...props }) => <div {...props}>{children}</div>,
    tr: ({ children, ...props }) => <tr {...props}>{children}</tr>,
  },
}));

// Mock lazy-loaded components
vi.mock('@/components/leads/LeadForm', () => ({ default: () => null }));
vi.mock('@/components/leads/LeadDetailPanel', () => ({ default: () => null }));
vi.mock('@/components/leads/LeadConversionDialog', () => ({ default: () => null }));
vi.mock('@/components/shared/CsvImportDialog', () => ({ default: () => null }));

// Mock regular component imports
vi.mock('@/components/leads/LeadCard', () => ({ default: () => <div data-testid="lead-card" /> }));
vi.mock('@/components/leads/BulkActionsMenu', () => ({
  default: (props) => <div data-testid="bulk-actions-menu" />,
}));
vi.mock('@/components/shared/CsvExportButton', () => ({
  default: () => <button data-testid="csv-export" />,
}));
vi.mock('@/components/shared/Pagination', () => ({
  default: () => <div data-testid="pagination" />,
}));
vi.mock('@/components/shared/TagFilter', () => ({
  default: () => <div data-testid="tag-filter" />,
}));
vi.mock('@/components/shared/RefreshButton', () => ({
  default: (props) => <button data-testid="refresh-button" onClick={props.onRefresh} />,
}));
vi.mock('@/components/shared/StatusHelper', () => ({
  default: () => null,
}));

// Mock shadcn/ui components
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }) => <button {...props}>{children}</button>,
}));
vi.mock('@/components/ui/input', () => ({
  Input: (props) => <input {...props} />,
}));
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }) => (open ? <div data-testid="dialog">{children}</div> : null),
  DialogContent: ({ children }) => <div>{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <div>{children}</div>,
  DialogDescription: ({ children }) => <div>{children}</div>,
}));
vi.mock('@/components/ui/select', () => ({
  Select: ({ children, onValueChange, value }) => <div data-testid="select">{children}</div>,
  SelectContent: ({ children }) => <div>{children}</div>,
  SelectItem: ({ children, value }) => <option value={value}>{children}</option>,
  SelectTrigger: ({ children, ...props }) => <button {...props}>{children}</button>,
  SelectValue: ({ placeholder }) => <span>{placeholder}</span>,
}));
vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: (props) => <input type="checkbox" data-testid="checkbox" {...props} />,
}));
vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, ...props }) => (
    <span data-testid="badge" {...props}>
      {children}
    </span>
  ),
}));
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }) => <div>{children}</div>,
  TooltipContent: ({ children }) => <div>{children}</div>,
  TooltipProvider: ({ children }) => <div>{children}</div>,
  TooltipTrigger: ({ children }) => <div>{children}</div>,
}));

// Mock @tanstack/react-query if used
vi.mock('@tanstack/react-query', () => ({
  QueryClient: vi.fn(),
  QueryClientProvider: ({ children }) => <div>{children}</div>,
}));

// Browser API mocks
beforeEach(() => {
  vi.clearAllMocks();
  // Mock window.location
  delete window.location;
  window.location = { pathname: '/leads', search: '', hash: '', href: '' };
});

// ─── Import Component Under Test ─────────────────────────────────────────────

import LeadsPage from '../Leads';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Leads Smoke Tests', () => {
  describe('Phase 0: Baseline — Page renders', () => {
    it('renders without crashing', async () => {
      const { container } = render(<LeadsPage />);
      await waitFor(() => {
        expect(container).toBeTruthy();
      });
    });

    it('shows the Leads header', async () => {
      render(<LeadsPage />);
      await waitFor(() => {
        expect(screen.getByText('Leads')).toBeTruthy();
      });
    });

    it('renders the add lead button', async () => {
      render(<LeadsPage />);
      await waitFor(() => {
        const addBtn = screen.getByText(/Add Lead/i);
        expect(addBtn).toBeTruthy();
      });
    });
  });

  describe('Phase 1: Data loading hook', () => {
    it('shows loading or empty state on mount', async () => {
      const { container } = render(<LeadsPage />);
      await waitFor(() => {
        // Either loading spinner or empty state should be present
        const hasContent =
          container.querySelector('table') ||
          container.textContent.includes('No leads found') ||
          container.textContent.includes('Leads') ||
          container.querySelector('[class*="animate-spin"]');
        expect(hasContent).toBeTruthy();
      });
    });
  });

  describe('Phase 2: Bulk operations', () => {
    it('bulk actions menu hidden when no selection', async () => {
      render(<LeadsPage />);
      await waitFor(() => {
        // BulkActionsMenu only renders when selectedLeads.size > 0
        expect(screen.queryByTestId('bulk-actions-menu')).toBeNull();
      });
    });
  });

  describe('Phase 3: Stats cards', () => {
    it('renders stats cards section', async () => {
      render(<LeadsPage />);
      await waitFor(() => {
        // Stats cards render with getCardLabel(tooltip) which returns tooltip key
        // Look for a stat value (0) which is always present from totalStats defaults
        const statValues = screen.getAllByText('0');
        expect(statValues.length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  describe('Phase 4: Table view', () => {
    it('renders empty state or table container', async () => {
      const { container } = render(<LeadsPage />);
      await waitFor(() => {
        const hasTable = container.querySelector('table');
        const hasEmptyState =
          container.textContent.includes('No leads found') ||
          container.textContent.includes('Add Your First');
        expect(hasTable || hasEmptyState).toBeTruthy();
      });
    });
  });

  describe('Phase 5: Filters', () => {
    it('renders search input', async () => {
      render(<LeadsPage />);
      await waitFor(() => {
        const searchInput = screen.getByPlaceholderText(/search/i);
        expect(searchInput).toBeTruthy();
      });
    });

    it('renders filter dropdowns', async () => {
      render(<LeadsPage />);
      await waitFor(() => {
        const selects = screen.getAllByTestId('select');
        expect(selects.length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  describe('Phase 6: Pagination', () => {
    it('pagination hidden when no leads', async () => {
      render(<LeadsPage />);
      await waitFor(() => {
        // Pagination only renders when leads.length > 0
        expect(screen.queryByTestId('pagination')).toBeNull();
      });
    });
  });

  describe('Full regression', () => {
    it('all structural elements present in empty state', async () => {
      const { container } = render(<LeadsPage />);
      await waitFor(() => {
        // Header
        expect(screen.getByText('Leads')).toBeTruthy();
        // Search
        expect(screen.getByPlaceholderText(/search/i)).toBeTruthy();
        // Add Lead button
        expect(screen.getByText(/Add Lead/i)).toBeTruthy();
        // Stats card values (0s)
        const zeros = screen.getAllByText('0');
        expect(zeros.length).toBeGreaterThanOrEqual(1);
      });
    });
  });
});
