import { useEffect, useState, useCallback } from 'react';
import { ModuleSettings } from '@/api/entities';
import { useUser } from '@/components/shared/useUser.js';
import { useAuthCookiesReady } from '@/components/shared/useAuthCookiesReady';
import { useTenant } from '@/components/shared/tenantContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  AlertCircle,
  BarChart3,
  BrainCircuit,
  Building2,
  Calendar,
  CheckCircle,
  CreditCard,
  Database,
  DollarSign,
  FileText,
  LayoutDashboard,
  Mic,
  Settings,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Workflow,
  Wrench,
  Zap,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { MODULE_ALIASES } from '@/utils/navigationConfig';

export const defaultModules = [
  {
    id: 'dashboard',
    name: 'Dashboard',
    description: 'Central hub for viewing key metrics and system activity.',
    icon: LayoutDashboard,
    features: [
      'Real-time Stats',
      'Activity Feed',
      'Sales Pipeline Overview',
      'Lead Source Insights',
      'Customizable Widgets',
    ],
  },
  {
    id: 'contacts',
    name: 'Contact Management',
    description: 'Manage customer contacts and relationships',
    icon: Users,
    features: [
      'Create & Edit Contacts',
      'CSV Import/Export',
      'Search & Filter',
      'Table & Card Views',
      'Notes System',
    ],
  },
  {
    id: 'accounts',
    name: 'Account Management',
    description: 'Manage companies and organizations',
    icon: Building2,
    features: [
      'Company Profiles',
      'Industry Categorization',
      'Contact Associations',
      'Address Management',
      'CSV Import/Export',
    ],
  },
  {
    id: 'leads',
    name: 'Lead Management',
    description: 'Track and convert potential customers',
    icon: TrendingUp,
    features: [
      'Lead Creation & Editing',
      'Status Tracking',
      'Source Attribution',
      'CSV Import/Export',
      'Notes System',
    ],
  },
  {
    id: 'opportunities',
    name: 'Opportunities',
    description: 'Manage sales opportunities and deals',
    icon: Target,
    features: [
      'Pipeline Stages',
      'Kanban Board View',
      'Deal Tracking',
      'Account/Contact Links',
      'Amount Tracking',
    ],
  },
  {
    id: 'activities',
    name: 'Activity Tracking',
    description: 'Schedule and track tasks, meetings, calls',
    icon: Calendar,
    features: [
      'Task Creation',
      'Due Date Management',
      'Priority Levels',
      'Status Tracking',
      'CSV Import/Export',
    ],
  },
  {
    id: 'calendar',
    name: 'Calendar',
    description: 'Manage and visualize scheduled events, tasks, and appointments within the CRM.',
    icon: Calendar,
    features: [
      'Event Scheduling',
      'Task Reminders',
      'Meeting Management',
      'Multiple Calendar Views',
      'Integration with Activities',
    ],
  },
  {
    id: 'bizdev_sources',
    name: 'Potential Leads',
    description: 'Import and manage business development leads from external directories',
    icon: Database,
    features: [
      'Bulk CSV Import',
      'Promote to Lead',
      'Archive to R2 Cloud',
      'Batch Management',
      'License Tracking',
      'Archive Retrieval',
    ],
  },
  {
    id: 'cash_flow',
    name: 'Cash Flow Management',
    description: 'Track income, expenses, and cash flow trends',
    icon: DollarSign,
    features: [
      'Manual Transaction Entry',
      'Income & Expense Tracking',
      'Time Period Analysis',
      'Recurring Transactions',
      'CRM Integration',
    ],
  },
  {
    id: 'document_processing',
    name: 'Document Processing & Management',
    description: 'AI-powered document extraction, business card scanning, and document management',
    icon: FileText,
    features: [
      'Business Card Scanning',
      'Document Data Extraction',
      'Auto-Contact Creation',
      'Company Research',
      'Mobile Photo Upload',
      'Document Storage & Management',
      'File Upload & Preview',
      'Document Organization',
    ],
  },
  {
    id: 'document_templates_esign',
    name: 'Document Templates (eSign)',
    description:
      'In-house e-signature engine: upload PDFs, drop signature/text/date fields, send for signing, track status (4VD-43)',
    icon: FileText,
    features: [
      'PDF Upload & Field Placement',
      'Drag-and-drop Signature / Text / Date / Checkbox',
      'Tenant-isolated Template Catalogue',
      'Preview / Edit / Soft-Delete',
      'Send-for-Signature (day 2+)',
      'Public Recipient Signing Page (day 4+)',
      'Audit Trail & Certificate of Completion (day 5+)',
    ],
  },
  {
    id: 'ai_campaigns',
    name: 'AI Campaigns',
    description: 'Create and manage AI-powered calling and outreach campaigns',
    icon: BrainCircuit,
    features: [
      'AI-powered Calling Lists',
      'Automated Follow-ups',
      'Campaign Performance Tracking',
      'Custom Prompts',
    ],
  },
  {
    id: 'ai_suggestions',
    name: 'AI Suggestions',
    description: 'Review and approve AI-generated email drafts and recommended actions',
    icon: Sparkles,
    features: [
      'Email Draft Approval Queue',
      'One-click Send or Discard',
      'AI Action Recommendations',
      'Pending Review Inbox',
    ],
  },
  {
    id: 'reports',
    name: 'Analytics & Reports',
    description: 'Business intelligence and insights',
    icon: BarChart3,
    features: [
      'Dashboard Overview',
      'Lead Source Charts',
      'Sales Pipeline View',
      'Activity Summary',
      'Data Export',
    ],
  },
  {
    id: 'employees',
    name: 'Employee Management',
    description: 'Manage team members and workforce',
    icon: Users,
    features: [
      'Employee Profiles',
      'Department Organization',
      'Skills Tracking',
      'Emergency Contacts',
      'CSV Import/Export',
    ],
  },
  {
    id: 'integrations',
    name: 'Integrations',
    description: 'Connect with other tools and manage API settings',
    icon: Zap,
    features: [
      'Webhook Management',
      'API Key Generation',
      'Email Integration',
      'Third-party Connectors',
    ],
  },
  {
    id: 'payment_portal',
    name: 'Payment Portal',
    description: 'Manage payment provider connections like Stripe.',
    icon: CreditCard,
    features: ['Stripe Integration', 'Subscription Management', 'Billing Portal Access'],
  },
  {
    id: 'utilities',
    name: 'Utilities',
    description: 'System utilities and tools',
    icon: Wrench,
    features: [
      'Duplicate Detection',
      'Data Quality Reports',
      'System Diagnostics',
      'Bulk Operations',
    ],
  },
  {
    id: 'client_onboarding',
    name: 'Client Onboarding',
    description: 'Streamlined form for prospects to submit their requirements and request a demo',
    icon: Users,
    features: [
      'Project Requirements Form',
      'Module Selection',
      'Navigation Permissions Setup',
      'Initial User Configuration',
      'Admin Review & Approval',
    ],
  },
  {
    id: 'developer_ai',
    name: 'Developer AI',
    description:
      'Superadmin-only AI assistant for codebase analysis, debugging, and system operations',
    icon: BrainCircuit,
    superadminOnly: true,
    features: [
      'Code Analysis & Search',
      'File Reading & Editing',
      'Command Execution (with approvals)',
      'Log Analysis & Debugging',
      'System Health Monitoring',
    ],
  },
  {
    id: 'realtime_voice',
    name: 'Realtime Voice',
    description: 'Hands-free voice conversations with AiSHA using the realtime assistant.',
    icon: Mic,
    experimental: true,
    features: [
      'OpenAI Realtime streaming',
      'Live microphone input',
      'Instant assistant replies',
      'Telemetry + safety enforcement',
      'Fallback to text chat',
    ],
  },
  {
    id: 'workflows',
    name: 'Workflows',
    description: 'Automate CRM tasks with custom workflows and triggers',
    icon: Workflow,
    features: [
      'Visual Workflow Builder',
      'Event-Based Triggers',
      'Multi-Step Automation',
      'Conditional Logic',
      'External Integrations',
    ],
  },
  {
    id: 'care_workflows',
    name: 'CARE Workflows',
    description:
      'AI-driven care triggers, automations, and playbooks for proactive client engagement',
    icon: Zap,
    features: [
      'C.A.R.E. Trigger Configuration',
      'Automated Follow-ups',
      'Playbook Management',
      'Client Engagement Rules',
      'Condition-Based Actions',
    ],
  },
  {
    id: 'construction_projects',
    name: 'Project Management',
    description: 'Track projects, assignments, and team resources across your organization',
    icon: Building2,
    features: [
      'Project Tracking',
      'Team Assignments',
      'Client & Site Management',
      'Rate Management',
      'Role-Based Assignments',
      'Lead to Project Conversion',
    ],
  },
  {
    id: 'workers',
    name: 'Workers',
    description: 'Manage contractors, temp labor, and subcontractors for construction staffing',
    icon: Users,
    features: [
      'Worker Management',
      'Contractor Management',
      'Temp Labor Tracking',
      'Skills Tracking',
      'Certifications',
      'Project Assignments',
    ],
  },
  {
    // Finance Operations (read-only Finance Ops console). Keyed by the canonical
    // backend module key `financeOps` (via moduleKey), NOT the display name, so
    // the Module Settings toggle writes the exact modulesettings.module_name the
    // Finance v2 gate reads (backend/lib/finance/financeModuleGate.js) and the
    // nav/permissions mapping expects (src/utils/navigationConfig.js,
    // src/utils/permissions.js). Defaults DISABLED: every tenant gets a row so
    // the module is visible/toggleable, but Finance Ops stays gated until an
    // admin/superadmin enables it per tenant (controlled rollout). The
    // process-level ENABLE_FINANCE_OPS env is a separate master switch that
    // mounts the route at all.
    id: 'financeOps',
    name: 'Finance Operations',
    moduleKey: 'financeOps',
    defaultEnabled: false,
    description:
      'Read-only Finance Operations console: runtime status, ledger, journal entries, approvals, adapter queue, and guardrail banners. No mutating actions.',
    icon: DollarSign,
    features: [
      'Runtime & Guardrail Overview',
      'Ledger / P&L / Balance Sheet',
      'Journal Entries',
      'Approval & Adapter Queues (read-only)',
      'Audit Timeline',
    ],
  },
];

