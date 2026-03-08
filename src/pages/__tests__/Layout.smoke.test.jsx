/**
 * Layout.jsx Refactoring Smoke Tests
 *
 * Pre-written before refactoring begins. Run after EACH phase to verify
 * no regressions. Tests cover:
 *
 *  Phase 0 (baseline): Layout renders, sidebar, header, nav items
 *  Phase 1: CSS extraction — visual elements still styled
 *  Phase 2: Permissions — access control functions work correctly
 *  Phase 3: SidebarContent — sidebar renders with nav items
 *  Phase 4: Branding — colors, logo URL, contrast text
 *  Phase 5: AI avatar — positioning hook doesn't crash
 *  Phase 6: Nav DnD — drag handlers exist and callable
 *
 * Run: npx vitest run src/pages/__tests__/Layout.smoke.test.jsx
 */

import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

// ─── Mocks (must be before imports that use them) ────────────────────────────

// Mock react-router
vi.mock('react-router-dom', () => ({
  Link: ({ children, to, ...props }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
  Outlet: () => <div data-testid="outlet" />,
}));

// Mock useUser
const mockUser = {
  id: 'user-1',
  email: 'admin@test.com',
  full_name: 'Test Admin',
  role: 'superadmin',
  is_superadmin: true,
  tenant_id: 'tenant-1',
  navigation_permissions: null,
  crm_access: true,
};
vi.mock('@/components/shared/useUser.js', () => ({
  useUser: () => ({ user: mockUser, loading: false, reloadUser: vi.fn() }),
}));

// Mock useAuthCookiesReady
vi.mock('@/components/shared/useAuthCookiesReady', () => ({
  useAuthCookiesReady: () => ({ authCookiesReady: true }),
}));

// Mock tenant context
vi.mock('@/components/shared/tenantContext', () => ({
  TenantProvider: ({ children }) => <div>{children}</div>,
  useTenant: () => ({
    selectedTenantId: 'tenant-1',
    setSelectedTenantId: vi.fn(),
  }),
}));

// Mock API entities
vi.mock('@/api/entities', () => ({
  User: {
    signOut: vi.fn().mockResolvedValue({}),
    me: vi.fn().mockResolvedValue(mockUser),
    list: vi.fn().mockResolvedValue([]),
  },
  Tenant: {
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue({ id: 'tenant-1', name: 'Test Tenant' }),
  },
  ModuleSettings: { filter: vi.fn().mockResolvedValue([]) },
  Employee: { filter: vi.fn().mockResolvedValue([]) },
  getTenantBrandingFast: vi.fn().mockResolvedValue({
    primaryColor: '#06b6d4',
    accentColor: '#6366f1',
    logoUrl: null,
    companyName: 'TestCo',
  }),
}));

// Mock API functions
vi.mock('@/api/functions', () => ({
  getOrCreateUserApiKey: vi.fn().mockResolvedValue('test-key'),
  createAuditLog: vi.fn().mockResolvedValue({}),
}));

// Mock API dashboard
vi.mock('@/api/dashboard', () => ({
  getDashboardBundleFast: vi.fn().mockResolvedValue(null),
}));

// Mock nav order hooks
vi.mock('@/hooks/useNavOrder', () => ({
  usePrimaryNavOrder: () => ({ orderedItems: [], setOrderedItems: vi.fn() }),
  useSecondaryNavOrder: () => ({ orderedItems: [], setOrderedItems: vi.fn() }),
}));

// Mock entity labels
vi.mock('@/components/shared/entityLabelsHooks', () => ({
  useEntityLabels: () => ({ getNavLabel: (label) => label }),
}));
vi.mock('@/components/shared/EntityLabelsContext', () => ({
  EntityLabelsProvider: ({ children }) => <div>{children}</div>,
}));

// Mock AI sidebar
vi.mock('@/components/ai/useAiSidebarState.jsx', () => ({
  AiSidebarProvider: ({ children }) => <div>{children}</div>,
  useAiSidebarState: () => ({
    isOpen: false,
    setIsOpen: vi.fn(),
    activeTab: 'chat',
    setActiveTab: vi.fn(),
    chatKey: 0,
    setChatKey: vi.fn(),
  }),
}));

// Mock peripheral components
vi.mock('@/components/notifications/NotificationPanel', () => ({ default: () => null }));
vi.mock('@/components/shared/SystemStatusIndicator', () => ({ default: () => null }));
vi.mock('@/components/shared/Clock', () => ({ default: () => null }));
vi.mock('@/components/shared/TenantSwitcher', () => ({ default: () => null }));
vi.mock('@/components/shared/RouteGuard', () => ({
  default: ({ children }) => <div data-testid="route-guard">{children}</div>,
}));
vi.mock('@/components/shared/MCPClient', () => ({ MCPManager: () => null }));
vi.mock('@/components/shared/GlobalDetailViewer', () => ({ default: () => null }));
vi.mock('@/components/shared/CronHeartbeat', () => ({ default: () => null }));
vi.mock('@/components/shared/UserPresenceHeartbeat', () => ({ default: () => null }));
vi.mock('@/components/shared/GlobalDomPatches', () => ({ default: () => null }));
vi.mock('@/components/shared/PortalRootManager', () => ({ default: () => null }));
vi.mock('@/components/shared/ModalHost', () => ({ default: () => null }));
vi.mock('@/components/shared/FooterBrand', () => ({ default: () => null }));
vi.mock('@/components/shared/EmployeeScopeFilter', () => ({ default: () => null }));
vi.mock('@/components/shared/EmployeeScopeContext', () => ({
  EmployeeScopeProvider: ({ children }) => <div>{children}</div>,
}));
vi.mock('@/components/shared/ErrorLogger', () => ({
  ErrorLogProvider: ({ children }) => <div>{children}</div>,
}));
vi.mock('@/components/shared/Logger', () => ({
  LoggerProvider: ({ children }) => <div>{children}</div>,
}));
vi.mock('@/components/shared/ProgressOverlay', () => ({
  ProgressProvider: ({ children }) => <div>{children}</div>,
}));
vi.mock('@/components/shared/ApiManager', () => ({
  ApiProvider: ({ children }) => <div>{children}</div>,
  useApiManager: () => ({ clearCache: vi.fn() }),
}));
vi.mock('@/components/shared/ApiOptimizer', () => ({
  ApiOptimizerProvider: ({ children }) => <div>{children}</div>,
}));
vi.mock('@/components/shared/TimezoneContext', () => ({
  TimezoneProvider: ({ children }) => <div>{children}</div>,
}));
vi.mock('@/components/ai/AiSidebar', () => ({ default: () => null }));
vi.mock('@/components/ai/AiAssistantLauncher.jsx', () => ({ default: () => null }));
vi.mock('@/components/ai/SuggestionBadge', () => ({ default: () => null }));
vi.mock('@/components/ai/AiShaActionHandler', () => ({ default: () => null }));
vi.mock('@/components/ai/agentSdkGuard', () => ({
  initAgentSdkGuard: vi.fn(),
  resetAgentSdkGuard: vi.fn(),
}));
vi.mock('@/components/ai/chatUtils', () => ({ clearChat: vi.fn() }));
vi.mock('@/components/auth/PasswordChangeModal', () => ({ default: () => null }));
vi.mock('@/components/shared/EnvironmentBanner', () => ({ default: () => null }));
vi.mock('@/components/shared/SortableNavItem', () => ({
  SortableNavItem: ({ children }) => <div>{children}</div>,
}));

// Mock DnD kit
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }) => <div>{children}</div>,
  closestCenter: vi.fn(),
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  useSensor: vi.fn(() => ({})),
  useSensors: vi.fn(() => []),
}));
vi.mock('@dnd-kit/sortable', () => ({
  arrayMove: vi.fn((arr) => arr),
  SortableContext: ({ children }) => <div>{children}</div>,
  sortableKeyboardCoordinates: vi.fn(),
  verticalListSortingStrategy: {},
}));

