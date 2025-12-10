import { useEffect, useState, useCallback } from "react";
import { ModuleSettings } from "@/api/entities";
import { useUser } from '@/components/shared/useUser.js';
import { useAuthCookiesReady } from '@/components/shared/useAuthCookiesReady';
import { useTenant } from '@/components/shared/tenantContext';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
  Target,
  TrendingUp,
  Users,
  Workflow,
  Wrench,
  Zap,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";

const defaultModules = [
  {
    id: "dashboard",
    name: "Dashboard",
    description: "Central hub for viewing key metrics and system activity.",
    icon: LayoutDashboard,
    features: [
      "Real-time Stats",
      "Activity Feed",
      "Sales Pipeline Overview",
      "Lead Source Insights",
      "Customizable Widgets",
    ],
  },
  {
    id: "contacts",
    name: "Contact Management",
    description: "Manage customer contacts and relationships",
    icon: Users,
    features: [
      "Create & Edit Contacts",
      "CSV Import/Export",
      "Search & Filter",
      "Table & Card Views",
      "Notes System",
    ],
  },
  {
    id: "accounts",
    name: "Account Management",
    description: "Manage companies and organizations",
    icon: Building2,
    features: [
      "Company Profiles",
      "Industry Categorization",
      "Contact Associations",
      "Address Management",
      "CSV Import/Export",
    ],
  },
  {
    id: "leads",
    name: "Lead Management",
    description: "Track and convert potential customers",
    icon: TrendingUp,
    features: [
      "Lead Creation & Editing",
      "Status Tracking",
      "Source Attribution",
      "CSV Import/Export",
      "Notes System",
    ],
  },
  {
    id: "opportunities",
    name: "Opportunities",
    description: "Manage sales opportunities and deals",
    icon: Target,
    features: [
      "Pipeline Stages",
      "Kanban Board View",
      "Deal Tracking",
      "Account/Contact Links",
      "Amount Tracking",
    ],
  },
  {
    id: "activities",
    name: "Activity Tracking",
    description: "Schedule and track tasks, meetings, calls",
    icon: Calendar,
    features: [
      "Task Creation",
      "Due Date Management",
      "Priority Levels",
      "Status Tracking",
      "CSV Import/Export",
    ],
  },
  {
    id: "calendar",
    name: "Calendar",
    description:
      "Manage and visualize scheduled events, tasks, and appointments within the CRM.",
    icon: Calendar,
    features: [
      "Event Scheduling",
      "Task Reminders",
      "Meeting Management",
      "Multiple Calendar Views",
      "Integration with Activities",
    ],
  },
  {
    id: "bizdev_sources",
    name: "BizDev Sources",
    description:
      "Import and manage business development leads from external directories",
    icon: Database,
    features: [
      "Bulk CSV Import",
      "Promote to Account",
      "Archive to R2 Cloud",
      "Batch Management",
      "License Tracking",
      "Archive Retrieval",
    ],
  },
  {
    id: "cash_flow",
    name: "Cash Flow Management",
    description: "Track income, expenses, and cash flow trends",
    icon: DollarSign,
    features: [
      "Manual Transaction Entry",
      "Income & Expense Tracking",
      "Time Period Analysis",
      "Recurring Transactions",
      "CRM Integration",
    ],
  },
  {
    id: "document_processing",
    name: "Document Processing & Management",
    description:
      "AI-powered document extraction, business card scanning, and document management",
    icon: FileText,
    features: [
      "Business Card Scanning",
      "Document Data Extraction",
      "Auto-Contact Creation",
      "Company Research",
      "Mobile Photo Upload",
      "Document Storage & Management",
      "File Upload & Preview",
      "Document Organization",
    ],
  },
  {
    id: "ai_campaigns",
    name: "AI Campaigns",
    description: "Create and manage AI-powered calling and outreach campaigns",
    icon: BrainCircuit,
    features: [
      "AI-powered Calling Lists",
      "Automated Follow-ups",
      "Campaign Performance Tracking",
      "Custom Prompts",
    ],
  },
  {
    id: "reports",
    name: "Analytics & Reports",
    description: "Business intelligence and insights",
    icon: BarChart3,
    features: [
      "Dashboard Overview",
      "Lead Source Charts",
      "Sales Pipeline View",
      "Activity Summary",
      "Data Export",
    ],
  },
  {
    id: "employees",
    name: "Employee Management",
    description: "Manage team members and workforce",
    icon: Users,
    features: [
      "Employee Profiles",
      "Department Organization",
      "Skills Tracking",
      "Emergency Contacts",
      "CSV Import/Export",
    ],
  },
  {
    id: "integrations",
    name: "Integrations",
    description: "Connect with other tools and manage API settings",
    icon: Zap,
    features: [
      "Webhook Management",
      "API Key Generation",
      "Email Integration",
      "Third-party Connectors",
    ],
  },
  {
    id: "payment_portal",
    name: "Payment Portal",
    description: "Manage payment provider connections like Stripe.",
    icon: CreditCard,
    features: [
      "Stripe Integration",
      "Subscription Management",
      "Billing Portal Access",
    ],
  },
  {
    id: "utilities",
    name: "Utilities",
    description: "System utilities and tools",
    icon: Wrench,
    features: [
      "Duplicate Detection",
      "Data Quality Reports",
      "System Diagnostics",
      "Bulk Operations",
    ],
  },
  {
    id: "client_onboarding",
    name: "Client Onboarding",
    description:
      "Streamlined form for prospects to submit their requirements and request a demo",
    icon: Users,
    features: [
      "Project Requirements Form",
      "Module Selection",
      "Navigation Permissions Setup",
      "Initial User Configuration",
      "Admin Review & Approval",
    ],
  },
  {
    id: "ai_agent",
    name: "AI Agent",
    description: "Intelligent AI assistant for CRM tasks and queries",
    icon: BrainCircuit,
    features: [
      "Natural Language Queries",
      "Data Analysis",
      "Task Automation",
      "Smart Recommendations",
      "Context-Aware Assistance",
    ],
  },
  {
    id: "realtime_voice",
    name: "Realtime Voice",
    description: "Hands-free voice conversations with AiSHA using the realtime assistant.",
    icon: Mic,
    experimental: true,
    features: [
      "OpenAI Realtime streaming",
      "Live microphone input",
      "Instant assistant replies",
      "Telemetry + safety enforcement",
      "Fallback to text chat",
    ],
  },
  {
    id: "workflows",
    name: "Workflows",
    description: "Automate CRM tasks with custom workflows and triggers",
    icon: Workflow,
    features: [
      "Visual Workflow Builder",
      "Event-Based Triggers",
      "Multi-Step Automation",
      "Conditional Logic",
      "External Integrations",
    ],
  },
  {
    id: "construction_projects",
    name: "Construction Projects",
    description: "Track construction projects and worker assignments for staffing companies",
    icon: Building2,
    features: [
      "Project Management",
      "Worker Assignments",
      "Site & Client Tracking",
      "Pay/Bill Rate Management",
      "Role-Based Assignments",
      "Lead to Project Conversion",
    ],
  },
];

