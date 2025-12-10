
import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
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
  Tags, // Added for Entity Labels

  // Icons for components not in outline's tabs array but preserved:
  Globe, // for TimezoneSettings (Regional Settings)
  CreditCard, // for BillingSettings
  Megaphone, // for SystemAnnouncements
  Bug, // for TestDataManager
  RefreshCw, // for SyncHealthMonitor
  Server, // for MCPServerMonitor
} from "lucide-react";
import { User as UserEntity } from "@/api/entities";

// Lazy loading wrapper for settings sub-components
const SettingsLoader = ({ children }) => (
  <Suspense fallback={
    <div className="flex items-center justify-center p-8">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      <span className="ml-2 text-muted-foreground">Loading...</span>
    </div>
  }>
    {children}
  </Suspense>
);

// User & Profile - lazy loaded
const UserInfo = lazy(() => import("../components/settings/UserInfo"));
const BrandingSettings = lazy(() => import("../components/settings/BrandingSettings"));
const TimezoneSettings = lazy(() => import("../components/settings/TimezoneSettings"));

// Access & Security - lazy loaded
const SecuritySettings = lazy(() => import("../components/settings/SecuritySettings"));
const ApiKeyManager = lazy(() => import("../components/settings/ApiKeyManager"));
const RateLimitManager = lazy(() => import("../components/settings/RateLimitManager"));

// Team Management - lazy loaded
const EnhancedUserManagement = lazy(() => import("../components/settings/EnhancedUserManagement"));

// Client Management - lazy loaded
const TenantManagement = lazy(() => import("../components/settings/TenantManagement"));
const ClientOffboarding = lazy(() => import("../components/settings/ClientOffboarding"));

// Integrations & API - lazy loaded
const IntegrationSettings = lazy(() => import("../components/settings/IntegrationSettings"));
const TenantIntegrationSettings = lazy(() => import("../components/settings/TenantIntegrationSettings"));

// System Configuration - lazy loaded
const ModuleManager = lazy(() => import("../components/shared/ModuleManager"));
const EntityLabelsManager = lazy(() => import("../components/settings/EntityLabelsManager"));
const TenantNavigationDefaults = lazy(() => import("../components/settings/TenantNavigationDefaults"));
const BillingSettings = lazy(() => import("../components/settings/BillingSettings"));
const CronJobManager = lazy(() => import("../components/settings/CronJobManager"));
const SystemAnnouncements = lazy(() => import("../components/settings/SystemAnnouncements"));
const SystemLogsViewer = lazy(() => import("../components/settings/SystemLogsViewer"));
const ApiHealthDashboard = lazy(() => import("../components/settings/ApiHealthDashboard"));

// Data Management - lazy loaded
const DataConsistencyManager = lazy(() => import("../components/settings/DataConsistencyManager"));
const TestDataManager = lazy(() => import("../components/settings/TestDataManager"));

// Monitoring & Health - lazy loaded
const InternalPerformanceDashboard = lazy(() => import("../components/settings/InternalPerformanceDashboard"));
const SyncHealthMonitor = lazy(() => import("../components/settings/SyncHealthMonitor"));
const MCPServerMonitor = lazy(() => import("../components/settings/MCPServerMonitor"));
const SecurityMonitor = lazy(() => import("../components/settings/SecurityMonitor"));
const PerformanceMonitor = lazy(() => import('../components/settings/PerformanceMonitor'));
const SystemHealthDashboard = lazy(() => import("../components/settings/SystemHealthDashboard"));
const QaConsole = lazy(() => import("../components/settings/QaConsole"));
const TenantResolveCacheMonitor = lazy(() => import("../components/settings/TenantResolveCacheMonitor"));
const LLMActivityMonitor = lazy(() => import("../components/settings/LLMActivityMonitor"));

