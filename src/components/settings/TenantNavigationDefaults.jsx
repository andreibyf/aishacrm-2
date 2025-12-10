import { useState, useEffect, useMemo, useCallback } from "react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tenant, ModuleSettings } from "@/api/entities";
import { useTenant } from "@/components/shared/tenantContext";
import { Loader2, Save, RotateCcw, Info, Lock } from "lucide-react";
import { toast } from "sonner";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

// Navigation items that can be toggled
// moduleName: matches modulesettings table module_name for disabling when module is off
const NAV_ITEMS = [
    { key: "Dashboard", label: "Dashboard", description: "Main overview page", default: true, moduleName: "Dashboard" },
    { key: "Contacts", label: "Contacts", description: "Contact management", default: true, moduleName: "Contact Management" },
    { key: "Accounts", label: "Accounts", description: "Company/organization records", default: true, moduleName: "Account Management" },
    { key: "Leads", label: "Leads", description: "Potential customer tracking", default: true, moduleName: "Lead Management" },
    { key: "Opportunities", label: "Opportunities", description: "Sales pipeline & deals", default: true, moduleName: "Opportunities" },
    { key: "Activities", label: "Activities", description: "Tasks, calls, meetings", default: true, moduleName: "Activity Tracking" },
    { key: "Calendar", label: "Calendar", description: "Schedule view", default: true, moduleName: "Calendar" },
    { key: "BizDevSources", label: "BizDev Sources", description: "Lead source tracking", default: false, moduleName: "BizDev Sources" },
    { key: "CashFlow", label: "Cash Flow", description: "Financial forecasting", default: false, moduleName: "Cash Flow Management" },
    { key: "DocumentProcessing", label: "Document Processing", description: "AI document extraction", default: false, moduleName: "Document Processing & Management" },
    { key: "DocumentManagement", label: "Document Management", description: "File storage", default: false, moduleName: "Document Processing & Management" },
    { key: "AICampaigns", label: "AI Campaigns", description: "Outreach campaigns", default: false, moduleName: "AI Campaigns" },
    { key: "Employees", label: "Employees", description: "Team member management", default: false, moduleName: "Employee Management" },
    { key: "Reports", label: "Reports", description: "Analytics & reporting", default: false, moduleName: "Analytics & Reports" },
    { key: "Integrations", label: "Integrations", description: "Third-party connections", default: false, moduleName: "Integrations" },
    { key: "Workflows", label: "Workflows", description: "Automation rules", default: false, moduleName: "Workflows" },
    { key: "PaymentPortal", label: "Payment Portal", description: "Payment processing", default: false, moduleName: "Payment Portal" },
    { key: "ConstructionProjects", label: "Construction Projects", description: "Project management", default: false, moduleName: "Construction Projects" },
    { key: "Utilities", label: "Utilities", description: "Admin tools", default: false, moduleName: "Utilities" },
    { key: "Agent", label: "AI Agent", description: "AI assistant", default: true, moduleName: "AI Agent" },
    { key: "Documentation", label: "Documentation", description: "Help & guides", default: true, moduleName: null },
];

// Build default permissions object
const DEFAULT_PERMISSIONS = NAV_ITEMS.reduce((acc, item) => {
  acc[item.key] = item.default;
  return acc;
}, {});