export default function ModuleManager() {
  const [moduleSettings, setModuleSettings] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useUser();
  const { authCookiesReady } = useAuthCookiesReady();
  const { selectedTenantId } = useTenant();

  // Determine effective tenant: prefer selectedTenantId (for superadmin switching), fall back to user.tenant_id
  const effectiveTenantId = selectedTenantId || user?.tenant_id;

  const loadData = useCallback(async () => {
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
          const rows = currentModuleSettings?.data?.modulesettings || currentModuleSettings?.data || [];
          currentModuleSettings = Array.isArray(rows) ? rows : [];
        }
        // Double-filter to ensure only this tenant's settings are used
        currentModuleSettings = currentModuleSettings.filter(s => s.tenant_id === effectiveTenantId);
        setModuleSettings(currentModuleSettings);
      } catch (error) {
        console.warn("Could not load module settings:", error);
        setModuleSettings([]);
        currentModuleSettings = [];
      }

      // Initialize default settings for modules that don't exist FOR THIS TENANT
      const existingModuleNames = currentModuleSettings.map((s) => s.module_name);
      const missingModules = defaultModules.filter((m) =>
        !existingModuleNames.includes(m.name)
      );

      if (missingModules.length > 0 && effectiveTenantId) {
        try {
          const newModuleRecords = missingModules.map((module) => ({
            tenant_id: effectiveTenantId, // Use effective tenant, not user.tenant_id
            module_name: module.name,
            is_enabled: true,
          }));
          await ModuleSettings.bulkCreate(newModuleRecords);

          const updatedSettings = await ModuleSettings.list({ tenant_id: effectiveTenantId });
          let updatedArray = updatedSettings;
          if (!Array.isArray(updatedArray)) {
            const rows = updatedSettings?.data?.modulesettings || updatedSettings?.data || [];
            updatedArray = Array.isArray(rows) ? rows : [];
          }
          updatedArray = updatedArray.filter(s => s.tenant_id === effectiveTenantId);
          setModuleSettings(updatedArray);
        } catch (error) {
          console.warn("Could not create default module settings:", error);
        }
      }
    } catch (error) {
      console.error("Error loading module data:", error);
    } finally {
      setLoading(false);
    }
  }, [effectiveTenantId]);

  useEffect(() => {
    if (user && authCookiesReady && effectiveTenantId) {
      loadData();
    }
  }, [user, authCookiesReady, effectiveTenantId, loadData]);

  const toggleModule = async (moduleId, currentStatus) => {
    if (!user || !effectiveTenantId) return;

    try {
      const module = defaultModules.find((m) => m.id === moduleId);
      // CRITICAL: Find setting for the current effective tenant only
      const setting = moduleSettings.find((s) => 
        s.module_name === module?.name && s.tenant_id === effectiveTenantId
      );
      const newStatus = !currentStatus;

      if (setting) {
        await ModuleSettings.update(setting.id, {
          tenant_id: effectiveTenantId, // Use effective tenant, not user.tenant_id
          is_enabled: newStatus,
        });

        // Update local state
        setModuleSettings((prev) =>
          prev.map((s) =>
            s.module_name === module?.name ? { ...s, is_enabled: newStatus } : s
          )
        );

        // Dispatch event to notify Layout and other components
        window.dispatchEvent(
          new CustomEvent("module-settings-changed", {
            detail: {
              moduleId,
              moduleName: module?.name || moduleId,
              isActive: newStatus,
              changedBy: user.email,
            },
          }),
        );

        toast.success(
          `${module?.name || moduleId} ${newStatus ? "enabled" : "disabled"}`,
        );
      }
    } catch (error) {
      console.error("Error toggling module:", error);
      toast.error("Failed to update module setting");
    }
  };

  const getModuleStatus = (moduleId) => {
    const module = defaultModules.find((m) => m.id === moduleId);
    // CRITICAL: Find setting for the current effective tenant only
    const setting = moduleSettings.find((s) => 
      s.module_name === module?.name && s.tenant_id === effectiveTenantId
    );
    return setting?.is_enabled ?? true;
  };

  // Admin-only: List currently disabled modules for the selected tenant
  const DisabledModulesPanel = () => {
    const isAdminLike = user?.role === 'admin' || user?.role === 'superadmin' || user?.is_superadmin === true;
    // Use effectiveTenantId which is already calculated at component level
    if (!isAdminLike || !effectiveTenantId) return null;

    const disabled = moduleSettings
      .filter((s) => s.tenant_id === effectiveTenantId && s.is_enabled === false)
      .map((s) => s.module_name);

    return (
      <div className="mt-6 p-3 rounded border border-yellow-700/40 bg-yellow-900/20">
        <div className="text-sm font-medium text-yellow-300">Disabled for tenant</div>
        {disabled.length === 0 ? (
          <div className="text-xs text-yellow-200/80 mt-1">No modules are disabled for this tenant.</div>
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
    return (
      <div className="p-6 text-center text-slate-300">Loading modules...</div>
    );
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
            Enable or disable modules to customize your CRM experience. Only
            administrators can manage module settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          <Alert className="bg-blue-900/30 border-blue-700/50">
            <AlertCircle className="h-4 w-4 text-blue-400" />
            <AlertDescription className="text-blue-300">
              <strong>
                Module settings are the final authority on visibility.
              </strong>{" "}
              Disabling a module here will hide it from all users, regardless of
              their individual permissions. Changes take effect immediately
              across the app.
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
                      ? "border-green-600/50 bg-green-900/20 shadow-lg"
                      : "border-slate-600 bg-slate-700/50 hover:bg-slate-700/70"
                  }`}
                >
                  <CardHeader className="pb-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-12 h-12 rounded-lg flex items-center justify-center transition-colors ${
                            isActive ? "bg-green-600/20" : "bg-slate-600/50"
                          }`}
                        >
                          <module.icon
                            className={`w-6 h-6 ${
                              isActive ? "text-green-400" : "text-slate-400"
                            }`}
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
                                ? "bg-green-600 text-white hover:bg-green-700"
                                : "bg-slate-600 text-slate-300 hover:bg-slate-500"
                            }`}
                          >
                            {isActive ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                      </div>
                      <Switch
                        checked={isActive}
                        onCheckedChange={() =>
                          toggleModule(module.id, isActive)}
                        className="data-[state=checked]:bg-green-600"
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-sm text-slate-400 mb-4">
                      {module.description}
                    </p>

                    <div className="space-y-3">
                      <h4 className="text-sm font-medium text-slate-300">
                        Current Features:
                      </h4>
                      <div className="space-y-2 max-h-32 overflow-y-auto">
                        {module.features.map((feature, index) => (
                          <div
                            key={index}
                            className="flex items-center gap-2 text-sm"
                          >
                            <CheckCircle
                              className={`w-3 h-3 flex-shrink-0 ${
                                isActive ? "text-green-400" : "text-slate-500"
                              }`}
                            />
                            <span
                              className={isActive
                                ? "text-slate-300"
                                : "text-slate-500"}
                            >
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
                    Future releases will include: Advanced AI Scoring, Revenue
                    Forecasting, Automated Workflows, Call Integration, Meeting
                    Scheduler, Custom Reports, and advanced Analytics. These
                    features will be automatically added to existing modules as
                    they become available.
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
              <div className="text-2xl font-bold text-blue-400">
                {defaultModules.length}
              </div>
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
