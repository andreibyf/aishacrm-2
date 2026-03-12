import '@/styles/layout-theme.css';
import { logDev } from '@/utils/devLogger';
import { isSuperAdmin, isAdminOrSuperAdmin, hasPageAccess } from '@/utils/permissions';
import SidebarContent from '@/components/layout/SidebarContent';
import { useBranding } from '@/hooks/useBranding';
import { useAiAvatarPositioning } from '@/hooks/useAiAvatarPositioning';
import { useNavDragAndDrop } from '@/hooks/useNavDragAndDrop';
import React, { useRef, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom'; // Import useNavigate
import { createPageUrl } from '@/utils';
import PasswordChangeModal from '@/components/auth/PasswordChangeModal';
import EnvironmentBanner from '@/components/shared/EnvironmentBanner';
import ImpersonationBanner from '@/components/shared/ImpersonationBanner';
import { getBackendUrl } from '@/api/backendUrl';
import { KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { usePrimaryNavOrder, useSecondaryNavOrder } from '@/hooks/useNavOrder';
import { EntityLabelsProvider } from '@/components/shared/EntityLabelsContext';
import { useEntityLabels } from '@/components/shared/entityLabelsHooks';
import {
  BarChart3,
  BookOpen, // NEW: Added for Documentation
  Bot,
  Building2,
  Calendar,
  CheckSquare,
  ClipboardCheck, // NEW: Added for ClientRequirements
  CreditCard,
  Database,
  DollarSign,
  FileText,
  FolderOpen,
  Kanban, // Project Management
  LayoutDashboard,
  Loader2,
  LogOut,
  Megaphone, // NEW: Added for AI Campaigns
  Menu,
  Moon,
  Plug, // NEW: Added for Integrations
  Settings,
  Sun,
  Target, // Changed Leads icon to Target
  TrendingUp, // Changed Opportunities icon to TrendingUp
  UserPlus, // NEW: Added for Client Onboarding
  Users, // Changed Employees icon to Users
  Wrench,
  Zap, // NEW: Added for Workflows
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { User } from '@/api/entities';
import { Tenant } from '@/api/entities';
import { ModuleSettings } from '@/api/entities';
import { Employee } from '@/api/entities';
import { supabase } from '@/lib/supabase';
import NotificationPanel from '../components/notifications/NotificationPanel';
import { TenantProvider, useTenant } from '../components/shared/tenantContext';
import { ProgressProvider } from '../components/shared/ProgressOverlay';
import { isValidId } from '../components/shared/tenantUtils';
import { ApiProvider, useApiManager } from '../components/shared/ApiManager';
import { TimezoneProvider } from '../components/shared/TimezoneContext';
import TenantSwitcher from '../components/shared/TenantSwitcher';
import SystemStatusIndicator from '../components/shared/SystemStatusIndicator';
import { useUser } from '@/components/shared/useUser.js';
import RouteGuard from '../components/shared/RouteGuard';
import { getOrCreateUserApiKey } from '@/api/functions';
import { createAuditLog } from '@/api/functions';
import { MCPManager } from '../components/shared/MCPClient';
import GlobalDetailViewer from '../components/shared/GlobalDetailViewer';
import { getTenantBrandingFast } from '@/api/entities';
import { getDashboardBundleFast } from '@/api/dashboard';
import { useAuthCookiesReady } from '@/components/shared/useAuthCookiesReady';
import EmployeeScopeFilter from '../components/shared/EmployeeScopeFilter';
import { EmployeeScopeProvider } from '../components/shared/EmployeeScopeContext';
import FooterBrand from '../components/shared/FooterBrand';
import { initAgentSdkGuard, resetAgentSdkGuard } from '@/components/ai/agentSdkGuard';
import { clearChat } from '../components/ai/chatUtils';
import AiSidebar from '@/components/ai/AiSidebar';
import AiAssistantLauncher from '@/components/ai/AiAssistantLauncher.jsx';
import { AiSidebarProvider, useAiSidebarState } from '@/components/ai/useAiSidebarState.jsx';
import SuggestionBadge from '@/components/ai/SuggestionBadge';
import AiShaActionHandler from '@/components/ai/AiShaActionHandler';
import CronHeartbeat from '../components/shared/CronHeartbeat';
import UserPresenceHeartbeat from '../components/shared/UserPresenceHeartbeat';
import GlobalDomPatches from '../components/shared/GlobalDomPatches';
import PortalRootManager from '../components/shared/PortalRootManager';
import ModalHost from '../components/shared/ModalHost';
import { ErrorLogProvider } from '../components/shared/ErrorLogger';
import { LoggerProvider } from '../components/shared/Logger';
import { NetworkGlobe } from '../components/shared/NetworkGlobe';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiOptimizerProvider } from '../components/shared/ApiOptimizer';

const navItems = [
  { href: 'Dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: 'Contacts', icon: Users, label: 'Contacts' },
  { href: 'Accounts', icon: Building2, label: 'Accounts' },
  { href: 'Leads', icon: Target, label: 'Leads' }, // Changed icon to Target
  { href: 'Opportunities', icon: TrendingUp, label: 'Opportunities' }, // Changed icon to TrendingUp
  { href: 'Activities', icon: CheckSquare, label: 'Activities' },
  { href: 'Calendar', icon: Calendar, label: 'Calendar' },
  { href: 'ConstructionProjects', icon: Kanban, label: 'Project Management' }, // Project management module
  { href: 'Workers', icon: Users, label: 'Workers' }, // Contractors/temp labor management
  { href: 'BizDevSources', icon: Database, label: 'Potential Leads' }, // Business development sources
  { href: 'CashFlow', icon: DollarSign, label: 'Cash Flow' },
  { href: 'DocumentProcessing', icon: FileText, label: 'Document Processing' },
  {
    href: 'DocumentManagement',
    icon: FolderOpen,
    label: 'Document Management',
  },
  { href: 'AICampaigns', icon: Megaphone, label: 'AI Campaigns' }, // Changed icon to Megaphone
  { href: 'Employees', icon: Users, label: 'Employees' }, // Changed icon to Users
  { href: 'Reports', icon: BarChart3, label: 'Reports' },
  { href: 'Integrations', icon: Plug, label: 'Integrations' }, // Changed icon to Plug
  { href: 'Workflows', icon: Zap, label: 'Workflows' }, // NEW: Added Workflows
  { href: 'PaymentPortal', icon: CreditCard, label: 'Payment Portal' },
  { href: 'Utilities', icon: Wrench, label: 'Utilities' },
  { href: 'ClientOnboarding', icon: UserPlus, label: 'Client Onboarding' }, // Changed icon to UserPlus
];

const secondaryNavItems = [
  { href: 'Documentation', icon: BookOpen, label: 'Documentation' }, // Changed icon to BookOpen
  {
    href: 'DeveloperAI',
    icon: Bot,
    label: 'Developer AI',
  },
  {
    href: 'ClientRequirements',
    icon: ClipboardCheck,
    label: 'Client Requirements',
  }, // NEW: Added Client Requirements
];

const UserNav = ({ user, handleLogout, createPageUrl, compact = false }) => {
  const getUserDisplayName = () => {
    if (user?.display_name) return user.display_name;
    if (user?.full_name) return user.full_name;
    if (user?.first_name || user?.last_name) {
      const fn = `${user.first_name || ''} ${user.last_name || ''}`.trim();
      if (fn) return fn;
    }
    if (user?.email) {
      const emailName = user.email.split('@')[0];
      return emailName.charAt(0).toUpperCase() + emailName.slice(1);
    }
    return 'User';
  };

  const displayName = getUserDisplayName();
  // Check if user is admin-like (admin or superadmin)
  const isAdmin = isAdminOrSuperAdmin(user);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={`flex items-center hover:bg-slate-700 ${compact ? 'gap-0 p-1' : 'gap-2 p-1.5'}`}
        >
          <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center">
            <span className="text-sm font-medium text-slate-600">
              {displayName?.charAt(0)?.toUpperCase() || 'A'}
            </span>
          </div>
          {!compact && (
            <span className="text-sm font-semibold leading-6 text-slate-200">{displayName}</span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-slate-800 border-slate-700">
        <DropdownMenuLabel className="text-slate-200">My Account</DropdownMenuLabel>
        <DropdownMenuSeparator className="border-slate-700" />
        <DropdownMenuItem asChild>
          <Link
            to={createPageUrl('Settings')}
            className="text-slate-200 hover:bg-slate-700 focus:bg-slate-700"
          >
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </Link>
        </DropdownMenuItem>
        {isAdmin && <></>}
        <DropdownMenuSeparator className="border-slate-700" />
        <DropdownMenuItem
          onClick={handleLogout}
          className="text-slate-200 hover:bg-slate-700 focus:bg-slate-700"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const SvgDefs = () => (
  <svg width="0" height="0" style={{ position: 'absolute' }}>
    <defs>
      <linearGradient id="ai-icon-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style={{ stopColor: 'var(--primary-color)' }} />
        <stop offset="100%" style={{ stopColor: 'var(--accent-color)' }} />
      </linearGradient>
    </defs>
  </svg>
);

// Add a global flag to prevent multiple cleanup attempts
let globalTenantCleanupDone = false;

function Layout({ children, currentPageName }) {
  // Renamed from AppLayout to Layout
  // Source user from global UserContext to avoid duplicate fetches/logs
  const { user, loading: userLoading, reloadUser } = useUser();
  // Ensure we know when auth cookies are available for backend calls
  const { authCookiesReady } = useAuthCookiesReady();
  const [userError, setUserError] = React.useState(null);

  // Proactive token refresh management (auto-refreshes before expiry)
  // TEMPORARILY DISABLED - debugging initialization issue
  // const handleSessionExpired = React.useCallback(() => {
  //   // Clear all app state on session expiration
  //   localStorage.clear();
  //   navigate('/?session_expired=true');
  // }, [navigate]);

  // const { isRefreshing } = useTokenRefresh({
  //   enabled: !!user && authCookiesReady, // Only run when user is logged in
  //   onSessionExpired: handleSessionExpired
  // });
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
  const [selectedTenant, setSelectedTenant] = React.useState(null);
  const [moduleSettings, setModuleSettings] = React.useState([]);
  const [currentTenantData, setCurrentTenantData] = React.useState(null);
  const [elevenLabsApiKey, setElevenLabsApiKey] = useState(null);
  const {
    isOpen: isAiSidebarOpen,
    openSidebar: openAiSidebar,
    toggleSidebar: toggleAiSidebar,
    realtimeMode: isRealtimeSidebarMode,
  } = useAiSidebarState();

  // CRITICAL: Access tenant context safely WITHOUT destructuring
  const tenantContext = useTenant();
  const selectedTenantId = tenantContext?.selectedTenantId || null;
  const setSelectedTenantId = React.useMemo(
    () => tenantContext?.setSelectedTenantId || (() => {}),
    [tenantContext?.setSelectedTenantId],
  );

  // Entity labels for custom navigation names
  const { getNavLabel } = useEntityLabels();

  const navigate = useNavigate();
  const [globalDetailRecord, setGlobalDetailRecord] = useState(null);
  const { cachedRequest, clearCache } = useApiManager();

  // NEW: lazy-mount flags to reduce initial rate-limit bursts
  const [showNotificationsWidget, setShowNotificationsWidget] = React.useState(false);
  const [showFooterBrand, setShowFooterBrand] = React.useState(false);

  // THEME: add theme state with persistence
  const [theme, setTheme] = React.useState('dark'); // Default to dark if nothing saved
  React.useEffect(() => {
    const saved = localStorage.getItem('app_theme');
    if (saved === 'light' || saved === 'dark') {
      setTheme(saved);
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      // Optional: Detect system preference if no explicit setting is found
      setTheme('light');
    }
  }, []);
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    try {
      localStorage.setItem('app_theme', next);
    } catch (e) {
      console.warn('Storage access failed to save theme:', e);
    }
  };

  const handleAssistantLauncherClick = React.useCallback(() => {
    if (isAiSidebarOpen) {
      toggleAiSidebar();
      return;
    }
    openAiSidebar();
  }, [isAiSidebarOpen, openAiSidebar, toggleAiSidebar]);

  // NEW: ensure theme class is also applied to document.body so Radix Portals inherit light styles
  React.useEffect(() => {
    const cls = theme === 'light' ? 'theme-light' : 'theme-dark';
    document.body.classList.remove('theme-light', 'theme-dark');
    document.body.classList.add(cls);

    // NEW: sync shadcn/ui dark mode by toggling the 'dark' class on <html>
    const rootEl = document.documentElement;
    if (theme === 'dark') {
      rootEl.classList.add('dark');
    } else {
      rootEl.classList.remove('dark');
    }

    return () => {
      document.body.classList.remove('theme-light', 'theme-dark');
    };
  }, [theme]);

  // DEV: Keyboard shortcut to clear cache (Ctrl+Shift+K or Cmd+Shift+K)
  React.useEffect(() => {
    if (!import.meta.env.DEV) return;
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'K') {
        e.preventDefault();
        clearCache();
        console.log('✅ API cache cleared (Ctrl+Shift+K)');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [clearCache]);

  // Ref to track if module settings have been loaded for the current user
  const moduleSettingsLoadedRef = useRef(false);
  // Ref to store the ID of the user for whom module settings were last loaded
  const lastModuleSettingsUserId = useRef(null);
  // Add a ref to dedupe repeated Tenant.get calls for the same id
  const lastTenantRequestIdRef = useRef(null);
  const prevUserTenantRef = useRef(null); // NEW: track last seen user tenant
  // Add a ref to track failed tenant IDs to prevent infinite retry loops
  const failedTenantIdsRef = React.useRef(new Set());
  // NEW: Track last tenant id we cleared cache for
  const tenantCachePrevRef = React.useRef(null);

  // Derive the effective tenant once, memoized (admin/superadmin can override via selectedTenantId)
  const effectiveTenantId = React.useMemo(() => {
    if (!user) return null;
    const superAdmin = isSuperAdmin(user);
    const isAdminLike = isAdminOrSuperAdmin(user);
    let nextTenantId = null;

    if (isAdminLike) {
      // Check if there's a UI tenant selection first (explicit override)
      if (selectedTenantId !== null && selectedTenantId !== undefined) {
        // Specific tenant selected via UI dropdown
        nextTenantId = selectedTenantId;
      } else {
        // No UI selection - check user's assigned tenant_id
        if (user?.tenant_id) {
          // Super Admin or Admin has an assigned tenant - default to it
          logDev('[Layout] Admin defaulting to assigned tenant:', user.tenant_id);
          nextTenantId = user.tenant_id;
        } else if (superAdmin) {
          // Super Admin with NO assigned tenant = global access to ALL tenants
          logDev('[Layout] SuperAdmin global access - viewing ALL tenants');
          return null; // null = "all tenants" for superadmins without tenant assignment
        }
      }
    } else {
      // Non-admins always use their assigned tenant_id
      nextTenantId = user?.tenant_id;
    }

    // Use shared validation function
    const validTenantId =
      nextTenantId && typeof nextTenantId === 'string' && isValidId(nextTenantId)
        ? nextTenantId
        : null;
    if (validTenantId) {
      logDev('[Layout] Filtering data for tenant:', validTenantId);
    }
    return validTenantId;
  }, [user, selectedTenantId]);

  const effectiveModuleTenantId = React.useMemo(() => {
    if (selectedTenantId !== null && selectedTenantId !== undefined) {
      return selectedTenantId;
    }
    if (user?.tenant_id) {
      return user.tenant_id;
    }
    if (currentTenantData?.id) {
      return currentTenantData.id;
    }
    return null;
  }, [currentTenantData?.id, selectedTenantId, user?.tenant_id]);

  const realtimeVoiceModuleEnabled = React.useMemo(() => {
    if (!Array.isArray(moduleSettings) || moduleSettings.length === 0) {
      return true;
    }
    const moduleName = 'Realtime Voice';
    const matchingEntries = moduleSettings.filter((setting) => setting.module_name === moduleName);
    if (matchingEntries.length === 0) {
      return true;
    }
    if (effectiveModuleTenantId) {
      const tenantMatch = matchingEntries.find(
        (setting) => setting.tenant_id === effectiveModuleTenantId,
      );
      if (tenantMatch) {
        return tenantMatch.is_enabled !== false;
      }
    }
    const defaultMatch = matchingEntries.find((setting) => !setting.tenant_id);
    if (defaultMatch) {
      return defaultMatch.is_enabled !== false;
    }
    return matchingEntries[0].is_enabled !== false;
  }, [effectiveModuleTenantId, moduleSettings]);

  // NEW: One-time cleanup of stale tenant IDs on app initialization
  React.useEffect(() => {
    if (globalTenantCleanupDone) return;
    globalTenantCleanupDone = true;

    try {
      const savedTenantId = localStorage.getItem('selected_tenant_id');
      if (savedTenantId && savedTenantId !== 'null' && savedTenantId !== 'undefined') {
        // Check if it's the problematic tenant
        if (savedTenantId === '68b85abfff6be8dc8573e116') {
          localStorage.removeItem('selected_tenant_id');
          if (setSelectedTenantId) {
            setSelectedTenantId(null);
          }
          // DON'T reload - just clear it and let React re-render naturally
        }
      }
    } catch (e) {
      console.warn('Storage access failed during tenant cleanup:', e);
    }
  }, [setSelectedTenantId]);

  // NEW: Auto-select tenant from user profile on login
  React.useEffect(() => {
    if (!user?.tenant_id || !setSelectedTenantId) return;
    const isAdminLike = user.role === 'admin' || user.role === 'superadmin';
    if (isAdminLike) {
      // Admins can freely switch tenants — only auto-select if nothing chosen yet
      if (selectedTenantId === null) {
        logDev('[Layout] Admin auto-selecting tenant from user profile:', user.tenant_id);
        setSelectedTenantId(user.tenant_id);
      }
    } else {
      // Non-admins are locked to their assigned tenant.
      // If localStorage has a stale/wrong tenant ID, correct it.
      if (selectedTenantId !== user.tenant_id) {
        logDev('[Layout] Correcting tenant selection for non-admin user:', {
          was: selectedTenantId,
          correctedTo: user.tenant_id,
        });
        setSelectedTenantId(user.tenant_id);
      }
    }
  }, [user?.tenant_id, user?.role, selectedTenantId, setSelectedTenantId]);

  // NEW: Reset failed tenants when user changes
  React.useEffect(() => {
    if (user?.id && lastModuleSettingsUserId.current !== user.id) {
      failedTenantIdsRef.current.clear();
    }
  }, [user?.id]);

  // NEW: Preconnect/dns-prefetch hints for performance-critical origins
  React.useEffect(() => {
    const origins = [
      'https://m.stripe.com',
      // Using local assets only
    ];
    const ensureLink = (rel, href, crossOrigin) => {
      const id = `hint-${rel}-${btoa(href).replace(/=/g, '')}`;
      if (document.getElementById(id)) return;
      const link = document.createElement('link');
      link.id = id;
      link.rel = rel;
      link.href = href;
      if (crossOrigin) link.crossOrigin = 'anonymous';
      document.head.appendChild(link);
    };
    origins.forEach((o) => {
      ensureLink('preconnect', o, true);
      ensureLink('dns-prefetch', o);
    });
  }, []);

  // Display Effective client badge in header for clarity (REMOVED per user request)
  // The tenant identifier should no longer be exposed in the UI.
  // Keeping the component stub to avoid runtime/JSX reference changes elsewhere.
  const EffectiveClientBadge = () => null;

  // Inject badge just before returning main layout (search for the primary return below)

  // NEW: Auto-apply loading="lazy" to images and observe future inserts
  React.useEffect(() => {
    const setLazy = (img) => {
      if (!img) return;
      const already = img.getAttribute('loading');
      if (!already) img.setAttribute('loading', 'lazy');
    };
    document.querySelectorAll('img').forEach(setLazy);
    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes?.forEach((n) => {
          if (n && n.nodeType === 1) {
            if (n.tagName === 'IMG') setLazy(n);
            n.querySelectorAll?.('img')?.forEach(setLazy);
          }
        });
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);

  // Add a global guard to gracefully handle transient Axios "Network Error" without crashing the app UI
  React.useEffect(() => {
    const handler = (event) => {
      const err = event?.reason || event;
      const msg = (err && (err.message || err.toString())) || '';
      // Suppress noisy Axios "Network Error" crashes; log instead
      if (typeof msg === 'string' && /network error/i.test(msg)) {
        console.warn('Network error suppressed:', err?.message || 'Connection issue');
        event.preventDefault?.();
        // Prevent subsequent default handling of the rejection
        event.stopImmediatePropagation?.();
      }
    };
    const onError = (e) => {
      const msg = (e?.error && e.error.message) || e?.message || '';
      if (typeof msg === 'string' && /network error/i.test(msg)) {
        console.warn('Network error suppressed:', e.error?.message || e.message);
        e.preventDefault?.();
        e.stopImmediatePropagation?.();
      }
    };
    window.addEventListener('unhandledrejection', handler);
    window.addEventListener('error', onError);
    return () => {
      window.removeEventListener('unhandledrejection', handler);
      window.removeEventListener('error', onError);
    };
  }, []);

  // Defer non-critical widgets to reduce initial load - DRAMATICALLY INCREASED delays
  React.useEffect(() => {
    const t1 = setTimeout(() => setShowNotificationsWidget(true), 6000); // 6s
    const t2 = setTimeout(() => setShowFooterBrand(true), 8000); // 8s
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  React.useEffect(() => {
    // Event listener for navigation from the command palette (now ChatWindow)
    const handleCommandPaletteNavigation = (event) => {
      const { pageName } = event.detail;
      if (pageName && navigate) {
        navigate(createPageUrl(pageName));
      }
    };

    // Event listener for viewing record details
    const handleViewDetails = (event) => {
      const { entityType, record } = event.detail;
      if (entityType && record) {
        setGlobalDetailRecord({ entityType, record });
      }
    };

    // ChatWindow now dispatches this event for navigation
    window.addEventListener('navigate-from-command-palette', handleCommandPaletteNavigation);
    window.addEventListener('view-record-details', handleViewDetails);

    return () => {
      window.removeEventListener('navigate-from-command-palette', handleCommandPaletteNavigation);
      window.removeEventListener('view-record-details', handleViewDetails);
    };
  }, [navigate]);

  // NEW: Keyboard shortcut: Ctrl+Shift+K to clear chat quickly
  React.useEffect(() => {
    const onKeyDown = (e) => {
      const key = e.key?.toLowerCase?.() || '';
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && key === 'k') {
        // Cmd+Shift+K for Mac, Ctrl+Shift+K for others
        e.preventDefault();
        clearChat({ reload: true, confirmFirst: true });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // UNUSED: handleElevenLabsMessage - ChatWindow component is commented out
  // const handleElevenLabsMessage = (event) => {
  //   try {
  //     if (import.meta.env.DEV) {
  //       console.debug('ElevenLabs Message Received:', event.detail);
  //     }
  //     const message = event.detail;
  //     // The actual response with actions is inside a stringified JSON in the 'text' field
  //     if (message.type === 'text' && message.text && message.text.startsWith('{')) {
  //       const parsedText = JSON.parse(message.text);
  //       if (parsedText.uiActions && Array.isArray(parsedText.uiActions)) {
  //         parsedText.uiActions.forEach(action => {
  //           // IMPORTANT: This is where we handle the navigation action
  //           if (action.action === 'navigate' && action.pageName) {
  //             if (import.meta.env.DEV) {
  //               console.debug('Executing navigation:', action.pageName);
  //             }
  //             navigate(createPageUrl(action.pageName));
  //           }
  //         });
  //       }
  //     }
  //   } catch (e) {
  //     // It's normal for some messages (like the agent's greeting) to not be JSON
  //     if (import.meta.env.DEV) {
  //       console.debug('Could not parse AI UI action from message:', e.message);
  //     }
  //   }
  // };

  // Navigation order management with drag-and-drop (tenant-scoped + database persistence)
  // Create save callbacks for navigation order persistence to database
  const saveNavOrderToDatabase = useCallback(
    async (orderArray) => {
      if (!user) return;
      try {
        await User.updateMyUserData({
          permissions: {
            ...user.permissions,
            navigation_order: orderArray,
          },
        });
        console.log('[Layout] Navigation order saved to database:', orderArray);
        reloadUser?.();
      } catch (error) {
        console.error('[Layout] Failed to save navigation order to database:', error);
      }
    },
    [user, reloadUser],
  );

  const saveSecondaryNavOrderToDatabase = useCallback(
    async (orderArray) => {
      if (!user) return;
      try {
        await User.updateMyUserData({
          permissions: {
            ...user.permissions,
            secondary_navigation_order: orderArray,
          },
        });
        console.log('[Layout] Secondary navigation order saved to database:', orderArray);
        reloadUser?.();
      } catch (error) {
        console.error('[Layout] Failed to save secondary navigation order to database:', error);
      }
    },
    [user, reloadUser],
  );

  // Navigation order hooks with database persistence
  const {
    orderedItems: orderedNavItems,
    setOrder: setNavOrder,
    resetOrder: resetNavOrder,
    hasCustomOrder: hasCustomNavOrder,
  } = usePrimaryNavOrder(navItems, effectiveTenantId, {
    user,
    saveToDatabase: saveNavOrderToDatabase,
  });
  const {
    orderedItems: orderedSecondaryItems,
    setOrder: setSecondaryOrder,
    resetOrder: resetSecondaryOrder,
    hasCustomOrder: hasCustomSecondaryOrder,
  } = useSecondaryNavOrder(secondaryNavItems, effectiveTenantId, {
    user,
    saveToDatabase: saveSecondaryNavOrderToDatabase,
  });

  // Debug navigation order persistence
  React.useEffect(() => {
    console.log('[Layout] effectiveTenantId changed:', effectiveTenantId, 'user:', user?.email);
  }, [effectiveTenantId, user?.email]);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Minimum drag distance before activation
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Navigation drag-and-drop state and handlers
  const {
    isDragMode,
    setIsDragMode,
    handleNavDragEnd,
    handleSecondaryDragEnd,
    handleResetNavOrder,
  } = useNavDragAndDrop({
    orderedNavItems,
    setNavOrder,
    orderedSecondaryItems,
    setSecondaryOrder,
    resetNavOrder,
    resetSecondaryOrder,
  });

  const filteredNavItems = React.useMemo(() => {
    if (!user) return [];
    // Filter out items with parentMenu if you want to implement a nested menu structure
    // For now, they are treated as top-level items for simplicity as per existing structure
    return orderedNavItems
      .filter((item) => hasPageAccess(user, item.href, selectedTenantId, moduleSettings))
      .map((item) => {
        // Apply custom entity labels if available
        const customLabel = getNavLabel(item.href);
        return customLabel ? { ...item, label: customLabel } : item;
      });
  }, [user, selectedTenantId, moduleSettings, orderedNavItems, getNavLabel]);

  const filteredSecondaryNavItems = React.useMemo(() => {
    if (!user) return [];
    return orderedSecondaryItems
      .filter((item) => hasPageAccess(user, item.href, selectedTenantId, moduleSettings))
      .map((item) => {
        // Apply custom entity labels if available
        const customLabel = getNavLabel(item.href);
        return customLabel ? { ...item, label: customLabel } : item;
      });
  }, [user, selectedTenantId, moduleSettings, orderedSecondaryItems, getNavLabel]);

  React.useEffect(() => {
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;

    const extensionErrorPatterns = [
      'A listener indicated an asynchronous response by returning true',
      'message channel closed before a response was received',
      'Extension context invalidated',
      'Could not establish connection. Receiving end does not exist',
      'The message port closed before a response was received',
    ];

    console.error = (...args) => {
      const message = args.join(' ');
      const isExtensionError = extensionErrorPatterns.some((pattern) => message.includes(pattern));

      if (!isExtensionError) {
        originalConsoleError.apply(console, args);
      } else if (import.meta.env.DEV) {
        console.debug('[Browser Extension]', ...args);
      }
    };

    console.warn = (...args) => {
      const message = args.join(' ');
      const isExtensionWarning = extensionErrorPatterns.some((pattern) =>
        message.includes(pattern),
      );

      if (!isExtensionWarning) {
        originalConsoleWarn.apply(console, args);
      } else if (import.meta.env.DEV) {
        console.debug('[Browser Extension]', ...args);
      }
    };

    return () => {
      console.error = originalConsoleError;
      console.warn = originalConsoleWarn;
    };
  }, []);

  // REMOVED: Client-side AI function-call logger (was wrapping every fetch)
  // This was adding overhead to every single network request

  const refetchUser = React.useCallback(async () => {
    try {
      setUserError(null);
      await reloadUser();
      // Fetch AI API key silently for the (new) current user context
      // Only in dev mode to avoid production warnings
      if (import.meta.env.DEV) {
        getOrCreateUserApiKey()
          .then((response) => {
            if (response?.data?.apiKey) {
              setElevenLabsApiKey(response.data.apiKey);
            }
          })
          .catch((err) => {
            console.debug('AI API key fetch skipped:', err.message);
          });
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.debug('User reload error (ignored):', error?.message || error);
      }
      setUserError(error?.message || 'Failed to reload user');
    }
  }, [reloadUser]);

  // NOTE: Removed redundant refetchUser() call on mount - UserContext already loads user
  // The refetchUser callback is still available for explicit refresh (e.g., after profile update)

  // Warm backend dashboard cache after auth cookies and user/tenant ready
  // Consolidated into single effect to prevent duplicate calls
  const lastWarmedTenantRef = React.useRef(null);
  React.useEffect(() => {
    const warmCache = async () => {
      if (!authCookiesReady || !user) return;

      const tenantId = selectedTenantId || user?.tenant_id || null;

      // Skip if we already warmed this tenant
      if (tenantId && lastWarmedTenantRef.current === tenantId) {
        return;
      }

      try {
        await getDashboardBundleFast({ tenant_id: tenantId, include_test_data: true });
        lastWarmedTenantRef.current = tenantId;
      } catch (err) {
        if (import.meta.env.DEV) {
          console.debug('[WarmCache] skipped:', err?.message || err);
        }
      }
    };
    warmCache();
  }, [authCookiesReady, user, selectedTenantId]);

  // Refresh user when profile data changes in-app (Employee/User updates)
  React.useEffect(() => {
    const onEntityModified = (event) => {
      const { entity } = event.detail || {};
      if (entity === 'Employee' || entity === 'User') {
        // Re-load current user to pick up display_name/first/last changes
        refetchUser();
      }
    };
    window.addEventListener('entity-modified', onEntityModified);
    return () => window.removeEventListener('entity-modified', onEntityModified);
  }, [refetchUser]);

  React.useEffect(() => {
    // Persist AI API key (from getOrCreateUserApiKey) for agent/chat usage
    if (elevenLabsApiKey) {
      try {
        // Security: Use in-memory storage only for API keys (no browser storage)
        // CodeQL flagged localStorage/sessionStorage as clear-text storage vulnerability

        // Expose minimal context for components that can't import Layout state (in-memory only)
        window.__AI_CONTEXT = {
          ...(window.__AI_CONTEXT || {}),
          apiKey: elevenLabsApiKey,
        };
      } catch (e) {
        console.warn('Storage access failed for AI SDK API key:', e);
      }
    }
  }, [elevenLabsApiKey]);

  // Initialize/refresh the agent SDK guard when client (tenant) context changes
  React.useEffect(() => {
    const tenantId = currentTenantData?.id || selectedTenant?.id || selectedTenantId || null;
    const tenantName = currentTenantData?.name || selectedTenant?.name || null;

    initAgentSdkGuard({ tenantId, tenantName });

    // Also expose globally for any legacy code paths
    try {
      window.__AI_CONTEXT = {
        ...(window.__AI_CONTEXT || {}),
        tenant_id: tenantId,
        tenant_name: tenantName,
      };
    } catch (e) {
      console.warn('Error exposing AI tenant context:', e);
    }
  }, [currentTenantData, selectedTenant, selectedTenantId]);

  // NEW: Respect manual selection for admins; only set default if none. Non-admins always follow their own tenant.
  React.useEffect(() => {
    const currTenantId = user?.tenant_id || null;
    const isAdminLike = isAdminOrSuperAdmin(user);
    const hasManualSelection =
      selectedTenantId !== null &&
      selectedTenantId !== undefined &&
      selectedTenantId !== '' &&
      selectedTenantId !== 'NO_TENANT_SELECTED_SAFETY_FILTER';

    // If the logged-in user's tenant actually changed, reset caches/tenant data
    // Or if the user role changed which might affect default tenant selection logic
    if (
      prevUserTenantRef.current !== currTenantId ||
      (user && user.id && lastModuleSettingsUserId.current !== user.id)
    ) {
      prevUserTenantRef.current = currTenantId;
      lastTenantRequestIdRef.current = null;
      setCurrentTenantData(null);
      setSelectedTenant(null);
      if (clearCache) clearCache();
    }

    // Admins/Superadmins: do not override manual tenant switching
    if (isAdminLike) {
      if (!hasManualSelection) {
        // No prior selection (fresh login or cleared), set to user's assigned tenant
        // This ensures Super Admins with tenant_id assignments default to their tenant
        if (setSelectedTenantId) setSelectedTenantId(currTenantId || null);
      }
      return; // Never force-reset when admin picked a tenant
    }

    // Regular users: always align to their assigned tenant
    if (!isAdminLike && setSelectedTenantId && selectedTenantId !== currTenantId) {
      setSelectedTenantId(currTenantId || null);
    }
  }, [user, selectedTenantId, setSelectedTenantId, clearCache]);

  // Tenant loading effect with improved error handling
  React.useEffect(() => {
    const loadCurrentTenant = async () => {
      // ALWAYS log effect entry in dev
      if (import.meta.env.DEV) {
        logDev('[Layout] loadCurrentTenant EFFECT RUNNING:', {
          user: !!user,
          effectiveTenantId,
          selectedTenantId,
          lastRequest: lastTenantRequestIdRef.current,
          currentTenantData: currentTenantData?.name || currentTenantData?.id || null,
        });
      }

      // Use the MEMOIZED effectiveTenantId to prevent unnecessary runs
      if (!user) {
        setCurrentTenantData(null);
        setSelectedTenant(null);
        lastTenantRequestIdRef.current = null;
        failedTenantIdsRef.current.clear();
        return;
      }

      try {
        const tenantIdToFetch = effectiveTenantId;

        if (import.meta.env.DEV) {
          logDev('[Layout] loadCurrentTenant FETCHING:', {
            effectiveTenantId: tenantIdToFetch,
            selectedTenantId,
            lastRequest: lastTenantRequestIdRef.current,
          });
        }

        if (!tenantIdToFetch) {
          setCurrentTenantData(null);
          setSelectedTenant(null);
          lastTenantRequestIdRef.current = null;
          return;
        }

        // CRITICAL: Check if this tenant ID has already failed - prevent infinite retry
        if (failedTenantIdsRef.current.has(tenantIdToFetch)) {
          setCurrentTenantData(null);
          setSelectedTenant(null);
          lastTenantRequestIdRef.current = null;

          // For admins, clear the bad selection so they can pick a valid tenant
          if (
            (user.role === 'admin' || user.role === 'superadmin') &&
            setSelectedTenantId &&
            selectedTenantId &&
            effectiveTenantId === selectedTenantId
          ) {
            setSelectedTenantId(null);
            try {
              localStorage.removeItem('selected_tenant_id');
            } catch {
              console.warn('Storage access failed');
            }
          }
          return;
        }

        // Dedupe by id to prevent redundant Tenant.get calls
        if (lastTenantRequestIdRef.current === tenantIdToFetch) {
          if (import.meta.env.DEV) {
            logDev('[Layout] loadCurrentTenant SKIPPED (dedupe):', tenantIdToFetch);
          }
          return;
        }
        lastTenantRequestIdRef.current = tenantIdToFetch;

        const tenant = await cachedRequest('Tenant', 'get', { id: tenantIdToFetch }, () =>
          Tenant.get(tenantIdToFetch),
        );

        if (tenant) {
          setCurrentTenantData(tenant);
          setSelectedTenant(tenant);
          failedTenantIdsRef.current.delete(tenantIdToFetch);
        } else {
          console.warn('Tenant not found/accessible:', tenantIdToFetch);
          failedTenantIdsRef.current.add(tenantIdToFetch);
          setCurrentTenantData(null);
          setSelectedTenant(null);
          lastTenantRequestIdRef.current = null;

          if (
            (user.role === 'admin' || user.role === 'superadmin') &&
            setSelectedTenantId &&
            selectedTenantId &&
            effectiveTenantId === selectedTenantId
          ) {
            setSelectedTenantId(null);
            try {
              localStorage.removeItem('selected_tenant_id');
            } catch {
              console.warn('Storage access failed');
            }
          }
        }
      } catch (error) {
        const attemptedTenantId = effectiveTenantId;
        const status = error?.response?.status || error?.status;

        console.error('Tenant load failed:', {
          tenantId: attemptedTenantId,
          status,
          message: error?.message || 'Unknown error',
        });

        // If it's a 404 or 429, mark this tenant as failed and clear everywhere
        const isNotFound = status === 404;
        const isRateLimited = status === 429;
        const isForbidden = status === 403; // Added 403 Forbidden for clearer error handling

        if (isNotFound || isRateLimited || isForbidden) {
          if (attemptedTenantId) {
            failedTenantIdsRef.current.add(attemptedTenantId);
            lastTenantRequestIdRef.current = null;
          }

          setCurrentTenantData(null);
          setSelectedTenant(null);

          // CRITICAL FIX: Clear invalid tenant from localStorage for ALL users
          try {
            const storedTenantId = localStorage.getItem('selected_tenant_id');
            if (storedTenantId === attemptedTenantId) {
              localStorage.removeItem('selected_tenant_id');
              if (setSelectedTenantId) {
                setSelectedTenantId(null);
              }
            }
          } catch {
            console.warn('Storage cleanup failed');
          }
        }
      }
    };

    // ALWAYS load tenant data when effectiveTenantId changes
    // Branding needs tenant data on ALL pages, including Settings
    loadCurrentTenant();

    // DEPS: run only when the effective tenant truly changes or page context changes
    // eslint-disable-next-line react-hooks/exhaustive-deps -- currentTenantData is logged for debugging only, not used in logic
  }, [
    effectiveTenantId,
    currentPageName,
    cachedRequest,
    setSelectedTenantId,
    user,
    selectedTenantId,
  ]);

  // NEW: Listen for tenant updates and refresh tenant data
  React.useEffect(() => {
    const handleTenantModified = async (event) => {
      const { entity } = event.detail || {};
      if (entity === 'Tenant' && effectiveTenantId) {
        // Tenant was modified, reload tenant data
        try {
          const updatedTenant = await Tenant.get(effectiveTenantId);
          if (updatedTenant) {
            setCurrentTenantData(updatedTenant);
            setSelectedTenant(updatedTenant);
            // Clear cache to force fresh data
            if (clearCache) {
              clearCache();
            }
          }
        } catch (error) {
          console.error('Failed to refresh tenant after update:', error);
        }
      }
    };

    window.addEventListener('entity-modified', handleTenantModified);

    return () => {
      window.removeEventListener('entity-modified', handleTenantModified);
    };
  }, [effectiveTenantId, clearCache]);

  // NEW: Fetch tenant branding for non-admin users via backend (bypasses Tenant RLS safely)
  React.useEffect(() => {
    if (!user) return;
    const isAdminLike = isAdminOrSuperAdmin(user);
    if (isAdminLike) return; // This effect is only for non-admins
    if (!user.tenant_id) return;

    // If currentTenantData is already set and matches the user's tenant_id, skip.
    // This prevents unnecessary re-fetching if the data is already correct.
    if (currentTenantData && currentTenantData.id === user.tenant_id) {
      // Also ensure selectedTenant is in sync if it's not already
      if (selectedTenant?.id !== user.tenant_id) {
        setSelectedTenant(currentTenantData);
      }
      return;
    }

    (async () => {
      try {
        const res = await getTenantBrandingFast();
        if (res?.status === 200 && res?.data?.tenant) {
          const t = res.data.tenant;
          setCurrentTenantData(t);
          setSelectedTenant(t); // Also set selectedTenant
          if (lastTenantRequestIdRef.current !== t.id) {
            lastTenantRequestIdRef.current = t.id;
          }
        } else {
          console.warn('Tenant branding fetch failed:', res?.error || 'Unknown error');
          setCurrentTenantData(null); // Clear stale data
          setSelectedTenant(null);
          lastTenantRequestIdRef.current = null; // Clear ref
        }
      } catch (error) {
        console.error('Tenant branding fetch error (non-admin):', error);
        setCurrentTenantData(null);
        setSelectedTenant(null);
        lastTenantRequestIdRef.current = null;
      }
    })();
  }, [user, currentTenantData, selectedTenant, setSelectedTenant]); // Added selectedTenant and setSelectedTenant to dependencies

  // Effect to reset moduleSettingsLoadedRef when the user changes
  React.useEffect(() => {
    if (user && lastModuleSettingsUserId.current !== user.id) {
      moduleSettingsLoadedRef.current = false; // Reset flag for a new user
      lastModuleSettingsUserId.current = user.id;
    } else if (!user) {
      moduleSettingsLoadedRef.current = false; // Reset if user logs out
      lastModuleSettingsUserId.current = null;
    }
  }, [user]);

  // Load module settings once per user; defer to idle time to reduce initial load
  React.useEffect(() => {
    const loadModuleSettings = () => {
      if (!user) {
        setModuleSettings([]);
        return;
      }
      // If module settings are already loaded for the current user, prevent re-fetching
      if (moduleSettingsLoadedRef.current) {
        return;
      }

      const fetchSettings = async () => {
        try {
          let settings;
          if (user.role === 'admin' || user.role === 'superadmin') {
            settings = await cachedRequest('ModuleSettings', 'list', {}, () =>
              ModuleSettings.list(),
            );
          } else if (user.tenant_id) {
            settings = await cachedRequest(
              'ModuleSettings',
              'filter',
              { filter: { tenant_id: user.tenant_id } },
              () => ModuleSettings.filter({ tenant_id: user.tenant_id }),
            );
          } else {
            settings = [];
          }
          setModuleSettings(settings || []);
          moduleSettingsLoadedRef.current = true; // Mark as loaded for the current user
        } catch (error) {
          console.warn('Module settings load failed:', error);
          setModuleSettings([]);
          // On error, do NOT mark as loaded, so it can retry
          moduleSettingsLoadedRef.current = false;
        }
      };

      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(fetchSettings, { timeout: 2000 });
      } else {
        setTimeout(fetchSettings, 750);
      }
    };
    loadModuleSettings();
  }, [user, cachedRequest]);

  // Listen for module settings changes and reload navigation
  React.useEffect(() => {
    const handleModuleSettingsChanged = () => {
      const reloadSettings = async () => {
        try {
          if (user) {
            let settings;
            if (user.role === 'admin' || user.role === 'superadmin') {
              settings = await cachedRequest('ModuleSettings', 'list', {}, () =>
                ModuleSettings.list(),
              );
            } else if (user.tenant_id) {
              settings = await cachedRequest(
                'ModuleSettings',
                'filter',
                { filter: { tenant_id: user.tenant_id } },
                () => ModuleSettings.filter({ tenant_id: user.tenant_id }),
              );
            } else {
              settings = [];
            }
            setModuleSettings(settings || []);

            // Clear API cache to force refresh of all components that rely on API data
            if (clearCache) {
              clearCache();
            }
            moduleSettingsLoadedRef.current = true; // Mark as loaded after refresh
          }
        } catch (error) {
          console.warn('Module settings reload failed:', error);
          // On error, do NOT mark as loaded, so it can retry
          moduleSettingsLoadedRef.current = false;
        }
      };

      reloadSettings();
    };

    window.addEventListener('module-settings-changed', handleModuleSettingsChanged);

    return () => {
      window.removeEventListener('module-settings-changed', handleModuleSettingsChanged);
    };
  }, [user, cachedRequest, clearCache]);

  // NEW: Clear API cache on real tenant change
  React.useEffect(() => {
    const prev = tenantCachePrevRef.current;
    const next = selectedTenantId; // Use selectedTenantId here, as it's the source of the tenant context for caching

    if (next && next !== prev) {
      clearCache && clearCache();
      tenantCachePrevRef.current = next;
    } else {
      // Skip churn on null/undefined or duplicate values
      // Do not update prev ref when next is falsy to avoid null→id→null thrash
    }
  }, [selectedTenantId, clearCache]);

  // Removed Lead patching - Leads page handles its own cache clearing

  // Patch Employee methods to clear cache and dispatch refresh event
  React.useEffect(() => {
    if (!user || !user.email) return;

    const originalEmployeeCreate = Employee.create;
    const originalEmployeeUpdate = Employee.update;
    const originalEmployeeDelete = Employee.delete;

    const dispatchEntityModifiedEvent = (entityName, payload = {}) => {
      window.dispatchEvent(
        new CustomEvent('entity-modified', { detail: { entity: entityName, ...payload } }),
      );
    };

    Employee.create = async (data) => {
      const res = await originalEmployeeCreate(data);
      try {
        if (import.meta.env.DEV) {
          console.debug('Employee created, refreshing data.');
        }
        if (clearCache) clearCache();
        dispatchEntityModifiedEvent('Employee', { id: res?.id });
      } catch (e) {
        console.warn('Data refresh failed after employee create:', e);
      }
      return res;
    };

    Employee.update = async (id, data) => {
      const res = await originalEmployeeUpdate(id, data);
      try {
        if (import.meta.env.DEV) {
          console.debug('Employee updated, refreshing data.');
        }
        if (clearCache) clearCache();
        dispatchEntityModifiedEvent('Employee', { id });
      } catch (e) {
        console.warn('Data refresh failed after employee update:', e);
      }
      return res;
    };

    Employee.delete = async (id) => {
      const res = await originalEmployeeDelete(id);
      try {
        if (import.meta.env.DEV) {
          console.debug('Employee deleted, refreshing data.');
        }
        if (clearCache) clearCache();
        dispatchEntityModifiedEvent('Employee', { id });
      } catch (e) {
        console.warn('Data refresh failed after employee delete:', e);
      }
      return res;
    };

    return () => {
      if (originalEmployeeCreate) Employee.create = originalEmployeeCreate;
      if (originalEmployeeUpdate) Employee.update = originalEmployeeUpdate;
      if (originalEmployeeDelete) Employee.delete = originalEmployeeDelete;
    };
  }, [user, clearCache]);

  // Patch User.update to dispatch entity-modified event for current user refresh
  React.useEffect(() => {
    if (!user || !user.email) return;

    const originalUserUpdate = User.update;

    const dispatchEntityModifiedEvent = (entityName, payload = {}) => {
      window.dispatchEvent(
        new CustomEvent('entity-modified', { detail: { entity: entityName, ...payload } }),
      );
    };

    User.update = async (id, data) => {
      const res = await originalUserUpdate(id, data);
      try {
        if (import.meta.env.DEV) {
          console.debug('User updated, refreshing current user.');
        }
        if (clearCache) clearCache();
        dispatchEntityModifiedEvent('User', { id });
      } catch (e) {
        console.warn('Data refresh failed after user update:', e);
      }
      return res;
    };

    return () => {
      if (originalUserUpdate) User.update = originalUserUpdate;
    };
  }, [user, clearCache]);

  // UNUSED: widgetContext - ChatWindow component is commented out
  // // Create the enhanced widget context
  // const widgetContext = React.useMemo(() => {
  //   if (!user || !currentTenantData) return null;

  //   const tenantId = currentTenantData.id;

  //   return JSON.stringify({
  //     tenant_id: tenantId,
  //     user_email: user.email,
  //     user_role: user.role,
  //     // The MCP handler function URL
  //     mcp_server_url: `${window.location.origin}/api/functions/mcpHandler`,
  //     capabilities: {
  //       can_access_activities: true,
  //       can_access_contacts: true,
  //       can_access_leads: true,
  //       can_access_opportunities: true,
  //       can_create_activities: true,
  //     }
  //   });
  // }, [user, currentTenantData]);

  const getBrandingSettings = () => {
    const defaultCompanyName = 'Ai-SHA CRM';
    const defaultLogoUrl = '/assets/Ai-SHA-logo-2.png'; // Default logo for global view
    const defaultPrimaryColor = '#06b6d4'; // New Cyan
    const defaultAccentColor = '#6366f1'; // New Indigo

    let companyName = defaultCompanyName;
    let logoUrl = defaultLogoUrl;
    let primaryColor = defaultPrimaryColor;
    let accentColor = defaultAccentColor;

    // Always prefer active tenant branding if available (applies to all roles)
    // This is the source of truth once loaded, ensuring correct branding for the active tenant.
    if (currentTenantData) {
      companyName = currentTenantData.name || defaultCompanyName;
      logoUrl = currentTenantData.logo_url || defaultLogoUrl;
      primaryColor = currentTenantData.primary_color || defaultPrimaryColor;
      accentColor = currentTenantData.accent_color || defaultAccentColor;
    } else {
      // Admins/Superadmins:
      // If there's a selected tenant (e.g., from the switcher), use its branding.
      // Otherwise, if the user has specific branding set in their user object, use that.
      if (user?.role === 'superadmin' || user?.role === 'admin') {
        if (selectedTenantId && selectedTenant) {
          companyName = selectedTenant.name || defaultCompanyName;
          logoUrl = selectedTenant.logo_url || defaultLogoUrl;
          primaryColor = selectedTenant.primary_color || defaultPrimaryColor;
          accentColor = selectedTenant.accent_color || defaultAccentColor;
        } else if (user.branding_settings) {
          // Fallback to user's own branding settings if no tenant selected
          companyName = user.branding_settings.companyName || defaultCompanyName;
          logoUrl = user.branding_settings.logoUrl || defaultLogoUrl;
          primaryColor = user.branding_settings.primaryColor || defaultPrimaryColor;
          accentColor = user.branding_settings.accentColor || defaultAccentColor;
        }
        // IMPORTANT: For non-admins/power-users, do NOT use personal branding here.
        // If currentTenantData is null, it means we are still fetching their assigned tenant branding (via getMyTenantBranding)
        // or they don't have one, so we should explicitly fall back to global defaults.
        // The default values are already set above, so no explicit 'else' block needed here.
      }
    }

    return {
      companyName: companyName,
      logoUrl: logoUrl,
      primaryColor: primaryColor,
      accentColor: accentColor,
      // Use the tenant-specific ElevenLabs agent ID from currentTenantData
      elevenlabsAgentId: currentTenantData?.elevenlabs_agent_id || null,
    };
  };

  const brandingSettings = getBrandingSettings();
  const companyName = brandingSettings.companyName;
  const logoUrl = brandingSettings.logoUrl;

  // Debug: log branding in dev
  React.useEffect(() => {
    if (import.meta.env.DEV) {
      logDev('[Layout] Branding:', {
        companyName,
        logoUrl,
        user: user?.email,
        selectedTenantId,
        currentTenantData: currentTenantData?.name,
      });
    }
  }, [companyName, logoUrl, user?.email, selectedTenantId, currentTenantData?.name]);

  // Cache-bust static logo paths so updated files with the same name show immediately
  const logoVersionRef = React.useRef(0);

  // Extract branding logic to useBranding hook
  const { displayedLogoUrl, primaryColor, accentColor, onPrimaryText, onAccentText, hexToHsl } =
    useBranding(brandingSettings, logoUrl, logoVersionRef);

  // Apply brand variables at the document root so portals/overlays inherit correctly
  React.useEffect(() => {
    try {
      const hexToHslStringLocal = (hex) => {
        const { h, s, l } = hexToHsl(hex);
        return `${h} ${s}% ${l}%`;
      };
      const root = document.documentElement;
      const set = (k, v) => root.style.setProperty(k, String(v));

      // Direct color tokens used across the app
      set('--primary-color', primaryColor);
      set('--accent-color', accentColor);
      set('--on-primary-text', onPrimaryText);
      set('--on-accent-text', onAccentText);

      // Map to Tailwind theme variables (expects HSL triplets)
      set('--primary', hexToHslStringLocal(primaryColor));
      set('--accent', hexToHslStringLocal(accentColor));
      set('--primary-foreground', hexToHslStringLocal(onPrimaryText));
      set('--accent-foreground', hexToHslStringLocal(onAccentText));
    } catch (e) {
      console.warn('Failed to apply branding variables at root:', e);
    }
  }, [primaryColor, accentColor, onPrimaryText, onAccentText, hexToHsl]);

  const handleLogout = async () => {
    try {
      if (user) {
        try {
          await createAuditLog({
            action_type: 'logout',
            entity_type: 'User',
            entity_id: user.id,
            description: `User logged out: ${user.full_name || user.email}`,
          });
        } catch (auditError) {
          console.warn('Logout audit log failed:', auditError);
        }
      }

      // Clear ApiManager cache to prevent stale data on next login
      try {
        if (clearCache) {
          clearCache(); // Clear all cached API requests
        }
      } catch (e) {
        console.warn('API cache clear failed on logout:', e);
      }

      // Explicitly sign out from Supabase Auth (clears local auth session & tokens)
      try {
        // Prefer centralized User entity method for consistency
        if (User && typeof User.signOut === 'function') {
          await User.signOut();
        } else if (supabase?.auth?.signOut) {
          await supabase.auth.signOut();
        }
      } catch (e) {
        console.warn('Supabase signOut failed (continuing logout):', e);
      }

      // NEW: Clear chat/session context before logging out
      try {
        // Notify chat UI to clean up (e.g., stop TTS playback)
        window.dispatchEvent(new CustomEvent('chat:reset'));
      } catch (e) {
        console.warn('Chat reset dispatch failed on logout:', e);
      }

      try {
        // CRITICAL: Clear ALL tenant-specific data on logout to prevent cross-tenant data leakage

        // Clear explicit tenant keys
        localStorage.removeItem('selected_tenant_id');
        localStorage.removeItem('tenant_id');
        localStorage.removeItem('effective_user_tenant_id');

        // Clear chat/AI-related keys
        localStorage.removeItem('ai_sdk_api_key');
        localStorage.removeItem('force_chat_fallback');

        // FIX: Prevent auto-login as mock user after explicit logout
        localStorage.setItem('DISABLE_MOCK_USER', 'true');

        // Clear ALL localStorage keys except navigation preferences and system flags
        // PRESERVE: Navigation order preferences across logout (aisha_crm_nav_order_*)
        // PRESERVE: DISABLE_MOCK_USER flag (set above)
        const toRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (!k) continue;

          // PRESERVE navigation order preferences across sessions
          if (
            k.startsWith('aisha_crm_nav_order') ||
            k.startsWith('aisha_crm_secondary_nav_order')
          ) {
            continue;
          }

          // PRESERVE system flags
          if (k === 'DISABLE_MOCK_USER') {
            continue;
          }

          // REMOVE everything else (tenant data, dashboard cache, chat, auth tokens, etc.)
          if (
            k.startsWith('chat_') ||
            k.startsWith('agent_') ||
            k.startsWith('ai_chat_') ||
            k.startsWith('agent_conversation') ||
            k.startsWith('conversation_') ||
            k.startsWith('dashboard:') ||
            k.startsWith('sb-') || // Supabase auth tokens
            k.includes('tenant') || // Any tenant-related keys
            k.startsWith('aisha_crm_') // Other app-specific keys (except nav order)
          ) {
            toRemove.push(k);
          }
        }
        toRemove.forEach((k) => localStorage.removeItem(k));

        console.log(`[Logout] Cleared ${toRemove.length} localStorage keys for session cleanup`);
      } catch (e) {
        console.warn('Session data cleanup failed on logout:', e);
      }

      try {
        // Reset agent guard context (clears in-memory tenant context)
        resetAgentSdkGuard && resetAgentSdkGuard();
      } catch (e) {
        console.warn('Agent guard reset failed on logout:', e);
      }

      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        });
      } catch {
        // ignore network errors, still navigate out
      }
      window.location.href = '/';
    } catch (error) {
      console.error('User logout failed:', error);
    }
  };

  // UNUSED: handleSafeExport - export functionality not connected to UI
  // const handleSafeExport = async () => {
  //   if (!user) return;
  //   const tenantFilter = getTenantFilter(user, selectedTenantId);
  //   const tenantName = (user?.branding_settings?.companyName || selectedTenant?.name || "Ai-SHA CRM");

  //   const { data, headers, status } = await exportReportToPDFSafe({
  //     reportType: 'ai_insights',
  //     tenantFilter,
  //     tenantName
  //   });

  //   if (status !== 200) {
  //     const errorMsg = typeof data === 'string' ? data : (data?.error || 'Unknown error');
  //     alert(`Safe export failed: ${errorMsg}`);
  //     return;
  //   }

  //   const blob = new Blob([data], { type: headers?.['content-type'] || 'application/pdf' });
  //   const url = window.URL.createObjectURL(blob);
  //   const a = document.createElement('a');
  //   a.href = url;
  //   const cd = headers?.['content-disposition'];
  //   const fallback = 'ai_insights_safe_report.pdf';
  //   let fileName = fallback;
  //   if (cd) {
  //     const m = cd.match(/filename="?(.+?)"?$/);
  //     if (m && m[1]) fileName = m[1];
  //   }
  //   a.download = fileName;
  //   document.body.appendChild(a);
  //   a.remove();
  //   window.URL.revokeObjectURL(url);
  // };

  // Determine if current user should see Employee scope filter (aggregate viewers)
  const showEmployeeScope = React.useMemo(() => {
    if (!user) return false;
    return (
      user.role === 'admin' ||
      user.role === 'superadmin' ||
      user.permissions?.dashboard_scope === 'aggregated'
    );
  }, [user]);

  // Reposition softphone/call widgets to sit left of Avatar launcher
  useAiAvatarPositioning();

  if (userLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Loading user data...</p>
        </div>
      </div>
    );
  }

  if (userError) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-red-800 mb-2">User Data Not Available</h2>
            <p className="text-red-600 mb-4">{userError}</p>
            <button
              onClick={() => window.location.reload()}
              className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div
        className="relative min-h-screen flex items-center overflow-hidden"
        style={{ background: '#080c15' }}
      >
        {/* Neural network background effect */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
          {/* Grid lines (subtle) */}
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage:
                'linear-gradient(rgba(34,211,238,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.5) 1px, transparent 1px)',
              backgroundSize: '60px 60px',
            }}
          />
          {/* Floating dots */}
          <style>{`
            @keyframes aishaFloat { 0%,100%{transform:translateY(0) scale(1)} 50%{transform:translateY(-18px) scale(1.1)} }
            @keyframes aishaPulse { 0%,100%{opacity:0.3} 50%{opacity:0.8} }
            .aisha-dot{position:absolute;border-radius:50%;animation:aishaFloat var(--dur,7s) ease-in-out infinite,aishaPulse var(--pulse,4s) ease-in-out infinite;animation-delay:var(--delay,0s)}
          `}</style>
          {[
            { t: '12%', l: '8%', s: 4, c: '#22d3ee', d: '0s', dur: '7s', p: '4s' },
            { t: '22%', l: '82%', s: 3, c: '#a3e635', d: '1.2s', dur: '8s', p: '5s' },
            { t: '45%', l: '15%', s: 5, c: '#22d3ee', d: '0.5s', dur: '9s', p: '3.5s' },
            { t: '65%', l: '75%', s: 3, c: '#a3e635', d: '2s', dur: '6s', p: '4.5s' },
            { t: '80%', l: '25%', s: 4, c: '#a3e635', d: '1.5s', dur: '7.5s', p: '5s' },
            { t: '35%', l: '90%', s: 3, c: '#22d3ee', d: '0.8s', dur: '8.5s', p: '3s' },
            { t: '55%', l: '5%', s: 3, c: '#22d3ee', d: '2.5s', dur: '7s', p: '4s' },
            { t: '8%', l: '50%', s: 4, c: '#a3e635', d: '1s', dur: '9s', p: '5.5s' },
            { t: '90%', l: '60%', s: 3, c: '#22d3ee', d: '0.3s', dur: '6.5s', p: '3.5s' },
            { t: '70%', l: '45%', s: 5, c: '#22d3ee', d: '1.8s', dur: '8s', p: '4s' },
            { t: '28%', l: '35%', s: 3, c: '#a3e635', d: '2.2s', dur: '7s', p: '5s' },
            { t: '50%', l: '55%', s: 4, c: '#22d3ee', d: '0.7s', dur: '9.5s', p: '3s' },
          ].map((dot, i) => (
            <div
              key={i}
              className="aisha-dot"
              style={{
                top: dot.t,
                left: dot.l,
                width: dot.s,
                height: dot.s,
                backgroundColor: dot.c,
                boxShadow: `0 0 ${dot.s * 3}px ${dot.c}40`,
                '--delay': dot.d,
                '--dur': dot.dur,
                '--pulse': dot.p,
              }}
            />
          ))}

          {/* 3D Network Globe & Subdued Halo */}
          <div className="absolute top-1/2 left-1/2 lg:left-[70%] -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] pointer-events-auto">
            {/* Subdued Halo Background */}
            <div
              className="absolute inset-0"
              style={{
                background:
                  'radial-gradient(circle at center, rgba(34,211,238,0.04) 0%, rgba(163,230,53,0.015) 45%, transparent 70%)',
                filter: 'blur(20px)',
                borderRadius: '50%',
              }}
            />

            {/* The Globe Canvas layer */}
            <div className="absolute inset-0 opacity-90 mix-blend-screen overflow-visible">
              <NetworkGlobe logoUrl={displayedLogoUrl || '/assets/Ai-SHA-logo-2.png'} />
            </div>
          </div>
        </div>

        {/* Login form layout wrapper */}
        <div className="relative z-10 w-full flex justify-center lg:justify-start lg:pl-[12vw] px-4 py-8">
          {/* Login card — glassmorphism dark */}
          <div
            className="overflow-hidden"
            style={{
              width: '100%',
              maxWidth: '380px',
              background: 'rgba(15, 23, 42, 0.85)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(255, 255, 255, 0.05)',
              borderRadius: '16px',
              boxShadow: '0 0 60px rgba(34, 211, 238, 0.08), 0 25px 50px rgba(0, 0, 0, 0.4)',
            }}
          >
            {/* Accent gradient strip */}
            <div
              className="h-1 w-full"
              style={{ background: 'linear-gradient(90deg, #22d3ee, #0284c7, #a3e635)' }}
            />

            <div className="p-8">
              {/* Badge */}
              <div className="flex justify-center mb-5">
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-semibold tracking-[0.15em] uppercase"
                  style={{
                    background: 'rgba(34, 211, 238, 0.1)',
                    border: '1px solid rgba(34, 211, 238, 0.25)',
                    color: '#22d3ee',
                  }}
                >
                  ✦ Cognitive Relationship Management
                </span>
              </div>

              {/* Logo + heading */}
              <div className="text-center mb-6">
                <h2 className="text-2xl font-bold text-white mb-1">
                  Welcome to{' '}
                  <span
                    style={{
                      background: 'linear-gradient(90deg, #a3e635, #22d3ee)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                    }}
                  >
                    Ai-SHA
                  </span>
                </h2>
                <p className="text-slate-400 text-sm">Sign in to your executive assistant</p>

                {/* Environment indicator on login page */}
                {(() => {
                  const backendUrl =
                    window._env_?.VITE_AISHACRM_BACKEND_URL ||
                    import.meta.env.VITE_AISHACRM_BACKEND_URL ||
                    '';
                  const supabaseUrl =
                    window._env_?.VITE_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL || '';
                  const isDev =
                    backendUrl.includes('localhost') || backendUrl.includes('127.0.0.1');
                  const isDevDb = supabaseUrl.includes('efzqxjpfewkrgpdootte');
                  const isProdDb = supabaseUrl.includes('ehjlenywplgyiahgxkfj');

                  let envLabel = null;
                  let envStyle = {};

                  if (isDev && isDevDb) {
                    envLabel = '🔵 DEVELOPMENT ENVIRONMENT';
                    envStyle = {
                      background: 'rgba(59,130,246,0.1)',
                      border: '1px solid rgba(59,130,246,0.3)',
                      color: '#93c5fd',
                    };
                  } else if (isDev && isProdDb) {
                    envLabel = '⚠️ LOCAL + PRODUCTION DATABASE';
                    envStyle = {
                      background: 'rgba(249,115,22,0.1)',
                      border: '1px solid rgba(249,115,22,0.3)',
                      color: '#fdba74',
                    };
                  } else if (!isDev && isDevDb) {
                    envLabel = '🟡 STAGING ENVIRONMENT';
                    envStyle = {
                      background: 'rgba(234,179,8,0.1)',
                      border: '1px solid rgba(234,179,8,0.3)',
                      color: '#fde047',
                    };
                  }

                  return envLabel ? (
                    <div className="mt-4 p-3 rounded-lg" style={envStyle}>
                      <p className="text-sm font-bold text-center">{envLabel}</p>
                    </div>
                  ) : null;
                })()}

                {/* Password reset success message */}
                {new URLSearchParams(window.location.search).get('reset') === 'success' && (
                  <div
                    className="mt-4 p-3 rounded-lg"
                    style={{
                      background: 'rgba(34,197,94,0.1)',
                      border: '1px solid rgba(34,197,94,0.3)',
                    }}
                  >
                    <p className="text-sm text-center" style={{ color: '#86efac' }}>
                      ✓ Password updated successfully! Please sign in with your new password.
                    </p>
                  </div>
                )}

                {/* Session expired message */}
                {new URLSearchParams(window.location.search).get('session_expired') === 'true' && (
                  <div
                    className="mt-4 p-3 rounded-lg"
                    style={{
                      background: 'rgba(245,158,11,0.1)',
                      border: '1px solid rgba(245,158,11,0.3)',
                    }}
                  >
                    <p className="text-sm text-center" style={{ color: '#fcd34d' }}>
                      ⚠️ Your session has expired. Please sign in again.
                    </p>
                  </div>
                )}
              </div>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const email = e.target.email.value;
                  const password = e.target.password.value;

                  try {
                    logDev('[Login] Attempting Supabase auth login:', email);
                    const { error } = await supabase.auth.signInWithPassword({
                      email,
                      password,
                    });
                    if (error) {
                      throw error;
                    }
                    logDev('[Login] Supabase auth successful, calling backend login...');

                    const backendUrl =
                      window._env_?.VITE_AISHACRM_BACKEND_URL ||
                      import.meta.env.VITE_AISHACRM_BACKEND_URL ||
                      '';
                    const loginResponse = await fetch(`${backendUrl}/api/auth/login`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      credentials: 'include',
                      body: JSON.stringify({ email, password }),
                    });

                    if (!loginResponse.ok) {
                      throw new Error(`Backend login failed: ${loginResponse.status}`);
                    }

                    const loginData = await loginResponse.json();
                    const tenant_id = loginData.data?.user?.tenant_id;

                    logDev('[Login] Login response data:', {
                      tenant_id,
                      hasUser: !!loginData.data?.user,
                      userKeys: Object.keys(loginData.data?.user || {}),
                    });

                    if (tenant_id) {
                      try {
                        const cacheResponse = await fetch(`${backendUrl}/api/reports/clear-cache`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          credentials: 'include',
                          body: JSON.stringify({ tenant_id }),
                        });
                        const cacheResult = await cacheResponse.json();
                        logDev('[Login] Dashboard cache cleared:', cacheResult);
                      } catch (cacheErr) {
                        console.warn('[Login] Failed to clear cache (non-critical):', cacheErr);
                      }
                    } else {
                      console.warn(
                        '[Login] No tenant_id found in login response, skipping cache clear',
                      );
                    }

                    logDev('[Login] Backend login successful, reloading...');
                    window.location.reload();
                  } catch (error) {
                    console.error('[Login] Login failed:', error);
                    alert('Login failed: ' + (error?.message || 'Unknown error'));
                  }
                }}
              >
                <div className="mb-4">
                  <label className="block text-slate-300 text-sm font-medium mb-2" htmlFor="email">
                    Email
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    required
                    autoComplete="email"
                    autoFocus
                    className="w-full px-4 py-3 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 transition-colors"
                    style={{
                      background: 'rgba(30, 41, 59, 0.6)',
                      border: '1px solid rgba(100, 116, 139, 0.3)',
                      '--tw-ring-color': '#22d3ee',
                    }}
                    placeholder="your-email@example.com"
                  />
                </div>

                <div className="mb-6">
                  <label
                    className="block text-slate-300 text-sm font-medium mb-2"
                    htmlFor="password"
                  >
                    Password
                  </label>
                  <input
                    type="password"
                    id="password"
                    name="password"
                    required
                    autoComplete="current-password"
                    className="w-full px-4 py-3 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 transition-colors"
                    style={{
                      background: 'rgba(30, 41, 59, 0.6)',
                      border: '1px solid rgba(100, 116, 139, 0.3)',
                      '--tw-ring-color': '#22d3ee',
                    }}
                    placeholder="Enter your password"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full text-white px-4 py-3 rounded-lg transition-all font-semibold text-base hover:brightness-110 hover:shadow-lg"
                  style={{
                    background: 'linear-gradient(90deg, #22d3ee, #0284c7)',
                    boxShadow: '0 4px 20px rgba(34, 211, 238, 0.3)',
                  }}
                >
                  Sign In
                </button>

                <div className="mt-3 text-center">
                  <button
                    type="button"
                    onClick={async (e) => {
                      e.preventDefault();
                      const emailInput = document.getElementById('email');
                      const email = emailInput?.value?.trim();
                      if (!email) {
                        alert('Enter your email above first.');
                        emailInput?.focus();
                        return;
                      }
                      try {
                        const backendUrl = getBackendUrl();
                        const response = await fetch(`${backendUrl}/api/users/reset-password`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ email }),
                        });
                        const result = await response.json();
                        if (!response.ok) {
                          const isRateLimit =
                            response.status === 429 ||
                            (result.message &&
                              (result.message.includes('rate limit') ||
                                result.message.includes('over_email_send_rate_limit')));

                          if (isRateLimit) {
                            throw new Error(
                              'Too many password reset attempts. Please wait 60 seconds and try again.',
                            );
                          }
                          throw new Error(result.message || 'Failed to send reset email');
                        }
                        alert('Reset email sent. Check your inbox (and spam).');
                      } catch (err) {
                        alert('Failed to send reset email: ' + (err?.message || 'Unknown error'));
                      }
                    }}
                    className="text-xs font-medium hover:underline transition-colors"
                    style={{ color: '#94a3b8' }}
                  >
                    Forgot password?
                  </button>
                </div>
              </form>

              {/* Footer brand line */}
              <p className="mt-6 text-center text-xs text-slate-600">
                AiSHA CRM &mdash; AI-Native Executive Assistant
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ⚠️ Check if user needs to change password
  if (user && user.user_metadata?.password_change_required) {
    return (
      <>
        <EffectiveClientBadge />
        <PasswordChangeModal
          user={user}
          onPasswordChanged={() => {
            logDev('[Password Change] Password changed successfully, reloading...');
            window.location.reload(); // Reload to refresh user data
          }}
        />
        {/* Show minimal UI behind the modal */}
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <Loader2 className="w-12 h-12 text-purple-600 animate-spin" />
        </div>
      </>
    );
  }

  return (
    <div
      className={`brand-scope w-full overflow-x-hidden ${theme === 'light' ? 'theme-light' : 'theme-dark'}`}
      style={{
        /* Inject brand CSS variables so mappings resolve everywhere */
        '--primary-color': primaryColor,
        '--accent-color': accentColor,
        '--on-primary-text': onPrimaryText,
        '--on-accent-text': onAccentText,
        backgroundColor: 'var(--app-bg, #0f172a)',
      }}
    >
      {/* Ensure global portal targets exist for any dialog libraries */}
      <PortalRootManager />
      {/* NEW: Root-level modal host for stable portals */}
      <ModalHost id="app-modal-host" />
      {/* Global DOM safety patches (runs once) */}
      <GlobalDomPatches />
      <SvgDefs />
      {/* Impersonation Banner - Shows when superadmin is viewing as another user */}
      <ImpersonationBanner />
      {/* Environment Banner - Shows dev/staging indicators */}
      <EnvironmentBanner />
      {/* Always-visible effective tenant badge in the top-right */}
      <EffectiveClientBadge />

      {/* Background heartbeat that ensures due cron jobs are processed when an admin is active */}
      <CronHeartbeat />
      {/* Keep user presence fresh while they are active */}
      <UserPresenceHeartbeat currentUser={user} />

      {/* System Status Indicator (moved to top level within AppLayout) */}
      <SystemStatusIndicator user={user} />

      <div className="lg:hidden sticky top-0 bg-slate-900 border-b border-slate-800 z-10 flex items-center justify-between p-4">
        <Sheet open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="text-slate-400 hover:text-slate-300 hover:bg-slate-800"
            >
              <Menu className="w-6 h-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0 bg-slate-900 border-slate-800">
            <SidebarContent
              user={user}
              selectedTenantId={selectedTenantId}
              selectedTenant={selectedTenant}
              logoUrl={logoUrl}
              displayedLogoUrl={displayedLogoUrl}
              companyName={companyName}
              primaryColor={primaryColor}
              accentColor={accentColor}
              filteredNavItems={filteredNavItems}
              filteredSecondaryNavItems={filteredSecondaryNavItems}
              currentPageName={currentPageName}
              isDragMode={isDragMode}
              handleNavDragEnd={handleNavDragEnd}
              handleSecondaryDragEnd={handleSecondaryDragEnd}
              handleResetNavOrder={handleResetNavOrder}
              setIsDragMode={setIsDragMode}
              hasCustomNavOrder={hasCustomNavOrder}
              hasCustomSecondaryOrder={hasCustomSecondaryOrder}
              sensors={sensors}
              createPageUrl={createPageUrl}
              onNavClick={() => setIsSidebarOpen(false)}
            />
          </SheetContent>
        </Sheet>
        <div className="font-bold text-lg text-slate-100">{companyName}</div>
        <UserNav user={user} handleLogout={handleLogout} createPageUrl={createPageUrl} compact />
      </div>

      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-50 lg:block lg:w-64 lg:overflow-y-auto lg:border-r lg:border-slate-800">
        <SidebarContent
          user={user}
          selectedTenantId={selectedTenantId}
          selectedTenant={selectedTenant}
          logoUrl={logoUrl}
          displayedLogoUrl={displayedLogoUrl}
          companyName={companyName}
          primaryColor={primaryColor}
          accentColor={accentColor}
          filteredNavItems={filteredNavItems}
          filteredSecondaryNavItems={filteredSecondaryNavItems}
          currentPageName={currentPageName}
          isDragMode={isDragMode}
          handleNavDragEnd={handleNavDragEnd}
          handleSecondaryDragEnd={handleSecondaryDragEnd}
          handleResetNavOrder={handleResetNavOrder}
          setIsDragMode={setIsDragMode}
          hasCustomNavOrder={hasCustomNavOrder}
          hasCustomSecondaryOrder={hasCustomSecondaryOrder}
          sensors={sensors}
          createPageUrl={createPageUrl}
          onNavClick={() => {}}
        />
      </aside>

      <div className="lg:pl-64 min-w-0 overflow-x-hidden">
        <header
          data-testid="app-header"
          className="sticky top-0 z-40 flex min-h-14 shrink-0 items-center border-b border-slate-800 bg-slate-900/95 backdrop-blur-sm px-3 py-2 shadow-sm sm:px-6 lg:px-8"
        >
          <div className="flex w-full items-center justify-end gap-2 sm:gap-3 lg:gap-4">
            <div className="flex min-w-0 flex-none items-center justify-start gap-2 overflow-x-auto rounded-2xl border border-white/10 bg-slate-900/70 px-2.5 py-1 shadow-inner shadow-slate-950/30 sm:justify-center sm:overflow-visible">
              <AiAssistantLauncher
                isOpen={isAiSidebarOpen}
                onToggle={handleAssistantLauncherClick}
                isRealtimeActive={Boolean(isRealtimeSidebarMode)}
                realtimeModuleEnabled={realtimeVoiceModuleEnabled}
              />
              {/* Only superadmins can switch tenants - admins are locked to their assigned tenant */}
              {user?.role === 'superadmin' && (
                <div className="hidden items-center sm:flex">
                  <TenantSwitcher user={user} />
                </div>
              )}

              {showEmployeeScope && (
                <div className="hidden items-center md:flex">
                  <EmployeeScopeFilter user={user} selectedTenantId={selectedTenantId} />
                </div>
              )}
            </div>

            {/* AI Suggestions Badge - Phase 3 Autonomous Operations */}
            <div className="hidden sm:block">
              {showNotificationsWidget && selectedTenantId ? (
                <SuggestionBadge tenantId={selectedTenantId} />
              ) : null}
            </div>

            {/* DEFERRED: mount notifications after initial load to reduce rate-limit hits */}
            <div className="hidden sm:block">
              {showNotificationsWidget ? <NotificationPanel user={user} /> : null}
            </div>

            {/* THEME TOGGLE BUTTON */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggleTheme}
                    className="text-slate-400 hover:text-slate-300 hover:bg-slate-800"
                    aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                  >
                    {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="bg-slate-800 border-slate-700 text-slate-200">
                  <p>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <div className="hidden lg:block lg:h-6 lg:w-px lg:bg-slate-700" aria-hidden="true" />
            <div className="sm:hidden">
              <UserNav
                user={user}
                handleLogout={handleLogout}
                createPageUrl={createPageUrl}
                compact
              />
            </div>
            <div className="hidden sm:block">
              <UserNav user={user} handleLogout={handleLogout} createPageUrl={createPageUrl} />
            </div>
          </div>
        </header>

        <main className="flex-1 min-h-screen bg-slate-900">
          <div className="p-4 sm:p-6">
            <RouteGuard user={user} pageName={currentPageName}>
              {children}
            </RouteGuard>
          </div>
        </main>

        {/* Footer (centralized via FooterBrand) */}
        <footer className="border-t border-slate-800 bg-slate-900 px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <div className="flex items-center justify-center">
              {/* DEFERRED: mount footer brand a bit later to avoid SystemBranding/Tenant call burst */}
              {showFooterBrand ? <FooterBrand showLegal /> : null}
            </div>
          </div>
        </footer>
      </div>

      {/* REMOVED: ChatWindow popup - user has full Agent page instead */}
      {/* <ChatWindow
        widgetContext={widgetContext}
        elevenlabsApiKey={elevenLabsApiKey}
        elevenlabsAgentId={elevenlabsAgentId}
      /> */}

      <GlobalDetailViewer
        recordInfo={globalDetailRecord}
        open={!!globalDetailRecord}
        onClose={() => setGlobalDetailRecord(null)}
      />

      {user && <MCPManager />}

      {/* CommandPaletteWidget is deprecated and removed */}
      {/* {user && <CommandPaletteWidget />} */}

      {/* Removed ElevenLabs floating brain widget */}
      {null}

      <AiSidebar realtimeVoiceEnabled={realtimeVoiceModuleEnabled} />
      <AiShaActionHandler />
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      staleTime: 5 * 60 * 1000,
      cacheTime: 10 * 60 * 1000,
    },
  },
});