export default function TenantNavigationDefaults() {
  const tenantContext = useTenant();
  const tenantId = tenantContext?.selectedTenantId || null;

  const [tenant, setTenant] = useState(null);
  const [permissions, setPermissions] = useState({ ...DEFAULT_PERMISSIONS });
    const [moduleSettings, setModuleSettings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

    // Build a set of disabled module names from module settings
    const disabledModules = useMemo(() => {
        const disabled = new Set();
        moduleSettings.forEach((ms) => {
            if (ms.is_enabled === false) {
                disabled.add(ms.module_name);
            }
        });
        return disabled;
    }, [moduleSettings]);

    // Load tenant settings and module settings
  useEffect(() => {
      async function loadData() {
      if (!tenantId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

          // Load tenant and module settings in parallel
          const [tenantData, moduleData] = await Promise.all([
              Tenant.get(tenantId),
              ModuleSettings.filter({ tenant_id: tenantId }),
          ]);

        setTenant(tenantData);
          setModuleSettings(moduleData || []);

        // Get stored defaults from tenant settings
        const storedDefaults = tenantData?.settings?.default_navigation_permissions;
        if (storedDefaults && typeof storedDefaults === 'object') {
          setPermissions({ ...DEFAULT_PERMISSIONS, ...storedDefaults });
        }
      } catch (error) {
        console.error('Error loading tenant:', error);
        toast.error('Failed to load tenant settings');
      } finally {
        setLoading(false);
      }
    }

      loadData();
  }, [tenantId]);

  const handleToggle = useCallback((key, checked) => {
    setPermissions(prev => ({ ...prev, [key]: checked }));
  }, []);

  const handleEnableAll = useCallback(() => {
    const allEnabled = NAV_ITEMS.reduce((acc, item) => {
      acc[item.key] = true;
      return acc;
    }, {});
    setPermissions(allEnabled);
  }, []);

  const handleReset = useCallback(() => {
    setPermissions({ ...DEFAULT_PERMISSIONS });
  }, []);

  const handleSave = async () => {
    if (!tenantId || !tenant) {
      toast.error('No tenant selected');
      return;
    }

    setSaving(true);
    try {
      // Update tenant settings with new navigation defaults
      const updatedSettings = {
        ...(tenant.settings || {}),
        default_navigation_permissions: permissions,
      };

      await Tenant.update(tenantId, {
        settings: updatedSettings,
      });

      toast.success('Default navigation permissions saved! New users will inherit these settings.');
    } catch (error) {
      console.error('Error saving navigation defaults:', error);
      toast.error('Failed to save: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  // Count enabled/disabled
  const enabledCount = useMemo(() => {
    return Object.values(permissions).filter(Boolean).length;
  }, [permissions]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading settings...</span>
      </div>
    );
  }

  if (!tenantId) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No tenant selected
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Info Banner */}
      <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
        <Info className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm text-blue-300">
            These settings control which navigation items are <strong>enabled by default</strong> when you invite new users.
          </p>
          <p className="text-xs text-blue-300/70 mt-1">
            You can still customize permissions for individual users during the invitation process.
          </p>
        </div>
      </div>

      {/* Summary */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-sm">
            {enabledCount} of {NAV_ITEMS.length} enabled
          </Badge>
                  {disabledModules.size > 0 && (
                      <Badge variant="secondary" className="text-sm text-muted-foreground">
                          <Lock className="w-3 h-3 mr-1" />
                          {disabledModules.size} module{disabledModules.size > 1 ? 's' : ''} disabled
                      </Badge>
                  )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            disabled={saving}
          >
            <RotateCcw className="w-4 h-4 mr-1" />
            Reset
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleEnableAll}
            disabled={saving}
          >
            Enable All
          </Button>
        </div>
      </div>

      {/* Permissions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {NAV_ITEMS.map((item) => {
                  // Check if this nav item's module is disabled
                  const isModuleDisabled = item.moduleName && disabledModules.has(item.moduleName);

                  return (
                      <TooltipProvider key={item.key}>
                          <Tooltip>
                              <TooltipTrigger asChild>
                                  <div
                              className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${isModuleDisabled
                                      ? 'bg-muted/30 border-border/50 opacity-60 cursor-not-allowed'
                                      : 'bg-secondary/50 border-border hover:bg-secondary/70'
                                  }`}
                          >
                              <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                      <span className={`font-medium text-sm ${isModuleDisabled ? 'text-muted-foreground' : ''}`}>
                                          {item.label}
                                      </span>
                                      {isModuleDisabled && (
                                          <Lock className="w-3 h-3 text-muted-foreground" />
                                      )}
                                  </div>
                                  <div className="text-xs text-muted-foreground truncate">
                                      {isModuleDisabled ? 'Module disabled' : item.description}
                                  </div>
                              </div>
                              <Switch
                                  checked={isModuleDisabled ? false : !!permissions[item.key]}
                                  onCheckedChange={(checked) => handleToggle(item.key, checked)}
                                  disabled={saving || isModuleDisabled}
                                  className="ml-3 flex-shrink-0"
                              />
                          </div>
                        </TooltipTrigger>
                        {isModuleDisabled && (
                            <TooltipContent>
                                <p>This module is disabled in Module Settings. Enable the module first to allow user access.</p>
                            </TooltipContent>
                        )}
                    </Tooltip>
                </TooltipProvider>
            );
        })}
      </div>

      {/* Save Button */}
      <div className="flex justify-end pt-4 border-t">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-primary hover:bg-primary/90"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              Save Defaults
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
