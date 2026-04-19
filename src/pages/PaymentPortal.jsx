/**
 * PaymentPortal -- tenant-facing platform billing portal.
 *
 * All the billing UI logic (exempt banner, current sub, plan selector,
 * payment method, invoices + detail drawer) lives in
 * <BillingAdminConsole mode="tenant" />. This page is just the frame:
 * role gate + tenant resolution from TenantContext.
 *
 * Cal.com tenant-Stripe credential config (the previous contents of
 * this page) has been moved to Settings → Client Integrations, where
 * it belongs.
 */

import { useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CreditCard, Loader2 } from 'lucide-react';
import { useUser } from '@/components/shared/useUser';
import { useTenant } from '@/components/shared/tenantContext';
import BillingAdminConsole from '@/components/settings/BillingAdminConsole';

export default function PaymentPortalPage() {
  const { user, loading: userLoading } = useUser();
  const { selectedTenantId } = useTenant();

  // Tenant mode: use the tenant the user is currently scoped to.
  // Superadmins viewing this page still get the tenant view for their
  // currently-selected tenant; they use Settings → Platform Billing
  // for the full superadmin console.
  const effectiveTenantId = useMemo(() => {
    if (selectedTenantId) return selectedTenantId;
    if (user?.tenant_uuid) return user.tenant_uuid;
    if (user?.tenant_id) return user.tenant_id;
    return null;
  }, [selectedTenantId, user?.tenant_uuid, user?.tenant_id]);

  // Surface Checkout return status from the URL. The backend receives the
  // Stripe webhook and updates state; we just show a success/cancel note.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('checkout');
    if (!result) return;
    // Clean up the param so refreshes don't re-trigger
    params.delete('checkout');
    const next = `${window.location.pathname}${
      params.toString() ? `?${params.toString()}` : ''
    }${window.location.hash || ''}`;
    window.history.replaceState({}, '', next);
  }, []);

  if (userLoading) {
    return (
      <div
        className="flex items-center justify-center p-8 text-slate-400"
        data-testid="payment-portal-loading"
      >
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading…
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8" data-testid="payment-portal-page">
      <div className="max-w-4xl mx-auto space-y-6">
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-100">
              <CreditCard className="w-5 h-5 text-indigo-500" />
              Payment Portal
            </CardTitle>
            <CardDescription className="text-slate-400">
              Manage your subscription plan, payment method, and invoices.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BillingAdminConsole mode="tenant" tenantId={effectiveTenantId} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