/**
 * Canonical modulesettings key for a module definition. Most modules use their
 * human display `name` as the stored `module_name` (legacy convention), but some
 * — Finance Ops — must store a specific backend key that differs from the label.
 * Such entries set an explicit `moduleKey`; everything else falls back to `name`.
 * This is the single place the frontend resolves a module to its DB key.
 */
export function moduleKeyOf(module) {
  return module?.moduleKey || module?.name;
}

/**
 * Codex P1: alias-aware missing-module filter for the auto-create-on-load path.
 * A tenant currently enrolled via a legacy alias (e.g. `enterpriseFinance`) must
 * NOT have a disabled canonical `financeOps` row silently inserted — under
 * canonical-wins resolution (`financeModuleGate.js`, `permissions.js`) that
 * would clobber the alias-enabled access. Treat the presence of EITHER the
 * canonical key OR any registered alias as "module already configured."
 *
 * @param {Object} opts
 * @param {Array}  opts.modules
 * @param {Iterable<string>} opts.existingNames  module_names already on the tenant
 * @param {Record<string,string[]>} [opts.moduleAliases=MODULE_ALIASES]
 * @returns {Array} modules that are truly missing
 */
export function computeMissingModules({ modules, existingNames, moduleAliases = MODULE_ALIASES }) {
  const existing = new Set(existingNames);
  return modules.filter((m) => {
    const key = moduleKeyOf(m);
    if (existing.has(key)) return false;
    const aliases = moduleAliases?.[key] || [];
    if (aliases.some((a) => existing.has(a))) return false;
    return true;
  });
}

