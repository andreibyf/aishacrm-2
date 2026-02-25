import { useState, useEffect, useCallback, lazy, Suspense, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BACKEND_URL } from '@/api/entities';
import {
  Cog, // Renamed from Settings to avoid conflict
  Loader2,
  Database,
  User,
  Shield,
  Users,
  Building2,
  Plug,
  Activity,
  TestTube2, // Already imported
  Lock,

  // New icons from outline's tabs array:
  Palette,
  LayoutGrid,
  Puzzle,
  Clock,
  Key,
  Trash2,
  FileText, // Added for System Logs
  ExternalLink, // Added for External Tools
  BookOpen, // Added for API Documentation
  Brain, // Added for LLM Activity Monitor
  GitBranch, // Added for Braid SDK Monitor
  Tags, // Added for Entity Labels
  Search,
  ChevronRight,

  // Icons for components not in outline's tabs array but preserved:
  Globe, // for TimezoneSettings (Regional Settings)
  CreditCard, // for BillingSettings
  Megaphone, // for SystemAnnouncements
  Bug, // for TestDataManager
  RefreshCw, // for SyncHealthMonitor
  Server, // for MCPServerMonitor
  Zap, // for CareSettings
} from 'lucide-react';
import { User as UserEntity } from '@/api/entities';
import { useTenant } from '@/components/shared/tenantContext';

// Lazy loading wrapper for settings sub-components
const SettingsLoader = ({ children }) => (
  <Suspense
    fallback={
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading...</span>
      </div>
    }
  >
    {children}
  </Suspense>
);

// User & Profile - lazy loaded
const UserInfo = lazy(() => import('../components/settings/UserInfo'));
const BrandingSettings = lazy(() => import('../components/settings/BrandingSettings'));
const TimezoneSettings = lazy(() => import('../components/settings/TimezoneSettings'));

// Access & Security - lazy loaded
const SecuritySettings = lazy(() => import('../components/settings/SecuritySettings'));
const ApiKeyManager = lazy(() => import('../components/settings/ApiKeyManager'));
const RateLimitManager = lazy(() => import('../components/settings/RateLimitManager'));

// Team Management - lazy loaded
const EnhancedUserManagement = lazy(() => import('../components/settings/EnhancedUserManagement'));

// Client Management - lazy loaded
const TenantManagement = lazy(() => import('../components/settings/TenantManagement'));
const ClientOffboarding = lazy(() => import('../components/settings/ClientOffboarding'));

// Integrations & API - lazy loaded
const IntegrationSettings = lazy(() => import('../components/settings/IntegrationSettings'));
const TenantIntegrationSettings = lazy(
  () => import('../components/settings/TenantIntegrationSettings'),
);

// System Configuration - lazy loaded
const ModuleManager = lazy(() => import('../components/shared/ModuleManager'));
const EntityLabelsManager = lazy(() => import('../components/settings/EntityLabelsManager'));
const StatusCardsManager = lazy(() => import('../components/settings/StatusCardsManager'));
const BillingSettings = lazy(() => import('../components/settings/BillingSettings'));
const CronJobManager = lazy(() => import('../components/settings/CronJobManager'));
const SystemAnnouncements = lazy(() => import('../components/settings/SystemAnnouncements'));
const SystemLogsViewer = lazy(() => import('../components/settings/SystemLogsViewer'));
const ApiHealthDashboard = lazy(() => import('../components/settings/ApiHealthDashboard'));

// Data Management - lazy loaded
const DataConsistencyManager = lazy(() => import('../components/settings/DataConsistencyManager'));
const TestDataManager = lazy(() => import('../components/settings/TestDataManager'));

// Monitoring & Health - lazy loaded
const InternalPerformanceDashboard = lazy(
  () => import('../components/settings/InternalPerformanceDashboard'),
);
const SyncHealthMonitor = lazy(() => import('../components/settings/SyncHealthMonitor'));
const SecurityMonitor = lazy(() => import('../components/settings/SecurityMonitor'));
const PerformanceMonitor = lazy(() => import('../components/settings/PerformanceMonitor'));
const SystemHealthDashboard = lazy(() => import('../components/settings/SystemHealthDashboard'));
const QaConsole = lazy(() => import('../components/settings/QaConsole'));
const TenantResolveCacheMonitor = lazy(
  () => import('../components/settings/TenantResolveCacheMonitor'),
);
const LLMActivityMonitor = lazy(() => import('../components/settings/LLMActivityMonitor'));
const BraidSDKMonitor = lazy(() => import('../components/settings/BraidSDKMonitor'));
const AiSettings = lazy(() => import('../components/settings/AiSettings'));
const CareSettings = lazy(() => import('../components/settings/CareSettings'));
const McpAdmin = lazy(() => import('./McpAdmin'));

