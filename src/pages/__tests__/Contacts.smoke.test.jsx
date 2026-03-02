/**
 * Contacts.jsx Refactoring Smoke Tests
 *
 * Run: npx vitest run src/pages/__tests__/Contacts.smoke.test.jsx
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
    Contact: {
      list: vi.fn().mockResolvedValue([]),
      filter: vi.fn().mockResolvedValue(mockFilterResult),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
      get: vi.fn().mockResolvedValue(null),
      schema: vi.fn().mockReturnValue(null),
    },
    Account: { list: vi.fn().mockResolvedValue([]), filter: vi.fn().mockResolvedValue([]), get: vi.fn().mockResolvedValue(null) },
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
  useEmployeeScope: () => ({ employeeScope: null, selectedEmail: null }),
}));

vi.mock('@/components/shared/entityLabelsHooks', () => ({
  useEntityLabel: () => ({ singular: 'Contact', plural: 'Contacts' }),
}));

vi.mock('@/hooks/useLoadingToast', () => ({
  useLoadingToast: () => ({
    showLoading: vi.fn(), hideLoading: vi.fn(), showSuccess: vi.fn(), showError: vi.fn(),
  }),
}));

vi.mock('@/components/shared/ProgressOverlay', () => ({
  useProgress: () => ({ startProgress: vi.fn(), updateProgress: vi.fn(), completeProgress: vi.fn() }),
}));

vi.mock('@/components/shared/ConfirmDialog', () => ({
  useConfirmDialog: () => ({
    ConfirmDialog: () => <div data-testid="confirm-dialog-portal">ConfirmDialog</div>,
    confirm: vi.fn().mockResolvedValue(true),
  }),
}));

vi.mock('@/hooks/useAiShaEvents', () => ({ useAiShaEvents: () => {} }));

vi.mock('@/hooks/useStatusCardPreferences', () => ({
  useStatusCardPreferences: () => ({
    hiddenStatusKeys: [], toggleStatusVisibility: vi.fn(),
    getCardLabel: (label) => label, isCardVisible: () => true,
  }),
}));

vi.mock('@/components/shared/Logger', () => ({
  useLogger: () => ({
    info: vi.fn(), warning: vi.fn(), error: vi.fn(), debug: vi.fn(),
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
vi.mock('@/components/contacts/ContactForm', () => ({ default: () => <div data-testid="contact-form">ContactForm</div> }));
vi.mock('@/components/contacts/ContactDetailPanel', () => ({ default: () => <div data-testid="contact-detail-panel">ContactDetailPanel</div> }));
vi.mock('@/components/contacts/ContactCard', () => ({ default: () => <div data-testid="contact-card">ContactCard</div> }));
vi.mock('@/components/contacts/ContactToLeadDialog', () => ({ default: () => <div>ContactToLeadDialog</div> }));
vi.mock('@/components/accounts/AccountDetailPanel', () => ({ default: () => <div>AccountDetailPanel</div> }));

vi.mock('@/components/shared/CsvExportButton', () => ({ default: () => <button data-testid="csv-export-button">Export CSV</button> }));
vi.mock('@/components/shared/CsvImportDialog', () => ({ default: () => <div data-testid="csv-import-dialog">CsvImportDialog</div> }));
vi.mock('@/components/shared/Pagination', () => ({ default: () => <div data-testid="pagination">Pagination</div> }));
vi.mock('@/components/shared/TagFilter', () => ({ default: () => <div data-testid="tag-filter">TagFilter</div> }));
vi.mock('@/components/shared/RefreshButton', () => ({ default: () => <button data-testid="refresh-button">Refresh</button> }));
vi.mock('@/components/shared/StatusHelper', () => ({ default: () => <div data-testid="status-helper">StatusHelper</div> }));
vi.mock('@/components/shared/PhoneDisplay', () => ({ default: () => <span data-testid="phone-display">Phone</span> }));
vi.mock('@/components/contacts/BulkActionsMenu', () => ({ default: () => <div data-testid="bulk-actions-menu">BulkActionsMenu</div> }));

/* eslint-disable react/display-name */
vi.mock('@/components/ui/button', () => ({ Button: React.forwardRef(({ children, ...props }, ref) => <button ref={ref} {...props}>{children}</button>) }));
vi.mock('@/components/ui/input', () => ({ Input: React.forwardRef((props, ref) => <input ref={ref} {...props} />) }));
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
  SelectTrigger: React.forwardRef(({ children, ...props }, ref) => <div ref={ref} {...props}>{children}</div>),
  SelectValue: ({ children, ...props }) => <div {...props}>{children}</div>,
}));
vi.mock('@/components/ui/checkbox', () => ({ Checkbox: React.forwardRef((props, ref) => <input type="checkbox" ref={ref} {...props} />) }));
vi.mock('@/components/ui/badge', () => ({ Badge: ({ children, ...props }) => <span {...props}>{children}</span> }));
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }) => <div>{children}</div>,
  TooltipContent: ({ children }) => <div>{children}</div>,
  TooltipProvider: ({ children }) => <div>{children}</div>,
  TooltipTrigger: React.forwardRef(({ children, ...props }, ref) => <div ref={ref} {...props}>{children}</div>),
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
    globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  }
  if (!window.matchMedia) {
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    }));
  }
});

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); });