export default function ModuleManager() {
  const [moduleSettings, setModuleSettings] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useUser();
  const { authCookiesReady } = useAuthCookiesReady();
  const { selectedTenantId } = useTenant();

  // Determine effective tenant: prefer selectedTenantId (for superadmin switching), fall back to user.tenant_id
  const effectiveTenantId = selectedTenantId || user?.tenant_id;
  const canManageModuleSettings =
    user?.role === 'admin' || user?.role === 'superadmin' || user?.is_superadmin === true;

  const loadData = useCallback(async () => {
    if (!canManageModuleSettings) {
      setModuleSettings([]);
      setLoading(false);
      return;
    }

    if (!effectiveTenantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      let currentModuleSettings = [];
      try {
        // CRITICAL: Filter by the effective tenant to ensure tenant isolation
        currentModuleSettings = await ModuleSettings.list({ tenant_id: effectiveTenantId });
        // Normalize response shape to array
        if (!Array.isArray(currentModuleSettings)) {
          const rows =
            currentModuleSettings?.data?.modulesettings || currentModuleSettings?.data || [];
          currentModuleSettings = Array.isArray(rows) ? rows : [];
        }
        // Double-filter to ensure only this tenant's settings are used
        currentModuleSettings = currentModuleSettings.filter(
          (s) => s.tenant_id === effectiveTenantId,
        );
        setModuleSettings(currentModuleSettings);
      } catch (error) {
        console.warn('Could not load module settings:', error);
        setModuleSettings([]);
        currentModuleSettings = [];
      }

      // Initialize default settings for modules that don't exist FOR THIS TENANT
      const existingModuleNames = currentModuleSettings.map((s) => s.module_name);
      const missingModules = computeMissingModules({
        modules: defaultModules,
        existingNames: existingModuleNames,
      });

      if (missingModules.length > 0 && effectiveTenantId) {
        try {
          const newModuleRecords = missingModules.map((module) => ({
            tenant_id: effectiveTenantId, // Use effective tenant, not user.tenant_id
            module_name: moduleKeyOf(module),
            // Most modules default enabled; controlled-rollout modules (e.g.
            // Finance Ops) set defaultEnabled:false so they seed disabled.
            is_enabled: module.defaultEnabled !== false,
          }));
          await ModuleSettings.bulkCreate(newModuleRecords);

          const updatedSettings = await ModuleSettings.list({ tenant_id: effectiveTenantId });
          let updatedArray = updatedSettings;
          if (!Array.isArray(updatedArray)) {
            const rows = updatedSettings?.data?.modulesettings || updatedSettings?.data || [];
            updatedArray = Array.isArray(rows) ? rows : [];
          }
          updatedArray = updatedArray.filter((s) => s.tenant_id === effectiveTenantId);
          setModuleSettings(updatedArray);
        } catch (error) {
          console.warn('Could not create default module settings:', error);
        }
      }
    } catch (error) {
      console.error('Error loading module data:', error);
    } finally {
      setLoading(false);
    }
  }, [canManageModuleSettings, effectiveTenantId]);

  useEffect(() => {
    if (user && authCookiesReady) {
      loadData();
    }
  }, [user, authCookiesReady, loadData]);

  const toggleModule = async (moduleId, currentStatus) => {
    if (!user || !effectiveTenantId) return;

    if (!canManageModuleSettings) {
      toast.error('Only admin and superadmin can modify module settings');
      return;
    }

    try {
      const module = defaultModules.find((m) => m.id === moduleId);
      // CRITICAL: Find setting for the current effective tenant only
      const setting = moduleSettings.find(
        (s) => s.module_name === moduleKeyOf(module) && s.tenant_id === effectiveTenantId,
      );
      const newStatus = !currentStatus;

      if (setting) {
        // Update existing setting
        await ModuleSettings.update(setting.id, {
          tenant_id: effectiveTenantId,
          is_enabled: newStatus,
        });

        // Update local state
        setModuleSettings((prev) =>
          prev.map((s) =>
            s.module_name === moduleKeyOf(module) && s.tenant_id === effectiveTenantId
              ? { ...s, is_enabled: newStatus }
              : s,
          ),
        );
      } else {
        // Create new setting if none exists
        const newSetting = await ModuleSettings.create({
          tenant_id: effectiveTenantId,
          module_name: moduleKeyOf(module),
          is_enabled: newStatus,
        });

        // Add to local state
        setModuleSettings((prev) => [...prev, newSetting]);
      }

      // Dispatch event to notify Layout and other components
      window.dispatchEvent(
        new CustomEvent('module-settings-changed', {
          detail: {
            moduleId,
            moduleName: module?.name || moduleId,
            isActive: newStatus,
            changedBy: user.email,
          },
        }),
      );

      toast.success(`${module?.name || moduleId} ${newStatus ? 'enabled' : 'disabled'}`);
    } catch (error) {
      console.error('Error toggling module:', error);
      toast.error('Failed to update module setting');
    }
  };

  const getModuleStatus = (moduleId) => {
    const module = defaultModules.find((m) => m.id === moduleId);
    const key = moduleKeyOf(module);
    // CRITICAL: Find setting for the current effective tenant only.
    let setting = moduleSettings.find(
      (s) => s.module_name === key && s.tenant_id === effectiveTenantId,
    );
    // Codex P1 — alias-aware fallback: a tenant enrolled via a legacy alias
    // (e.g. `enterpriseFinance`) is effectively enrolled in the canonical
    // module. Without this, the toggle would show OFF for an alias-enrolled
    // tenant, misleading the admin and risking a misclick that disables them.
    if (!setting) {
      const aliases = MODULE_ALIASES?.[key] || [];
      if (aliases.length > 0) {
        setting = moduleSettings.find(
          (s) => aliases.includes(s.module_name) && s.tenant_id === effectiveTenantId,
        );
      }
    }
    // No row yet: fall back to the module's own default (most are enabled;
    // controlled-rollout modules like Finance Ops set defaultEnabled:false).
    return setting?.is_enabled ?? module?.defaultEnabled !== false;
  };

  // Admin-only: List currently disabled modules for the selected tenant
  const DisabledModulesPanel = () => {
    const isAdminLike = canManageModuleSettings;
    // Use effectiveTenantId which is already calculated at component level
    if (!isAdminLike || !effectiveTenantId) return null;

    const disabled = moduleSettings
      .filter((s) => s.tenant_id === effectiveTenantId && s.is_enabled === false)
      .map((s) => s.module_name);

    return (
      <div className="mt-6 p-3 rounded border border-yellow-700/40 bg-yellow-900/20">
        <div className="text-sm font-medium text-yellow-300">Disabled for tenant</div>
        {disabled.length === 0 ? (
          <div className="text-xs text-yellow-200/80 mt-1">
            No modules are disabled for this tenant.
          </div>
        ) : (
          <ul className="mt-2 text-sm text-yellow-100 list-disc list-inside">
            {disabled.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  if (loading) {
    return <div className="p-6 text-center text-slate-300">Loading modules...</div>;
  }

  return (
    <div className="space-y-6">
      <Card className="bg-slate-800 border-slate-700 shadow-lg">
        <CardHeader className="border-b border-slate-700">
          <CardTitle className="flex items-center gap-2 text-slate-100">
            <Settings className="w-5 h-5 text-blue-400" />
            Ai-SHA CRM Module Management
          </CardTitle>
          <CardDescription className="text-slate-400">
            Enable or disable modules to customize your CRM experience. Only administrators can
            manage module settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          {!canManageModuleSettings && (
            <Alert className="bg-amber-900/30 border-amber-700/50">
              <AlertCircle className="h-4 w-4 text-amber-400" />
              <AlertDescription className="text-amber-200">
                Module settings are admin-only. Your role can view this page, but changes are
                disabled.
              </AlertDescription>
            </Alert>
          )}

          <Alert className="bg-blue-900/30 border-blue-700/50">
            <AlertCircle className="h-4 w-4 text-blue-400" />
            <AlertDescription className="text-blue-300">
              <strong>Module settings are the final authority on visibility.</strong> Disabling a
              module here will hide it from all users, regardless of their individual permissions.
              Changes take effect immediately across the app.
            </AlertDescription>
          </Alert>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {defaultModules.map((module) => {
              const isActive = getModuleStatus(module.id);
              return (
                <Card
                  key={module.id}
                  className={`transition-all duration-200 ${
                    isActive
                      ? 'border-green-600/50 bg-green-900/20 shadow-lg'
                      : 'border-slate-600 bg-slate-700/50 hover:bg-slate-700/70'
                  }`}
                >
                  <CardHeader className="pb-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-12 h-12 rounded-lg flex items-center justify-center transition-colors ${
                            isActive ? 'bg-green-600/20' : 'bg-slate-600/50'
                          }`}
                        >
                          <module.icon
                            className={`w-6 h-6 ${isActive ? 'text-green-400' : 'text-slate-400'}`}
                          />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-slate-100">
                            {module.name}
                            {module.experimental && (
                              <Badge className="ml-2 bg-yellow-600 text-white hover:bg-yellow-700 text-xs">
                                BETA
                              </Badge>
                            )}
                          </h3>
                          <Badge
                            className={`mt-1 ${
                              isActive
                                ? 'bg-green-600 text-white hover:bg-green-700'
                                : 'bg-slate-600 text-slate-300 hover:bg-slate-500'
                            }`}
                          >
                            {isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </div>
                      </div>
                      <Switch
                        checked={isActive}
                        onCheckedChange={() => toggleModule(module.id, isActive)}
                        disabled={!canManageModuleSettings}
                        className="data-[state=checked]:bg-green-600"
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-sm text-slate-400 mb-4">{module.description}</p>

                    <div className="space-y-3">
                      <h4 className="text-sm font-medium text-slate-300">Current Features:</h4>
                      <div className="space-y-2 max-h-32 overflow-y-auto">
                        {module.features.map((feature, index) => (
                          <div key={index} className="flex items-center gap-2 text-sm">
                            <CheckCircle
                              className={`w-3 h-3 flex-shrink-0 ${
                                isActive ? 'text-green-400' : 'text-slate-500'
                              }`}
                            />
                            <span className={isActive ? 'text-slate-300' : 'text-slate-500'}>
                              {feature}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card className="border-amber-600/50 bg-amber-900/20">
            <CardContent className="p-6">
              <div className="flex items-start gap-3">
                <Zap className="w-6 h-6 text-amber-400 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="text-amber-400 mb-2 text-lg font-semibold">
                    Planned Enhancements
                  </h4>
                  <p className="text-amber-600 text-sm leading-relaxed">
                    Future releases will include: Advanced AI Scoring, Revenue Forecasting,
                    Automated Workflows, Call Integration, Meeting Scheduler, Custom Reports, and
                    advanced Analytics. These features will be automatically added to existing
                    modules as they become available.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Module Statistics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-slate-700">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-400">
                {defaultModules.filter((m) => getModuleStatus(m.id)).length}
              </div>
              <div className="text-sm text-slate-400">Active Modules</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-slate-400">
                {defaultModules.filter((m) => !getModuleStatus(m.id)).length}
              </div>
              <div className="text-sm text-slate-400">Inactive Modules</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-400">{defaultModules.length}</div>
              <div className="text-sm text-slate-400">Total Available</div>
            </div>
          </div>

          {/* Disabled Modules Panel */}
          <DisabledModulesPanel />
        </CardContent>
      </Card>
    </div>
  );
}
