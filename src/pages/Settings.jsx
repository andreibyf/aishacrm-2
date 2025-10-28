
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
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
  Menu,
  Puzzle,
  Webhook,
  Clock,
  Key,
  Trash2,
  FileText, // Added for System Logs
  ExternalLink, // Added for External Tools

  // Icons for components not in outline's tabs array but preserved:
  Globe, // for TimezoneSettings (Regional Settings)
  CreditCard, // for BillingSettings
  Megaphone, // for SystemAnnouncements
  Shuffle, // for DenormalizationSync
  BarChart2, // for DataOptimizationDashboard
  Bug, // for TestDataManager
  RefreshCw, // for SyncHealthMonitor
  Server, // for MCPServerMonitor
} from "lucide-react";
import { User as UserEntity } from "@/api/entities";

// User & Profile
import UserInfo from "../components/settings/UserInfo";
import BrandingSettings from "../components/settings/BrandingSettings";
import TimezoneSettings from "../components/settings/TimezoneSettings";

// Access & Security
import UserPermissions from "../components/settings/UserPermissions";
import NavigationPermissions from "../components/settings/NavigationPermissions";
import SecuritySettings from "../components/settings/SecuritySettings";
import ApiKeyManager from "../components/settings/ApiKeyManager";

// Team Management
import EnhancedUserManagement from "../components/settings/EnhancedUserManagement";
// import InviteUserDialog from "../components/settings/InviteUserDialog"; // InviteUserDialog is typically used within EnhancedUserManagement, not as a standalone tab.

// Client Management
import TenantManagement from "../components/settings/TenantManagement";
import ClientOffboarding from "../components/settings/ClientOffboarding"; // New component for tenant deletion

// Integrations & Webhooks
import IntegrationSettings from "../components/settings/IntegrationSettings"; // Global integrations
import WebhookSettings from "../components/settings/WebhookSettings";
import TenantIntegrationSettings from "../components/settings/TenantIntegrationSettings"; // Tenant-specific integrations

// System Configuration
import ModuleManager from "../components/shared/ModuleManager";
import BillingSettings from "../components/settings/BillingSettings";
import CronJobManager from "../components/settings/CronJobManager";
import SystemAnnouncements from "../components/settings/SystemAnnouncements";
import DocumentationSeeder from "../components/settings/DocumentationSeeder"; // NEW: Documentation Seeder
import SystemLogsViewer from "../components/settings/SystemLogsViewer"; // NEW: System Logs Viewer
import ApiHealthDashboard from "../components/settings/ApiHealthDashboard"; // NEW: API Health Monitor

// Data Management
import DataConsistencyManager from "../components/settings/DataConsistencyManager";
import DenormalizationSync from "../components/settings/DenormalizationSync";
import DataOptimizationDashboard from "../components/settings/DataOptimizationDashboard";
import TestDataManager from "../components/settings/TestDataManager";