/* eslint-disable react/display-name */
// Mock shadcn/ui components
vi.mock('@/components/ui/button', () => ({
  Button: React.forwardRef(({ children, ...props }, ref) => (
    <button ref={ref} {...props}>
      {children}
    </button>
  )),
}));
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, ...props }) => <div {...props}>{children}</div>,
  DropdownMenuLabel: ({ children }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuTrigger: React.forwardRef(({ children, ...props }, ref) => (
    <div ref={ref} {...props}>
      {children}
    </div>
  )),
}));
vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children }) => <div>{children}</div>,
  SheetContent: ({ children }) => <div data-testid="sheet-content">{children}</div>,
  SheetTrigger: React.forwardRef(({ children, ...props }, ref) => (
    <div ref={ref} {...props}>
      {children}
    </div>
  )),
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

// Mock @tanstack/react-query
vi.mock('@tanstack/react-query', () => ({
  QueryClient: vi.fn(function () {
    return {};
  }),
  QueryClientProvider: ({ children }) => <div>{children}</div>,
}));
/* eslint-enable react/display-name */

// Mock backendUrl
vi.mock('@/api/backendUrl', () => ({
  getBackendUrl: () => 'http://localhost:3001',
}));

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeAll(() => {
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (!globalThis.IntersectionObserver) {
    globalThis.IntersectionObserver = class {
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

// ─── Import Layout (AFTER all mocks) ────────────────────────────────────────

const { default: LayoutWrapper } = await import('../Layout.jsx');

// ─── PHASE 0: Baseline — Layout renders at all ──────────────────────────────

describe('[PLATFORM] Phase 0: Baseline render', () => {
  it('renders without crashing', async () => {
    const { container } = render(
      <LayoutWrapper currentPageName="Dashboard">
        <div data-testid="page-content">Hello</div>
      </LayoutWrapper>,
    );
    expect(container).toBeTruthy();
  });

  it('renders children content', async () => {
    render(
      <LayoutWrapper currentPageName="Dashboard">
        <div data-testid="page-content">Dashboard Page</div>
      </LayoutWrapper>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('page-content')).toBeInTheDocument();
    });
  });

  it('renders sidebar header', async () => {
    render(
      <LayoutWrapper currentPageName="Dashboard">
        <div>Content</div>
      </LayoutWrapper>,
    );
    await waitFor(() => {
      expect(screen.getAllByTestId('sidebar-header')[0]).toBeInTheDocument();
    });
  });
});

// ─── PHASE 1: CSS Extraction — structural elements remain ───────────────────

describe('[PLATFORM] Phase 1: CSS extraction', () => {
  it('main content area exists', async () => {
    const { container } = render(
      <LayoutWrapper currentPageName="Dashboard">
        <div>Content</div>
      </LayoutWrapper>,
    );
    await waitFor(() => {
      expect(container.querySelector('main')).toBeTruthy();
    });
  });

  it('desktop sidebar (aside) exists', async () => {
    const { container } = render(
      <LayoutWrapper currentPageName="Dashboard">
        <div>Content</div>
      </LayoutWrapper>,
    );
    await waitFor(() => {
      expect(container.querySelector('aside')).toBeTruthy();
    });
  });

  it('footer exists', async () => {
    const { container } = render(
      <LayoutWrapper currentPageName="Dashboard">
        <div>Content</div>
      </LayoutWrapper>,
    );
    await waitFor(() => {
      expect(container.querySelector('footer')).toBeTruthy();
    });
  });
});

// ─── PHASE 2: Permissions — access logic intact ─────────────────────────────
// NOTE: After Phase 2, uncomment the direct import tests below and add them
// to the Claude Code task brief. The render tests here verify the integrated
// behavior still works.

describe('[PLATFORM] Phase 2: Permissions', () => {
  it('superadmin Layout renders (has access)', async () => {
    render(
      <LayoutWrapper currentPageName="Dashboard">
        <div data-testid="page-content">Content</div>
      </LayoutWrapper>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('page-content')).toBeInTheDocument();
    });
  });

  it('isSuperAdmin identifies superadmin correctly', async () => {
    const { isSuperAdmin } = await import('@/utils/permissions');
    expect(isSuperAdmin({ role: 'superadmin' })).toBe(true);
    expect(isSuperAdmin({ is_superadmin: true, role: 'admin' })).toBe(true);
    expect(isSuperAdmin({ role: 'admin' })).toBe(false);
    expect(isSuperAdmin({ role: 'employee' })).toBe(false);
  });

  it('isAdminOrSuperAdmin identifies correctly', async () => {
    const { isAdminOrSuperAdmin } = await import('@/utils/permissions');
    expect(isAdminOrSuperAdmin({ role: 'admin' })).toBe(true);
    expect(isAdminOrSuperAdmin({ role: 'superadmin' })).toBe(true);
    expect(isAdminOrSuperAdmin({ role: 'employee' })).toBe(false);
  });

  it('hasPageAccess blocks employee from admin pages', async () => {
    const { hasPageAccess } = await import('@/utils/permissions');
    const emp = {
      role: 'employee',
      email: 'e@test.com',
      crm_access: true,
      navigation_permissions: null,
    };
    expect(hasPageAccess(emp, 'AdminSettings', 'tenant-1', [])).toBe(false);
    expect(hasPageAccess(emp, 'Dashboard', 'tenant-1', [])).toBe(true);
  });

  it('getDefaultNavigationPermissions returns correct defaults', async () => {
    const { getDefaultNavigationPermissions } = await import('@/utils/permissions');
    const adminPerms = getDefaultNavigationPermissions('admin');
    expect(adminPerms.Dashboard).toBe(true);
    expect(adminPerms.Tenants).toBe(true);

    const empPerms = getDefaultNavigationPermissions('employee');
    expect(empPerms.Dashboard).toBe(true);
    expect(empPerms.Tenants).toBe(false);
  });
});

