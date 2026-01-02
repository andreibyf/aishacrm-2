import { logDev } from "@/utils/devLogger";
import React, { useRef, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom"; // Import useNavigate
import { createPageUrl } from "@/utils";
import PasswordChangeModal from "@/components/auth/PasswordChangeModal";
import EnvironmentBanner from "@/components/shared/EnvironmentBanner";
import { getBackendUrl } from "@/api/backendUrl";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { SortableNavItem } from "@/components/shared/SortableNavItem";
import { usePrimaryNavOrder, useSecondaryNavOrder } from "@/hooks/useNavOrder";
import { EntityLabelsProvider, useEntityLabels } from "@/components/shared/EntityLabelsContext";
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
  GripVertical,
  HardHat, // NEW: Added for Construction Projects
  LayoutDashboard,
  Loader2,
  LogOut,
  Megaphone, // NEW: Added for AI Campaigns
  Menu,
  Moon,
  Plug, // NEW: Added for Integrations
  RotateCcw,
  Settings,
  Sun,
  Target, // Changed Leads icon to Target
  TrendingUp, // Changed Opportunities icon to TrendingUp
  UserPlus, // NEW: Added for Client Onboarding
  Users, // Changed Employees icon to Users
  Wrench,
  Zap, // NEW: Added for Workflows
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { User } from "@/api/entities";
import { Tenant } from "@/api/entities";
import { ModuleSettings } from "@/api/entities";
import { Employee } from "@/api/entities";
import { supabase } from "@/lib/supabase";
import NotificationPanel from "../components/notifications/NotificationPanel";
import { TenantProvider, useTenant } from "../components/shared/tenantContext";
import { isValidId } from "../components/shared/tenantUtils";
import { ApiProvider, useApiManager } from "../components/shared/ApiManager";
import { TimezoneProvider } from "../components/shared/TimezoneContext";
import TenantSwitcher from "../components/shared/TenantSwitcher";
import SystemStatusIndicator from "../components/shared/SystemStatusIndicator";
import Clock from "../components/shared/Clock";
import { useUser } from "@/components/shared/useUser.js";
import RouteGuard from "../components/shared/RouteGuard";
import { getOrCreateUserApiKey } from "@/api/functions";
import { createAuditLog } from "@/api/functions";
import { MCPManager } from "../components/shared/MCPClient";
import GlobalDetailViewer from "../components/shared/GlobalDetailViewer";
import { getTenantBrandingFast } from "@/api/entities";
import { getDashboardBundleFast } from "@/api/dashboard";
import { useAuthCookiesReady } from "@/components/shared/useAuthCookiesReady";
import { useTokenRefresh } from "@/hooks/useTokenRefresh";
import EmployeeScopeFilter from "../components/shared/EmployeeScopeFilter";
import { EmployeeScopeProvider } from "../components/shared/EmployeeScopeContext";
import FooterBrand from "../components/shared/FooterBrand";
import {
  initAgentSdkGuard,
  resetAgentSdkGuard,
} from "@/components/ai/agentSdkGuard";
import { clearChat } from "../components/ai/chatUtils";
import AiSidebar from "@/components/ai/AiSidebar";
import AiAssistantLauncher from "@/components/ai/AiAssistantLauncher.jsx";
import { AiSidebarProvider, useAiSidebarState } from "@/components/ai/useAiSidebarState.jsx";
import SuggestionBadge from "@/components/ai/SuggestionBadge";
import AiShaActionHandler from "@/components/ai/AiShaActionHandler";
import CronHeartbeat from "../components/shared/CronHeartbeat";
import UserPresenceHeartbeat from "../components/shared/UserPresenceHeartbeat";
import GlobalDomPatches from "../components/shared/GlobalDomPatches";
import PortalRootManager from "../components/shared/PortalRootManager";
import ModalHost from "../components/shared/ModalHost";
import { ErrorLogProvider } from "../components/shared/ErrorLogger";
import { LoggerProvider } from "../components/shared/Logger";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiOptimizerProvider } from "../components/shared/ApiOptimizer";