// Monitoring & Health
import InternalPerformanceDashboard from "../components/settings/InternalPerformanceDashboard";
import SyncHealthMonitor from "../components/settings/SyncHealthMonitor";
import MCPServerMonitor from "../components/settings/MCPServerMonitor";
import PerformanceMonitor from '../components/settings/PerformanceMonitor';
import SystemHealthDashboard from "../components/settings/SystemHealthDashboard"; // NEW: SystemHealthDashboard

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
      <div className="min-h-screen bg-slate-900 p-4 lg:p-8">
        <div className="flex items-center justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
          <span className="ml-3 text-slate-300">Loading settings...</span>
        </div>
      </div>
    );
  }

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'superadmin';
  const isManager = currentUser?.role === 'manager';
  const isSuperadmin = currentUser?.role === 'superadmin';

  // Define all tabs based on the outline, preserving existing components by creating new tabs where necessary
  const tabsConfig = [
    { id: 'profile', label: 'My Profile', icon: User, color: 'blue', roles: ['any'] },
    { id: 'branding', label: 'Branding', icon: Palette, color: 'blue', roles: ['any'] },
    { id: 'regional', label: 'Regional', icon: Globe, color: 'blue', roles: ['any'] }, // New tab for TimezoneSettings
    { id: 'billing', label: 'Billing', icon: CreditCard, color: 'blue', roles: ['any'] }, // New tab for BillingSettings

    // Admin & Manager accessible tabs
    ...(isAdmin || isManager ? [
      { id: 'global-integrations', label: 'Global Integrations', icon: Plug, color: 'orange', roles: ['admin', 'superadmin', 'manager'] },
      { id: 'tenant-integrations', label: 'Tenant Integrations', icon: Puzzle, color: 'orange', roles: ['admin', 'superadmin', 'manager'] },
      { id: 'webhooks', label: 'Webhooks', icon: Webhook, color: 'orange', roles: ['admin', 'superadmin', 'manager'] },

      { id: 'data-consistency', label: 'Data Consistency', icon: Database, color: 'cyan', roles: ['admin', 'superadmin', 'manager'] },
      { id: 'denormalization', label: 'Denormalization', icon: Shuffle, color: 'cyan', roles: ['admin', 'superadmin', 'manager'] },
      { id: 'data-optimization', label: 'Data Optimization', icon: BarChart2, color: 'cyan', roles: ['admin', 'superadmin', 'manager'] },
    ] : []),

    // Admin-specific tabs
    ...(isAdmin ? [
      { id: 'users', label: 'User Management', icon: Users, color: 'green', roles: ['admin', 'superadmin'] },
      { id: 'tenants', label: 'Client Management', icon: Building2, color: 'indigo', roles: ['admin', 'superadmin'] },
      { id: 'modules', label: 'Module Settings', icon: LayoutGrid, color: 'slate', roles: ['admin', 'superadmin'] },
      { id: 'permissions', label: 'User Permissions', icon: Shield, color: 'purple', roles: ['admin', 'superadmin'] },
      { id: 'navigation', label: 'Navigation Permissions', icon: Menu, color: 'indigo', roles: ['admin', 'superadmin'] },
      { id: 'cron', label: 'Cron Jobs', icon: Clock, color: 'yellow', roles: ['admin', 'superadmin'] },
      { id: 'security', label: 'Security', icon: Lock, color: 'purple', roles: ['admin', 'superadmin'] },
      { id: 'apikeys', label: 'API Keys', icon: Key, color: 'green', roles: ['admin', 'superadmin'] }, // Changed from Superadmin to Admin as per original code

      { id: 'advanced', label: 'Advanced', icon: Cog, color: 'slate', roles: ['admin', 'superadmin'] }, // NEW: Advanced Settings Tab

      { id: 'announcements', label: 'Announcements', icon: Megaphone, color: 'slate', roles: ['admin', 'superadmin'] }, // New tab for SystemAnnouncements

      { id: 'test-data', label: 'Test Data', icon: Bug, color: 'cyan', roles: ['admin', 'superadmin'] },

      { id: 'performance', label: 'Performance', icon: Activity, color: 'emerald', roles: ['admin', 'superadmin'] }, // Combined Performance Dashboard
      { id: 'sync-health', label: 'Sync Health', icon: RefreshCw, color: 'emerald', roles: ['admin', 'superadmin'] },
      { id: 'mcp-monitor', label: 'MCP Monitor', icon: Server, color: 'emerald', roles: ['admin', 'superadmin'] },
      { id: 'system-health', label: 'System Health', icon: Activity, color: 'emerald', roles: ['admin', 'superadmin'] }, // NEW: System Health Dashboard
      { id: 'system-logs', label: 'System Logs', icon: FileText, color: 'slate', roles: ['admin', 'superadmin'] }, // NEW: System Logs

      // Testing & Diagnostics
      { id: 'unit-tests', label: 'Unit Tests', icon: TestTube2, color: 'blue', roles: ['admin', 'superadmin'] }, // NEW: Unit Tests tab
      { id: 'external-tools', label: 'External Tools', icon: ExternalLink, color: 'orange', roles: ['admin', 'superadmin'] }, // NEW: External Tools tab
      { id: 'api-health', label: 'API Health', icon: Activity, color: 'red', roles: ['admin', 'superadmin'] }, // NEW: API Health Monitor
    ] : []),

    // Superadmin-specific tabs
    ...(isSuperadmin ? [
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
    <div className="min-h-screen bg-slate-900">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 p-4 lg:p-8">
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-100 flex items-center gap-3">
            <div className="w-10 h-10 lg:w-12 lg:h-12 flex items-center justify-center rounded-full bg-slate-800 border border-slate-700">
              <Cog className="w-5 h-5 lg:w-7 h-7 text-slate-300" />
            </div>
            Settings & Administration
          </h1>
          <p className="text-slate-400 mt-1 text-sm lg:text-base">
            Configure your account, manage users, monitor system health, and optimize performance.
          </p>
        </div>

        <div className="p-4 sm:p-6 lg:p-8 pt-0">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-6">
            {/* TabsList now dynamically generated */}
            <TabsList className="bg-slate-800 border border-slate-700 p-1 rounded-lg grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10 gap-1 h-auto overflow-x-auto">
              {tabsConfig.map((tab) => (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className={`rounded-md px-3 py-2 ${getTabColorClass(tab.color)} data-[state=active]:text-white text-slate-300 font-medium transition-colors flex items-center justify-center gap-2`}
                >
                  <tab.icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>

            {/* TabsContent is now flat, conditional rendering within a single div */}
            <div className="space-y-6 m-0">
              {/* User & Profile */}
              {activeTab === 'profile' && (
                <Card className="bg-slate-800 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-slate-100">Personal Information</CardTitle>
                    <CardDescription className="text-slate-400">Update your profile details and preferences</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <UserInfo user={currentUser} onUpdate={loadUser} />
                  </CardContent>
                </Card>
              )}

              {activeTab === 'branding' && (
                <Card className="bg-slate-800 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-slate-100">Branding & Appearance</CardTitle>
                    <CardDescription className="text-slate-400">Customize your organization&apos;s visual identity</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <BrandingSettings user={currentUser} onUpdate={loadUser} />
                  </CardContent>
                </Card>
              )}

              {activeTab === 'regional' && ( // New tab content
                <Card className="bg-slate-800 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-slate-100">Regional Settings</CardTitle>
                    <CardDescription className="text-slate-400">Configure timezone and date formats</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <TimezoneSettings user={currentUser} onUpdate={loadUser} />
                  </CardContent>
                </Card>
              )}

              {activeTab === 'billing' && ( // New tab content
                <Card className="bg-slate-800 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-slate-100">Billing & Subscription</CardTitle>
                    <CardDescription className="text-slate-400">Manage your subscription plan and payment settings</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <BillingSettings />
                  </CardContent>
                </Card>
              )}

              {/* Team Management */}
              {activeTab === 'users' && isAdmin && (
                <Card className="bg-slate-800 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-slate-100">User Management</CardTitle>
                    <CardDescription className="text-slate-400">Invite, manage, and configure team member access</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <EnhancedUserManagement />
                  </CardContent>
                </Card>
              )}

              {/* Access & Security */}
              {activeTab === 'permissions' && isAdmin && (
                <Card className="bg-slate-800 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-slate-100 flex items-center gap-2">
                      <Lock className="w-5 h-5 text-purple-400" />
                      Role-Based Permissions
                    </CardTitle>
                    <CardDescription className="text-slate-400">Manage what different user roles can access and modify</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <UserPermissions user={currentUser} onUpdate={loadUser} />
                  </CardContent>
                </Card>
              )}

              {activeTab === 'navigation' && isAdmin && (
                <Card className="bg-slate-800 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-slate-100 flex items-center gap-2">
                      <Menu className="w-5 h-5 text-indigo-400" />
                      Navigation Visibility
                    </CardTitle>
                    <CardDescription className="text-slate-400">Control which menu items are visible to each user role</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <NavigationPermissions user={currentUser} onUpdate={loadUser} />
                  </CardContent>
                </Card>
              )}

              {activeTab === 'security' && isAdmin && (
                <Card className="bg-slate-800 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-slate-100 flex items-center gap-2">
                      <Shield className="w-5 h-5 text-orange-400" />
                      Security & Authentication
                    </CardTitle>
                    <CardDescription className="text-slate-400">Review endpoint protection and authentication methods</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <SecuritySettings user={currentUser} />
                  </CardContent>
                </Card>
              )}

              {activeTab === 'apikeys' && isAdmin && ( // Adjusted to isAdmin as per original code
                <Card className="bg-slate-800 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-slate-100 flex items-center gap-2">
                      <Key className="w-5 h-5 text-green-400" />
                      API Security & Keys
                    </CardTitle>
                    <CardDescription className="text-slate-400">Manage API keys for external integrations and webhook access</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ApiKeyManager />
                  </CardContent>
                </Card>
              )}

              {/* Client Management (Admin) */}
              {activeTab === 'tenants' && isAdmin && (
                <Card className="bg-slate-800 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-slate-100">Tenant Administration</CardTitle>
                    <CardDescription className="text-slate-400">Manage client organizations, branding, and configurations</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <TenantManagement />
                  </CardContent>
                </Card>
              )}

              {/* Integrations & Webhooks */}
              {activeTab === 'global-integrations' && (isAdmin || isManager) && ( // New tab content
                <Card className="bg-slate-800 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-slate-100">System Integrations</CardTitle>
                    <CardDescription className="text-slate-400">Connect external services, APIs, and automation platforms</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <IntegrationSettings user={currentUser} />
                  </CardContent>
                </Card>
              )}

              {activeTab === 'tenant-integrations' && (isAdmin || isManager) && ( // Tab from outline mapping to TenantIntegrationSettings
                <Card className="bg-slate-800 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-slate-100">Tenant-Specific Integrations</CardTitle>
                    <CardDescription className="text-slate-400">Configure client-specific integration settings</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <TenantIntegrationSettings />
                  </CardContent>
                </Card>
              )}

              {activeTab === 'webhooks' && (isAdmin || isManager) && (
                <Card className="bg-slate-800 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-slate-100">Webhook Management</CardTitle>
                    <CardDescription className="text-slate-400">Configure outbound webhooks for CRM events</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <WebhookSettings />
                  </CardContent>
                </Card>
              )}

              {/* System Configuration */}
              {activeTab === 'modules' && isAdmin && (
                <Card className="bg-slate-800 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-slate-100">Feature Modules</CardTitle>
                    <CardDescription className="text-slate-400">Enable or disable CRM modules and features</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ModuleManager />
                  </CardContent>
                </Card>
              )}

              {activeTab === 'cron' && isAdmin && (
                <>
                  <Card className="bg-slate-800 border-slate-700">
                    <CardHeader>
                      <CardTitle className="text-slate-100 flex items-center gap-2">
                        <Clock className="w-5 h-5 text-yellow-400" />
                        Automated Tasks (Cron Jobs)
                      </CardTitle>
                      <CardDescription className="text-slate-400">Manage scheduled background tasks and automation</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <CronJobManager user={currentUser} />
                    </CardContent>
                  </Card>

                  <Card className="bg-slate-800 border-slate-700">
                    <CardHeader>
                      <CardTitle className="text-slate-100">System Initialization</CardTitle>
                      <CardDescription className="text-slate-400">Initialize system-level components and scheduled tasks</CardDescription>
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
                        className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600"
                      >
                        Initialize System Cron Jobs
                      </Button>
                      <p className="text-xs text-slate-400 mt-2">
                        This will create the master cron job runner that processes all scheduled tasks.
                      </p>
                    </CardContent>
                  </Card>
                </>
              )}

              {activeTab === 'announcements' && isAdmin && ( // New tab content
                <Card className="bg-slate-800 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-slate-100">System Announcements</CardTitle>
                    <CardDescription className="text-slate-400">Create and manage system-wide notifications for users</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <SystemAnnouncements />
                  </CardContent>
                </Card>
              )}

              {/* NEW: Advanced Settings Tab Content */}
              {activeTab === 'advanced' && isAdmin && (
                <div className="space-y-6">
                  <Card className="bg-slate-800 border-slate-700">
                    <CardHeader>
                      <CardTitle className="text-slate-100">Advanced Settings</CardTitle>
                      <CardDescription className="text-slate-400">
                        System configuration and advanced features
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-slate-300">
                        Manage critical system-level configurations and utilities.
                      </p>
                    </CardContent>
                  </Card>

                  {/* NEW: Documentation Seeder */}
                  <DocumentationSeeder />
                </div>
              )}

              {/* Data Management */}
              {activeTab === 'data-consistency' && (isAdmin || isManager) && ( // New tab content
                <Card className="bg-slate-800 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-slate-100">Data Consistency Manager</CardTitle>
                    <CardDescription className="text-slate-400">Identify and resolve referential integrity issues</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <DataConsistencyManager />
                  </CardContent>
                </Card>
              )}

              {activeTab === 'denormalization' && (isAdmin || isManager) && ( // New tab content
                <Card className="bg-slate-800 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-slate-100">Denormalization Sync</CardTitle>
                    <CardDescription className="text-slate-400">Keep cached data fields synchronized across entities</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <DenormalizationSync />
                  </CardContent>
                </Card>
              )}

              {activeTab === 'data-optimization' && (isAdmin || isManager) && ( // New tab content
                <Card className="bg-slate-800 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-slate-100">Query Optimization</CardTitle>
                    <CardDescription className="text-slate-400">Aggregate tables and performance caching for faster dashboards</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <DataOptimizationDashboard />
                  </CardContent>
                </Card>
              )}

              {activeTab === 'test-data' && isAdmin && ( // New tab content
                <Card className="bg-slate-800 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-slate-100">Test Data Management</CardTitle>
                    <CardDescription className="text-slate-400">Clean up test records and development data</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <TestDataManager />
                  </CardContent>
                </Card>
              )}

              {/* Monitoring & Health */}
              {activeTab === 'performance' && isAdmin && (
                <div className="space-y-6">
                  <Card className="bg-slate-800 border-slate-700">
                    <CardHeader>
                      <CardTitle className="text-slate-100">Performance Dashboard</CardTitle>
                      <CardDescription className="text-slate-400">Monitor API response times, error rates, and system health</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Tabs defaultValue="overview" className="w-full">
                        <TabsList className="grid w-full grid-cols-2 bg-slate-900">
                          <TabsTrigger value="overview" className="data-[state=active]:bg-slate-700">
                            Overview & Metrics
                          </TabsTrigger>
                          <TabsTrigger value="realtime" className="data-[state=active]:bg-slate-700">
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

              {activeTab === 'sync-health' && isAdmin && ( // New tab content
                <Card className="bg-slate-800 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-slate-100">Data Sync Health</CardTitle>
                    <CardDescription className="text-slate-400">Monitor automated sync jobs and data consistency</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <SyncHealthMonitor tenantId={selectedTenantId} />
                  </CardContent>
                </Card>
              )}

              {activeTab === 'mcp-monitor' && isAdmin && ( // New tab content
                <Card className="bg-slate-800 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-slate-100">MCP Server Status</CardTitle>
                    <CardDescription className="text-slate-400">Monitor the Model Context Protocol server health</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <MCPServerMonitor />
                  </CardContent>
                </Card>
              )}

              {/* NEW: System Health Dashboard */}
              {activeTab === 'system-health' && isAdmin && (
                <Card className="bg-slate-800 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-slate-100">System Health Dashboard</CardTitle>
                    <CardDescription className="text-slate-400">Monitor system status, error logs, and performance metrics.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <SystemHealthDashboard />
                  </CardContent>
                </Card>
              )}

              {/* NEW: System Logs tab content */}
              {activeTab === 'system-logs' && isAdmin && (
                <Card className="bg-slate-800 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-slate-100 flex items-center gap-2">
                      <FileText className="w-5 h-5 text-slate-400" />
                      System Logs
                    </CardTitle>
                    <CardDescription className="text-slate-400">
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
                <Card className="bg-slate-800 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-slate-100 flex items-center gap-2">
                      <TestTube2 className="w-5 h-5 text-blue-400" />
                      Automated Unit Tests
                    </CardTitle>
                    <CardDescription className="text-slate-400">
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
                    <p className="text-xs text-slate-400 mt-2">
                      Access a dedicated interface for running and viewing automated test results.
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* NEW: API Health Monitor tab content */}
              {activeTab === 'api-health' && (isAdmin || isSuperadmin) && (
                <ApiHealthDashboard />
              )}

              {/* NEW: External Tools tab content */}
              {activeTab === 'external-tools' && (isAdmin || isSuperadmin) && (
                <Card className="bg-slate-800 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-xl font-semibold text-slate-100 flex items-center gap-2">
                      <ExternalLink className="w-5 h-5 text-orange-400" />
                      External Tools
                    </CardTitle>
                    <CardDescription className="text-slate-400">
                      Access third-party dashboards and tools directly from within the CRM.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* CallFluent Section */}
                    <div className="p-4 rounded-lg bg-slate-700/50 border border-slate-600 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
                            CallFluent (Ai-SHA Call Center)
                          </h3>
                          <p className="text-sm text-slate-400 mt-1">AI-powered call center platform</p>
                          <p className="text-xs text-slate-500 mt-2">
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
                    <div className="p-4 rounded-lg bg-slate-700/50 border border-slate-600 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
                            Thoughtly
                          </h3>
                          <p className="text-sm text-slate-400 mt-1">AI voice agent platform</p>
                          <p className="text-xs text-slate-500 mt-2">
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

                    <div className="text-xs text-slate-500 bg-slate-700/30 border border-slate-600 rounded p-3">
                      <strong>Note:</strong> These links will open in a new browser tab. You may need to log in to each service separately.
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* NEW: Superadmin-only offboarding section */}
              {activeTab === 'offboarding' && isSuperadmin && (
                <Card className="bg-slate-800 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-slate-100">Client Offboarding</CardTitle>
                    <CardDescription className="text-slate-400">
                      Permanently remove client data and configurations from the system. This action is irreversible.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ClientOffboarding />
                  </CardContent>
                </Card>
              )}
            </div>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