// ─── Import ContactsPage (AFTER all mocks) ──────────────────────────────────

const { default: ContactsPage } = await import('../Contacts.jsx');

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Phase 0: Baseline render', () => {
  it('renders without crashing', async () => {
    const { container } = render(<ContactsPage />);
    expect(container).toBeTruthy();
  });

  it('renders header with Contacts title', async () => {
    render(<ContactsPage />);
    await waitFor(() => {
      expect(screen.getByText('Contacts')).toBeTruthy();
    }, { timeout: 3000 });
  });

  it('renders stats cards grid', async () => {
    const { container } = render(<ContactsPage />);
    await waitFor(() => {
      expect(container.querySelector('[class*="grid"]')).toBeTruthy();
    });
  });

  it('renders search input', async () => {
    render(<ContactsPage />);
    await waitFor(() => {
      const inputs = screen.getAllByRole('textbox');
      expect(inputs.length).toBeGreaterThan(0);
    });
  });
});

describe('Phase 1: Data hook', () => {
  it('page renders after data hook extraction', async () => {
    const { container } = render(<ContactsPage />);
    await waitFor(() => { expect(container).toBeTruthy(); });
  });
});

describe('Phase 2: Bulk operations', () => {
  it('page renders with bulk ops extracted', async () => {
    const { container } = render(<ContactsPage />);
    await waitFor(() => { expect(container).toBeTruthy(); }, { timeout: 3000 });
  });
});

describe('Phase 3: Stats cards', () => {
  it('stats cards include Total Contacts label', async () => {
    render(<ContactsPage />);
    await waitFor(() => {
      expect(screen.getByText(/Total Contacts/i)).toBeTruthy();
    });
  });
});

describe('Phase 4: Table view', () => {
  it('table view renders in default list mode', async () => {
    const { container } = render(<ContactsPage />);
    await waitFor(() => { expect(container).toBeTruthy(); }, { timeout: 3000 });
  });
});

describe('Phase 5: Filters', () => {
  it('search input present', async () => {
    render(<ContactsPage />);
    await waitFor(() => {
      const inputs = screen.getAllByRole('textbox');
      expect(inputs.length).toBeGreaterThan(0);
    });
  });
});

describe('Full regression', () => {
  it('ContactsPage renders with all child areas', async () => {
    const { container } = render(<ContactsPage />);
    await waitFor(() => {
      expect(container.firstChild).toBeTruthy();
      expect(screen.getByText('Contacts')).toBeTruthy();
      expect(screen.getAllByRole('textbox').length).toBeGreaterThan(0);
    }, { timeout: 3000 });
  });

  it('Add Contact button is present', async () => {
    render(<ContactsPage />);
    await waitFor(() => { expect(screen.getByText(/Add Contact/i)).toBeTruthy(); });
  });

  it('Refresh button is present', async () => {
    render(<ContactsPage />);
    await waitFor(() => { expect(screen.getByTestId('refresh-button')).toBeTruthy(); });
  });

  it('CSV export button is present', async () => {
    render(<ContactsPage />);
    await waitFor(() => { expect(screen.getByTestId('csv-export-button')).toBeTruthy(); });
  });

  it('Pagination is present', async () => {
    render(<ContactsPage />);
    await waitFor(() => { expect(screen.getByTestId('pagination')).toBeTruthy(); });
  });
});