const navItems = [
  { href: "Dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "Contacts", icon: Users, label: "Contacts" },
  { href: "Accounts", icon: Building2, label: "Accounts" },
  { href: "Leads", icon: Target, label: "Leads" }, // Changed icon to Target
  { href: "Opportunities", icon: TrendingUp, label: "Opportunities" }, // Changed icon to TrendingUp
  { href: "Activities", icon: CheckSquare, label: "Activities" },
  { href: "Calendar", icon: Calendar, label: "Calendar" },
  { href: "ConstructionProjects", icon: HardHat, label: "Construction Projects" }, // Construction staffing module
  { href: "Workers", icon: Users, label: "Workers" }, // Contractors/temp labor management
  { href: "BizDevSources", icon: Database, label: "BizDev Sources" }, // Business development sources
  { href: "CashFlow", icon: DollarSign, label: "Cash Flow" },
  { href: "DocumentProcessing", icon: FileText, label: "Document Processing" },
  {
    href: "DocumentManagement",
    icon: FolderOpen,
    label: "Document Management",
  },
  { href: "AICampaigns", icon: Megaphone, label: "AI Campaigns" }, // Changed icon to Megaphone
  { href: "Employees", icon: Users, label: "Employees" }, // Changed icon to Users
  { href: "Reports", icon: BarChart3, label: "Reports" },
  { href: "Integrations", icon: Plug, label: "Integrations" }, // Changed icon to Plug
  { href: "Workflows", icon: Zap, label: "Workflows" }, // NEW: Added Workflows
  { href: "PaymentPortal", icon: CreditCard, label: "Payment Portal" },
  { href: "Utilities", icon: Wrench, label: "Utilities" },
  { href: "ClientOnboarding", icon: UserPlus, label: "Client Onboarding" }, // Changed icon to UserPlus
];

const secondaryNavItems = [
  { href: "Documentation", icon: BookOpen, label: "Documentation" }, // Changed icon to BookOpen
  {
    href: "DeveloperAI",
    icon: Bot,
    label: "Developer AI",
  },
  {
    href: "ClientRequirements",
    icon: ClipboardCheck,
    label: "Client Requirements",
  }, // NEW: Added Client Requirements
];

/**
 * Helper: Check if user is a superadmin (god mode)
 */
function isSuperAdmin(user) {
  if (!user) return false;
  return user.is_superadmin === true ||
    user.access_level === "superadmin" ||
    user.role === "superadmin";
}

/**
 * Helper: Check if user is admin or superadmin
 */
function isAdminOrSuperAdmin(user) {
  if (!user) return false;
  return user.role === 'admin' || user.role === 'superadmin' || user.is_superadmin === true;
}

function hasPageAccess(user, pageName, selectedTenantId, moduleSettings = []) {
  if (!user) return false;

  logDev("[hasPageAccess] Called with:", {
    pageName,
    userEmail: user.email,
    userRole: user.role,
    hasNavigationPermissions: !!user.navigation_permissions,
    navigationPermissionsType: typeof user.navigation_permissions,
    navigationPermissions: user.navigation_permissions,
  });

  // Superadmins bypass disables only in global view (no tenant selected)
  if (isSuperAdmin(user) && (selectedTenantId === null || selectedTenantId === undefined)) {
    return true;
  }

  const superadminOnlyPages = new Set(["Tenants"]);
  if (superadminOnlyPages.has(pageName) && user.role !== 'superadmin') return false;

  const pagesAllowedWithoutCRM = new Set([
    "Documentation","DeveloperAI","Settings","AuditLog","UnitTests","ClientRequirements",
  ]);
  if (user.crm_access === false) return pagesAllowedWithoutCRM.has(pageName);

  // Module names must match EXACTLY what's stored in modulesettings table
  // See ModuleManager.jsx defaultModules for the canonical names
  const moduleMapping = {
    Dashboard: 'Dashboard',
    Contacts: 'Contact Management',
    Accounts: 'Account Management',
    Leads: 'Lead Management',
    Opportunities: 'Opportunities',
    Activities: 'Activity Tracking',
    Calendar: 'Calendar',
    BizDevSources: 'BizDev Sources',
    CashFlow: 'Cash Flow Management',
    DocumentProcessing: 'Document Processing & Management',
    DocumentManagement: 'Document Processing & Management',
    Employees: 'Employee Management',
    Reports: 'Analytics & Reports',
    Integrations: 'Integrations',
    PaymentPortal: 'Payment Portal',
    AICampaigns: 'AI Campaigns',
    DeveloperAI: 'Developer AI',
    Utilities: 'Utilities',
    ClientOnboarding: 'Client Onboarding',
    Workflows: 'Workflows',
    ConstructionProjects: 'Construction Projects',
    Workers: 'Workers',
    DuplicateContacts: null,
    DuplicateAccounts: null,
    DuplicateLeads: null,
    Tenants: null,
    Settings: null,
    Documentation: null,
    AuditLog: null,
    UnitTests: null,
    ClientRequirements: null,
  };

  const requiredModuleId = moduleMapping[pageName];
  if (requiredModuleId && moduleSettings.length > 0) {
    const moduleSetting = moduleSettings.find(m => m.module_name === requiredModuleId);
    if (moduleSetting && moduleSetting.is_enabled === false) return false;
  }

  // Settings page is always accessible to authenticated users (for profile settings)
  // Admin tabs within Settings are controlled by the Settings page itself
  if (pageName === 'Settings') return true;

  if (user.navigation_permissions && typeof user.navigation_permissions === 'object') {
    if (pageName === 'Dashboard') {
      logDev('[hasPageAccess] User navigation_permissions:', {
        userEmail: user.email,
        role: user.role,
        permissions: user.navigation_permissions,
        pageName,
      });
    }
    const hasCustomPermission = Object.prototype.hasOwnProperty.call(user.navigation_permissions, pageName);
    if (hasCustomPermission) {
      const explicit = user.navigation_permissions[pageName];
      logDev(`[hasPageAccess] Explicit permission for ${pageName}:`, explicit);
      if (explicit === false) return false;
      if (explicit === true) return true;
    }
  }

  if ((user.role === 'admin' || user.role === 'superadmin') && (
      pageName === 'Documentation' || pageName === 'AuditLog' || pageName === 'Tenants' ||
    pageName === 'UnitTests' || pageName === 'ClientRequirements' || pageName === 'ConstructionProjects')) return true;
  if (user.role === 'superadmin' && pageName === 'DeveloperAI') return true;
  if ((user.role === 'superadmin' || user.role === 'admin') && !selectedTenantId) return true;

  const defaultPermissions = getDefaultNavigationPermissions(user.role);
  return defaultPermissions[pageName] || false;
}

function getDefaultNavigationPermissions(role) {
  // Combine all possible navigation items to generate a comprehensive list of pageNames
  const allPageHrefs = [
    ...navItems.map((item) => item.href),
    ...secondaryNavItems.map((item) => item.href),
    // Add other system/hidden pages that might need default permissions
    "DuplicateContacts",
    "DuplicateAccounts",
    "DuplicateLeads",
    "Tenants",
    "AuditLog",
    "UnitTests",
    "ClientOnboarding",
    "ClientRequirements", // NEW: Added ClientRequirements
  ];

  // Initialize all permissions to false for safety
  const basePermissions = Object.fromEntries(
    allPageHrefs.map((href) => [href, false]),
  );

  const defaults = {
    superadmin: {
      ...basePermissions,
      Dashboard: true,
      Contacts: true,
      Accounts: true,
      Leads: true,
      Opportunities: true,
      Activities: true,
      Calendar: true,
      BizDevSources: true,
      CashFlow: true,
      DocumentProcessing: true,
      DocumentManagement: true,
      Employees: true,
      Reports: true,
      Integrations: true,
      PaymentPortal: true,
      AICampaigns: true,
      DeveloperAI: true,
      Tenants: true,
      Settings: true,
      Documentation: true,
      AuditLog: true,
      Utilities: true,
      UnitTests: true,
      ClientOnboarding: true,
      ClientRequirements: true, // NEW
      ConstructionProjects: true, // Construction staffing module
      Workers: true, // Worker/contractor management
      DuplicateContacts: true,
      DuplicateAccounts: true,
      DuplicateLeads: true,
    },
    admin: {
      ...basePermissions,
      Dashboard: true,
      Contacts: true,
      Accounts: true,
      Leads: true,
      Opportunities: true,
      Activities: true,
      Calendar: true,
      BizDevSources: true,
      CashFlow: true,
      DocumentProcessing: true,
      DocumentManagement: true,
      Employees: true,
      Reports: true,
      Integrations: true,
      PaymentPortal: true,
      AICampaigns: true,
      Tenants: true,
      Settings: true,
      Documentation: true,
      AuditLog: true,
      Utilities: true,
      UnitTests: true,
      ClientOnboarding: true,
      ClientRequirements: true, // NEW
      ConstructionProjects: true, // Construction staffing module
      Workers: true, // Worker/contractor management
      DuplicateContacts: true,
      DuplicateAccounts: true,
      DuplicateLeads: true,
    },
    manager: {
      ...basePermissions,
      Dashboard: true,
      Contacts: true,
      Accounts: true,
      Leads: true,
      Opportunities: true,
      Activities: true,
      Calendar: true,
      BizDevSources: true,
      CashFlow: true,
      DocumentProcessing: true,
      DocumentManagement: true,
      Employees: true,
      Reports: true,
      Integrations: true,
      PaymentPortal: false,
      AICampaigns: true,
      Tenants: false,
      Settings: true,
      Documentation: true,
      AuditLog: true,
      Utilities: true,
      UnitTests: false,
      ClientOnboarding: true,
      ClientRequirements: false,
      ConstructionProjects: true, // Construction staffing module
      Workers: true, // Worker/contractor management
      DuplicateContacts: true,
      DuplicateAccounts: true,
      DuplicateLeads: true,
    },
    employee: {
      ...basePermissions,
      Dashboard: true,
      Contacts: true,
      Leads: true,
      Opportunities: true,
      Activities: true,
      Calendar: true,
      Documentation: true,
      Settings: true, // All users need access to their profile settings
      ClientOnboarding: false,
      ClientRequirements: false,
      ConstructionProjects: true, // Construction staffing module - workers need access
      Workers: true, // Worker/contractor management - workers need access
    },
  };

  // Merge the basePermissions with role-specific permissions, ensuring role-specific explicit 'true's override 'false'
  const rolePermissions = { ...(defaults[role] || defaults.employee) };

  // Explicitly ensure 'Settings', 'Documentation' are accessible for all roles if CRM access is true
  // (CRM access check is done in hasPageAccess first)
  rolePermissions.Settings = true; // Always allow Settings for profile access
  rolePermissions.Documentation = rolePermissions.Documentation || true;
  rolePermissions.ClientRequirements = rolePermissions.ClientRequirements ||
    false; // NEW: Explicitly manage ClientRequirements access

  return rolePermissions;
}

const UserNav = ({ user, handleLogout, createPageUrl }) => {
  const getUserDisplayName = () => {
    if (user?.display_name) return user.display_name;
    if (user?.full_name) return user.full_name;
    if (user?.first_name || user?.last_name) {
      const fn = `${user.first_name || ""} ${user.last_name || ""}`.trim();
      if (fn) return fn;
    }
    if (user?.email) {
      const emailName = user.email.split("@")[0];
      return emailName.charAt(0).toUpperCase() + emailName.slice(1);
    }
    return "User";
  };

  const displayName = getUserDisplayName();
  // Check if user is admin-like (admin or superadmin)
  const isAdmin = isAdminOrSuperAdmin(user);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="flex items-center gap-2 p-1.5 hover:bg-slate-700"
        >
          <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center">
            <span className="text-sm font-medium text-slate-600">
              {displayName?.charAt(0)?.toUpperCase() || "A"}
            </span>
          </div>
          <span className="text-sm font-semibold leading-6 text-slate-200">
            {displayName}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="bg-slate-800 border-slate-700"
      >
        <DropdownMenuLabel className="text-slate-200">
          My Account
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="border-slate-700" />
        <DropdownMenuItem asChild>
          <Link
            to={createPageUrl("Settings")}
            className="text-slate-200 hover:bg-slate-700 focus:bg-slate-700"
          >
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </Link>
        </DropdownMenuItem>
        {isAdmin && (
          <>
            
          </>
        )}
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
  <svg width="0" height="0" style={{ position: "absolute" }}>
    <defs>
      <linearGradient id="ai-icon-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style={{ stopColor: "var(--primary-color)" }} />
        <stop offset="100%" style={{ stopColor: "var(--accent-color)" }} />
      </linearGradient>
    </defs>
  </svg>
);

// Add a global flag to prevent multiple cleanup attempts
let globalTenantCleanupDone = false;

function Layout({ children, currentPageName }) { // Renamed from AppLayout to Layout
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
  const [showNotificationsWidget, setShowNotificationsWidget] = React.useState(
    false,
  );
  const [showFooterBrand, setShowFooterBrand] = React.useState(false);

  // THEME: add theme state with persistence
  const [theme, setTheme] = React.useState("dark"); // Default to dark if nothing saved
  React.useEffect(() => {
    const saved = localStorage.getItem("app_theme");
    if (saved === "light" || saved === "dark") {
      setTheme(saved);
    } else if (
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: light)").matches
    ) {
      // Optional: Detect system preference if no explicit setting is found
      setTheme("light");
    }
  }, []);
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try {
      localStorage.setItem("app_theme", next);
    } catch (e) {
      console.warn("Storage access failed to save theme:", e);
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
    const cls = theme === "light" ? "theme-light" : "theme-dark";
    document.body.classList.remove("theme-light", "theme-dark");
    document.body.classList.add(cls);

    // NEW: sync shadcn/ui dark mode by toggling the 'dark' class on <html>
    const rootEl = document.documentElement;
    if (theme === "dark") {
      rootEl.classList.add("dark");
    } else {
      rootEl.classList.remove("dark");
    }

    return () => {
      document.body.classList.remove("theme-light", "theme-dark");
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
          logDev(
            "[Layout] Admin defaulting to assigned tenant:",
            user.tenant_id,
          );
          nextTenantId = user.tenant_id;
        } else if (superAdmin) {
          // Super Admin with NO assigned tenant = global access to ALL tenants
          logDev(
            "[Layout] SuperAdmin global access - viewing ALL tenants",
          );
          return null; // null = "all tenants" for superadmins without tenant assignment
        }
      }
    } else {
      // Non-admins always use their assigned tenant_id
      nextTenantId = user?.tenant_id;
    }

    // Use shared validation function
    const validTenantId = nextTenantId && typeof nextTenantId === "string" &&
        isValidId(nextTenantId)
      ? nextTenantId
      : null;
    if (validTenantId) {
      logDev("[Layout] Filtering data for tenant:", validTenantId);
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
    const moduleName = "Realtime Voice";
    const matchingEntries = moduleSettings.filter((setting) => setting.module_name === moduleName);
    if (matchingEntries.length === 0) {
      return true;
    }
    if (effectiveModuleTenantId) {
      const tenantMatch = matchingEntries.find((setting) => setting.tenant_id === effectiveModuleTenantId);
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
      const savedTenantId = localStorage.getItem("selected_tenant_id");
      if (
        savedTenantId && savedTenantId !== "null" &&
        savedTenantId !== "undefined"
      ) {
        // Check if it's the problematic tenant
        if (savedTenantId === "68b85abfff6be8dc8573e116") {
          localStorage.removeItem("selected_tenant_id");
          if (setSelectedTenantId) {
            setSelectedTenantId(null);
          }
          // DON'T reload - just clear it and let React re-render naturally
        }
      }
    } catch (e) {
      console.warn("Storage access failed during tenant cleanup:", e);
    }
  }, [setSelectedTenantId]);

  // NEW: Auto-select tenant from user profile on login
  React.useEffect(() => {
    // Only auto-select if:
    // 1. User is logged in and has a tenant_id
    // 2. No tenant is currently selected in context
    // 3. User is not a global super admin (tenant_id=null for global access)
    if (user?.tenant_id && selectedTenantId === null && setSelectedTenantId) {
      logDev("[Layout] Auto-selecting tenant from user profile:", user.tenant_id);
      setSelectedTenantId(user.tenant_id);
    }
  }, [user?.tenant_id, selectedTenantId, setSelectedTenantId]);

  // NEW: Reset failed tenants when user changes
  React.useEffect(() => {
    if (user?.id && lastModuleSettingsUserId.current !== user.id) {
      failedTenantIdsRef.current.clear();
    }
  }, [user?.id]);

  // NEW: Preconnect/dns-prefetch hints for performance-critical origins
  React.useEffect(() => {
    const origins = [
      "https://m.stripe.com",
      // Note: Removed Base44 and external Supabase URLs - using local assets now
    ];
    const ensureLink = (rel, href, crossOrigin) => {
      const id = `hint-${rel}-${btoa(href).replace(/=/g, "")}`;
      if (document.getElementById(id)) return;
      const link = document.createElement("link");
      link.id = id;
      link.rel = rel;
      link.href = href;
      if (crossOrigin) link.crossOrigin = "anonymous";
      document.head.appendChild(link);
    };
    origins.forEach((o) => {
      ensureLink("preconnect", o, true);
      ensureLink("dns-prefetch", o);
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
      const already = img.getAttribute("loading");
      if (!already) img.setAttribute("loading", "lazy");
    };
    document.querySelectorAll("img").forEach(setLazy);
    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes?.forEach((n) => {
          if (n && n.nodeType === 1) {
            if (n.tagName === "IMG") setLazy(n);
            n.querySelectorAll?.("img")?.forEach(setLazy);
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
      const msg = (err && (err.message || err.toString())) || "";
      // Suppress noisy Axios "Network Error" crashes; log instead
      if (typeof msg === "string" && /network error/i.test(msg)) {
        console.warn(
          "Network error suppressed:",
          err?.message || "Connection issue",
        );
        event.preventDefault?.();
        // Prevent subsequent default handling of the rejection
        event.stopImmediatePropagation?.();
      }
    };
    const onError = (e) => {
      const msg = (e?.error && e.error.message) || e?.message || "";
      if (typeof msg === "string" && /network error/i.test(msg)) {
        console.warn(
          "Network error suppressed:",
          e.error?.message || e.message,
        );
        e.preventDefault?.();
        e.stopImmediatePropagation?.();
      }
    };
    window.addEventListener("unhandledrejection", handler);
    window.addEventListener("error", onError);
    return () => {
      window.removeEventListener("unhandledrejection", handler);
      window.removeEventListener("error", onError);
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
    window.addEventListener(
      "navigate-from-command-palette",
      handleCommandPaletteNavigation,
    );
    window.addEventListener("view-record-details", handleViewDetails);

    return () => {
      window.removeEventListener(
        "navigate-from-command-palette",
        handleCommandPaletteNavigation,
      );
      window.removeEventListener("view-record-details", handleViewDetails);
    };
  }, [navigate]);

  // NEW: Keyboard shortcut: Ctrl+Shift+K to clear chat quickly
  React.useEffect(() => {
    const onKeyDown = (e) => {
      const key = e.key?.toLowerCase?.() || "";
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && key === "k") { // Cmd+Shift+K for Mac, Ctrl+Shift+K for others
        e.preventDefault();
        clearChat({ reload: true, confirmFirst: true });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
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

  // Navigation order management with drag-and-drop (tenant-scoped)
  const [isDragMode, setIsDragMode] = useState(false);
  const { orderedItems: orderedNavItems, setOrder: setNavOrder, resetOrder: resetNavOrder, hasCustomOrder: hasCustomNavOrder } = usePrimaryNavOrder(navItems, effectiveTenantId);
  const { orderedItems: orderedSecondaryItems, setOrder: setSecondaryOrder, resetOrder: resetSecondaryOrder, hasCustomOrder: hasCustomSecondaryOrder } = useSecondaryNavOrder(secondaryNavItems, effectiveTenantId);

  // Debug navigation order persistence
  React.useEffect(() => {
    console.log("[Layout] effectiveTenantId changed:", effectiveTenantId, "user:", user?.email);
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
    })
  );

  // Handle drag end for primary nav
  const handleNavDragEnd = useCallback((event) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      const oldIndex = orderedNavItems.findIndex((item) => item.href === active.id);
      const newIndex = orderedNavItems.findIndex((item) => item.href === over?.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(orderedNavItems, oldIndex, newIndex);
        setNavOrder(newOrder);
      }
    }
  }, [orderedNavItems, setNavOrder]);

  // Handle drag end for secondary nav
  const handleSecondaryDragEnd = useCallback((event) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      const oldIndex = orderedSecondaryItems.findIndex((item) => item.href === active.id);
      const newIndex = orderedSecondaryItems.findIndex((item) => item.href === over?.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(orderedSecondaryItems, oldIndex, newIndex);
        setSecondaryOrder(newOrder);
      }
    }
  }, [orderedSecondaryItems, setSecondaryOrder]);

  // Reset all nav order to default
  const handleResetNavOrder = useCallback(() => {
    resetNavOrder();
    resetSecondaryOrder();
    setIsDragMode(false);
  }, [resetNavOrder, resetSecondaryOrder]);

  const filteredNavItems = React.useMemo(() => {
    if (!user) return [];
    // Filter out items with parentMenu if you want to implement a nested menu structure
    // For now, they are treated as top-level items for simplicity as per existing structure
    return orderedNavItems
      .filter((item) =>
        hasPageAccess(user, item.href, selectedTenantId, moduleSettings)
    )
      .map((item) => {
        // Apply custom entity labels if available
        const customLabel = getNavLabel(item.href);
        return customLabel ? { ...item, label: customLabel } : item;
      });
  }, [user, selectedTenantId, moduleSettings, orderedNavItems, getNavLabel]);

  const filteredSecondaryNavItems = React.useMemo(() => {
    if (!user) return [];
    return orderedSecondaryItems
      .filter((item) =>
        hasPageAccess(user, item.href, selectedTenantId, moduleSettings)
    )
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
      "A listener indicated an asynchronous response by returning true",
      "message channel closed before a response was received",
      "Extension context invalidated",
      "Could not establish connection. Receiving end does not exist",
      "The message port closed before a response was received",
    ];

    console.error = (...args) => {
      const message = args.join(" ");
      const isExtensionError = extensionErrorPatterns.some((pattern) =>
        message.includes(pattern)
      );

      if (!isExtensionError) {
        originalConsoleError.apply(console, args);
      } else if (import.meta.env.DEV) {
        console.debug("[Browser Extension]", ...args);
      }
    };

    console.warn = (...args) => {
      const message = args.join(" ");
      const isExtensionWarning = extensionErrorPatterns.some((pattern) =>
        message.includes(pattern)
      );

      if (!isExtensionWarning) {
        originalConsoleWarn.apply(console, args);
      } else if (import.meta.env.DEV) {
        console.debug("[Browser Extension]", ...args);
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
            console.debug("AI API key fetch skipped:", err.message);
          });
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.debug("User reload error (ignored):", error?.message || error);
      }
      setUserError(error?.message || "Failed to reload user");
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
      if (entity === "Employee" || entity === "User") {
        // Re-load current user to pick up display_name/first/last changes
        refetchUser();
      }
    };
    window.addEventListener("entity-modified", onEntityModified);
    return () => window.removeEventListener("entity-modified", onEntityModified);
  }, [refetchUser]);

  React.useEffect(() => {
    // Persist AI API key (from getOrCreateUserApiKey) for agent/chat usage
    if (elevenLabsApiKey) {
      try {
        const persistAllowed = (import.meta.env.VITE_ALLOW_PERSIST_API_KEYS === 'true');

        // Prefer ephemeral storage to avoid long-lived secrets in the browser
        try {
          sessionStorage.setItem("ai_sdk_api_key", elevenLabsApiKey);
        } catch { /* ignore */ }

        if (persistAllowed) {
          try { localStorage.setItem("ai_sdk_api_key", elevenLabsApiKey); } catch { /* ignore */ }
        } else {
          // Clean up any legacy persistent copy
          try { localStorage.removeItem("ai_sdk_api_key"); } catch { /* ignore */ }
        }

        // Also expose minimal context for components that can't import Layout state (in-memory only)
        window.__AI_CONTEXT = {
          ...(window.__AI_CONTEXT || {}),
          apiKey: elevenLabsApiKey,
        };
      } catch (e) {
        console.warn("Storage access failed for AI SDK API key:", e);
      }
    }
  }, [elevenLabsApiKey]);

  // Initialize/refresh the agent SDK guard when client (tenant) context changes
  React.useEffect(() => {
    const tenantId = currentTenantData?.id || selectedTenant?.id ||
      selectedTenantId || null;
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
      console.warn("Error exposing AI tenant context:", e);
    }
  }, [currentTenantData, selectedTenant, selectedTenantId]);

  // NEW: Respect manual selection for admins; only set default if none. Non-admins always follow their own tenant.
  React.useEffect(() => {
    const currTenantId = user?.tenant_id || null;
    const isAdminLike = isAdminOrSuperAdmin(user);
    const hasManualSelection = selectedTenantId !== null &&
      selectedTenantId !== undefined &&
      selectedTenantId !== "" &&
      selectedTenantId !== "NO_TENANT_SELECTED_SAFETY_FILTER";

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
    if (
      !isAdminLike && setSelectedTenantId && selectedTenantId !== currTenantId
    ) {
      setSelectedTenantId(currTenantId || null);
    }
  }, [user, selectedTenantId, setSelectedTenantId, clearCache]);

  // Tenant loading effect with improved error handling
  React.useEffect(() => {
    const loadCurrentTenant = async () => {
      // ALWAYS log effect entry in dev
      if (import.meta.env.DEV) {
        logDev("[Layout] loadCurrentTenant EFFECT RUNNING:", {
          user: !!user,
          effectiveTenantId,
          selectedTenantId,
          lastRequest: lastTenantRequestIdRef.current,
          currentTenantData: currentTenantData?.name || currentTenantData?.id ||
            null,
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
          logDev("[Layout] loadCurrentTenant FETCHING:", {
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
            (user.role === "admin" || user.role === "superadmin") &&
            setSelectedTenantId && selectedTenantId &&
            effectiveTenantId === selectedTenantId
          ) {
            setSelectedTenantId(null);
            try {
              localStorage.removeItem("selected_tenant_id");
            } catch {
              console.warn("Storage access failed");
            }
          }
          return;
        }

        // Dedupe by id to prevent redundant Tenant.get calls
        if (lastTenantRequestIdRef.current === tenantIdToFetch) {
          if (import.meta.env.DEV) {
            logDev(
              "[Layout] loadCurrentTenant SKIPPED (dedupe):",
              tenantIdToFetch,
            );
          }
          return;
        }
        lastTenantRequestIdRef.current = tenantIdToFetch;

        const tenant = await cachedRequest(
          "Tenant",
          "get",
          { id: tenantIdToFetch },
          () => Tenant.get(tenantIdToFetch),
        );

        if (tenant) {
          setCurrentTenantData(tenant);
          setSelectedTenant(tenant);
          failedTenantIdsRef.current.delete(tenantIdToFetch);
        } else {
          console.warn("Tenant not found/accessible:", tenantIdToFetch);
          failedTenantIdsRef.current.add(tenantIdToFetch);
          setCurrentTenantData(null);
          setSelectedTenant(null);
          lastTenantRequestIdRef.current = null;

          if (
            (user.role === "admin" || user.role === "superadmin") &&
            setSelectedTenantId && selectedTenantId &&
            effectiveTenantId === selectedTenantId
          ) {
            setSelectedTenantId(null);
            try {
              localStorage.removeItem("selected_tenant_id");
            } catch {
              console.warn("Storage access failed");
            }
          }
        }
      } catch (error) {
        const attemptedTenantId = effectiveTenantId;
        const status = error?.response?.status || error?.status;

        console.error("Tenant load failed:", {
          tenantId: attemptedTenantId,
          status,
          message: error?.message || "Unknown error",
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
            const storedTenantId = localStorage.getItem("selected_tenant_id");
            if (storedTenantId === attemptedTenantId) {
              localStorage.removeItem("selected_tenant_id");
              if (setSelectedTenantId) {
                setSelectedTenantId(null);
              }
            }
          } catch {
            console.warn("Storage cleanup failed");
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
      if (entity === "Tenant" && effectiveTenantId) {
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
          console.error("Failed to refresh tenant after update:", error);
        }
      }
    };

    window.addEventListener("entity-modified", handleTenantModified);

    return () => {
      window.removeEventListener("entity-modified", handleTenantModified);
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
          console.warn(
            "Tenant branding fetch failed:",
            res?.error || "Unknown error",
          );
          setCurrentTenantData(null); // Clear stale data
          setSelectedTenant(null);
          lastTenantRequestIdRef.current = null; // Clear ref
        }
      } catch (error) {
        console.error("Tenant branding fetch error (non-admin):", error);
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
          if (user.role === "admin" || user.role === "superadmin") {
            settings = await cachedRequest(
              "ModuleSettings",
              "list",
              {},
              () => ModuleSettings.list(),
            );
          } else if (user.tenant_id) {
            settings = await cachedRequest(
              "ModuleSettings",
              "filter",
              { filter: { tenant_id: user.tenant_id } },
              () => ModuleSettings.filter({ tenant_id: user.tenant_id }),
            );
          } else {
            settings = [];
          }
          setModuleSettings(settings || []);
          moduleSettingsLoadedRef.current = true; // Mark as loaded for the current user
        } catch (error) {
          console.warn("Module settings load failed:", error);
          setModuleSettings([]);
          // On error, do NOT mark as loaded, so it can retry
          moduleSettingsLoadedRef.current = false;
        }
      };

      if (typeof window.requestIdleCallback === "function") {
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
            if (user.role === "admin" || user.role === "superadmin") {
              settings = await cachedRequest(
                "ModuleSettings",
                "list",
                {},
                () => ModuleSettings.list(),
              );
            } else if (user.tenant_id) {
              settings = await cachedRequest(
                "ModuleSettings",
                "filter",
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
          console.warn("Module settings reload failed:", error);
          // On error, do NOT mark as loaded, so it can retry
          moduleSettingsLoadedRef.current = false;
        }
      };

      reloadSettings();
    };

    window.addEventListener(
      "module-settings-changed",
      handleModuleSettingsChanged,
    );

    return () => {
      window.removeEventListener(
        "module-settings-changed",
        handleModuleSettingsChanged,
      );
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
        new CustomEvent("entity-modified", { detail: { entity: entityName, ...payload } }),
      );
    };

    Employee.create = async (data) => {
      const res = await originalEmployeeCreate(data);
      try {
        if (import.meta.env.DEV) {
          console.debug("Employee created, refreshing data.");
        }
        if (clearCache) clearCache();
        dispatchEntityModifiedEvent("Employee", { id: res?.id });
      } catch (e) {
        console.warn("Data refresh failed after employee create:", e);
      }
      return res;
    };

    Employee.update = async (id, data) => {
      const res = await originalEmployeeUpdate(id, data);
      try {
        if (import.meta.env.DEV) {
          console.debug("Employee updated, refreshing data.");
        }
        if (clearCache) clearCache();
        dispatchEntityModifiedEvent("Employee", { id });
      } catch (e) {
        console.warn("Data refresh failed after employee update:", e);
      }
      return res;
    };

    Employee.delete = async (id) => {
      const res = await originalEmployeeDelete(id);
      try {
        if (import.meta.env.DEV) {
          console.debug("Employee deleted, refreshing data.");
        }
        if (clearCache) clearCache();
        dispatchEntityModifiedEvent("Employee", { id });
      } catch (e) {
        console.warn("Data refresh failed after employee delete:", e);
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
        new CustomEvent("entity-modified", { detail: { entity: entityName, ...payload } }),
      );
    };

    User.update = async (id, data) => {
      const res = await originalUserUpdate(id, data);
      try {
        if (import.meta.env.DEV) {
          console.debug("User updated, refreshing current user.");
        }
        if (clearCache) clearCache();
        dispatchEntityModifiedEvent("User", { id });
      } catch (e) {
        console.warn("Data refresh failed after user update:", e);
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
    const defaultCompanyName = "Ai-SHA CRM";
    const defaultLogoUrl = "/assets/Ai-SHA-logo-2.png"; // Default logo for global view
    const defaultPrimaryColor = "#06b6d4"; // New Cyan
    const defaultAccentColor = "#6366f1"; // New Indigo

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
      if (user?.role === "superadmin" || user?.role === "admin") {
        if (selectedTenantId && selectedTenant) {
          companyName = selectedTenant.name || defaultCompanyName;
          logoUrl = selectedTenant.logo_url || defaultLogoUrl;
          primaryColor = selectedTenant.primary_color || defaultPrimaryColor;
          accentColor = selectedTenant.accent_color || defaultAccentColor;
        } else if (user.branding_settings) { // Fallback to user's own branding settings if no tenant selected
          companyName = user.branding_settings.companyName ||
            defaultCompanyName;
          logoUrl = user.branding_settings.logoUrl || defaultLogoUrl;
          primaryColor = user.branding_settings.primaryColor ||
            defaultPrimaryColor;
          accentColor = user.branding_settings.accentColor ||
            defaultAccentColor;
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
      logDev("[Layout] Branding:", {
        companyName,
        logoUrl,
        user: user?.email,
        selectedTenantId,
        currentTenantData: currentTenantData?.name,
      });
    }
  }, [
    companyName,
    logoUrl,
    user?.email,
    selectedTenantId,
    currentTenantData?.name,
  ]);

  // Cache-bust static logo paths so updated files with the same name show immediately
  const logoVersionRef = React.useRef(0);
  React.useEffect(() => {
    logoVersionRef.current = Date.now();
  }, [logoUrl]);
  const displayedLogoUrl = React.useMemo(() => {
    if (!logoUrl) return null;
    if (/^data:/i.test(String(logoUrl))) return logoUrl; // data URLs don't need cache busting

    // If it's already a full URL (http/https), keep it as-is but add cache-busting
    if (/^https?:\/\//i.test(String(logoUrl))) {
      try {
        const u = new URL(String(logoUrl));
        // Avoid appending cache-busting params to signed URLs (e.g., Supabase signed URLs)
        const isSigned = u.pathname.includes('/storage/v1/object/sign') || u.searchParams.has('token');
        if (isSigned) return u.toString();
        u.searchParams.set("v", String(logoVersionRef.current || 1));
        return u.toString();
      } catch {
        return `${logoUrl}${String(logoUrl).includes("?") ? "&" : "?"}v=${
          logoVersionRef.current || 1
        }`;
      }
    }

    // For relative paths (e.g., /assets/...), make them relative to origin
    try {
      const u = new URL(String(logoUrl), window.location.origin);
      u.searchParams.set("v", String(logoVersionRef.current || 1));
      return u.pathname + u.search + u.hash;
    } catch {
      return `${logoUrl}${String(logoUrl).includes("?") ? "&" : "?"}v=${
        logoVersionRef.current || 1
      }`;
    }
  }, [logoUrl]);
  // Use tenant branding colors with safe fallbacks (remove hardcoded overrides)
  const primaryColor = brandingSettings.primaryColor || "#06b6d4";
  const accentColor = brandingSettings.accentColor || "#6366f1";
  // UNUSED: elevenlabsAgentId - ChatWindow component is commented out
  // const elevenlabsAgentId = brandingSettings.elevenlabsAgentId;

  // Compute readable text colors for primary/accent backgrounds
  const getContrastText = (hex) => {
    const n = (h) => {
      const s = h.replace("#", "");
      const b = s.length === 3 ? s.split("").map((c) => c + c).join("") : s;
      const r = parseInt(b.slice(0, 2), 16);
      const g = parseInt(b.slice(2, 4), 16);
      const bl = parseInt(b.slice(4, 6), 16);
      // Relative luminance
      const srgb = [r, g, bl].map((v) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });
      const L = 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
      // Return black for light colors, white for dark colors
      return L > 0.179 ? "#0f172a" /* slate-900 */ : "#ffffff"; // Adjusted luminance threshold for better contrast
    };
    try {
      return n(hex);
    } catch {
      return "#ffffff";
    }
  };

  const onPrimaryText = getContrastText(primaryColor);
  const onAccentText = getContrastText(accentColor);

  // REMOVED: verbose console.log for widget context debug

  // Convert HEX to HSL (for Tailwind CSS variable mapping like --primary/--accent)
  const hexToHsl = (hex) => {
    try {
      let h = String(hex || "").trim();
      if (!h) return { h: 0, s: 0, l: 0 };
      if (h.startsWith("#")) h = h.slice(1);
      if (h.length === 3) h = h.split("").map((c) => c + c).join("");
      const r = parseInt(h.slice(0, 2), 16) / 255;
      const g = parseInt(h.slice(2, 4), 16) / 255;
      const b = parseInt(h.slice(4, 6), 16) / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      let H, S;
      const L = (max + min) / 2;
      if (max === min) {
        H = 0;
        S = 0;
      } else {
        const d = max - min;
        S = L > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case r:
            H = (g - b) / d + (g < b ? 6 : 0);
            break;
          case g:
            H = (b - r) / d + 2;
            break;
          case b:
            H = (r - g) / d + 4;
            break;
          default:
            H = 0;
        }
        H /= 6;
      }
      return {
        h: Math.round(H * 360),
        s: Math.round(S * 100),
        l: Math.round(L * 100),
      };
    } catch {
      return { h: 0, s: 0, l: 0 };
    }
  };

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
      set("--primary-color", primaryColor);
      set("--accent-color", accentColor);
      set("--on-primary-text", onPrimaryText);
      set("--on-accent-text", onAccentText);

      // Map to Tailwind theme variables (expects HSL triplets)
      set("--primary", hexToHslStringLocal(primaryColor));
      set("--accent", hexToHslStringLocal(accentColor));
      set("--primary-foreground", hexToHslStringLocal(onPrimaryText));
      set("--accent-foreground", hexToHslStringLocal(onAccentText));
    } catch (e) {
      console.warn("Failed to apply branding variables at root:", e);
    }
  }, [primaryColor, accentColor, onPrimaryText, onAccentText]);

  const handleLogout = async () => {
    try {
      if (user) {
        try {
          await createAuditLog({
            action_type: "logout",
            entity_type: "User",
            entity_id: user.id,
            description: `User logged out: ${user.full_name || user.email}`,
          });
        } catch (auditError) {
          console.warn("Logout audit log failed:", auditError);
        }
      }

      // Clear ApiManager cache to prevent stale data on next login
      try {
        if (clearCache) {
          clearCache(); // Clear all cached API requests
        }
      } catch (e) {
        console.warn("API cache clear failed on logout:", e);
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
        console.warn("Supabase signOut failed (continuing logout):", e);
      }

      // NEW: Clear chat/session context before logging out
      try {
        // Notify chat UI to clean up (e.g., stop TTS playback)
        window.dispatchEvent(new CustomEvent("chat:reset"));
      } catch (e) {
        console.warn("Chat reset dispatch failed on logout:", e);
      }

      try {
        // Clear chat-related local storage (api keys, fallback flags, cached conv ids, etc.)
        localStorage.removeItem("ai_sdk_api_key");
        localStorage.removeItem("force_chat_fallback");

        // FIX: Prevent auto-login as mock user after explicit logout
        // This ensures that isLocalDevMode() returns false on the next load,
        // preventing UserContext from automatically signing in the mock user.
        localStorage.setItem('DISABLE_MOCK_USER', 'true');

        // Remove any chat/agent-related keys by prefix
        // PRESERVE: Navigation order preferences across logout (aisha_crm_nav_order_*)
        const toRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (!k) continue;
          // Skip navigation order keys - preserve user preferences
          if (k.startsWith("aisha_crm_nav_order") || k.startsWith("aisha_crm_secondary_nav_order")) {
            continue;
          }
          if (
            k.startsWith("chat_") ||
            k.startsWith("agent_") ||
            k.startsWith("ai_chat_") ||
            k.startsWith("agent_conversation") ||
            k.startsWith("conversation_")
          ) {
            toRemove.push(k);
          }
        }
        toRemove.forEach((k) => localStorage.removeItem(k));
      } catch (e) {
        console.warn("Chat data cleanup failed on logout:", e);
      }

      try {
        // Reset agent guard context (clears in-memory tenant context)
        resetAgentSdkGuard && resetAgentSdkGuard();
      } catch (e) {
        console.warn("Agent guard reset failed on logout:", e);
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
      window.location.href = "/";
    } catch (error) {
      console.error("User logout failed:", error);
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
      user.role === "admin" ||
      user.role === "superadmin" ||
      user.permissions?.dashboard_scope === "aggregated"
    );
  }, [user]);


  // NEW: Reposition any softphone/call widgets so they sit to the left of the Avatar launcher
  React.useEffect(() => {
    const AVATAR_ID = "ai-avatar-launcher";
    const GAP_PX = 16; // gap between phone widget and avatar
    const MIN_RIGHT_PX = 128; // minimum right offset (for tiny screens)
    const BOTTOM_OFFSET_PX = 18;
    const MAX_Z = 2147483000; // near-max z-index
    const AVATAR_RIGHT_OFFSET_PX = 96; // NEW: centralize the avatar right offset (desktop)

    // Heuristic selectors for softphone/call widgets (incl. iframe cases)
    const PHONE_SELECTORS = [
      "#signalwire-softphone",
      "[data-softphone]",
      '[id*="softphone" i]',
      '[class*="softphone" i]',
      '[id*="signalwire" i]',
      '[class*="signalwire" i]',
      '[id*="callcenter" i]',
      '[class*="callcenter" i]',
      '[id*="call-widget" i]',
      '[class*="call-widget" i]',
      '[id*="phone-widget" i]',
      '[class*="phone-widget" i]',
      'iframe[src*="signalwire" i]',
      'iframe[id*="softphone" i]',
    ];

    const rectsOverlap = (a, b) => {
      if (!a || !b) return false;
      return !(
        a.right <= b.left ||
        a.left >= b.right ||
        a.bottom <= b.top ||
        a.top >= b.bottom
      );
    };

    const getAvatar = () => document.getElementById(AVATAR_ID);

    const getAvatarZ = () => {
      const avatar = getAvatar();
      if (!avatar) return 10000;
      const z = Number.parseInt(
        window.getComputedStyle(avatar).zIndex || "10000",
        10,
      );
      return Number.isFinite(z) ? z : 10000;
    };

    const computeRightOffset = () => {
      const avatar = getAvatar();
      if (!avatar) return MIN_RIGHT_PX;
      const r = avatar.getBoundingClientRect();
      // Distance from viewport right edge to the avatar's LEFT edge, plus gap
      const dynamicRight = Math.max(
        Math.round(window.innerWidth - r.left + GAP_PX),
        MIN_RIGHT_PX,
      );
      return dynamicRight;
    };

    // NEW: Ensure candidate element is in document.body (escape transformed/overflow ancestors)
    const ensureInDocumentBody = (el) => {
      try {
        const likelyThirdParty = el.tagName === "IFRAME" ||
          (el.id && /signalwire|softphone|call/i.test(el.id)) ||
          (el.className &&
            /signalwire|softphone|call/i.test(String(el.className)));

        if (likelyThirdParty && el.parentElement !== document.body) {
          // Mark and move to body to break out of stacking contexts
          el.setAttribute("data-teleported", "true");
          document.body.appendChild(el);
        }
      } catch {
        // ignore
      }
    };

    const placeLeftOfAvatar = (el) => {
      try {
        const s = el.style;
        // Normalize base styles
        s.position = "fixed";
        s.bottom = `${BOTTOM_OFFSET_PX}px`;
        s.right = `${computeRightOffset()}px`;
        // Ensure it sits above the avatar
        const baseZ = getAvatarZ();
        s.zIndex = String(Math.max(baseZ + 2, MAX_Z));
        s.transform = "none";
        s.pointerEvents = "auto";

        // If still overlapping avatar visually, push further left intelligently
        requestAnimationFrame(() => {
          const avatar = getAvatar();
          if (!avatar) return;

          const avatarRect = avatar.getBoundingClientRect();
          let phoneRect = el.getBoundingClientRect();

          let tries = 0;
          const maxTries = 8;
          while (rectsOverlap(avatarRect, phoneRect) && tries < maxTries) {
            const currentRight = parseInt(s.right || "0", 10) || MIN_RIGHT_PX;
            const pushBy = Math.ceil(
              Math.max(avatarRect.width, 64) + GAP_PX + 12,
            );
            s.right = `${currentRight + pushBy}px`;
            tries += 1;
            phoneRect = el.getBoundingClientRect();
          }

          // Fallback: if overlap persists (e.g., third-party inline styles fight us), shift the avatar left instead
          if (rectsOverlap(avatarRect, phoneRect)) {
            const shift = Math.ceil((phoneRect.width || 160) + GAP_PX + 12);
            avatar.style.position = "fixed";
            avatar.style.right = `${Math.max(AVATAR_RIGHT_OFFSET_PX, shift)}px`;
            avatar.style.bottom = "16px";
            // Keep avatar below phone in stacking order
            avatar.style.zIndex = String(getAvatarZ() - 1);
          }
        });
      } catch {
        // ignore
      }
    };

    const isNearBottomRight = (el) => {
      try {
        const rect = el.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const nearRight = rect.right >= (vw - 260); // widened trigger zone
        const nearBottom = rect.bottom >= (vh - 260);
        return nearRight && nearBottom;
      } catch {
        return false;
      }
    };

    const adjustAll = () => {
      try {
        // Pin avatar at bottom-right as anchor (we may shift it in fallback)
        const avatar = getAvatar();
        if (avatar) {
          if (!avatar.style.position) avatar.style.position = "fixed";
          // Start at default; fallback may change this later
          avatar.style.right = `${AVATAR_RIGHT_OFFSET_PX}px`;
          avatar.style.bottom = "16px";
          // Keep it lower than the phone z-index; phone will be MAX_Z
          avatar.style.zIndex = "10004";
        }

        // Find and reposition likely phone widgets
        PHONE_SELECTORS.forEach((sel) => {
          document.querySelectorAll(sel).forEach((el) => {
            if (!el || el.id === AVATAR_ID || el.closest(`#${AVATAR_ID}`)) {
              return;
            }
            if (!isNearBottomRight(el)) return;

            // Move out of any clipping/transform contexts first
            ensureInDocumentBody(el);

            // Always try to bring the phone above everything and to the left of avatar
            try {
              el.style.zIndex = String(MAX_Z);
            } catch { /* ignore */ }
            placeLeftOfAvatar(el);
          });
        });
      } catch {
        // no-op
      }
    };

    // Initial pass
    const t = setTimeout(adjustAll, 150);
    // Observe DOM changes
    const mo = new MutationObserver(() => adjustAll());
    mo.observe(document.body, { childList: true, subtree: true });

    // Re-adjust on resize (layout shifts)
    window.addEventListener("resize", adjustAll);

    return () => {
      clearTimeout(t);
      try {
        mo.disconnect();
      } catch { /* ignore */ }
      window.removeEventListener("resize", adjustAll);
    };
  }, []);

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
            <h2 className="text-lg font-semibold text-red-800 mb-2">
              User Data Not Available
            </h2>
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
        className="relative min-h-screen flex items-center justify-center overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${primaryColor}, ${accentColor})`,
        }}
      >
        {/* Subtle brand watermark behind the card */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 opacity-10"
          style={{
            backgroundImage: `url(${logoUrl || "/assets/Ai-SHA-logo-2.png"})`,
            backgroundSize: "min(70vmin, 720px)",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "center",
            filter: "blur(6px)",
          }}
        />
        {/* 4V Data Consulting logo watermark (top left) */}
        <img
          src="/assets/uploads/ai360logo.png"
          alt="4V Data Consulting Logo"
          style={{
            position: 'absolute',
            top: 24,
            left: 24,
            width: 80,
            height: 'auto',
            opacity: 0.13,
            filter: 'grayscale(100%) blur(0.5px)',
            zIndex: 2,
            pointerEvents: 'none',
          }}
        />
        <div
          className="relative bg-white border rounded-lg p-8 max-w-md w-full shadow-2xl"
          style={{ borderColor: primaryColor }}
        >
          <div className="text-center mb-6">
            <img
              src="/assets/Ai-SHA-logo-2.png"
              alt="AI-SHA CRM"
              className="h-16 mx-auto mb-4"
            />
            <h2 className="text-2xl font-bold text-slate-800 mb-2">
              Welcome to AI-SHA CRM
            </h2>
            <p className="text-slate-600">Sign in to access your account</p>
            
            {/* Environment indicator on login page */}
            {(() => {
              // Use runtime window._env_ (injected by entrypoint) with fallback to build-time import.meta.env
              const backendUrl = window._env_?.VITE_AISHACRM_BACKEND_URL || import.meta.env.VITE_AISHACRM_BACKEND_URL || '';
              const supabaseUrl = window._env_?.VITE_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL || '';
              const isDev = backendUrl.includes('localhost') || backendUrl.includes('127.0.0.1');
              const isDevDb = supabaseUrl.includes('efzqxjpfewkrgpdootte');
              const isProdDb = supabaseUrl.includes('ehjlenywplgyiahgxkfj');
              
              let envLabel = null;
              let bgColor = '';
              
              if (isDev && isDevDb) {
                envLabel = '🔵 DEVELOPMENT ENVIRONMENT';
                bgColor = 'bg-blue-100 border-blue-300 text-blue-800';
              } else if (isDev && isProdDb) {
                envLabel = '⚠️ LOCAL + PRODUCTION DATABASE';
                bgColor = 'bg-orange-100 border-orange-300 text-orange-800';
              } else if (!isDev && isDevDb) {
                envLabel = '🟡 STAGING ENVIRONMENT';
                bgColor = 'bg-yellow-100 border-yellow-300 text-yellow-800';
              }
              
              return envLabel ? (
                <div className={`mt-4 p-3 border rounded-md ${bgColor}`}>
                  <p className="text-sm font-bold text-center">{envLabel}</p>
                </div>
              ) : null;
            })()}
            
            {/* Password reset success message */}
            {new URLSearchParams(window.location.search).get('reset') === 'success' && (
              <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md">
                <p className="text-sm text-green-700 text-center">
                  ✓ Password updated successfully! Please sign in with your new password.
                </p>
              </div>
            )}
            
            {/* Session expired message */}
            {new URLSearchParams(window.location.search).get('session_expired') === 'true' && (
              <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
                <p className="text-sm text-amber-700 text-center">
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
                logDev("[Login] Attempting Supabase auth login:", email);
                const { error } = await supabase.auth.signInWithPassword({
                  email,
                  password,
                });
                if (error) {
                  throw error;
                }
                logDev("[Login] Supabase auth successful, calling backend login...");
                
                // Call backend /api/auth/login to get JWT cookies
                // Use runtime env (window._env_) with fallback to build-time env
                const backendUrl = window._env_?.VITE_AISHACRM_BACKEND_URL || import.meta.env.VITE_AISHACRM_BACKEND_URL || '';
                const loginResponse = await fetch(`${backendUrl}/api/auth/login`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'include', // Important: include cookies
                  body: JSON.stringify({ email, password })
                });
                
                if (!loginResponse.ok) {
                  throw new Error(`Backend login failed: ${loginResponse.status}`);
                }
                
                const loginData = await loginResponse.json();
                const tenant_id = loginData.data?.user?.tenant_id;
                
                logDev("[Login] Login response data:", { 
                  tenant_id, 
                  hasUser: !!loginData.data?.user,
                  userKeys: Object.keys(loginData.data?.user || {})
                });
                
                // Clear backend dashboard cache to ensure fresh data after login
                if (tenant_id) {
                  try {
                    const cacheResponse = await fetch(`${backendUrl}/api/reports/clear-cache`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      credentials: 'include',
                      body: JSON.stringify({ tenant_id })
                    });
                    const cacheResult = await cacheResponse.json();
                    logDev("[Login] Dashboard cache cleared:", cacheResult);
                  } catch (cacheErr) {
                    console.warn("[Login] Failed to clear cache (non-critical):", cacheErr);
                  }
                } else {
                  console.warn("[Login] No tenant_id found in login response, skipping cache clear");
                }
                
                logDev("[Login] Backend login successful, reloading...");
                window.location.reload();
              } catch (error) {
                console.error("[Login] Login failed:", error);
                alert("Login failed: " + (error?.message || "Unknown error"));
              }
            }}
          >
            <div className="mb-4">
              <label
                className="block text-slate-800 text-sm font-semibold mb-2"
                htmlFor="email"
              >
                Email
              </label>
              <input
                type="email"
                id="email"
                name="email"
                required
                autoComplete="email"
                autoFocus
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 bg-white text-slate-900"
                style={{ "--tw-ring-color": accentColor }}
                placeholder="your-email@example.com"
              />
            </div>

            <div className="mb-4">
              <label
                className="block text-slate-800 text-sm font-semibold mb-2"
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
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 bg-white text-slate-900"
                style={{ "--tw-ring-color": accentColor }}
                placeholder="Enter your password"
              />
            </div>

            <button
              type="submit"
              className="w-full text-white px-4 py-2 rounded-md transition-all font-semibold shadow-lg hover:brightness-110"
              style={{
                background: `linear-gradient(90deg, ${primaryColor}, ${accentColor})`,
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
                    // Use backend proxy to avoid CORS issues
                    // Get backend URL from runtime config (window._env_) or build-time env
                    const backendUrl = getBackendUrl();
                    const response = await fetch(`${backendUrl}/api/users/reset-password`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ email }),
                    });
                    const result = await response.json();
                    if (!response.ok) {
                      // Detect Supabase rate limit error (429 or rate_limit in message)
                      const isRateLimit = response.status === 429 ||
                        (result.message && (
                          result.message.includes('rate limit') ||
                          result.message.includes('over_email_send_rate_limit')
                        ));

                      if (isRateLimit) {
                        throw new Error('Too many password reset attempts. Please wait 60 seconds and try again.');
                      }
                      throw new Error(result.message || 'Failed to send reset email');
                    }
                    alert('Reset email sent. Check your inbox (and spam).');
                  } catch (err) {
                    alert('Failed to send reset email: ' + (err?.message || 'Unknown error'));
                  }
                }}
                className="text-xs font-medium text-slate-600 hover:text-slate-800 hover:underline"
              >
                Forgot password?
              </button>
            </div>
          </form>
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
            logDev(
              "[Password Change] Password changed successfully, reloading...",
            );
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

  const SidebarContent = ({ onNavClick }) => (
    <div className="flex flex-col h-full bg-slate-900 border-r border-slate-800">
      <div
        className="border-b border-slate-800 px-6 py-4 flex flex-col items-center"
        data-testid="sidebar-header"
      >
        {logoUrl
          ? (
            <img
              src={displayedLogoUrl}
              alt={companyName}
              className="h-32 w-auto max-w-[400px] object-contain"
              onError={(e) => {
                // Hard fallback to global app logo so branding is always visible
                try {
                  const img = e?.currentTarget || e?.target;
                  if (!img) return;

                  // Prevent infinite retry loop by only attempting fallback once
                  if (!img.dataset.fallbackApplied) {
                    img.dataset.fallbackApplied = "1";
                    const fallbackSrc = "/assets/Ai-SHA-logo-2.png"; // stable URL; no cache-busting here
                    img.src = fallbackSrc;
                    img.style.display = ""; // ensure it's visible
                    if (import.meta.env.DEV) {
                      console.debug("Logo failed to load, swapped to default:", {
                        raw: logoUrl,
                        resolved: displayedLogoUrl,
                        fallback: fallbackSrc,
                      });
                    }
                    return;
                  }
                } catch (err) {
                  if (import.meta.env.DEV) {
                    console.debug(
                      "Logo fallback swap error (safe to ignore):",
                      err?.message || err,
                    );
                  }
                }

                // If even the fallback fails, show the text-based placeholder
                const img = e?.currentTarget || e?.target;
                if (img) {
                  img.style.display = "none";
                  if (img.nextElementSibling) {
                    img.nextElementSibling.style.display = "flex";
                  }
                }
              }}
              onLoad={(e) => {
                const fallback = e.target.nextElementSibling;
                if (fallback) fallback.style.display = "none";
              }}
            />
          )
          : null}

        <div
          className={`h-16 flex items-center justify-center ${
            logoUrl ? "hidden" : ""
          }`}
        >
          <div
            className="w-14 h-14 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: primaryColor }}
          >
            <span className="text-on-primary font-bold text-xl">
              {companyName.charAt(0).toUpperCase()}
            </span>
          </div>
          <span className="font-bold text-xl text-slate-100 ml-2">
            {companyName}
          </span>
        </div>

        {(user?.role === "superadmin" || user?.role === "admin") &&
          selectedTenantId && selectedTenant &&
          (
            <p className="text-xs text-slate-400 mt-2 text-center">
              Managing Client:{" "}
              <span className="font-medium text-slate-300">
                {selectedTenant.name}
              </span>
            </p>
          )}
        {(user?.role === "superadmin" || user?.role === "admin") &&
          !selectedTenantId &&
          (
            <p className="text-xs text-orange-400 mt-2 text-center">
              ⚠️ No Client Selected
            </p>
          )}
      </div>

      <div className="p-4">
        <Clock />
      </div>

      <div className="px-4 flex items-center justify-between">
        <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
          Navigation
        </p>
        <div className="flex items-center gap-1">
          {(hasCustomNavOrder || hasCustomSecondaryOrder) && (
            <button
              type="button"
              onClick={handleResetNavOrder}
              className="p-1 text-slate-500 hover:text-slate-300 transition-colors"
              title="Reset to default order"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsDragMode(!isDragMode)}
            className={`p-1 transition-colors ${isDragMode ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}
            title={isDragMode ? "Exit reorder mode" : "Reorder navigation items"}
          >
            <GripVertical className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <nav
        className="flex-1 px-4 py-2 overflow-y-auto"
        data-testid="main-navigation"
      >
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleNavDragEnd}
        >
          <SortableContext
            items={filteredNavItems.map(item => item.href)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="space-y-1">
              {filteredNavItems.map((item) => (
                <SortableNavItem
                  key={item.href}
                  item={item}
                  isActive={currentPageName === item.href}
                  createPageUrl={createPageUrl}
                  onNavClick={onNavClick}
                  isDragMode={isDragMode}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      </nav>

      <div className="mt-auto p-4 border-t border-slate-800">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleSecondaryDragEnd}
        >
          <SortableContext
            items={filteredSecondaryNavItems.map(item => item.href)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="space-y-1">
              {filteredSecondaryNavItems.map((item) => (
                <li key={item.href}>
                  <div className="flex items-center">
                    {isDragMode && !item.isAvatar && (
                      <div className="p-1 mr-1 text-slate-500">
                        <GripVertical className="w-4 h-4" />
                      </div>
                    )}
                    <Link
                      to={createPageUrl(item.href)}
                      data-testid={`nav-${item.href.toLowerCase()}`}
                      className={`flex-1 flex items-center ${item.isAvatar ? "justify-center" : "gap-3"
                        } px-3 py-2.5 rounded-lg transition-all text-base font-medium ${currentPageName === item.href
                          ? (item.isAvatar
                            ? "bg-transparent"
                            : "shadow-lg nav-active")
                          : "text-slate-400 hover:bg-slate-800 hover:text-slate-300"
                        }`}
                      onClick={onNavClick}
                      style={currentPageName === item.href && !item.isAvatar
                        ? {
                          backgroundColor: "var(--primary-color)",
                          color: "var(--on-primary-text)",
                        }
                        : {}}
                    >
                      {item.isAvatar
                        ? (
                          <div
                            className="relative"
                            style={{
                              borderRadius: "50%",
                              padding: "3px",
                              background: currentPageName === item.href
                                ? `linear-gradient(135deg, ${primaryColor}, ${accentColor})`
                                : "transparent",
                              boxShadow: currentPageName === item.href
                                ? `0 0 15px ${primaryColor}, 0 0 30px ${accentColor}`
                                : "none",
                            }}
                          >
                            <img
                              src={item.avatarUrl}
                              alt="AI Assistant"
                              style={{
                                width: "0.75in",
                                height: "0.75in",
                                borderRadius: "50%",
                              }}
                              className={`object-cover sidebar-avatar-border ${currentPageName === item.href
                                  ? "opacity-100"
                                  : "opacity-90 hover:opacity-100"
                                }`}
                            />
                          </div>
                        )
                        : (
                          <item.icon
                            className={`w-5 h-5 ${currentPageName === item.href ? "" : "text-slate-400"
                              }`}
                            style={currentPageName === item.href
                              ? {
                                color: "var(--on-primary-text)",
                              }
                              : {}}
                          />
                        )}

                      {!item.isAvatar && <span>{item.label}</span>}
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );

  return (
    <div
      className={`brand-scope ${
        theme === "light" ? "theme-light" : "theme-dark"
      }`}
      style={{
        /* Inject brand CSS variables so mappings resolve everywhere */
        "--primary-color": primaryColor,
        "--accent-color": accentColor,
        "--on-primary-text": onPrimaryText,
        "--on-accent-text": onAccentText,
        backgroundColor: "var(--app-bg, #0f172a)",
      }}
    >
      {/* Ensure global portal targets exist for any dialog libraries */}
      <PortalRootManager />
      {/* NEW: Root-level modal host for stable portals */}
      <ModalHost id="app-modal-host" />
      {/* Global DOM safety patches (runs once) */}
      <GlobalDomPatches />
      <SvgDefs />
      <style>
        {`
          /* CRITICAL: Ensure proper viewport scaling */
          html {
            font-size: 16px; /* Base font size */
          }
          
          @media (max-width: 640px) {
            html {
              font-size: 14px; /* Smaller base for mobile */
            }
          }
          
          @media (min-width: 1920px) {
            html {
              font-size: 18px; /* Larger base for big screens */
            }
          }

          /* RESPONSIVE: Ensure all containers can shrink/grow */
          * {
            min-width: 0; /* Prevent flex items from overflowing */
          }

          /* ------------ WIDTH STANDARDIZATION (match Activities) ------------ */

          /* Enforce full-width content across pages (match Activities) */
          body [class*="max-w-"],
          body .mx-auto,
          body .container,
          main [class*="max-w-"],
          main .mx-auto,
          main .container,
          main .overflow-x-auto {
            max-width: 100% !important;
            width: 100% !important;
            margin-left: 0 !important;
            margin-right: 0 !important;
          }

          /* Primary cards/blank states should span full width */
          main .bg-slate-800.border-slate-700.rounded-lg,
          main .bg-slate-800.rounded-lg.border {
            width: 100% !important;
            max-width: 100% !important;
          }

          @media (min-width: 1024px) {
            main .bg-slate-800.border-slate-700.rounded-lg,
            main .bg-slate-800.rounded-lg.border {
              margin-left: 0 !important;
              margin-right: 0 !important;
            }
          }

          /* AGGRESSIVE EMPTY STATE FULL WIDTH FIX */
          /* Target all empty state cards specifically */
          main > div > div.space-y-6,
          main > div > div.space-y-6 > div {
            max-width: 100% !important;
            width: 100% !important;
          }

          /* Force empty state cards to full width */
          main .space-y-6 > .bg-slate-800.border-slate-700 {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 100% !important;
            margin-left: 0 !important;
            margin-right: 0 !important;
          }

          /* Specific override for cards with min-h-[600px] (empty states) */
          main [class*="min-h-"] {
            width: 100% !important;
            max-width: none !important;
          }

          /* Remove any flexbox constraints that might shrink cards */
          main .space-y-6 {
            display: block !important;
          }

          /* RESPONSIVE: Scale padding based on screen size */
          @media (max-width: 640px) {
            main {
              padding: 0.75rem !important; /* Reduce padding on mobile */
            }
            
            .bg-slate-800.rounded-lg {
              padding: 0.75rem !important;
            }
          }

          @media (min-width: 1920px) {
            main {
              padding: 2rem !important; /* More breathing room on large screens */
            }
          }

          /* RESPONSIVE: Tables should scroll horizontally on small screens */
          @media (max-width: 1024px) {
            table {
              display: block;
              overflow-x: auto;
              white-space: nowrap;
            }
          }

          /* RESPONSIVE: Grid layouts should stack on mobile */
          @media (max-width: 640px) {
            .grid {
              grid-template-columns: 1fr !important;
            }
          }

          /* RESPONSIVE: Font sizes scale with screen */
          @media (max-width: 640px) {
            h1, .text-3xl { font-size: 1.5rem !important; }
            h2, .text-2xl { font-size: 1.25rem !important; }
            h3, .text-xl { font-size: 1.125rem !important; }
          }

          @media (min-width: 1920px) {
            h1, .text-3xl { font-size: 2.5rem !important; }
            h2, .text-2xl { font-size: 2rem !important; }
          }

          /* Dark theme scrollbars */
          * {
            scrollbar-width: thin;
            scrollbar-color: #475569 #1e293b;
          }

          /* Webkit scrollbars (Chrome, Safari, Edge) */
          ::-webkit-scrollbar {
            width: 8px;
            height: 8px;
          }

          ::-webkit-scrollbar-track {
            background: #1e293b;
            border-radius: 4px;
          }

          ::-webkit-scrollbar-thumb {
            background: #475569;
            border-radius: 4px;
            border: 1px solid #334155;
          }

          ::-webkit-scrollbar-thumb:hover {
            background: #64748b;
          }

          ::-webkit-scrollbar-thumb:active {
            background: #94a3b8;
          }

          ::-webkit-scrollbar-corner {
            background: #1e293b;
          }

          /* Additional scrollbar styling for specific containers */
          .overflow-y-auto::-webkit-scrollbar,
          .overflow-x-auto::-webkit-scrollbar,
          .overflow-auto::-webkit-scrollbar {
            width: 6px;
            height: 6px;
          }

          /* Hover effects for scrollable areas */
          .overflow-y-auto:hover::-webkit-scrollbar-thumb,
          .overflow-x-auto:hover::-webkit-scrollbar-thumb,
          .overflow-auto:hover::-webkit-scrollbar-thumb {
            background: #64748b;
          }

          /* Global override for documentation text color */
          .prose { color: #cbd5e1; }
          .prose h1, .prose h2, .prose h3, .prose h4, .prose h5, .prose h6 { color: #f1f5f9; }
          .prose p, .prose ul, .prose ol, .prose li, .prose blockquote { color: #cbd5e1; }
          .prose strong { color: #e2e8f0; }
          .prose a { color: #60a5fa; }
          .prose code { color: #f472b6; }
          .prose a:hover { color: #93c5fd; }

          /* Translucent chatbox utility classes */
          .chatbox-translucent-bg {
            background-color: var(--chatbox-bg) !important;
            backdrop-filter: saturate(120%) blur(8px);
          }
          .chatbox-translucent-border {
            border-color: var(--chatbox-border) !important;
          }
          /* Ensure translucency works in both themes by out-specifying theme-light bg overrides */
          .theme-light .chatbox-translucent-bg {
            background-color: rgba(255, 255, 255, 0) !important; /* fully transparent in light theme */
            backdrop-filter: saturate(120%) blur(8px);
          }
          .theme-light .chatbox-translucent-border {
            border-color: var(--chatbox-border) !important;
          }

          /* User avatar white border in dark theme */
          .theme-dark header img[alt*="avatar" i],
          .theme-dark header img[src*="avatar" i],
          .theme-dark header .w-8.h-8.rounded-full,
          .theme-dark header button img {
            border: 2px solid #ffffff !important;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
          }

          /* Specifically target the user avatar div with initials in header */
          .theme-dark header button .w-8.h-8.bg-slate-200.rounded-full {
            border: 2px solid #ffffff !important;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3) !important;
          }

          /* Sidebar avatar border - white in dark theme, dark in light theme */
          .theme-dark .sidebar-avatar-border {
            border: 2px solid #ffffff !important;
          }

          .theme-light .sidebar-avatar-border {
            border: 2px solid #0f172a !important;
          }

          /* THEME LIGHT OVERRIDES */
          .theme-light {
            --chatbox-bg: rgba(255, 255, 255, 0) !important; /* fully transparent in light theme */
            --chatbox-border: rgba(226, 232, 240, 0.75); /* slate-200 @ 75% */
          }

          /* BUTTONS - Make blue buttons MUCH more visible in light theme */
          .theme-light .bg-blue-600,
          .theme-light button.bg-blue-600,
          .theme-light a.bg-blue-600,
          .theme-light [role="button"].bg-blue-600,
          .theme-light [class*="bg-blue-600"] {
            background-color: #1e40af !important; /* blue-800 - very dark */
            color: #ffffff !important;
            border: 1px solid #1e3a8a !important; /* blue-900 border */
            box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.2) !important;
          }
          .theme-light .bg-blue-600:hover,
          .theme-light button.bg-blue-600:hover,
          .theme-light a.bg-blue-600:hover,
          .theme-light [role="button"].bg-blue-600:hover,
          .theme-light [class*="bg-blue-600"]:hover {
            background-color: #1e3a8a !important; /* blue-900 - even darker on hover */
            box-shadow: 0 2px 4px 0 rgb(0 0 0 / 0.3) !important;
          }
          .theme-light .hover\\:bg-blue-700:hover,
          .theme-light .bg-blue-700 {
            background-color: #1e3a8a !important; /* blue-900 */
          }

          /* Action icon buttons - make them MUCH more visible in light theme */
          .theme-light .text-slate-400,
          .theme-light button.text-slate-400,
          .theme-light [class*="text-slate-400"] {
            color: #64748b !important; /* slate-500 - darker gray */
          }
          .theme-light .hover\\:text-slate-300:hover,
          .theme-light button:hover.hover\\:text-slate-300,
          .theme-light [class*="hover:text-slate-300"]:hover {
            color: #1e40af !important; /* blue-800 - dark blue on hover */
          }
          .theme-light .hover\\:bg-slate-700:hover,
          .theme-light button:hover.hover\\:bg-slate-700,
          .theme-light [class*="hover:bg-slate-700"]:hover {
            background-color: #e2e8f0 !important; /* slate-200 - light gray background */
          }

          .theme-light .bg-slate-900 { background-color: #f8fafc !important; } /* page bg */
          .theme-light .bg-slate-800 { background-color: #ffffff !important; } /* cards/dialogs */
          .theme-light .bg-slate-700 { background-color: #f1f5f9 !important; }
          .theme-light [class*="bg-slate-700/"] { background-color: rgba(241,245,249,0.6) !important; }
          .theme-light .border-slate-800 { border-color: #e2e8f0 !important; }
          .theme-light .border-slate-700 { border-color: #e5e7eb !important; }
          .theme-light .border-green-700 { border-color: #86efac !important; } /* green-300 */
          .theme-light .border-blue-700 { border-color: #93c5fd !important; } /* blue-300 */
          .theme-light .border-emerald-700 { border-color: #6ee7b7 !important; } /* emerald-300 */
          
          /* Stat card backgrounds - keep semi-transparent appearance but adjust for light theme */
          .theme-light .bg-green-900\\/20 { background-color: #d1fae5 !important; } /* green-200 */
          .theme-light .bg-blue-900\\/20 { background-color: #dbeafe !important; } /* blue-200 */
          .theme-light .bg-emerald-900\\/20 { background-color: #d1fae5 !important; } /* emerald-200 */
          .theme-light .bg-slate-900\\/20 { background-color: #e2e8f0 !important; } /* slate-200 */

          /* Ensure strong contrast for text across themes */
          .theme-light .text-slate-100,
          .theme-light .text-slate-200,
          .theme-light .text-slate-300 { color: #0f172a !important; }
          .theme-light .text-slate-400 { color: #1f2937 !important; }
          .theme-light .text-slate-500 { color: #374151 !important; }

          /* Active item contrast on primary/accent backgrounds */
          .theme-light .text-on-primary,
          .theme-dark .text-on-primary { color: var(--on-primary-text) !important; }
          .theme-light .text-on-accent,
          .theme-dark .text-on-accent { color: var(--on-accent-text) !important; }

          .theme-light .hover\\:bg-slate-800:hover { background-color: #f1f5f9 !important; }
          .theme-light .hover\\:text-slate-300:hover { color: #111827 !important; }
          .theme-light .shadow-lg { box-shadow: 0 10px 15px -3px rgba(0,0,0,0.08), 0 4px 6px -2px rgba(0,0,0,0.05) !important; }

          /* GLOBAL: Improve light theme contrast */
          .theme-light .text-slate-100,
          .theme-light .text-slate-200,
          .theme-light .text-slate-300 { color: #0f172a !important; } /* slate-900 */
          .theme-light .text-slate-400 { color: #1f2937 !important; } /* slate-800 */
          .theme-light .text-slate-500 { color: #374151 !important; } /* slate-700 */

          /* Lighten dark-tinted utility backgrounds app-wide in light theme */
          .theme-light .bg-slate-700\\/50,
          .theme-light .bg-slate-800\\/50,
          .theme-light .bg-slate-700 { background-color: #f8fafc !important; } /* slate-50 */
          .theme-light .border-slate-700,
          .theme-light .border-slate-600 { border-color: #e5e7eb !important; } /* slate-200 */

          /* NEW: Ensure any slate-900 and slate-800 tints are light in light theme (fixes Calendar dark squares) */
          .theme-light [class*="bg-slate-900/"] { background-color: #f1f5f9 !important; } /* slate-100 */
          .theme-light [class*="bg-slate-800/"] { background-color: #f1f5f9 !important; } /* slate-100 */

          /* Alerts: ensure readable text in light mode */
          .theme-light [role="alert"] { color: #0f172a !important; }
          .theme-light [role="alert"] a { color: #1d4ed8 !important; }

          /* CRITICAL FIX: Force all badge text to be visible in light theme */
          .theme-light .badge,
          .theme-light [class*="badge"],
          .theme-light [role="status"],
          .theme-light .contrast-badge {
            font-weight: 900 !important;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
          }
          
          /* AGGRESSIVE: Force dark text on light-background badges ONLY (not stat cards) */
          .theme-light .badge.bg-blue-900\\/20,
          .theme-light .badge.bg-blue-300,
          .theme-light .badge.bg-indigo-900\\/20,
          .theme-light .badge.bg-indigo-300,
          .theme-light .badge.bg-purple-900\\/20,
          .theme-light .badge.bg-purple-300,
          .theme-light .badge[class*="bg-blue"],
          .theme-light .badge[class*="bg-indigo"],
          .theme-light .badge[class*="bg-purple"] {
            color: #1e40af !important; /* blue-800 - dark enough to read on light backgrounds */
          }
          
          .theme-light .badge.bg-green-900\\/20,
          .theme-light .badge.bg-green-300,
          .theme-light .badge.bg-emerald-900\\/20,
          .theme-light .badge.bg-emerald-300,
          .theme-light .badge[class*="bg-green"],
          .theme-light .badge[class*="bg-emerald"] {
            color: #065f46 !important; /* green-800 */
          }
          
          .theme-light .badge.bg-yellow-900\\/20,
          .theme-light .badge.bg-yellow-300,
          .theme-light .badge.bg-amber-900\\/20,
          .theme-light .badge.bg-amber-300,
          .theme-light .badge[class*="bg-yellow"],
          .theme-light .badge[class*="bg-amber"] {
            color: #92400e !important; /* amber-800 */
          }
          
          .theme-light .badge.bg-red-900\\/20,
          .theme-light .badge.bg-red-300,
          .theme-light .badge[class*="bg-red"] {
            color: #991b1b !important; /* red-800 */
          }
          
          .theme-light .badge.bg-slate-900\\/20,
          .theme-light .badge.bg-slate-300,
          .theme-light .badge[class*="bg-slate"] {
            color: #1e293b !important; /* slate-800 */
          }

          /* Status badges - specific targeting with bright colors */
          .theme-light .contrast-badge[data-variant="status"][data-status="completed"] {
            background-color: #a7f3d0 !important; /* green-300 */
            color: #059669 !important;            /* green-600 - bright green */
            border-color: #34d399 !important;     /* green-400 */
          }
          .theme-light .contrast-badge[data-variant="status"][data-status="scheduled"] {
            background-color: #bfdbfe !important; /* blue-300 */
            color: #2563eb !important;            /* blue-600 - bright blue */
            border-color: #60a5fa !important;     /* blue-400 */
          }
          .theme-light .contrast-badge[data-variant="status"][data-status="overdue"] {
            background-color: #fde68a !important; /* amber-300 */
            color: #d97706 !important;            /* amber-600 - bright amber */
            border-color: #fbbf24 !important;     /* amber-400 */
          }
          .theme-light .contrast-badge[data-variant="status"][data-status="in-progress"],
          .theme-light .contrast-badge[data-variant="status"][data-status="in_progress"] {
            background-color: #fef08a !important; /* yellow-300 */
            color: #ca8a04 !important;            /* yellow-600 - bright yellow */
            border-color: #facc15 !important;     /* yellow-400 */
          }
          .theme-light .contrast-badge[data-variant="status"][data-status="cancelled"],
          .theme-light .contrast-badge[data-variant="status"][data-status="failed"] {
            background-color: #fca5a5 !important; /* red-300 */
            color: #dc2626 !important;            /* red-600 - bright red */
            border-color: #f87171 !important;     /* red-400 */
          }

          /* Lead status badges - bright colors */
          .theme-light .contrast-badge[data-variant="status"][data-status="new"] {
            background-color: #bfdbfe !important; /* blue-300 */
            color: #2563eb !important;            /* blue-600 - bright blue */
            border-color: #60a5fa !important;     /* blue-400 */
          }
          .theme-light .contrast-badge[data-variant="status"][data-status="contacted"] {
            background-color: #c7d2fe !important; /* indigo-300 */
            color: #4f46e5 !important;            /* indigo-600 - bright indigo */
            border-color: #818cf8 !important;     /* indigo-400 */
          }
          .theme-light .contrast-badge[data-variant="status"][data-status="qualified"],
          .theme-light .contrast-badge[data-variant="status"][data-status="qualification"] {
            background-color: #a7f3d0 !important; /* green-300 */
            color: #059669 !important;            /* green-600 - bright green */
            border-color: #34d399 !important;     /* green-400 */
          }
          .theme-light .contrast-badge[data-variant="status"][data-status="unqualified"] {
            background-color: #fde68a !important; /* amber-300 */
            color: #d97706 !important;            /* amber-600 - bright amber */
            border-color: #fbbf24 !important;     /* amber-400 */
          }
          .theme-light .contrast-badge[data-variant="status"][data-status="converted"] {
            background-color: #a7f3d0 !important; /* green-300 */
            color: #059669 !important;            /* green-600 - bright green */
            border-color: #34d399 !important;     /* green-400 */
          }
          .theme-light .contrast-badge[data-variant="status"][data-status="lost"] {
            background-color: #fca5a5 !important; /* red-300 */
            color: #dc2626 !important;            /* red-600 - bright red */
            border-color: #f87171 !important;     /* red-400 */
          }
          
          /* Opportunity stages */
          .theme-light .contrast-badge[data-variant="status"][data-status="prospecting"] {
            background-color: #bfdbfe !important; /* blue-300 */
            color: #2563eb !important;            /* blue-600 */
            border-color: #60a5fa !important;     /* blue-400 */
          }
          .theme-light .contrast-badge[data-variant="status"][data-status="proposal"] {
            background-color: #c7d2fe !important; /* indigo-300 */
            color: #4f46e5 !important;            /* indigo-600 */
            border-color: #818cf8 !important;     /* indigo-400 */
          }
          .theme-light .contrast-badge[data-variant="status"][data-status="negotiation"] {
            background-color: #fef08a !important; /* yellow-300 */
            color: #ca8a04 !important;            /* yellow-600 */
            border-color: #facc15 !important;     /* yellow-400 */
          }
          .theme-light .contrast-badge[data-variant="status"][data-status="closed_won"] {
            background-color: #a7f3d0 !important; /* green-300 */
            color: #059669 !important;            /* green-600 */
            border-color: #34d399 !important;     /* green-400 */
          }
          .theme-light .contrast-badge[data-variant="status"][data-status="closed_lost"] {
            background-color: #fca5a5 !important; /* red-300 */
            color: #dc2626 !important;            /* red-600 */
            border-color: #f87171 !important;     /* red-400 */
          }

          /* Priority badges - bright colors */
          .theme-light .contrast-badge[data-variant="priority"][data-priority="urgent"] {
            background-color: #fda4af !important; /* rose-300 */
            color: #f43f5e !important;            /* rose-500 - bright rose */
            border-color: #fb7185 !important;     /* rose-400 */
          }
          .theme-light .contrast-badge[data-variant="priority"][data-priority="high"] {
            background-color: #fca5a5 !important; /* red-300 */
            color: #ef4444 !important;            /* red-500 - bright red */
            border-color: #f87171 !important;     /* red-400 */
          }
          .theme-light .contrast-badge[data-variant="priority"][data-priority="medium"] {
            background-color: #fdba74 !important; /* orange-300 */
            color: #ea580c !important;            /* orange-600 - bright orange */
            border-color: #fb923c !important;     /* orange-400 */
          }
          .theme-light .contrast-badge[data-variant="priority"][data-priority="low"],
          .theme-light .contrast-badge[data-variant="priority"][data-priority="normal"] {
            background-color: #7dd3fc !important; /* sky-300 */
            color: #0284c7 !important;            /* sky-600 - bright sky */
            border-color: #38bdf8 !important;     /* sky-400 */
          }

          /* Account types - bright colors */
          .theme-light .contrast-badge[data-variant="status"][data-status="prospect"] {
            background-color: #bfdbfe !important; /* blue-300 */
            color: #2563eb !important;            /* blue-600 */
            border-color: #60a5fa !important;     /* blue-400 */
          }
          .theme-light .contrast-badge[data-variant="status"][data-status="customer"] {
            background-color: #a7f3d0 !important; /* green-300 */
            color: #059669 !important;            /* green-600 */
            border-color: #34d399 !important;     /* green-400 */
          }
          .theme-light .contrast-badge[data-variant="status"][data-status="partner"] {
            background-color: #e9d5ff !important; /* purple-300 */
            color: #9333ea !important;            /* purple-600 */
            border-color: #c084fc !important;     /* purple-400 */
          }
          .theme-light .contrast-badge[data-variant="status"][data-status="competitor"] {
            background-color: #fca5a5 !important; /* red-300 */
            color: #dc2626 !important;            /* red-600 */
            border-color: #f87171 !important;     /* red-400 */
          }
          .theme-light .contrast-badge[data-variant="status"][data-status="vendor"] {
            background-color: #fde68a !important; /* amber-300 */
            color: #d97706 !important;            /* amber-600 */
            border-color: #fbbf24 !important;     /* amber-400 */
          }
          .theme-light .contrast-badge[data-variant="status"][data-status="inactive"] {
            background-color: #e2e8f0 !important; /* slate-300 */
            color: #475569 !important;            /* slate-600 */
            border-color: #cbd5e1 !important;     /* slate-400 */
          }

          /* Contact statuses - bright colors */
          .theme-light .contrast-badge[data-variant="status"][data-status="active"] {
            background-color: #a7f3d0 !important; /* green-300 */
            color: #059669 !important;            /* green-600 */
            border-color: #34d399 !important;     /* green-400 */
          }

          /* Activities Scheduled badge theme-specific colors */
          .theme-light .scheduled-badge {
            color: white !important;
          }

          .theme-dark .scheduled-badge {
            color: black !important;
          }

          /* Tabs active contrast already handled above */
          /* Prose in light mode */
          .theme-light .prose { color: #1f2937; }
          .theme-light .prose h1,
          .theme-light .prose h2,
          .theme-light .prose h3,
          .theme-light .prose h4 { color: #0f172a; }
          .theme-light .prose strong { color: #111827; }
          .theme-light .prose a { color: #2563eb; }
          .theme-light .prose code { color: #db2777; }

          /* NEW: Force documentation to dark text in light theme even if 'prose-invert' is present */
          .theme-light .prose.prose-invert,
          .theme-light .prose.prose-invert p,
          .theme-light .prose.prose-invert li,
          .theme-light .prose.prose-invert ins,
          .theme-light .prose.prose-invert del,
          .theme-light .prose.prose-invert ol,
          .theme-light .prose.prose-invert ul,
          .theme-light .prose.prose-invert blockquote {
            color: #1f2937 !important; /* slate-800/700 */
          }
          .theme-light .prose.prose-invert h1,
          .theme-light .prose.prose-invert h2,
          .theme-light .prose.prose-invert h3,
          .theme-light .prose.prose-invert h4,
          .theme-light .prose.prose-invert h5,
          .theme-light .prose.prose-invert h6 {
            color: #0f172a !important; /* slate-900 */
          }
          .theme-light .prose.prose-invert a {
            color: #2563eb !important;
          }
          .theme-light .prose.prose-invert code {
            color: #db2777 !important;
          }

          /* Light theme scrollbars */
          .theme-light * {
            scrollbar-color: #94a3b8 #e5e7eb;
          }
          .theme-light ::-webkit-scrollbar-track { background: #e5e7eb; }
          .theme-light ::-webkit-scrollbar-thumb { background: #94a3b8; border: 1px solid #cbd5e1; }
          .theme-light ::-webkit-scrollbar-thumb:hover { background: #64748b; }

          /* NEW: High-contrast active filter/tab highlights in light theme using tenant branding */
          .theme-light [role="tab"][data-state="active"] {
            background-color: var(--primary-color) !important;
            color: var(--on-primary-text) !important;
            border-color: var(--primary-color) !important;
          }
          .theme-light [role="tab"][data-state="active"] svg {
            color: var(--on-primary-text) !important;
            stroke: var(--on-primary-text) !important;
          }

          /* BRAND MAPPINGS — scope to the app root to avoid global button highlight issues */
          /* Previously these were applied globally to .brand-scope and bled into header chips.
             Now we scope strictly to elements inside the main content area. */

          /* Focus rings on interactive controls inside main content */
          .brand-scope main :is(button,a,[role="button"],input,select,textarea):focus,
          .brand-scope main :is(button,a,[role="button"],input,select,textarea):focus-visible {
            --tw-ring-color: var(--accent-color) !important;
            outline-color: var(--accent-color) !important;
          }

          /* Active/pressed state (Radix data-state=on) — only in main content */
          .brand-scope main :is(button,[role="tab"],[role="switch"],[role="button"])[data-state="on"] {
            background-color: var(--accent-color) !important;
            color: var(--on-accent-text) !important;
            border-color: color-mix(in srgb, var(--accent-color) 60%, transparent) !important;
          }
          .brand-scope main :is(button,[role="tab"],[role="switch"],[role="button"])[data-state="on"]:hover {
            background-color: color-mix(in srgb, var(--accent-color) 85%, black 15%) !important;
          }

          /* Map common primary button utility classes only within main content */
          .brand-scope main .bg-blue-600,
          .brand-scope main .bg-indigo-600 {
            background-color: var(--accent-color) !important;
            color: var(--on-accent-text) !important;
          }
          .brand-scope main .hover\\:bg-blue-700:hover,
          .brand-scope main .hover\\:bg-indigo-700:hover {
            background-color: color-mix(in srgb, var(--accent-color) 85%, black 15%) !important;
          }

          /* Limit blue text/link remapping to body content (avoid header chips) */
          .brand-scope main .text-blue-400,
          .brand-scope main .text-blue-500,
          .brand-scope main .text-blue-600,
          .brand-scope main .text-blue-700 {
            color: var(--primary-color) !important;
          }
          .brand-scope main .hover\\:text-blue-500:hover,
          .brand-scope main .hover\\:text-blue-600:hover,
          .brand-scope main .hover\\:text-blue-700:hover {
            color: color-mix(in srgb, var(--primary-color) 85%, black 15%) !important;
          }
          .brand-scope main .border-blue-400,
          .brand-scope main .border-blue-500,
          .brand-scope main .border-blue-600,
          .brand-scope main .border-blue-700 {
            border-color: var(--primary-color) !important;
          }

          /* Tabs active styling (filters etc.) — only in main content */
          .brand-scope main [role="tab"][data-state="active"],
          .brand-scope main [role="tab"][data-state="on"] {
            background-color: var(--accent-color) !important;
            color: var(--on-accent-text) !important;
            border-color: var(--accent-color) !important;
          }
          .brand-scope main [role="tab"][data-state="active"] svg,
          .brand-scope main [role="tab"][data-state="on"] svg {
            color: var(--on-accent-text) !important;
            stroke: var(--on-accent-text) !important;
          }

          /* Keep phone/email link colorization (content only) */
          .brand-scope main a[href^="mailto:"],
          .brand-scope main a[href^="tel:"],
          .brand-scope main .crm-contact-link {
            color: #2563eb !important; /* blue-600 */
          }
          .brand-scope main a[href^="mailto:"]:hover,
          .brand-scope main a[href^="tel:"]:hover,
          .brand-scope main .crm-contact-link:hover {
            color: #1d4ed8 !important; /* blue-700 */
            text-decoration: underline !important;
          }

          /* LIGHT THEME: AI Market Insights Card - Force light background and dark text */
          .theme-light [class*="AIMarketInsights"] .bg-slate-800,
          .theme-light .bg-slate-800.border-slate-700 {
            background-color: #ffffff !important;
          }
          
          .theme-light .bg-slate-700\\/50 {
            background-color: #f8fafc !important; /* slate-50 for header */
          }
          
          .theme-light .border-slate-700,
          .theme-light .border-slate-600 {
            border-color: #e2e8f0 !important; /* slate-200 */
          }
          
          .theme-light .text-slate-100,
          .theme-light .text-slate-200,
          .theme-light .text-slate-300 {
            color: #0f172a !important; /* slate-900 for dark text */
          }
          
          .theme-light .text-slate-400 {
            color: #475569 !important; /* slate-600 */
          }
        `}
      </style>
      <style>
        {`
        /* Avatar launcher offset: move it away from the phone widget on the far right */
        #ai-avatar-launcher {
          right: 96px !important;  /* was 168px */
          bottom: 16px !important;
        }

        /* On small screens, keep it near the edge to preserve space */
        @media (max-width: 640px) {
          #ai-avatar-launcher {
            right: 16px !important;
          }
        }
      `}
      </style>
      {/* Environment Banner - Shows dev/staging indicators */}
      <EnvironmentBanner />
      {/* Always-visible effective tenant badge in the top-right */}
      <EffectiveClientBadge />
      {/* Light Theme Alert Background Lightening Styles */}
      <style>
        {`
        /* Lighten green alert backgrounds for better text readability - LIGHT THEME ONLY */
        .theme-light .bg-green-900\\/20,
        .theme-light .bg-green-900\\/30 {
          background-color: rgb(240 253 244) !important; /* green-50 */
        }
        
        /* Lighten blue alert backgrounds for better text readability - LIGHT THEME ONLY */
        .theme-light .bg-blue-900\\/20,
        .theme-light .bg-blue-900\\/30 {
          background-color: rgb(239 246 255) !important; /* blue-50 */
        }
        
        /* Lighten yellow/amber alert backgrounds - LIGHT THEME ONLY */
        .theme-light .bg-yellow-900\\/20,
        .theme-light .bg-yellow-900\\/30,
        .theme-light .bg-amber-900\\/20,
        .theme-light .bg-amber-900\\/30 {
          background-color: rgb(254 252 232) !important; /* yellow-50 */
        }
        
        /* Lighten red alert backgrounds - LIGHT THEME ONLY */
        .theme-light .bg-red-900\\/20,
        .theme-light .bg-red-900\\/30 {
          background-color: rgb(254 242 242) !important; /* red-50 */
        }
        
        /* Ensure text in these alerts is dark enough - LIGHT THEME ONLY */
        .theme-light [class*="bg-green-900"] .text-green-300,
        .theme-light [class*="bg-blue-900"] .text-blue-300,
        .theme-light [class*="bg-yellow-900"] .text-yellow-300,
        .theme-light [class*="bg-amber-900"] .text-amber-300,
        .theme-light [class*="bg-red-900"] .text-red-300 {
          color: rgb(21 128 61) !important; /* green-700 for green alerts */
        }
        
        .theme-light [class*="bg-blue-900"] .text-blue-300 {
          color: rgb(29 78 216) !important; /* blue-700 */
        }
        
        .theme-light [class*="bg-yellow-900"] .text-yellow-300,
        .theme-light [class*="bg-amber-900"] .text-amber-300 {
          color: rgb(161 98 7) !important; /* yellow-700 */
        }
        
        .theme-light [class*="bg-red-900"] .text-red-300 {
          color: rgb(185 28 28) !important; /* red-700 */
        }
      `}
      </style>

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
          <SheetContent
            side="left"
            className="w-64 p-0 bg-slate-900 border-slate-800"
          >
            <SidebarContent onNavClick={() => setIsSidebarOpen(false)} />
          </SheetContent>
        </Sheet>
        <div className="font-bold text-lg text-slate-100">{companyName}</div>
        <UserNav
          user={user}
          handleLogout={handleLogout}
          createPageUrl={createPageUrl}
        />
      </div>

      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-50 lg:block lg:w-64 lg:overflow-y-auto lg:border-r lg:border-slate-800">
        <SidebarContent />
      </aside>

      <div className="lg:pl-64">
        <header data-testid="app-header" className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-x-4 border-b border-slate-800 bg-slate-900 px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:px-8">
          {/* Removed AI Command brain button */}
          {/* THEME TOGGLE BUTTON */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleTheme}
                  className="text-slate-400 hover:text-slate-300 hover:bg-slate-800"
                  aria-label={theme === "dark"
                    ? "Switch to light mode"
                    : "Switch to dark mode"}
                >
                  {theme === "dark"
                    ? <Sun className="w-5 h-5" />
                    : <Moon className="w-5 h-5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent className="bg-slate-800 border-slate-700 text-slate-200">
                <p>{theme === "dark" ? "Light mode" : "Dark mode"}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <div className="flex flex-1 items-center justify-end gap-3 lg:gap-4">
            <div className="flex max-w-[520px] items-center justify-center gap-2 rounded-2xl border border-white/10 bg-slate-900/70 px-2.5 py-1 shadow-inner shadow-slate-950/30">
              <AiAssistantLauncher
                isOpen={isAiSidebarOpen}
                onToggle={handleAssistantLauncherClick}
                isRealtimeActive={Boolean(isRealtimeSidebarMode)}
                realtimeModuleEnabled={realtimeVoiceModuleEnabled}
              />
              {/* Only superadmins can switch tenants - admins are locked to their assigned tenant */}
              {user?.role === "superadmin" && (
                <div className="flex items-center">
                  <TenantSwitcher user={user} />
                </div>
              )}

              {showEmployeeScope && (
                <div className="flex items-center">
                  <EmployeeScopeFilter
                    user={user}
                    selectedTenantId={selectedTenantId}
                  />
                </div>
              )}
            </div>

            {/* AI Suggestions Badge - Phase 3 Autonomous Operations */}
            {showNotificationsWidget && selectedTenantId ? (
              <SuggestionBadge tenantId={selectedTenantId} />
            ) : null}

            {/* DEFERRED: mount notifications after initial load to reduce rate-limit hits */}
            {showNotificationsWidget ? <NotificationPanel user={user} /> : null}
            <div
              className="hidden lg:block lg:h-6 lg:w-px lg:bg-slate-700"
              aria-hidden="true"
            />
            <UserNav
              user={user}
              handleLogout={handleLogout}
              createPageUrl={createPageUrl}
            />
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
      {
        /* <ChatWindow
        widgetContext={widgetContext}
        elevenlabsApiKey={elevenLabsApiKey}
        elevenlabsAgentId={elevenlabsAgentId}
      /> */
      }

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
  return (
    <EntityLabelsProvider tenantId={tenantId}>
      {children}
    </EntityLabelsProvider>
  );
}

export default function LayoutWrapper({ children, currentPageName }) {
  // Disable loading of ElevenLabs ConvAI script (brain widget)
  React.useEffect(() => {
    // Brain widget removed — no external script injection needed.
    return () => {};
  }, []);

  return (
    <ErrorLogProvider>
      <QueryClientProvider client={queryClient}>
        <ApiOptimizerProvider>
          <TenantProvider>
            <EntityLabelsWrapper>
              <ApiProvider>
                <TimezoneProvider>
                  <EmployeeScopeProvider>
                    <LoggerProvider>
                      <AiSidebarProvider>
                        <Layout currentPageName={currentPageName}>
                          {children}
                        </Layout>
                      </AiSidebarProvider>
                    </LoggerProvider>
                  </EmployeeScopeProvider>
                </TimezoneProvider>
              </ApiProvider>
            </EntityLabelsWrapper>
          </TenantProvider>
        </ApiOptimizerProvider>
      </QueryClientProvider>
    </ErrorLogProvider>
  );
}