// ─── PHASE 3: SidebarContent renders ─────────────────────────────────────────

describe('[PLATFORM] Phase 3: SidebarContent', () => {
  it('sidebar header is present', async () => {
    render(
      <LayoutWrapper currentPageName="Dashboard">
        <div>Content</div>
      </LayoutWrapper>,
    );
    await waitFor(() => {
      expect(screen.getAllByTestId('sidebar-header')[0]).toBeInTheDocument();
    });
  });

  it('mobile sheet sidebar renders', async () => {
    render(
      <LayoutWrapper currentPageName="Dashboard">
        <div>Content</div>
      </LayoutWrapper>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('sheet-content')).toBeInTheDocument();
    });
  });
});

// ─── PHASE 4: Branding CSS variables applied ─────────────────────────────────

describe('[PLATFORM] Phase 4: Branding', () => {
  it('brand-scope class is present on root', async () => {
    const { container } = render(
      <LayoutWrapper currentPageName="Dashboard">
        <div>Content</div>
      </LayoutWrapper>,
    );
    await waitFor(() => {
      expect(container.querySelector('.brand-scope')).toBeTruthy();
    });
  });

  it('CSS custom properties are set', async () => {
    const { container } = render(
      <LayoutWrapper currentPageName="Dashboard">
        <div>Content</div>
      </LayoutWrapper>,
    );
    await waitFor(() => {
      const el = container.querySelector('.brand-scope');
      expect(el).toBeTruthy();
      const style = el?.getAttribute('style') || '';
      expect(style).toContain('--primary-color');
      expect(style).toContain('--accent-color');
    });
  });
});