export default function SettingsPage() {
  // Renamed from Settings to SettingsPage as per outline
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(null); // null = show menu, string = show specific setting
  // Use global tenant context instead of local state — prevents cascading loadUser re-renders
  const { selectedTenantId } = useTenant();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(null);

  const loadUser = useCallback(async () => {
    try {
      const user = await UserEntity.me();
      setCurrentUser(user);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error loading user:', error);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab && tab !== 'menu') {
      setActiveTab(tab);
    }
  }, []);

  // Compute role flags (safe even if currentUser is null)
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'superadmin';
  const isManager = currentUser?.role === 'manager';
  const isSuperadmin = currentUser?.role === 'superadmin';

  // Debug logging for MCP Admin
  console.log('[Settings] User role check:', {
    role: currentUser?.role,
    email: currentUser?.email,
    isAdmin,
    isManager,
    isSuperadmin,
  });

  // Categories for grouping settings cards
  const CATEGORIES = useMemo(
    () => ({
      account: { label: 'Account', color: 'blue', icon: User },
      team: { label: 'Team', color: 'green', icon: Users },
      clients: { label: 'Clients', color: 'indigo', icon: Building2 },
      integrations: { label: 'Integrations', color: 'orange', icon: Plug },
      system: { label: 'System', color: 'slate', icon: LayoutGrid },
      data: { label: 'Data', color: 'cyan', icon: Database },
      monitoring: { label: 'Monitoring', color: 'emerald', icon: Activity },
      security: { label: 'Security', color: 'purple', icon: Shield },
      testing: { label: 'Testing', color: 'blue', icon: TestTube2 },
    }),
    [],
  );

  // Define all settings items with categories
  const settingsItems = useMemo(() => {
    const items = [
      // Account - everyone
      {
        id: 'profile',
        label: 'My Profile',
        description: 'Update your profile details and preferences',
        icon: User,
        category: 'account',
        roles: ['any'],
      },
      {
        id: 'branding',
        label: 'Branding',
        description: 'Customize visual identity and themes',
        icon: Palette,
        category: 'account',
        roles: ['any'],
      },
      {
        id: 'regional',
        label: 'Regional',
        description: 'Timezone and date format settings',
        icon: Globe,
        category: 'account',
        roles: ['any'],
      },
      {
        id: 'billing',
        label: 'Billing',
        description: 'Subscription plan and payment settings',
        icon: CreditCard,
        category: 'account',
        roles: ['any'],
      },
    ];

    // Tenant Admin items
    if (isAdmin && !isSuperadmin) {
      items.push(
        {
          id: 'users',
          label: 'User Management',
          description: 'Invite and manage team members',
          icon: Users,
          category: 'team',
          roles: ['admin'],
        },
        {
          id: 'tenant-integrations',
          label: 'Client Integrations',
          description: 'Configure Gmail SMTP, webhooks, and other integrations',
          icon: Puzzle,
          category: 'integrations',
          roles: ['admin'],
        },
        {
          id: 'entity-labels',
          label: 'Entity Labels',
          description: 'Customize terminology for your organization',
          icon: Tags,
          category: 'system',
          roles: ['admin'],
        },
        {
          id: 'status-cards',
          label: 'Status Cards',
          description: 'Customize status card visibility',
          icon: LayoutGrid,
          category: 'system',
          roles: ['admin'],
        },
      );
    }

    // Manager items
    if (isManager && !isAdmin) {
      items.push(
        {
          id: 'tenant-integrations',
          label: 'Client Integrations',
          description: 'Configure Gmail SMTP, webhooks, and other integrations',
          icon: Puzzle,
          category: 'integrations',
          roles: ['manager'],
        },
        {
          id: 'data-consistency',
          label: 'Data Consistency',
          description: 'Check and fix data integrity issues',
          icon: Database,
          category: 'data',
          roles: ['manager'],
        },
      );
    }

    // Superadmin items
    if (isSuperadmin) {
      items.push(
        // Team
        {
          id: 'users',
          label: 'User Management',
          description: 'Invite and manage all users',
          icon: Users,
          category: 'team',
          roles: ['superadmin'],
        },

        // Clients
        {
          id: 'tenants',
          label: 'Client Management',
          description: 'Manage client tenants and configurations',
          icon: Building2,
          category: 'clients',
          roles: ['superadmin'],
        },
        {
          id: 'offboarding',
          label: 'Client Offboarding',
          description: 'Permanently remove client data',
          icon: Trash2,
          category: 'clients',
          roles: ['superadmin'],
        },

        // Integrations
        {
          id: 'global-integrations',
          label: 'Global Integrations',
          description: 'Configure system-wide integrations',
          icon: Plug,
          category: 'integrations',
          roles: ['superadmin'],
        },
        {
          id: 'tenant-integrations',
          label: 'Tenant Integrations',
          description: 'Per-tenant integration settings',
          icon: Puzzle,
          category: 'integrations',
          roles: ['superadmin'],
        },
        {
          id: 'api-docs',
          label: 'API Documentation',
          description: 'API reference and examples',
          icon: BookOpen,
          category: 'integrations',
          roles: ['superadmin'],
        },
        {
          id: 'external-tools',
          label: 'External Tools',
          description: 'Links to third-party dashboards',
          icon: ExternalLink,
          category: 'integrations',
          roles: ['superadmin'],
        },
        {
          id: 'care-settings',
          label: 'CARE Workflows',
          description: 'Configure AI-driven customer care triggers',
          icon: Zap,
          category: 'integrations',
          roles: ['superadmin'],
        },

        // System
        {
          id: 'modules',
          label: 'Module Settings',
          description: 'Enable or disable CRM modules',
          icon: LayoutGrid,
          category: 'system',
          roles: ['superadmin'],
        },
        {
          id: 'entity-labels',
          label: 'Entity Labels',
          description: 'Customize terminology per tenant',
          icon: Tags,
          category: 'system',
          roles: ['superadmin', 'admin'],
        },
        {
          id: 'status-cards',
          label: 'Status Cards',
          description: 'Customize and manage status card visibility',
          icon: LayoutGrid,
          category: 'system',
          roles: ['superadmin', 'admin'],
        },
        {
          id: 'cron',
          label: 'Cron Jobs',
          description: 'Scheduled background tasks',
          icon: Clock,
          category: 'system',
          roles: ['superadmin'],
        },
        {
          id: 'announcements',
          label: 'Announcements',
          description: 'System-wide notifications',
          icon: Megaphone,
          category: 'system',
          roles: ['superadmin'],
        },

        // Security
        {
          id: 'security',
          label: 'Auth & Access',
          description: 'Authentication and access policies',
          icon: Lock,
          category: 'security',
          roles: ['superadmin'],
        },
        {
          id: 'apikeys',
          label: 'API Keys',
          description: 'Manage API authentication keys',
          icon: Key,
          category: 'security',
          roles: ['superadmin'],
        },
        {
          id: 'rate-limits',
          label: 'Rate Limits',
          description: 'Configure API rate limiting',
          icon: Lock,
          category: 'security',
          roles: ['superadmin'],
        },
        {
          id: 'security-monitor',
          label: 'Intrusion Detection',
          description: 'Monitor for security threats',
          icon: Shield,
          category: 'security',
          roles: ['superadmin'],
        },

        // Data
        {
          id: 'data-consistency',
          label: 'Data Consistency',
          description: 'Check and fix data integrity',
          icon: Database,
          category: 'data',
          roles: ['superadmin'],
        },
        {
          id: 'test-data',
          label: 'Test Data',
          description: 'Manage test data and cleanup',
          icon: Bug,
          category: 'data',
          roles: ['superadmin'],
        },

        // Monitoring
        {
          id: 'performance',
          label: 'Performance',
          description: 'System performance metrics',
          icon: Activity,
          category: 'monitoring',
          roles: ['superadmin'],
        },
        {
          id: 'cache-monitor',
          label: 'Cache Monitor',
          description: 'Tenant cache statistics',
          icon: Database,
          category: 'monitoring',
          roles: ['superadmin'],
        },
        {
          id: 'llm-monitor',
          label: 'LLM Monitor',
          description: 'AI model usage and costs',
          icon: Brain,
          category: 'monitoring',
          roles: ['superadmin'],
        },
        {
          id: 'ai-settings',
          label: 'AI Settings',
          description: 'Configure AI behavior and parameters',
          icon: Brain,
          category: 'monitoring',
          roles: ['superadmin'],
        },
        {
          id: 'braid-monitor',
          label: 'AI Tools Monitor',
          description: 'Tool metrics and dependency graph',
          icon: GitBranch,
          category: 'monitoring',
          roles: ['superadmin'],
        },
        {
          id: 'sync-health',
          label: 'Sync Health',
          description: 'Data synchronization status',
          icon: RefreshCw,
          category: 'monitoring',
          roles: ['superadmin'],
        },
        {
          id: 'mcp-monitor',
          label: 'MCP Admin',
          description: 'MCP server health, memory, queue, and adapters',
          icon: Server,
          category: 'monitoring',
          roles: ['superadmin'],
        },
        {
          id: 'system-health',
          label: 'System Health',
          description: 'Overall system status',
          icon: Activity,
          category: 'monitoring',
          roles: ['superadmin'],
        },
        {
          id: 'system-logs',
          label: 'System Logs',
          description: 'Application logs and errors',
          icon: FileText,
          category: 'monitoring',
          roles: ['superadmin'],
        },
        {
          id: 'api-health',
          label: 'API Health',
          description: 'Backend endpoint status',
          icon: Activity,
          category: 'monitoring',
          roles: ['superadmin'],
        },

        // Testing
        {
          id: 'unit-tests',
          label: 'Unit Tests',
          description: 'Run and view test results',
          icon: TestTube2,
          category: 'testing',
          roles: ['superadmin'],
        },
        {
          id: 'qa-console',
          label: 'QA Console',
          description: 'Quality assurance tools',
          icon: TestTube2,
          category: 'testing',
          roles: ['superadmin'],
        },
      );
    }

    return items;
  }, [isAdmin, isManager, isSuperadmin]);

  // Get available categories based on current items
  const availableCategories = useMemo(() => {
    const cats = new Set(settingsItems.map((item) => item.category));
    return Object.entries(CATEGORIES).filter(([key]) => cats.has(key));
  }, [settingsItems, CATEGORIES]);

  // Filter items based on search and category
  const filteredItems = useMemo(() => {
    return settingsItems.filter((item) => {
      const matchesSearch =
        !searchTerm ||
        item.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.description.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = !selectedCategory || item.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [settingsItems, searchTerm, selectedCategory]);

  // Group filtered items by category
  const groupedItems = useMemo(() => {
    const groups = {};
    filteredItems.forEach((item) => {
      if (!groups[item.category]) {
        groups[item.category] = [];
      }
      groups[item.category].push(item);
    });
    return groups;
  }, [filteredItems]);

  // Loading check - AFTER all hooks are defined
  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4 lg:p-8">
        <div className="flex items-center justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
          <span className="ml-3 text-muted-foreground">Loading settings...</span>
        </div>
      </div>
    );
  }

  const getColorClasses = (color) => {
    const colors = {
      blue: 'bg-blue-500/10 border-blue-500/30 hover:border-blue-500/50 text-blue-400',
      purple: 'bg-purple-500/10 border-purple-500/30 hover:border-purple-500/50 text-purple-400',
      green: 'bg-green-500/10 border-green-500/30 hover:border-green-500/50 text-green-400',
      indigo: 'bg-indigo-500/10 border-indigo-500/30 hover:border-indigo-500/50 text-indigo-400',
      orange: 'bg-orange-500/10 border-orange-500/30 hover:border-orange-500/50 text-orange-400',
      slate: 'bg-slate-500/10 border-slate-500/30 hover:border-slate-500/50 text-slate-400',
      cyan: 'bg-cyan-500/10 border-cyan-500/30 hover:border-cyan-500/50 text-cyan-400',
      emerald:
        'bg-emerald-500/10 border-emerald-500/30 hover:border-emerald-500/50 text-emerald-400',
      red: 'bg-red-500/10 border-red-500/30 hover:border-red-500/50 text-red-400',
      yellow: 'bg-yellow-500/10 border-yellow-500/30 hover:border-yellow-500/50 text-yellow-400',
    };
    return colors[color] || colors.slate;
  };

  const getCategoryBadgeClasses = (color, isSelected) => {
    const baseClasses = 'cursor-pointer transition-all';
    if (isSelected) {
      const selectedColors = {
        blue: 'bg-blue-600 text-white hover:bg-blue-700',
        purple: 'bg-purple-600 text-white hover:bg-purple-700',
        green: 'bg-green-600 text-white hover:bg-green-700',
        indigo: 'bg-indigo-600 text-white hover:bg-indigo-700',
        orange: 'bg-orange-600 text-white hover:bg-orange-700',
        slate: 'bg-slate-600 text-white hover:bg-slate-700',
        cyan: 'bg-cyan-600 text-white hover:bg-cyan-700',
        emerald: 'bg-emerald-600 text-white hover:bg-emerald-700',
        red: 'bg-red-600 text-white hover:bg-red-700',
      };
      return `${baseClasses} ${selectedColors[color] || selectedColors.slate}`;
    }
    return `${baseClasses} bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground`;
  };

  // If a setting is selected, show its content
  if (activeTab && activeTab !== 'menu') {
    const activeItem = settingsItems.find((item) => item.id === activeTab);

    return (
      <div className="space-y-6">
        {/* Breadcrumb navigation */}
        <nav className="flex items-center gap-2 text-sm">
          <button
            onClick={() => setActiveTab(null)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Settings
          </button>
          {activeItem?.category && CATEGORIES[activeItem.category] && (
            <>
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />
              <span className="text-muted-foreground">{CATEGORIES[activeItem.category].label}</span>
            </>
          )}
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />
          <span className="text-foreground font-medium">{activeItem?.label || 'Settings'}</span>
        </nav>

        {/* Header */}
        <div className="flex items-center gap-3">
          {activeItem && (
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center ${getColorClasses(CATEGORIES[activeItem.category]?.color)}`}
            >
              <activeItem.icon className="w-5 h-5" />
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {activeItem?.label || 'Settings'}
            </h1>
            <p className="text-muted-foreground text-sm">{activeItem?.description}</p>
          </div>
        </div>

        {/* Settings Content */}
        <SettingsLoader>
          <div className="space-y-6">
            {/* User & Profile */}
            {activeTab === 'profile' && (
              <Card>
                <CardHeader>
                  <CardTitle>Personal Information</CardTitle>
                  <CardDescription>Update your profile details and preferences</CardDescription>
                </CardHeader>
                <CardContent>
                  <UserInfo user={currentUser} onUpdate={loadUser} />
                </CardContent>
              </Card>
            )}

            {activeTab === 'branding' && (
              <Card>
                <CardHeader>
                  <CardTitle>Branding & Appearance</CardTitle>
                  <CardDescription>
                    Customize your organization&apos;s visual identity
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <BrandingSettings user={currentUser} onUpdate={loadUser} />
                </CardContent>
              </Card>
            )}

            {activeTab === 'regional' && ( // New tab content
              <Card>
                <CardHeader>
                  <CardTitle>Regional Settings</CardTitle>
                  <CardDescription>Configure timezone and date formats</CardDescription>
                </CardHeader>
                <CardContent>
                  <TimezoneSettings user={currentUser} onUpdate={loadUser} />
                </CardContent>
              </Card>
            )}

            {activeTab === 'billing' && ( // New tab content
              <Card>
                <CardHeader>
                  <CardTitle>Billing & Subscription</CardTitle>
                  <CardDescription>
                    Manage your subscription plan and payment settings
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <BillingSettings />
                </CardContent>
              </Card>
            )}

            {/* Team Management */}
            {activeTab === 'users' && isAdmin && (
              <Card>
                <CardHeader>
                  <CardTitle>User Management</CardTitle>
                  <CardDescription>
                    Invite, manage, and configure team member access
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <EnhancedUserManagement />
                </CardContent>
              </Card>
            )}

            {/* Access & Security */}
            {activeTab === 'security' && isAdmin && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="w-5 h-5 text-orange-400" />
                    Security & Authentication
                  </CardTitle>
                  <CardDescription>
                    Review endpoint protection and authentication methods
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <SecuritySettings user={currentUser} />
                </CardContent>
              </Card>
            )}

            {activeTab === 'apikeys' &&
              isAdmin && ( // Adjusted to isAdmin as per original code
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Key className="w-5 h-5 text-green-400" />
                      API Security & Keys
                    </CardTitle>
                    <CardDescription>
                      Manage API keys for external integrations and webhook access
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ApiKeyManager />
                  </CardContent>
                </Card>
              )}

            {/* Client Management (Admin) */}
            {activeTab === 'tenants' && isAdmin && (
              <Card>
                <CardHeader>
                  <CardTitle>Tenant Administration</CardTitle>
                  <CardDescription>
                    Manage client organizations, branding, and configurations
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <TenantManagement />
                </CardContent>
              </Card>
            )}

            {/* Integrations & Webhooks */}
            {activeTab === 'global-integrations' &&
              (isAdmin || isManager) && ( // New tab content
                <Card>
                  <CardHeader>
                    <CardTitle>System Integrations</CardTitle>
                    <CardDescription>
                      Connect external services, APIs, and automation platforms
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <IntegrationSettings user={currentUser} />
                  </CardContent>
                </Card>
              )}

            {activeTab === 'tenant-integrations' &&
              (isAdmin || isManager) && ( // Tab from outline mapping to TenantIntegrationSettings
                <Card>
                  <CardHeader>
                    <CardTitle>Tenant-Specific Integrations</CardTitle>
                    <CardDescription>
                      Configure client-specific integration settings
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <TenantIntegrationSettings />
                  </CardContent>
                </Card>
              )}

            {activeTab === 'care-settings' && isSuperadmin && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="w-5 h-5 text-yellow-400" />
                    CARE Workflow Overview
                  </CardTitle>
                  <CardDescription>
                    View CARE workflows and their tenant configurations
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <CareSettings isSuperadmin={isSuperadmin} />
                </CardContent>
              </Card>
            )}

            {activeTab === 'api-docs' && (isAdmin || isManager) && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-blue-400" />
                    API Documentation
                  </CardTitle>
                  <CardDescription>
                    Interactive Swagger documentation for all 197 backend API endpoints
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-4">
                      <p className="text-sm text-blue-300 mb-2">
                        <strong>Full API documentation available at:</strong>
                      </p>
                      <a
                        href={`${BACKEND_URL}/api-docs`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 underline flex items-center gap-2"
                      >
                        {BACKEND_URL}/api-docs
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                    <iframe
                      src={`${BACKEND_URL}/api-docs`}
                      className="w-full border-0 rounded-lg bg-white"
                      style={{ height: '800px' }}
                      title="API Documentation"
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* System Configuration */}
            {activeTab === 'modules' && isAdmin && (
              <Card>
                <CardHeader>
                  <CardTitle>Feature Modules</CardTitle>
                  <CardDescription>Enable or disable CRM modules and features</CardDescription>
                </CardHeader>
                <CardContent>
                  <ModuleManager />
                </CardContent>
              </Card>
            )}

            {activeTab === 'entity-labels' && isAdmin && (
              <SettingsLoader>
                <EntityLabelsManager isTenantAdmin={!isSuperadmin} />
              </SettingsLoader>
            )}

            {activeTab === 'status-cards' && isAdmin && (
              <SettingsLoader>
                <StatusCardsManager />
              </SettingsLoader>
            )}

            {activeTab === 'cron' && isAdmin && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Clock className="w-5 h-5 text-yellow-400" />
                      Automated Tasks (Cron Jobs)
                    </CardTitle>
                    <CardDescription>
                      Manage scheduled background tasks and automation
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <CronJobManager user={currentUser} />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>System Initialization</CardTitle>
                    <CardDescription>
                      Initialize system-level components and scheduled tasks
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button
                      onClick={async () => {
                        try {
                          const { createInitialCronJobs } = await import('@/api/functions');
                          const response = await createInitialCronJobs();
                          if (import.meta.env.DEV) {
                            console.log('Cron jobs initialization result:', response);
                          }
                          alert('System cron jobs initialized successfully!');
                        } catch (error) {
                          if (import.meta.env.DEV) {
                            console.error('Failed to initialize cron jobs:', error);
                          }
                          alert('Failed to initialize cron jobs: ' + error.message);
                        }
                      }}
                      variant="outline"
                    >
                      Initialize System Cron Jobs
                    </Button>
                    <p className="text-xs text-muted-foreground mt-2">
                      This will create the master cron job runner that processes all scheduled
                      tasks.
                    </p>
                  </CardContent>
                </Card>
              </>
            )}

            {activeTab === 'announcements' &&
              isAdmin && ( // New tab content
                <Card>
                  <CardHeader>
                    <CardTitle>System Announcements</CardTitle>
                    <CardDescription>
                      Create and manage system-wide notifications for users
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <SystemAnnouncements />
                  </CardContent>
                </Card>
              )}

            {/* Data Management */}
            {activeTab === 'data-consistency' &&
              (isAdmin || isManager) && ( // New tab content
                <Card>
                  <CardHeader>
                    <CardTitle>Data Consistency Manager</CardTitle>
                    <CardDescription>
                      Identify and resolve referential integrity issues
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <DataConsistencyManager />
                  </CardContent>
                </Card>
              )}

            {activeTab === 'test-data' &&
              (isAdmin || isManager) && ( // New tab content
                <Card>
                  <CardHeader>
                    <CardTitle>Test Data Management</CardTitle>
                    <CardDescription>Clean up test records and development data</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <TestDataManager />
                  </CardContent>
                </Card>
              )}

            {/* Monitoring & Health */}
            {activeTab === 'performance' && isAdmin && (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Performance Dashboard</CardTitle>
                    <CardDescription>
                      Monitor API response times, error rates, and system health
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Tabs defaultValue="overview" className="w-full">
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="overview">Overview & Metrics</TabsTrigger>
                        <TabsTrigger value="realtime">Real-Time Charts</TabsTrigger>
                      </TabsList>
                      <TabsContent value="overview" className="mt-6">
                        <InternalPerformanceDashboard user={currentUser} />
                      </TabsContent>
                      <TabsContent value="realtime" className="mt-6">
                        <PerformanceMonitor user={currentUser} />
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>
              </div>
            )}

            {activeTab === 'cache-monitor' && isAdmin && (
              <Card>
                <CardHeader>
                  <CardTitle>Tenant Resolve Cache Monitor</CardTitle>
                  <CardDescription>
                    Monitor cache performance and hit ratios for tenant identity resolution
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <TenantResolveCacheMonitor />
                </CardContent>
              </Card>
            )}

            {activeTab === 'sync-health' &&
              isAdmin && ( // New tab content
                <Card>
                  <CardHeader>
                    <CardTitle>Data Sync Health</CardTitle>
                    <CardDescription>
                      Monitor automated sync jobs and data consistency
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <SyncHealthMonitor tenantId={selectedTenantId} />
                  </CardContent>
                </Card>
              )}

            {activeTab === 'mcp-monitor' &&
              isSuperadmin && ( // MCP Admin - superadmin only
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Server className="w-5 h-5 text-blue-400" />
                      MCP Server Administration
                    </CardTitle>
                    <CardDescription>
                      Comprehensive MCP server health, memory, queue stats, and registered adapters
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <SettingsLoader>
                      <McpAdmin />
                    </SettingsLoader>
                  </CardContent>
                </Card>
              )}

            {activeTab === 'llm-monitor' && isAdmin && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Brain className="w-5 h-5 text-purple-400" />
                    LLM Activity Monitor
                  </CardTitle>
                  <CardDescription>
                    Real-time view of all LLM calls: tenant, capability, provider, model, node ID,
                    duration, tokens
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <LLMActivityMonitor />
                </CardContent>
              </Card>
            )}

            {activeTab === 'ai-settings' && isSuperadmin && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Brain className="w-5 h-5 text-blue-400" />
                    AI Settings
                  </CardTitle>
                  <CardDescription>
                    Configure AI behavior, context limits, temperature, and other parameters
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <AiSettings />
                </CardContent>
              </Card>
            )}

            {activeTab === 'braid-monitor' && isSuperadmin && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <GitBranch className="w-5 h-5 text-green-400" />
                    AI Tools Monitor
                  </CardTitle>
                  <CardDescription>
                    Real-time metrics, tool health scores, and dependency graph for Braid SDK tools
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <BraidSDKMonitor />
                </CardContent>
              </Card>
            )}

            {activeTab === 'security-monitor' &&
              isAdmin && ( // New Security Monitor tab
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Shield className="w-5 h-5 text-red-400" />
                      Security & Intrusion Detection
                    </CardTitle>
                    <CardDescription>
                      Monitor security alerts, track unauthorized access attempts, and manage
                      blocked IPs
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <SecurityMonitor />
                  </CardContent>
                </Card>
              )}

            {activeTab === 'rate-limits' && isSuperadmin && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Lock className="w-5 h-5 text-orange-400" />
                    Rate Limit & IP Block Management
                  </CardTitle>
                  <CardDescription>
                    View and clear rate-limited IPs, unblock users, and monitor security violations
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <RateLimitManager />
                </CardContent>
              </Card>
            )}

            {/* NEW: System Health Dashboard */}
            {activeTab === 'system-health' && isAdmin && (
              <Card>
                <CardHeader>
                  <CardTitle>System Health Dashboard</CardTitle>
                  <CardDescription>
                    Monitor system status, error logs, and performance metrics.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <SystemHealthDashboard />
                </CardContent>
              </Card>
            )}

            {/* NEW: System Logs tab content */}
            {activeTab === 'system-logs' && isAdmin && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-slate-400" />
                    System Logs
                  </CardTitle>
                  <CardDescription>
                    View and manage application logs (INFO, WARNING, ERROR, DEBUG)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <SystemLogsViewer />
                </CardContent>
              </Card>
            )}

            {/* NEW: Unit Tests tab content */}
            {activeTab === 'unit-tests' && isAdmin && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TestTube2 className="w-5 h-5 text-blue-400" />
                    Automated Unit Tests
                  </CardTitle>
                  <CardDescription>
                    Run automated tests to verify core functionality and catch regressions
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    onClick={() => (window.location.href = '/UnitTests')}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    Open Unit Test Dashboard
                  </Button>
                  <p className="text-xs text-muted-foreground mt-2">
                    Access a dedicated interface for running and viewing automated test results.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* NEW: QA Console (CI-triggered E2E) */}
            {activeTab === 'qa-console' && isAdmin && <QaConsole />}

            {/* NEW: API Health Monitor tab content */}
            {activeTab === 'api-health' && (isAdmin || isSuperadmin) && <ApiHealthDashboard />}

            {/* NEW: External Tools tab content */}
            {activeTab === 'external-tools' && (isAdmin || isSuperadmin) && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-xl font-semibold flex items-center gap-2">
                    <ExternalLink className="w-5 h-5 text-orange-400" />
                    External Tools
                  </CardTitle>
                  <CardDescription>
                    Access third-party dashboards and tools directly from within the CRM.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* CallFluent Section */}
                  <div className="p-4 rounded-lg bg-secondary/50 border border-border space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                          CallFluent (Ai-SHA Call Center)
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          AI-powered call center platform
                        </p>
                        <p className="text-xs text-muted-foreground/80 mt-2">
                          Manage AI voice agents, call campaigns, and review call analytics.
                        </p>
                      </div>
                    </div>
                    <Button
                      onClick={() =>
                        window.open('https://aisha-callcenter.4v-ai360.com/login', '_blank')
                      }
                      className="bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto"
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Open CallFluent Dashboard
                    </Button>
                  </div>

                  {/* Thoughtly Section */}
                  <div className="p-4 rounded-lg bg-secondary/50 border border-border space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold flex items-center gap-2">Thoughtly</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          AI voice agent platform
                        </p>
                        <p className="text-xs text-muted-foreground/80 mt-2">
                          Configure AI voice agents, manage conversations, and review transcripts.
                        </p>
                      </div>
                    </div>
                    <Button
                      onClick={() => window.open('https://app.thoughtly.com', '_blank')}
                      className="bg-purple-600 hover:bg-purple-700 text-white w-full sm:w-auto"
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Open Thoughtly Dashboard
                    </Button>
                  </div>

                  <div className="text-xs text-muted-foreground/80 bg-secondary/30 border border-border rounded p-3">
                    <strong>Note:</strong> These links will open in a new browser tab. You may need
                    to log in to each service separately.
                  </div>
                </CardContent>
              </Card>
            )}

            {/* NEW: Superadmin-only offboarding section */}
            {activeTab === 'offboarding' && isSuperadmin && (
              <Card>
                <CardHeader>
                  <CardTitle>Client Offboarding</CardTitle>
                  <CardDescription>
                    Permanently remove client data and configurations from the system. This action
                    is irreversible.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ClientOffboarding />
                </CardContent>
              </Card>
            )}
          </div>
        </SettingsLoader>
      </div>
    );
  }

  // Card Menu View - show when no setting is selected
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-foreground flex items-center gap-3">
          <div className="w-10 h-10 lg:w-12 lg:h-12 flex items-center justify-center rounded-full bg-card border border-border">
            <Cog className="w-5 h-5 lg:w-7 lg:h-7 text-muted-foreground" />
          </div>
          Settings & Administration
        </h1>
        <p className="text-muted-foreground mt-2 text-sm lg:text-base">
          Configure your account, manage users, monitor system health, and optimize performance.
        </p>
      </div>

      {/* Search and Category Filters */}
      <div className="mb-6 space-y-4">
        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search settings..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-card border-border"
          />
        </div>

        {/* Category Filters */}
        <div className="flex flex-wrap gap-2">
          <Badge
            variant="outline"
            className={getCategoryBadgeClasses('slate', selectedCategory === null)}
            onClick={() => setSelectedCategory(null)}
          >
            All
          </Badge>
          {availableCategories.map(([key, cat]) => (
            <Badge
              key={key}
              variant="outline"
              className={getCategoryBadgeClasses(cat.color, selectedCategory === key)}
              onClick={() => setSelectedCategory(selectedCategory === key ? null : key)}
            >
              <cat.icon className="w-3 h-3 mr-1" />
              {cat.label}
            </Badge>
          ))}
        </div>
      </div>

      {/* Settings Cards Grid */}
      <div className="space-y-8">
        {Object.entries(groupedItems).map(([categoryKey, items]) => {
          const category = CATEGORIES[categoryKey];
          return (
            <div key={categoryKey}>
              <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <category.icon className={`w-5 h-5 text-${category.color}-400`} />
                {category.label}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {items.map((item) => (
                  <Card
                    key={item.id}
                    className={`cursor-pointer transition-all duration-200 hover:scale-[1.02] hover:shadow-lg border-2 ${getColorClasses(CATEGORIES[item.category]?.color)}`}
                    onClick={() => setActiveTab(item.id)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3 flex-1">
                          <div
                            className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${getColorClasses(CATEGORIES[item.category]?.color)}`}
                          >
                            <item.icon className="w-5 h-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium text-foreground truncate">{item.label}</h3>
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                              {item.description}
                            </p>
                          </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0 ml-2" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* No results */}
      {filteredItems.length === 0 && (
        <div className="text-center py-12">
          <Search className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium text-foreground">No settings found</h3>
          <p className="text-muted-foreground mt-1">Try adjusting your search or filter criteria</p>
        </div>
      )}
    </div>
  );
}
