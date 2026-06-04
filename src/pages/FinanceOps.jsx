/**
 * Finance Operations Console (UI Slice 1 / UI-1B)
 *
 * Read-only operations console for finance admins / operators / implementation
 * engineers. Hosts the per-tenant Finance v2 runtime view, the four
 * persistent guardrail banners, and the tab strip that UI-1C populates with
 * data panels.
 *
 * Scope (per design freeze §1/§15, extended by the Test/Live data-mode feature):
 *   - The page exposes NO finance-DATA mutating affordance — no approve / reject
 *     / reverse / replay / retry / cancel / sync / activate / enable button. The
 *     6 mutating Finance v2 data endpoints are not imported, referenced, or called.
 *   - The ONE exception is the superadmin **Test/Live data-mode** control (in the
 *     Runtime overview): it calls the single config setter
 *     `finance.updateFinanceDataMode` (PUT /settings/data-mode), and is gated to
 *     superadmins on the frontend (the backend enforces it too, 403 otherwise).
 *   - Otherwise the page consumes only the GET read routes via src/api/finance.js.
 *   - Access follows the backend contract: authenticated tenant +
 *     validateTenantAccess + per-tenant financeOps module gate.
 *
 * The page renders one of three top-level states:
 *
 *   1. "Route disabled" — `/runtime/status` returns 404, meaning
 *      ENABLE_FINANCE_OPS is not 'true' in this environment. Operator action
 *      required.
 *   2. "Tenant not enrolled" — `/runtime/status` returns 403 with the
 *      "Finance Ops is not enabled for this tenant" message. Admin action
 *      required (insert/enable a modulesettings row with module_name =
 *      'financeOps' or the 'enterpriseFinance' alias).
 *   3. "Healthy" — `/runtime/status` returns 200. The page renders the
 *      banner stack + tab strip + active tab content. UI-1B fills only the
 *      Runtime overview tab; UI-1C replaces the other tabs' placeholder
 *      content with real panels.
 *
 * UI-1B tab placeholders carry a stable data-testid (`finance-tab-content-
 * placeholder-{tabId}`) so UI-1C's PR diff and Codex review can confirm
 * every placeholder has been replaced with a real panel.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, BarChart3, Lock, Loader2 } from 'lucide-react';
import { useTenant } from '@/components/shared/tenantContext';
import { useUser } from '@/components/shared/useUser';
import * as finance from '@/api/finance';
import GuardrailBanners from '@/components/finance/GuardrailBanners';
import RuntimeOverview from '@/components/finance/RuntimeOverview';
import FinanceCreatePanel from '@/components/finance/FinanceCreatePanel';
import LedgerSummary from '@/components/finance/LedgerSummary';
import JournalEntriesList from '@/components/finance/JournalEntriesList';
import DraftInvoicesPanel from '@/components/finance/DraftInvoicesPanel';
import JournalDraftsPanel from '@/components/finance/JournalDraftsPanel';
import ApprovalQueuePanel from '@/components/finance/ApprovalQueuePanel';
import AdapterQueuePanel from '@/components/finance/AdapterQueuePanel';
import AuditTimelinePanel from '@/components/finance/AuditTimelinePanel';
import ProjectionStatusPanel from '@/components/finance/ProjectionStatusPanel';
import SandboxAdapterPanel from '@/components/finance/SandboxAdapterPanel';
import EvidencePlaceholder from '@/components/finance/EvidencePlaceholder';

// Tab inventory frozen by design freeze §6.2. UI-1B renders the full tab
// strip; UI-1C fills the content for tabs 2-11. Keeping the list here means
// UI-1C does NOT need to edit FinanceOps.jsx structurally — it only swaps
// out the per-tab `Component` slot or replaces the placeholder JSX inside
// each TabsContent.
export const FINANCE_OPS_TABS = Object.freeze([
  { id: 'runtime-overview', label: 'Runtime overview' },
  { id: 'ledger', label: 'Ledger summary' },
  { id: 'invoices', label: 'Draft invoices' },
  { id: 'journal-drafts', label: 'Journal drafts' },
  { id: 'journal-entries', label: 'Journal entries' },
  { id: 'approvals', label: 'Approval queue' },
  { id: 'adapter-queue', label: 'Adapter queue' },
  { id: 'audit', label: 'Audit timeline' },
  { id: 'projection', label: 'Projection / degraded' },
  { id: 'sandbox-adapter', label: 'Sandbox adapter' },
  { id: 'evidence', label: 'Evidence' },
]);

const DEFAULT_TAB = 'runtime-overview';

// Exact message returned by the per-tenant financeOps module gate at
// backend/routes/finance.v2.js:78-82. This is the ONLY 403 path that means
// "tenant not enrolled". The other 403 paths on the route stack come from
// validateTenantAccess (backend/middleware/validateTenant.js:138-163) and
// signal different remediation:
//   - "User not assigned to any tenant. Contact administrator."     (auth)
//   - "Access denied: You do not have permission to access this tenant's data."  (wrong tenant)
// Collapsing all 403s into "tenant not enrolled" misrenders those two states
// as a module-enrollment problem and points the operator at the wrong fix,
// so they are explicitly NOT treated as the not-enrolled state below.
const FINANCE_OPS_NOT_ENABLED_MESSAGE = 'Finance Ops is not enabled for this tenant';

function isTenantNotEnrolledError(err) {
  if (!err) return false;
  if (err.status !== 403) return false;
  return err.message === FINANCE_OPS_NOT_ENABLED_MESSAGE;
}

function isRouteDisabledError(err) {
  return Boolean(err) && err.status === 404;
}

function PageHeader() {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-slate-100">
        <BarChart3 className="h-5 w-5" aria-hidden="true" />
        <h1 className="text-xl font-semibold">Finance Operations</h1>
      </div>
      <p className="max-w-3xl text-sm text-slate-400">
        Read-only operator / admin view of the Finance v2 runtime, projections, ledger, draft
        invoices, journal entries, approval queue, adapter queue, audit timeline, and sandbox
        adapter status. No mutating actions are available in this slice.
      </p>
    </div>
  );
}

function RouteDisabledState() {
  return (
    <Card data-testid="finance-ops-route-disabled" className="border-slate-700/40 bg-slate-900/60">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-amber-300" aria-hidden="true" />
          <CardTitle className="text-base text-slate-100">
            Finance Operations is not enabled in this environment
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="text-sm text-slate-400">
        The Finance v2 route surface is not mounted (ENABLE_FINANCE_OPS is not &apos;true&apos;).
        Contact your deploy owner if Finance Operations should be available here. Retrying will not
        help — this is a process-level environment flag, not a per-tenant setting.
      </CardContent>
    </Card>
  );
}

function TenantNotEnrolledState() {
  return (
    <Card
      data-testid="finance-ops-tenant-not-enrolled"
      className="border-slate-700/40 bg-slate-900/60"
    >
      <CardHeader>
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-300" aria-hidden="true" />
          <CardTitle className="text-base text-slate-100">
            Finance Operations is not enabled for this tenant
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="text-sm text-slate-400">
        Your tenant is not enrolled in the financeOps module. Contact your administrator to enable
        it in Module Settings. (Backend expects a row in{' '}
        <code className="rounded bg-slate-800 px-1 py-0.5 text-xs">modulesettings</code> with{' '}
        <code className="rounded bg-slate-800 px-1 py-0.5 text-xs">
          module_name = &apos;financeOps&apos;
        </code>{' '}
        and <code className="rounded bg-slate-800 px-1 py-0.5 text-xs">is_enabled = true</code>.)
      </CardContent>
    </Card>
  );
}

function MissingTenantState() {
  return (
    <Card data-testid="finance-ops-missing-tenant" className="border-slate-700/40 bg-slate-900/60">
      <CardHeader>
        <CardTitle className="text-base text-slate-100">No tenant selected</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-slate-400">
        Select a tenant from the top bar to view Finance Operations state.
      </CardContent>
    </Card>
  );
}

function GenericErrorState({ error, onRetry }) {
  return (
    <Card data-testid="finance-ops-generic-error" className="border-red-800/50 bg-red-900/20">
      <CardHeader>
        <CardTitle className="text-base text-red-100">Could not load Finance Operations</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-red-200/80">
        <p>
          {error?.message || 'Unknown error.'} (status {error?.status ?? '—'})
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRetry}
          data-testid="finance-ops-generic-error-retry"
          className="border-red-700 bg-red-900/40 text-red-100 hover:bg-red-900/60"
        >
          Retry
        </Button>
      </CardContent>
    </Card>
  );
}

export default function FinanceOpsPage() {
  const { selectedTenantId } = useTenant();
  const { user } = useUser();
  const isSuperadmin = user?.role === 'superadmin' || user?.is_superadmin === true;

  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab');
  const activeTab = useMemo(() => {
    if (tabFromUrl && FINANCE_OPS_TABS.some((t) => t.id === tabFromUrl)) {
      return tabFromUrl;
    }
    return DEFAULT_TAB;
  }, [tabFromUrl]);

  const handleTabChange = useCallback(
    (next) => {
      const params = new URLSearchParams(searchParams);
      if (next === DEFAULT_TAB) {
        params.delete('tab');
      } else {
        params.set('tab', next);
      }
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);

  const fetchStatus = useCallback(
    async (signal) => {
      if (!selectedTenantId) {
        setStatus(null);
        setError(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const next = await finance.getRuntimeStatus(selectedTenantId, { signal });
        if (signal?.aborted) return;
        setStatus(next);
        setLastRefreshedAt(new Date());
      } catch (err) {
        if (err?.name === 'AbortError' || signal?.aborted) return;
        setError(err);
        setStatus(null);
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
        }
      }
    },
    [selectedTenantId],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    fetchStatus(ctrl.signal);
    return () => ctrl.abort();
  }, [fetchStatus]);

  const handleRefresh = useCallback(() => {
    // Return the promise so awaiters (e.g. FinanceCreatePanel) actually wait for
    // the refetch before settling their own UI state.
    return fetchStatus();
  }, [fetchStatus]);

  // Superadmin Test/Live data-mode control. The backend also enforces the
  // superadmin gate (403 otherwise); the UI hides the control for non-superadmins.
  const [modeUpdating, setModeUpdating] = useState(false);
  const [modeError, setModeError] = useState(null);
  const handleChangeMode = useCallback(
    async (mode) => {
      if (!selectedTenantId) return;
      setModeUpdating(true);
      setModeError(null);
      try {
        await finance.updateFinanceDataMode(selectedTenantId, mode);
        await fetchStatus();
      } catch (err) {
        setModeError(err?.message || 'Failed to change the data mode.');
      } finally {
        setModeUpdating(false);
      }
    },
    [selectedTenantId, fetchStatus],
  );

  // Top-level state selection. The order matters: route-disabled and
  // tenant-not-enrolled override the page chrome entirely (banners + tabs
  // would be confusing when the data surface is unavailable), while the
  // generic error preserves the chrome so the retry path is visible.
  if (!selectedTenantId) {
    return (
      <div className="flex flex-col gap-4 p-4" data-testid="finance-ops-page">
        <PageHeader />
        <MissingTenantState />
      </div>
    );
  }
  if (isRouteDisabledError(error)) {
    return (
      <div className="flex flex-col gap-4 p-4" data-testid="finance-ops-page">
        <PageHeader />
        <RouteDisabledState />
      </div>
    );
  }
  if (isTenantNotEnrolledError(error)) {
    return (
      <div className="flex flex-col gap-4 p-4" data-testid="finance-ops-page">
        <PageHeader />
        <TenantNotEnrolledState />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4" data-testid="finance-ops-page">
      <PageHeader />
      <GuardrailBanners status={status} />

      {status?.runtime?.mode === 'test' ? (
        <div
          className="rounded-md border border-amber-500/50 bg-amber-500/10 px-4 py-2 text-sm text-amber-200"
          data-testid="finance-ops-test-mode-banner"
          role="status"
        >
          <span className="font-semibold">⚠ TEST DATA</span> — this tenant&apos;s Finance module is
          in <span className="font-semibold">test mode</span>. Records here are sandbox data (not
          real) and can be cleared.
        </div>
      ) : null}

      {error ? <GenericErrorState error={error} onRetry={handleRefresh} /> : null}

      {loading && !status ? (
        <div
          className="flex items-center gap-2 text-sm text-slate-400"
          data-testid="finance-ops-initial-loading"
        >
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading Finance Operations runtime status…
        </div>
      ) : null}

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-3">
        <TabsList
          className="flex flex-wrap gap-1 bg-transparent p-0"
          data-testid="finance-ops-tabs-list"
        >
          {FINANCE_OPS_TABS.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              data-testid={`finance-ops-tab-${tab.id}`}
              className="border border-slate-700/40 bg-slate-800/40 text-xs data-[state=active]:bg-slate-700 data-[state=active]:text-slate-100"
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="runtime-overview" className="m-0">
          <RuntimeOverview
            status={status}
            loading={loading}
            error={null}
            onRefresh={handleRefresh}
            lastRefreshedAt={lastRefreshedAt}
            dataMode={status?.runtime?.data_mode || status?.runtime?.mode || null}
            canEditMode={isSuperadmin}
            onChangeMode={handleChangeMode}
            modeUpdating={modeUpdating}
            modeError={modeError}
            testDataCount={status?.test_data_count ?? 0}
          />
          {status?.runtime?.mode === 'test' ? (
            <div className="mt-3">
              <FinanceCreatePanel tenantId={selectedTenantId} onCreated={handleRefresh} />
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="ledger" className="m-0">
          <LedgerSummary tenantId={selectedTenantId} />
        </TabsContent>
        <TabsContent value="invoices" className="m-0">
          <DraftInvoicesPanel tenantId={selectedTenantId} />
        </TabsContent>
        <TabsContent value="journal-drafts" className="m-0">
          <JournalDraftsPanel tenantId={selectedTenantId} />
        </TabsContent>
        <TabsContent value="journal-entries" className="m-0">
          <JournalEntriesList tenantId={selectedTenantId} />
        </TabsContent>
        <TabsContent value="approvals" className="m-0">
          <ApprovalQueuePanel tenantId={selectedTenantId} />
        </TabsContent>
        <TabsContent value="adapter-queue" className="m-0">
          <AdapterQueuePanel tenantId={selectedTenantId} />
        </TabsContent>
        <TabsContent value="audit" className="m-0">
          <AuditTimelinePanel tenantId={selectedTenantId} />
        </TabsContent>
        <TabsContent value="projection" className="m-0">
          <ProjectionStatusPanel status={status} />
        </TabsContent>
        <TabsContent value="sandbox-adapter" className="m-0">
          <SandboxAdapterPanel status={status} tenantId={selectedTenantId} />
        </TabsContent>
        <TabsContent value="evidence" className="m-0">
          <EvidencePlaceholder tenantId={selectedTenantId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