// ─── PHASE 5: AI Avatar positioning doesn't crash ────────────────────────────

describe('[PLATFORM] Phase 5: AI Avatar positioning', () => {
  it('renders without errors from avatar hook', async () => {
    render(
      <LayoutWrapper currentPageName="Dashboard">
        <div data-testid="content">Content</div>
      </LayoutWrapper>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('content')).toBeInTheDocument();
    });
  });
});

// ─── PHASE 6: Nav DnD still works ───────────────────────────────────────────

describe('[PLATFORM] Phase 6: Nav drag and drop', () => {
  it('sidebar renders with DnD context', async () => {
    render(
      <LayoutWrapper currentPageName="Dashboard">
        <div>Content</div>
      </LayoutWrapper>,
    );
    await waitFor(() => {
      expect(screen.getAllByTestId('sidebar-header')[0]).toBeInTheDocument();
    });
  });
});

// ─── FULL REGRESSION: Run after all phases complete ──────────────────────────

describe('[PLATFORM] Full regression', () => {
  it('Layout renders with all child areas', async () => {
    const { container } = render(
      <LayoutWrapper currentPageName="Leads">
        <div data-testid="leads-page">Leads Content</div>
      </LayoutWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('leads-page')).toBeInTheDocument();
      expect(screen.getAllByTestId('sidebar-header')[0]).toBeInTheDocument();
      expect(container.querySelector('main')).toBeTruthy();
      expect(container.querySelector('aside')).toBeTruthy();
      expect(container.querySelector('footer')).toBeTruthy();
      expect(container.querySelector('.brand-scope')).toBeTruthy();
    });
  });
});