export default function SettingsPage() { // Renamed from Settings to SettingsPage as per outline
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("profile");
  const [selectedTenantId, setSelectedTenantId] = useState(null);
  
  const loadUser = useCallback(async () => {
    try {
      const user = await UserEntity.me();
      setCurrentUser(user);
      if (!selectedTenantId && user?.tenant_id) {
        setSelectedTenantId(user.tenant_id);
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Error loading user:", error);
      }
    } finally {
      setLoading(false);
    }
  }, [selectedTenantId]);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    if (tab) {
      setActiveTab(tab);
    }
  }, []);

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

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'superadmin';
  const isManager = currentUser?.role === 'manager';
  const isSuperadmin = currentUser?.role === 'superadmin';

  // Define all tabs based on the outline, preserving existing components by creating new tabs where necessary
  const tabsConfig = [
    // Basic user settings - everyone gets these
    { id: 'profile', label: 'My Profile', icon: User, color: 'blue', roles: ['any'] },
    { id: 'branding', label: 'Branding', icon: Palette, color: 'blue', roles: ['any'] },
    { id: 'regional', label: 'Regional', icon: Globe, color: 'blue', roles: ['any'] },
    { id: 'billing', label: 'Billing', icon: CreditCard, color: 'blue', roles: ['any'] },

    // Tenant Admin tabs (limited access - user management + customization)
    ...(isAdmin && !isSuperadmin ? [
      { id: 'users', label: 'User Management', icon: Users, color: 'green', roles: ['admin'] },
      { id: 'entity-labels', label: 'Entity Labels', icon: Tags, color: 'indigo', roles: ['admin'] },
      { id: 'nav-defaults', label: 'Nav Defaults', icon: LayoutGrid, color: 'slate', roles: ['admin'] },
    ] : []),

    // Manager accessible tabs (no admin features)
    ...(isManager && !isAdmin ? [
      { id: 'data-consistency', label: 'Data Consistency', icon: Database, color: 'cyan', roles: ['manager'] },
    ] : []),

    // Superadmin-only tabs (full system access)
    ...(isSuperadmin ? [
      { id: 'users', label: 'User Management', icon: Users, color: 'green', roles: ['superadmin'] },
      { id: 'tenants', label: 'Client Management', icon: Building2, color: 'indigo', roles: ['superadmin'] },

      // Integrations
      { id: 'global-integrations', label: 'Global Integrations', icon: Plug, color: 'orange', roles: ['superadmin'] },
      { id: 'tenant-integrations', label: 'Tenant Integrations', icon: Puzzle, color: 'orange', roles: ['superadmin'] },
      { id: 'api-docs', label: 'API Documentation', icon: BookOpen, color: 'blue', roles: ['superadmin'] },

      // System Configuration
      { id: 'modules', label: 'Module Settings', icon: LayoutGrid, color: 'slate', roles: ['superadmin'] },
      { id: 'entity-labels', label: 'Entity Labels', icon: Tags, color: 'indigo', roles: ['superadmin'] },
      { id: 'cron', label: 'Cron Jobs', icon: Clock, color: 'yellow', roles: ['superadmin'] },
      { id: 'security', label: 'Auth & Access', icon: Lock, color: 'purple', roles: ['superadmin'] },
      { id: 'apikeys', label: 'API Keys', icon: Key, color: 'green', roles: ['superadmin'] },
      { id: 'announcements', label: 'Announcements', icon: Megaphone, color: 'slate', roles: ['superadmin'] },

      // Data Management
      { id: 'data-consistency', label: 'Data Consistency', icon: Database, color: 'cyan', roles: ['superadmin'] },
      { id: 'test-data', label: 'Test Data', icon: Bug, color: 'cyan', roles: ['superadmin'] },

      // Monitoring & Health
      { id: 'performance', label: 'Performance', icon: Activity, color: 'emerald', roles: ['superadmin'] },
      { id: 'cache-monitor', label: 'Cache Monitor', icon: Database, color: 'emerald', roles: ['superadmin'] },
      { id: 'llm-monitor', label: 'LLM Monitor', icon: Brain, color: 'purple', roles: ['superadmin'] },
      { id: 'sync-health', label: 'Sync Health', icon: RefreshCw, color: 'emerald', roles: ['superadmin'] },
      { id: 'mcp-monitor', label: 'MCP Monitor', icon: Server, color: 'emerald', roles: ['superadmin'] },
      { id: 'security-monitor', label: 'Intrusion Detection', icon: Shield, color: 'red', roles: ['superadmin'] },
      { id: 'rate-limits', label: 'Rate Limits', icon: Lock, color: 'orange', roles: ['superadmin'] },
      { id: 'system-health', label: 'System Health', icon: Activity, color: 'emerald', roles: ['superadmin'] },
      { id: 'system-logs', label: 'System Logs', icon: FileText, color: 'slate', roles: ['superadmin'] },

      // Testing & Diagnostics
      { id: 'unit-tests', label: 'Unit Tests', icon: TestTube2, color: 'blue', roles: ['superadmin'] },
      { id: 'qa-console', label: 'QA Console', icon: TestTube2, color: 'blue', roles: ['superadmin'] },
      { id: 'external-tools', label: 'External Tools', icon: ExternalLink, color: 'orange', roles: ['superadmin'] },
      { id: 'api-health', label: 'API Health', icon: Activity, color: 'red', roles: ['superadmin'] },

      // Client Management
      { id: 'offboarding', label: 'Client Offboarding', icon: Trash2, color: 'red', roles: ['superadmin'] },
    ] : []),
  ];

  const getTabColorClass = (color) => {
    switch (color) {
      case 'blue': return 'data-[state=active]:bg-blue-600';
      case 'purple': return 'data-[state=active]:bg-purple-600';
      case 'green': return 'data-[state=active]:bg-green-600';
      case 'indigo': return 'data-[state=active]:bg-indigo-600';
      case 'orange': return 'data-[state=active]:bg-orange-600';
      case 'slate': return 'data-[state=active]:bg-slate-600';
      case 'cyan': return 'data-[state=active]:bg-cyan-600';
      case 'emerald': return 'data-[state=active]:bg-emerald-600';
      case 'red': return 'data-[state=active]:bg-red-600';
      case 'yellow': return 'data-[state=active]:bg-yellow-600';
      default: return 'data-[state=active]:bg-gray-600';
    }
  };


  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 p-4 lg:p-8">
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground flex items-center gap-3">
            <div className="w-10 h-10 lg:w-12 lg:h-12 flex items-center justify-center rounded-full bg-card border border-border">
              <Cog className="w-5 h-5 lg:w-7 h-7 text-muted-foreground" />
            </div>
            Settings & Administration
          </h1>
          <p className="text-muted-foreground mt-1 text-sm lg:text-base">
            Configure your account, manage users, monitor system health, and optimize performance.
          </p>
        </div>

        <div className="p-4 sm:p-6 lg:p-8 pt-0">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-6">
            {/* TabsList now dynamically generated */}
            <TabsList className="bg-card border border-border p-1 rounded-lg grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10 gap-1 h-auto overflow-x-auto">
              {tabsConfig.map((tab) => (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className={`rounded-md px-3 py-2 ${getTabColorClass(tab.color)} data-[state=active]:text-white font-medium transition-colors flex items-center justify-center gap-2`}
                >
                  <tab.icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>

            {/* TabsContent is now flat, conditional rendering within a single div */}
            <SettingsLoader>
            <div className="space-y-6 m-0">
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
                    <CardDescription>Customize your organization&apos;s visual identity</CardDescription>
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
                    <CardDescription>Manage your subscription plan and payment settings</CardDescription>
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
                    <CardDescription>Invite, manage, and configure team member access</CardDescription>
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
                    <CardDescription>Review endpoint protection and authentication methods</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <SecuritySettings user={currentUser} />
                  </CardContent>
                </Card>
              )}

              {activeTab === 'apikeys' && isAdmin && ( // Adjusted to isAdmin as per original code
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Key className="w-5 h-5 text-green-400" />
                      API Security & Keys
                    </CardTitle>
                    <CardDescription>Manage API keys for external integrations and webhook access</CardDescription>
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
                    <CardDescription>Manage client organizations, branding, and configurations</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <TenantManagement />
                  </CardContent>
                </Card>
              )}

              {/* Integrations & Webhooks */}
              {activeTab === 'global-integrations' && (isAdmin || isManager) && ( // New tab content
                <Card>
                  <CardHeader>
                    <CardTitle>System Integrations</CardTitle>
                    <CardDescription>Connect external services, APIs, and automation platforms</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <IntegrationSettings user={currentUser} />
                  </CardContent>
                </Card>
              )}

              {activeTab === 'tenant-integrations' && (isAdmin || isManager) && ( // Tab from outline mapping to TenantIntegrationSettings
                <Card>
                  <CardHeader>
                    <CardTitle>Tenant-Specific Integrations</CardTitle>
                    <CardDescription>Configure client-specific integration settings</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <TenantIntegrationSettings />
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

                {activeTab === 'nav-defaults' && isAdmin && !isSuperadmin && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <LayoutGrid className="w-5 h-5 text-slate-400" />
                        Default Navigation Permissions
                      </CardTitle>
                      <CardDescription>
                        Set default page access for new users you invite. Individual users can be customized when inviting.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <SettingsLoader>
                        <TenantNavigationDefaults />
                      </SettingsLoader>
                    </CardContent>
                  </Card>
                )}

              {activeTab === 'cron' && isAdmin && (
                <>
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Clock className="w-5 h-5 text-yellow-400" />
                        Automated Tasks (Cron Jobs)
                      </CardTitle>
                      <CardDescription>Manage scheduled background tasks and automation</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <CronJobManager user={currentUser} />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>System Initialization</CardTitle>
                      <CardDescription>Initialize system-level components and scheduled tasks</CardDescription>
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
                        This will create the master cron job runner that processes all scheduled tasks.
                      </p>
                    </CardContent>
                  </Card>
                </>
              )}

              {activeTab === 'announcements' && isAdmin && ( // New tab content
                <Card>
                  <CardHeader>
                    <CardTitle>System Announcements</CardTitle>
                    <CardDescription>Create and manage system-wide notifications for users</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <SystemAnnouncements />
                  </CardContent>
                </Card>
              )}

              {/* Data Management */}
              {activeTab === 'data-consistency' && (isAdmin || isManager) && ( // New tab content
                <Card>
                  <CardHeader>
                    <CardTitle>Data Consistency Manager</CardTitle>
                    <CardDescription>Identify and resolve referential integrity issues</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <DataConsistencyManager />
                  </CardContent>
                </Card>
              )}

              {activeTab === 'test-data' && (isAdmin || isManager) && ( // New tab content
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
                      <CardDescription>Monitor API response times, error rates, and system health</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Tabs defaultValue="overview" className="w-full">
                        <TabsList className="grid w-full grid-cols-2">
                          <TabsTrigger value="overview">
                            Overview & Metrics
                          </TabsTrigger>
                          <TabsTrigger value="realtime">
                            Real-Time Charts
                          </TabsTrigger>
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
                    <CardDescription>Monitor cache performance and hit ratios for tenant identity resolution</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <TenantResolveCacheMonitor />
                  </CardContent>
                </Card>
              )}

              {activeTab === 'sync-health' && isAdmin && ( // New tab content
                <Card>
                  <CardHeader>
                    <CardTitle>Data Sync Health</CardTitle>
                    <CardDescription>Monitor automated sync jobs and data consistency</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <SyncHealthMonitor tenantId={selectedTenantId} />
                  </CardContent>
                </Card>
              )}

              {activeTab === 'mcp-monitor' && isAdmin && ( // New tab content
                <Card>
                  <CardHeader>
                    <CardTitle>MCP Server Status</CardTitle>
                    <CardDescription>Monitor the Model Context Protocol server health</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <MCPServerMonitor />
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
                        Real-time view of all LLM calls: tenant, capability, provider, model, node ID, duration, tokens
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <LLMActivityMonitor />
                    </CardContent>
                  </Card>
                )}

              {activeTab === 'security-monitor' && isAdmin && ( // New Security Monitor tab
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Shield className="w-5 h-5 text-red-400" />
                      Security & Intrusion Detection
                    </CardTitle>
                    <CardDescription>
                      Monitor security alerts, track unauthorized access attempts, and manage blocked IPs
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
                    <CardDescription>Monitor system status, error logs, and performance metrics.</CardDescription>
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
                      onClick={() => window.location.href = '/UnitTests'}
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
              {activeTab === 'qa-console' && isAdmin && (
                <QaConsole />
              )}

              {/* NEW: API Health Monitor tab content */}
              {activeTab === 'api-health' && (isAdmin || isSuperadmin) && (
                <ApiHealthDashboard />
              )}

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
                          <p className="text-sm text-muted-foreground mt-1">AI-powered call center platform</p>
                          <p className="text-xs text-muted-foreground/80 mt-2">
                            Manage AI voice agents, call campaigns, and review call analytics.
                          </p>
                        </div>
                      </div>
                      <Button
                        onClick={() => window.open('https://aisha-callcenter.4v-ai360.com/login', '_blank')}
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
                          <h3 className="text-lg font-semibold flex items-center gap-2">
                            Thoughtly
                          </h3>
                          <p className="text-sm text-muted-foreground mt-1">AI voice agent platform</p>
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
                      <strong>Note:</strong> These links will open in a new browser tab. You may need to log in to each service separately.
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
                      Permanently remove client data and configurations from the system. This action is irreversible.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ClientOffboarding />
                  </CardContent>
                </Card>
              )}
            </div>
            </SettingsLoader>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
