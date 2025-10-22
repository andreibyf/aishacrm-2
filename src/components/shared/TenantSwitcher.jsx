import React, { useState, useEffect, useCallback } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Building2, Users, AlertCircle, Globe } from "lucide-react";
import { Tenant } from "@/api/entities";
import { useTenant } from './tenantContext';
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
        'Tenant',
        'list',
        {},
        () => Tenant.list()
      );
      
      // CRITICAL: Handle undefined or null response
      const validTenantsData = Array.isArray(tenantsData) ? tenantsData : [];
      
      console.log('TenantSwitcher: Loaded tenants:', validTenantsData.length);
      setTenants(validTenantsData);
      
      // CRITICAL: Validate current selectedTenantId is in the list
      if (selectedTenantId && validTenantsData.length > 0) {
        const tenantExists = validTenantsData.find(t => t.id === selectedTenantId);
        if (!tenantExists) {
          console.warn('TenantSwitcher: Current selected tenant not in list, clearing selection:', selectedTenantId);
          setSelectedTenantId(null);
          try {
            localStorage.removeItem('selected_tenant_id');
          } catch (e) {
            console.warn('TenantSwitcher: Failed to clear localStorage:', e);
          }
          toast.error('Selected client no longer exists. Reverted to global view.');
        }
      }
    } catch (error) {
      console.error("Error loading clients:", error);
      setError(error.message || 'Network error');
      setTenants([]);
    } finally {
      setLoading(false);
    }
  }, [cachedRequest, selectedTenantId, setSelectedTenantId]);

  useEffect(() => {
    if (user?.role === 'admin' || user?.role === 'superadmin') {
      loadTenants();
    }
  }, [user, loadTenants]);

  // Only show for admin/superadmin users
  if (!user || (user.role !== 'admin' && user.role !== 'superadmin')) {
    return null;
  }

  const handleTenantChange = async (tenantId) => {
    console.log('TenantSwitcher: Switching to tenant:', tenantId);
    
    try {
      // CRITICAL: Validate the tenant exists before switching
      if (tenantId && tenantId !== 'null') {
        // Ensure tenants is an array before using find
        const tenantsArray = Array.isArray(tenants) ? tenants : [];
        const tenantExists = tenantsArray.find(t => t?.id === tenantId);
        if (!tenantExists) {
          console.error('TenantSwitcher: Attempted to switch to non-existent tenant:', tenantId);
          toast.error('Selected client does not exist.');
          return;
        }
      }

      // Update the context
      setSelectedTenantId(tenantId);
      
      // Force a page refresh to apply new branding
      setTimeout(() => {
        window.location.reload();
      }, 100);
      
    } catch (error) {
      console.error('Error switching tenant:', error);
      toast.error('Failed to switch client. Please try again.');
    }
  };

  const getDisplayValue = () => {
    return selectedTenantId;
  };

  const getCurrentTenantName = () => {
    if (!selectedTenantId) return 'All Clients';
    const tenantsArray = Array.isArray(tenants) ? tenants : [];
    const tenant = tenantsArray.find((t) => t?.id === selectedTenantId);
    return tenant?.name || 'Unknown Client';
  };

  if (error) {
    return (
      <div className="flex items-center gap-2 text-amber-600">
        <AlertCircle className="w-4 h-4" />
        <span className="text-sm hidden sm:inline">Client data unavailable</span>
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
            <SelectValue placeholder={loading ? "Loading clients..." : "Select a client to manage..."} />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
            <SelectItem value={null} className="text-slate-200 hover:bg-slate-700 focus:bg-slate-700">
              <div className="flex items-center gap-2">
                <Globe className="w-3 h-3" />
                <span>All Clients (Global View)</span>
              </div>
            </SelectItem>
            {tenantsArray.map((tenant) => (
              <SelectItem key={tenant.id} value={tenant.id} className="text-slate-200 hover:bg-slate-700 focus:bg-slate-700">
                <div className="flex items-center gap-2">
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: tenant.primary_color || '#3b82f6' }}
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
            <SelectValue placeholder={loading ? "Loading clients..." : "Select client..."} />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
            <SelectItem value={null} className="text-slate-200 hover:bg-slate-700 focus:bg-slate-700">All Clients (Global View)</SelectItem>
            {tenantsArray.map((tenant) => (
              <SelectItem key={tenant.id} value={tenant.id} className="text-slate-200 hover:bg-slate-700 focus:bg-slate-700">
                {tenant.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="hidden lg:block">
        <Badge variant="outline" className="text-xs bg-slate-700/50 text-slate-300 border-slate-600">
          Managing Client: {getCurrentTenantName()}
        </Badge>
      </div>
    </div>
  );
}