// Wrapper to inject tenantId into EntityLabelsProvider from TenantContext
function EntityLabelsWrapper({ children }) {
  const tenantContext = useTenant();
  const tenantId = tenantContext?.selectedTenantId || null;
  return <EntityLabelsProvider tenantId={tenantId}>{children}</EntityLabelsProvider>;
}

export default function LayoutWrapper({ children, currentPageName }) {
  // Disable loading of ElevenLabs ConvAI script (brain widget)
  React.useEffect(() => {
    // Brain widget removed — no external script injection needed.
    return () => {};
  }, []);

  return (
    <ErrorLogProvider>
      <ProgressProvider>
        <QueryClientProvider client={queryClient}>
          <ApiOptimizerProvider>
            <TenantProvider>
              <EntityLabelsWrapper>
                <ApiProvider>
                  <TimezoneProvider>
                    <EmployeeScopeProvider>
                      <LoggerProvider>
                        <AiSidebarProvider>
                          <Layout currentPageName={currentPageName}>{children}</Layout>
                        </AiSidebarProvider>
                      </LoggerProvider>
                    </EmployeeScopeProvider>
                  </TimezoneProvider>
                </ApiProvider>
              </EntityLabelsWrapper>
            </TenantProvider>
          </ApiOptimizerProvider>
        </QueryClientProvider>
      </ProgressProvider>
    </ErrorLogProvider>
  );
}
