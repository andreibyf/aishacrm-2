/**
 * Finance Operations Console (UI Slice 1 / UI-1B)
 *
 * Read-only operations console for finance admins / operators / implementation
 * engineers. Hosts the per-tenant Finance v2 runtime view, the four
 * persistent guardrail banners, and the tab strip that UI-1C populates with
 * data panels.
 *
 * Strict scope per design freeze §1 and §15 (commits 5db9d45b / bc0bce52):
 *   - This page exposes NO mutating affordance. No approve / reject / reverse
 *     / replay / retry / cancel / sync / activate / enable button anywhere.
 *   - The page consumes only the 5 GET routes exposed via src/api/finance.js
 *     (UI-1A). The 6 mutating Finance v2 endpoints are not imported, not
 *     referenced, not called.
 *   - Access follows the backend contract: authenticated tenant +
 *     validateTenantAccess + per-tenant financeOps module gate. No frontend
 *     role gate is enforced — that decision is deferred to a later
 *     product/UX slice (design freeze §11.3).
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
import * as finance from '@/api/finance';
import GuardrailBanners from '@/components/finance/GuardrailBanners';
import RuntimeOverview from '@/components/finance/RuntimeOverview';

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

function isTenantNotEnrolledError(err) {
  if (!err) return false;
  if (err.status !== 403) return false;
  // Backend returns this exact message from finance.v2.js:78-82. Matching on
  // the message is a soft signal; the 403 status alone is treated as
  // "tenant not enrolled" because the route's only 403 path is the module
  // gate.
  return true;
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

/**
 * Placeholder rendered inside every UI-1C tab. UI-1B ships these so the tab
 * strip is wired and clickable end-to-end before UI-1C lands. UI-1C replaces
 * each placeholder with the matching read-only panel.
 */
function TabPlaceholder({ tabId, label }) {
  return (
    <Card
      data-testid={`finance-tab-content-placeholder-${tabId}`}
      className="border-dashed border-slate-700/60 bg-slate-900/40"
    >
      <CardHeader>
        <CardTitle className="text-sm text-slate-300">{label}</CardTitle>
      </CardHeader>
      <CardContent className="text-xs text-slate-500">
        This panel is delivered by UI-1C (read-only finance data panels). UI-1B reserves the tab so
        navigation works end-to-end before the data panels land.
      </CardContent>
    </Card>
  );
}

export default function FinanceOpsPage() {
  const { selectedTenantId } = useTenant();

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
    fetchStatus();
  }, [fetchStatus]);

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
          />
        </TabsContent>

        {FINANCE_OPS_TABS.filter((tab) => tab.id !== 'runtime-overview').map((tab) => (
          <TabsContent key={tab.id} value={tab.id} className="m-0">
            <TabPlaceholder tabId={tab.id} label={tab.label} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
