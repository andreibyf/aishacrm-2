import { useCallback, useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Building2, Globe } from "lucide-react";
import { Tenant } from "@/api/entities";
import { useTenant } from "./tenantContext";
import { toast } from "sonner";
import { useApiManager } from "./ApiManager";

export default function TenantSwitcher({ user }) {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { selectedTenantId, setSelectedTenantId } = useTenant();
  const { cachedRequest } = useApiManager();

  const loadTenants = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const tenantsData = await cachedRequest(
        "Tenant",
        "list",
        {},
        () => Tenant.list(),
      );

      // CRITICAL: Handle undefined or null response
      const validTenantsData = Array.isArray(tenantsData) ? tenantsData : [];

      console.log("TenantSwitcher: Loaded tenants:", validTenantsData.length);
      setTenants(validTenantsData);

      // CRITICAL: Validate current selectedTenantId is in the list
      if (selectedTenantId && validTenantsData.length > 0) {
        // Check by UUID id only
        const tenantExists = validTenantsData.find((t) =>
          t.id === selectedTenantId
        );
        if (!tenantExists) {
          console.warn(
            "TenantSwitcher: Current selected tenant not in list, clearing selection:",
            selectedTenantId,
          );
          setSelectedTenantId(null);
          try {
            localStorage.removeItem("selected_tenant_id");
          } catch (e) {
            console.warn("TenantSwitcher: Failed to clear localStorage:", e);
          }
          toast.error(
            "Selected client no longer exists. Reverted to global view.",
          );
        }
      }
    } catch (error) {
      console.error("Error loading clients:", error);
      setError(error.message || "Network error");
      setTenants([]);
    } finally {
      setLoading(false);
    }
  }, [cachedRequest, selectedTenantId, setSelectedTenantId]);

  useEffect(() => {
    if (user?.role === "admin" || user?.role === "superadmin") {
      loadTenants();
    }
  }, [user, loadTenants]);

  // Only show for admin/superadmin users
  if (!user || (user.role !== "admin" && user.role !== "superadmin")) {
    return null;
  }

  const handleTenantChange = async (tenantId) => {
    console.log("[TenantSwitcher] User selected tenant:", tenantId);
    console.log("[TenantSwitcher] Current selectedTenantId:", selectedTenantId);

    try {
      // Normalize special 'all' value to null
      const normalizedTenantId = tenantId === "all" || tenantId === "null"
        ? null
        : tenantId;

      console.log("[TenantSwitcher] Normalized tenant ID:", normalizedTenantId);

      // CRITICAL: Validate the tenant exists before switching (only when not global)
      if (normalizedTenantId) {
        // Ensure tenants is an array before using find
        const tenantsArray = Array.isArray(tenants) ? tenants : [];
        // Check by UUID id only (tenant_id is legacy TEXT field)
        const tenantExists = tenantsArray.find((t) =>
          t?.id === normalizedTenantId
        );
        if (!tenantExists) {
          console.error(
            "TenantSwitcher: Attempted to switch to non-existent tenant:",
            tenantId,
          );
          toast.error("Selected client does not exist.");
          return;
        }
      }

      // Update the context and persist to localStorage
      setSelectedTenantId(normalizedTenantId);

      // Persist immediately to localStorage
      try {
        if (normalizedTenantId === null) {
          localStorage.removeItem("selected_tenant_id");
          console.log(
            "[TenantSwitcher] Cleared tenant selection from localStorage",
          );
        } else {
          localStorage.setItem("selected_tenant_id", normalizedTenantId);
          console.log(
            "[TenantSwitcher] Saved tenant to localStorage:",
            normalizedTenantId,
          );
        }
      } catch (e) {
        console.error("[TenantSwitcher] Failed to save to localStorage:", e);
      }

      // Do not force a page refresh; let React context propagate and Layout re-render
      try {
        const tenantsArray = Array.isArray(tenants) ? tenants : [];
        const name = normalizedTenantId === null
          ? "All Clients"
          : tenantsArray.find((t) => t?.id === normalizedTenantId)?.name ||
            "Selected client";
        toast.success(`Switched to: ${name}`);
      } catch {
        // non-blocking UX
      }
    } catch (error) {
      console.error("Error switching tenant:", error);
      toast.error("Failed to switch client. Please try again.");
    }
  };

  const getDisplayValue = () => {
    // Map null to a stable string value for the Select component
    return selectedTenantId ?? "all";
  };

  const getCurrentTenantName = () => {
    if (!selectedTenantId) return "All Clients";
    const tenantsArray = Array.isArray(tenants) ? tenants : [];
    // Match by UUID id only
    const tenant = tenantsArray.find((t) => t?.id === selectedTenantId);
    return tenant?.name || "Unknown Client";
  };

  if (error) {
    return (
      <div className="flex items-center gap-2 text-amber-600">
        <AlertCircle className="w-4 h-4" />
        <span className="text-sm hidden sm:inline">
          Client data unavailable
        </span>
      </div>
    );
  }

  // Ensure tenants is always an array
  const tenantsArray = Array.isArray(tenants) ? tenants : [];

  return (
    <div className="flex items-center gap-2">
      <div className="hidden sm:flex items-center gap-2 text-sm">
        <Building2 className="w-4 h-4 text-slate-500" />
        <Select
          value={getDisplayValue()}
          onValueChange={handleTenantChange}
          disabled={loading}
        >
          <SelectTrigger className="w-[280px] h-8 text-xs bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600">
            <SelectValue
              placeholder={loading
                ? "Loading clients..."
                : "Select a client to manage..."}
            />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
            <SelectItem
              value="all"
              className="text-slate-200 hover:bg-slate-700 focus:bg-slate-700"
            >
              <div className="flex items-center gap-2">
                <Globe className="w-3 h-3" />
                <span>All Clients (Global View)</span>
              </div>
            </SelectItem>
            {tenantsArray.map((tenant) => (
              <SelectItem
                key={tenant.id}
                value={tenant.id}
                className="text-slate-200 hover:bg-slate-700 focus:bg-slate-700"
              >
                <div className="flex items-center gap-2">
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{
                      backgroundColor: tenant.primary_color || "#3b82f6",
                    }}
                  />
                  <span>{tenant.name}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="sm:hidden">
        <Select
          value={getDisplayValue()}
          onValueChange={handleTenantChange}
          disabled={loading}
        >
          <SelectTrigger className="w-36 h-8 text-xs bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600">
            <SelectValue
              placeholder={loading ? "Loading clients..." : "Select client..."}
            />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
            <SelectItem
              value="all"
              className="text-slate-200 hover:bg-slate-700 focus:bg-slate-700"
            >
              All Clients (Global View)
            </SelectItem>
            {tenantsArray.map((tenant) => (
              <SelectItem
                key={tenant.id}
                value={tenant.id}
                className="text-slate-200 hover:bg-slate-700 focus:bg-slate-700"
              >
                {tenant.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="hidden lg:block">
        <Badge
          variant="outline"
          className="text-xs bg-slate-700/50 text-slate-300 border-slate-600"
        >
          Managing Client: {getCurrentTenantName()}
        </Badge>
      </div>
    </div>
  );
}
