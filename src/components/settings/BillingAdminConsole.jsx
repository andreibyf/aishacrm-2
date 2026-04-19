/**
 * BillingAdminConsole
 *
 * Unified billing console with two modes:
 *
 *   mode="tenant"     — visible to all tenant users on their own billing.
 *                        Shows exempt banner OR [current sub + plan selector +
 *                        payment method + invoices] for the tenant that's
 *                        currently selected via TenantContext.
 *
 *   mode="superadmin" — visible only to superadmins. Adds a tenant picker,
 *                        full lifecycle controls (assign/change/cancel),
 *                        exemption set/remove, invoice management
 *                        (create draft, issue, void), and the audit
 *                        event timeline.
 *
 * Backend: uses @/api/billing + @/hooks/useBilling. All shapes normalized
 * at the hook layer (see useBilling.js JSDoc).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Building2, History, FileText, Ban, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { Tenant } from '@/api/entities';
import * as billing from '@/api/billing';
import {
  usePlans,
  useBillingAccount,
  useActiveSubscription,
  useInvoices,
  useInvoice,
  useBillingSummary,
  useBillingEvents,
} from '@/hooks/useBilling';

import {
  PlanSelector,
  CurrentSubscriptionCard,
  InvoiceTable,
  InvoiceDetailSheet,
  PaymentMethodCard,
  ExemptBanner,
  BillingEventTimeline,
  CreateInvoiceDialog,
  ConfirmCancelSubDialog,
  VoidInvoiceDialog,
  ExemptionDialog,
} from '@/components/billing';

const PORTAL_RETURN_URL = () => `${window.location.origin}/PaymentPortal`;

// ============================================================================
// TenantPicker -- superadmin-only
// ============================================================================

function TenantPicker({ value, onChange, disabled }) {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await Tenant.list();
        if (!cancelled) setTenants(list || []);
      } catch (err) {
        if (!cancelled) toast.error(`Failed to load tenants: ${err.message}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const sorted = useMemo(
    () =>
      [...tenants].sort((a, b) => {
        const orderDiff = (a.display_order || 0) - (b.display_order || 0);
        if (orderDiff !== 0) return orderDiff;
        return (a.name || '').localeCompare(b.name || '');
      }),
    [tenants],
  );

  return (
    <div className="flex items-center gap-3" data-testid="billing-tenant-picker">
      <Building2 className="w-4 h-4 text-slate-400 flex-shrink-0" />
      <Select value={value || ''} onValueChange={onChange} disabled={disabled || loading}>
        <SelectTrigger className="w-[320px] bg-slate-800 border-slate-700 text-slate-100">
          <SelectValue placeholder={loading ? 'Loading tenants…' : 'Select a tenant to manage'} />
        </SelectTrigger>
        <SelectContent className="bg-slate-800 border-slate-700 text-slate-100">
          {sorted.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ============================================================================
// Main component
// ============================================================================

export default function BillingAdminConsole({ mode = 'tenant', tenantId: tenantIdProp }) {
  const isSuperadminMode = mode === 'superadmin';

  // Superadmin picks a tenant; tenant-mode just uses the prop
  const [pickedTenantId, setPickedTenantId] = useState(null);
  const tenantId = isSuperadminMode ? pickedTenantId : tenantIdProp;

  // Data loading
  const plans = usePlans();
  const account = useBillingAccount(tenantId);
  const subscription = useActiveSubscription(tenantId);
  const invoices = useInvoices(tenantId, { limit: 50 });
  const summary = useBillingSummary(isSuperadminMode ? tenantId : null);
  const events = useBillingEvents(isSuperadminMode ? tenantId : null, { limit: 50 });

  // Dialog state
  const [detailInvoiceId, setDetailInvoiceId] = useState(null);
  // Full invoice for the drawer (with line_items). Only fetches when a row is picked.
  const detail = useInvoice(detailInvoiceId, detailInvoiceId ? tenantId : null);
  const [showCreateInvoice, setShowCreateInvoice] = useState(false);
  const [showCancelSub, setShowCancelSub] = useState(false);
  const [voidingInvoice, setVoidingInvoice] = useState(null);
  const [showExemptionDialog, setShowExemptionDialog] = useState(false);
  const [exemptionMode, setExemptionMode] = useState('set');
  const [submittingPlan, setSubmittingPlan] = useState(null); // plan_code in flight
  const [redirecting, setRedirecting] = useState(false);

  // Ref to the plan-selector card so we can scroll it into view when a tenant
  // with no card on file clicks the PaymentMethodCard's "Add payment method"
  // CTA. Stripe Checkout requires a plan_code, so the shortest valid path to
  // adding a card is: pick a plan -> complete Checkout -> card is saved.
  const planSelectorRef = useRef(null);

  // Track which tenant id the currently-loaded data belongs to. When the
  // picker changes, we use this to detect the stale-data window so the
  // previous tenant's invoices/subscription don't appear under the
  // new tenant's header (and, more importantly, so mutation handlers
  // can't act on stale row ids that resolve to the wrong tenant).
  //
  // Codex PR #521 P1: without this, switching tenants in superadmin mode
  // left the prior tenant's plan/invoices on screen during the refetch
  // window, and Issue/Void/Cancel would already target the NEW tenant id.
  const tenantSwitching =
    isSuperadminMode &&
    Boolean(tenantId) &&
    // Any of the primary data hooks still loading against the new tenant,
    // OR the account data we have is for a different tenant than the one
    // currently picked (pre-refetch window).
    (account.loading ||
      subscription.loading ||
      invoices.loading ||
      (account.data && account.data.tenant_id && account.data.tenant_id !== tenantId));

  // Gate that disables destructive/mutation actions while data for the
  // currently-picked tenant hasn't finished loading. Read by the Issue/
  // Void per-row buttons, the Cancel subscription CTA, the Create invoice
  // CTA, and the plan selector's in-flight guard.
  const mutationsLocked = tenantSwitching || redirecting;

  const refreshAll = useCallback(() => {
    account.refetch();
    subscription.refetch();
    invoices.refetch();
    if (isSuperadminMode) {
      summary.refetch();
      events.refetch();
    }
  }, [account, subscription, invoices, summary, events, isSuperadminMode]);

  // ------ Handlers: plan selection (tenant-mode = Checkout; superadmin-mode = direct assign/change)
  const handleSelectPlan = useCallback(
    async (plan) => {
      if (!tenantId) return;
      setSubmittingPlan(plan.code);
      try {
        if (isSuperadminMode) {
          if (subscription.data) {
            await billing.changePlan(tenantId, { plan_code: plan.code });
            toast.success(`Plan changed to ${plan.name}`);
          } else {
            await billing.assignPlan(tenantId, { plan_code: plan.code });
            toast.success(`Plan ${plan.name} assigned`);
          }
          refreshAll();
        } else {
          const { url } = await billing.createCheckoutSession({
            tenant_id: tenantId,
            plan_code: plan.code,
            success_url: `${PORTAL_RETURN_URL()}?checkout=success`,
            cancel_url: `${PORTAL_RETURN_URL()}?checkout=cancel`,
          });
          setRedirecting(true);
          window.location.href = url;
        }
      } catch (err) {
        toast.error(err.message || 'Failed to update subscription');
      } finally {
        setSubmittingPlan(null);
      }
    },
    [tenantId, isSuperadminMode, subscription.data, refreshAll],
  );

  // ------ Handlers: Stripe Billing Portal for payment-method updates (tenant-mode only)
  const handleOpenBillingPortal = useCallback(async () => {
    if (!tenantId) return;
    try {
      setRedirecting(true);
      const { url } = await billing.createPortalSession({
        tenant_id: tenantId,
        return_url: PORTAL_RETURN_URL(),
      });
      window.location.href = url;
    } catch (err) {
      setRedirecting(false);
      toast.error(err.message || 'Failed to open billing portal');
    }
  }, [tenantId]);

  // ------ Handler: tenant has no card on file and clicks "Add payment method".
  // There's no standalone add-card endpoint -- Stripe Checkout is the canonical
  // path, and it requires a plan_code. So we scroll the plan selector into
  // view and prompt the user to pick a plan; completing Checkout will save
  // the card on Stripe's side.
  //
  // Codex PR #521 P1: this unblocks the onboarding/recovery flow that was
  // previously broken because PaymentMethodCard's CTA disabled itself with
  // no onAdd callback.
  const handleAddPaymentMethod = useCallback(() => {
    toast.info('Select a plan below to add your payment method via Stripe Checkout.');
    if (planSelectorRef.current) {
      planSelectorRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  // ------ Handlers: subscription lifecycle (superadmin-mode)
  const handleCancelSub = useCallback(
    async ({ reason }) => {
      await billing.cancelSubscription(tenantId, { reason });
      refreshAll();
    },
    [tenantId, refreshAll],
  );

  // ------ Handlers: invoices (superadmin-mode)
  const handleCreateInvoice = useCallback(
    async (tid, payload) => {
      await billing.createInvoice(tid, payload);
      refreshAll();
    },
    [refreshAll],
  );

  const handleIssueInvoice = useCallback(
    async (invoiceId) => {
      try {
        await billing.issueInvoice(invoiceId);
        toast.success('Invoice issued');
        refreshAll();
      } catch (err) {
        toast.error(err.message || 'Failed to issue invoice');
      }
    },
    [refreshAll],
  );

  const handleVoidInvoice = useCallback(
    async ({ reason }) => {
      if (!voidingInvoice) return;
      await billing.voidInvoice(voidingInvoice.id, { reason });
      refreshAll();
    },
    [voidingInvoice, refreshAll],
  );

  // ------ Handlers: exemption (superadmin-mode)
  const handleExemptionConfirm = useCallback(
    async ({ reason }) => {
      if (exemptionMode === 'set') {
        await billing.setExemption(tenantId, { reason });
      } else {
        await billing.removeExemption(tenantId);
      }
      refreshAll();
    },
    [exemptionMode, tenantId, refreshAll],
  );

  // ------ Derive UI state
  const isExempt = account.data?.billing_exempt === true;
  const loadingAny = account.loading || subscription.loading || invoices.loading || plans.loading;
  const activePlan = subscription.data?.plan || null;

  // ------ Render: superadmin tenant picker
  if (isSuperadminMode && !tenantId) {
    return (
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-slate-100">Platform Billing Administration</CardTitle>
          <CardDescription className="text-slate-400">
            Select a tenant to view and manage their billing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TenantPicker value={pickedTenantId} onChange={setPickedTenantId} />
        </CardContent>
      </Card>
    );
  }

  // ------ Render: tenant-mode without a resolved tenant id
  if (!isSuperadminMode && !tenantId) {
    return (
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-slate-100">Billing</CardTitle>
          <CardDescription className="text-slate-400">
            No tenant is currently selected. Switch to a tenant to view billing.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6" data-testid="billing-admin-console">
      {/* Superadmin header: tenant picker + summary badge */}
      {isSuperadminMode && (
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <TenantPicker
            value={pickedTenantId}
            onChange={(id) => {
              setPickedTenantId(id);
              setDetailInvoiceId(null);
            }}
            disabled={redirecting}
          />
          {summary.data?.tenant?.billing_state && (
            <div className="text-sm text-slate-300">
              State:{' '}
              <span className="font-medium text-slate-100">
                {summary.data.tenant.billing_state}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Redirect overlay when sending user to Stripe */}
      {redirecting && (
        <div className="flex items-center gap-2 text-slate-300" data-testid="billing-redirecting">
          <Loader2 className="w-4 h-4 animate-spin" />
          Redirecting to Stripe…
        </div>
      )}

      {/* Tenant-switch indicator: data for the newly-picked tenant is still
       * loading. Mutation buttons are disabled via `mutationsLocked` while
       * this is showing, so superadmins can't accidentally act on stale
       * on-screen rows with the new tenant's id. */}
      {tenantSwitching && !redirecting && (
        <div
          className="flex items-center gap-2 rounded-md border border-amber-700/50 bg-amber-900/20 px-3 py-2 text-sm text-amber-200"
          data-testid="billing-tenant-switching"
        >
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading billing data for the selected tenant… actions are temporarily disabled.
        </div>
      )}

      {/* Errors */}
      {account.error && (
        <Card className="bg-rose-900/20 border-rose-700/50">
          <CardContent className="p-4 text-rose-200 text-sm">
            Failed to load billing account: {account.error.message}
          </CardContent>
        </Card>
      )}

      {/* Superadmin-only: exemption toggle row */}
      {isSuperadminMode && account.data && (
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-200">Billing exemption</p>
              <p className="text-xs text-slate-400">
                {isExempt
                  ? 'This tenant is currently marked billing-exempt. No invoices or subscriptions apply.'
                  : 'This tenant is billable.'}
              </p>
            </div>
            <Button
              variant={isExempt ? 'outline' : 'secondary'}
              onClick={() => {
                setExemptionMode(isExempt ? 'remove' : 'set');
                setShowExemptionDialog(true);
              }}
            >
              {isExempt ? (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Remove exemption
                </>
              ) : (
                <>
                  <Ban className="w-4 h-4 mr-2" />
                  Mark exempt
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Exempt tenant: show banner only */}
      {isExempt && (
        <ExemptBanner
          reason={account.data?.exemption_reason}
          setAt={account.data?.exemption_set_at}
        />
      )}

      {/* Non-exempt: full billing surface */}
      {!isExempt && (
        <>
          {/* Current subscription */}
          <CurrentSubscriptionCard
            subscription={subscription.data}
            readOnly={!isSuperadminMode}
            onChangePlan={
              isSuperadminMode
                ? undefined /* change is handled inline by selecting a different plan below */
                : undefined
            }
            onCancel={
              isSuperadminMode && subscription.data && !mutationsLocked
                ? () => setShowCancelSub(true)
                : undefined
            }
          />

          {/* Plan selector (always visible: shows current, lets user choose) */}
          <Card className="bg-slate-800 border-slate-700" ref={planSelectorRef}>
            <CardHeader>
              <CardTitle className="text-slate-100">
                {subscription.data ? 'Change plan' : 'Choose a plan'}
              </CardTitle>
              <CardDescription className="text-slate-400">
                {isSuperadminMode
                  ? 'Selecting a plan assigns or changes the subscription immediately.'
                  : 'Selecting a plan takes you to Stripe Checkout to complete payment.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PlanSelector
                plans={plans.data || []}
                currentPlanCode={activePlan?.code}
                onSelect={handleSelectPlan}
                submittingCode={submittingPlan}
              />
            </CardContent>
          </Card>

          {/* Payment method -- tenant-mode only. Superadmins manage cards via
           * the Stripe dashboard directly; this card is the tenant's self-service
           * surface for updating or adding their saved payment method. */}
          {!isSuperadminMode && (
            <PaymentMethodCard
              paymentMethod={
                account.data?.default_payment_method_last4
                  ? {
                      last4: account.data.default_payment_method_last4,
                      brand: account.data.default_payment_method_brand || null,
                    }
                  : null
              }
              onManage={handleOpenBillingPortal}
              onAdd={handleAddPaymentMethod}
              loading={redirecting}
            />
          )}

          {/* Invoices */}
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-slate-100">
                  <FileText className="w-5 h-5 text-indigo-400" />
                  Invoices
                </CardTitle>
                <CardDescription className="text-slate-400">
                  {isSuperadminMode
                    ? 'Full invoice history. Click a row to view details; use the actions column to issue or void.'
                    : 'Your recent invoices. Click a row for details.'}
                </CardDescription>
              </div>
              {isSuperadminMode && (
                <Button
                  onClick={() => setShowCreateInvoice(true)}
                  variant="secondary"
                  data-testid="create-invoice-button"
                  disabled={mutationsLocked}
                >
                  Create invoice
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <InvoiceTable
                invoices={invoices.data || []}
                loading={invoices.loading}
                onRowClick={(inv) => setDetailInvoiceId(inv.id)}
                renderActions={
                  isSuperadminMode
                    ? (inv) => (
                        <div className="flex items-center justify-end gap-2">
                          {inv.status === 'draft' && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleIssueInvoice(inv.id)}
                              disabled={mutationsLocked}
                            >
                              Issue
                            </Button>
                          )}
                          {inv.status !== 'paid' && inv.status !== 'void' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setVoidingInvoice(inv)}
                              disabled={mutationsLocked}
                            >
                              Void
                            </Button>
                          )}
                        </div>
                      )
                    : undefined
                }
              />
            </CardContent>
          </Card>
        </>
      )}

      {/* Audit timeline: superadmin-mode only */}
      {isSuperadminMode && (
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-100">
              <History className="w-5 h-5 text-indigo-400" />
              Audit timeline
            </CardTitle>
            <CardDescription className="text-slate-400">
              Every billing-related event for this tenant, most recent first.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BillingEventTimeline events={events.data || []} loading={events.loading} />
          </CardContent>
        </Card>
      )}

      {/* Loading fallback */}
      {loadingAny && !invoices.data && !subscription.data && (
        <div
          className="flex items-center gap-2 text-slate-400 text-sm"
          data-testid="billing-loading"
        >
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading billing data…
        </div>
      )}

      {/* ---- Dialogs ---- */}
      <InvoiceDetailSheet
        invoice={detail.data}
        loading={detail.loading}
        open={!!detailInvoiceId}
        onClose={() => setDetailInvoiceId(null)}
      />

      {isSuperadminMode && (
        <>
          <CreateInvoiceDialog
            open={showCreateInvoice}
            onClose={() => setShowCreateInvoice(false)}
            tenantId={tenantId}
            onCreate={handleCreateInvoice}
          />

          <ConfirmCancelSubDialog
            open={showCancelSub}
            onClose={() => setShowCancelSub(false)}
            onConfirm={handleCancelSub}
          />

          <VoidInvoiceDialog
            open={!!voidingInvoice}
            onClose={() => setVoidingInvoice(null)}
            onConfirm={handleVoidInvoice}
          />

          <ExemptionDialog
            open={showExemptionDialog}
            mode={exemptionMode}
            onClose={() => setShowExemptionDialog(false)}
            onConfirm={handleExemptionConfirm}
          />
        </>
      )}
    </div>
  );
}
