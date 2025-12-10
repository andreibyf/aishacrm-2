import { useState, useEffect, useMemo, useCallback } from "react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tenant } from "@/api/entities";
import { useTenant } from "@/components/shared/tenantContext";
import { Loader2, Save, RotateCcw, Info } from "lucide-react";
import { toast } from "sonner";

// Navigation items that can be toggled
const NAV_ITEMS = [
  { key: "Dashboard", label: "Dashboard", description: "Main overview page", default: true },
  { key: "Contacts", label: "Contacts", description: "Contact management", default: true },
  { key: "Accounts", label: "Accounts", description: "Company/organization records", default: true },
  { key: "Leads", label: "Leads", description: "Potential customer tracking", default: true },
  { key: "Opportunities", label: "Opportunities", description: "Sales pipeline & deals", default: true },
  { key: "Activities", label: "Activities", description: "Tasks, calls, meetings", default: true },
  { key: "Calendar", label: "Calendar", description: "Schedule view", default: true },
  { key: "BizDevSources", label: "BizDev Sources", description: "Lead source tracking", default: false },
  { key: "CashFlow", label: "Cash Flow", description: "Financial forecasting", default: false },
  { key: "DocumentProcessing", label: "Document Processing", description: "AI document extraction", default: false },
  { key: "DocumentManagement", label: "Document Management", description: "File storage", default: false },
  { key: "AICampaigns", label: "AI Campaigns", description: "Outreach campaigns", default: false },
  { key: "Employees", label: "Employees", description: "Team member management", default: false },
  { key: "Reports", label: "Reports", description: "Analytics & reporting", default: false },
  { key: "Integrations", label: "Integrations", description: "Third-party connections", default: false },
  { key: "Workflows", label: "Workflows", description: "Automation rules", default: false },
  { key: "PaymentPortal", label: "Payment Portal", description: "Payment processing", default: false },
  { key: "Utilities", label: "Utilities", description: "Admin tools", default: false },
  { key: "Agent", label: "AI Agent", description: "AI assistant", default: true },
  { key: "Documentation", label: "Documentation", description: "Help & guides", default: true },
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load tenant settings
  useEffect(() => {
    async function loadTenant() {
      if (!tenantId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const tenantData = await Tenant.get(tenantId);
        setTenant(tenantData);

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

    loadTenant();
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
        {NAV_ITEMS.map((item) => (
          <div
            key={item.key}
            className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 border border-border hover:bg-secondary/70 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm">{item.label}</div>
              <div className="text-xs text-muted-foreground truncate">
                {item.description}
              </div>
            </div>
            <Switch
              checked={!!permissions[item.key]}
              onCheckedChange={(checked) => handleToggle(item.key, checked)}
              disabled={saving}
              className="ml-3 flex-shrink-0"
            />
          </div>
        ))}
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
