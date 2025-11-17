import { useState, useEffect, useMemo, useCallback } from "react";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { User } from "@/api/entities"; // still needed for update & schema
import { useUser } from "@/components/shared/useUser.js";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

function toLabel(key) {
  const map = {
    CashFlow: "Cash Flow",
    DocumentProcessing: "Document Processing",
    DocumentManagement: "Document Management",
    AICampaigns: "AI Campaigns",
    PaymentPortal: "Payment Portal",
    Utilities: "Utilities",
    BizDevSources: "BizDev Sources",
    ClientOnboarding: "Client Onboarding",
    WorkflowGuide: "Workflow Guide",
    ClientRequirements: "Client Requirements"
  };
  return map[key] || key.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}

const ORDER = [
  "Dashboard","Contacts","Accounts","Leads","Opportunities","Activities","Calendar",
  "BizDevSources","CashFlow","DocumentProcessing","DocumentManagement","AICampaigns","Employees",
  "Reports","Integrations","Documentation","Settings","Agent","PaymentPortal","Utilities","Workflows","ClientOnboarding","WorkflowGuide","ClientRequirements"
];

export default function NavigationPermissions({ value, onChange, disabled = false, className = "" }) {
  const { user } = useUser();
  const [keys, setKeys] = useState([]);
  const [_defaults, setDefaults] = useState({}); // Reserved for future default values feature
  const [local, setLocal] = useState(value || {});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load user and schema
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const schema = await User.schema();
        const props = schema?.properties?.navigation_permissions?.properties || {};
        const ks = Object.keys(props);
        const defs = ks.reduce((acc, k) => {
          acc[k] = props[k]?.default !== undefined ? props[k].default : true;
          return acc;
        }, {});

        if (mounted) {
          setKeys(ks);
          setDefaults(defs);
          const userNavPerms = user?.navigation_permissions || {};
          const merged = { ...defs, ...userNavPerms };
          setLocal({ ...merged, ...value });
        }
      } catch (e) {
        console.error('[NavigationPermissions] Error loading schema:', e);
        const ks = [...ORDER];
        const defs = ks.reduce((acc, k) => { acc[k] = true; return acc; }, {});
        if (mounted) {
          setKeys(ks);
          setDefaults(defs);
          setLocal(prev => ({ ...defs, ...value, ...prev }));
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [user, value]);

  // Update local state when value prop changes (for external updates)
  useEffect(() => {
    if (value) {
      console.log('[NavigationPermissions] External value changed:', value);
      setLocal(prev => ({ ...prev, ...value }));
    }
  }, [value]);

  const sortedKeys = useMemo(() => {
    const inOrder = ORDER.filter(k => keys.includes(k));
    const extras = keys.filter(k => !ORDER.includes(k)).sort();
    return [...inOrder, ...extras];
  }, [keys]);

  const handleToggle = useCallback((k, checked) => {
    console.log('[NavigationPermissions] Toggle:', k, '=', checked);
    const next = { ...local, [k]: !!checked };
    setLocal(next);
    
    // Also notify parent component if onChange is provided
    if (typeof onChange === "function") {
      onChange(next);
    }
  }, [local, onChange]);

  const handleSave = async () => {
    if (!user) {
      toast.error("No user loaded");
      return;
    }

    setSaving(true);
    try {
      console.log('[NavigationPermissions] Saving:', local);
      
      // Save to User entity
      await User.update(user.id, {
        navigation_permissions: local
      });

      // Verify it saved by re-fetching
      // We rely on a full page reload to refresh context; optional re-fetch omitted
      console.log('[NavigationPermissions] Saved navigation permissions.');

      toast.success("Navigation permissions saved successfully!");
      
      // Reload page to apply changes
      setTimeout(() => {
        window.location.reload();
      }, 1000);

    } catch (error) {
      console.error('[NavigationPermissions] Save error:', error);
      toast.error("Failed to save navigation permissions: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card className={`bg-slate-800 border-slate-700 ${className}`}>
        <CardContent className="flex items-center justify-center p-8">
          <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
          <span className="ml-2 text-slate-300">Loading permissions...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`bg-slate-800 border-slate-700 ${className}`}>
      <CardHeader className="border-b border-slate-700">
        <CardTitle className="text-slate-100 text-base">Navigation Permissions</CardTitle>
        <CardDescription className="text-slate-400">
          Control which menu items are visible to each user role
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mb-4">
          {sortedKeys.map((k) => (
            <div key={k} className="flex items-center justify-between rounded-md px-3 py-2 bg-slate-700/40 border border-slate-600">
              <span className="text-slate-200 text-sm">{toLabel(k)}</span>
              <Switch
                checked={!!local[k]}
                onCheckedChange={(c) => handleToggle(k, c)}
                disabled={disabled || saving}
              />
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-4 border-t border-slate-700">
          <Button
            onClick={handleSave}
            disabled={disabled || saving}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </div>

        <p className="text-xs text-slate-500 mt-2">
          Changes will take effect after you save and reload the page.
        </p>
      </CardContent>
    </Card>
  );
}
