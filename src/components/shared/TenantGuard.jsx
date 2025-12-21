import React from 'react';
import { useTenant } from './tenantContext';
import { useUser } from './useUser';

/**
 * TenantGuard - Enforces mandatory tenant selection for data operations
 * 
 * For admins/superadmins without a pre-assigned tenant: Allow UI to render
 * so they can use the tenant selector to choose one.
 * 
 * For regular users without tenant: They see a message asking admin to assign them.
 */
export default function TenantGuard({ children }) {
  const { selectedTenantId } = useTenant();
  const { user } = useUser();
  const isAdmin = user?.role === 'superadmin' || user?.role === 'admin';

  // For admins/superadmins: Always allow rendering (they can use tenant selector in nav)
  // For regular users: Only block if no tenant assigned
  if (!selectedTenantId && !isAdmin) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full bg-slate-800 border border-red-700/50 rounded-lg p-8">
          <h2 className="text-xl font-semibold text-red-400 mb-4">Tenant Assignment Required</h2>
          <p className="text-slate-300 mb-2">
            Your account is not configured with a tenant. You need to be assigned to a tenant to access data.
          </p>
          <p className="text-slate-400 text-sm">
            Please contact your administrator to assign you to a tenant.
          </p>
        </div>
      </div>
    );
  }

  // Render children - admins will see tenant selector in nav, regular users have a tenant assigned
  return children;
}
