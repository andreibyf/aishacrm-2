/**
 * RuntimeOverview (UI Slice 1 / UI-1B)
 *
 * The default tab of the Finance Operations console. Renders the
 * `GET /api/v2/finance/runtime/status` response shape (design freeze §7.1):
 *
 *   - Tenant id (echoed back from the server-resolved tenant)
 *   - Runtime mode / persistence / provider sync / governance posture
 *   - 5 entity counts: journal entries, invoices, approvals, audit events,
 *     adapter jobs
 *
 * This component is presentation-only: it accepts the already-fetched
 * status payload (or null while loading) plus optional error state and an
 * onRefresh callback. The fetch lifecycle lives in the page (FinanceOps.jsx)
 * so the runtime status request stays a single per-page-mount round-trip
 * shared with the GuardrailBanners (design freeze §14 cross-packet
 * contract: single RuntimeStatusContext).
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCcw } from 'lucide-react';
import { FINANCE_API_GAPS } from '@/api/finance';

// The backend currently returns this exact string as `runtime.mode` for every
// tenant (backend/routes/finance.v2.js:110). It is NOT an authoritative
// representation of the running mode — see FINANCE_API_GAPS.runtimeMode
// (design freeze §8.2.9). Surface this so the placeholder is not mistaken
// for live signal.
const MODE_PLACEHOLDER = 'mock_read_only';

const COUNT_TILES = [
  { key: 'journal_entries', label: 'Journal entries' },
  { key: 'invoices', label: 'Invoices' },
  { key: 'approvals', label: 'Approvals' },
  { key: 'audit_events', label: 'Audit events' },
  { key: 'adapter_jobs', label: 'Adapter jobs' },
];

function PostureRow({ label, value, dataTestKey }) {
  return (
    <div
      className="flex items-center justify-between gap-3 border-b border-slate-700/40 py-2 last:border-b-0"
      data-testid={`runtime-overview-row-${dataTestKey}`}
    >
      <span className="text-xs uppercase tracking-wide text-slate-400">{label}</span>
      <span className="text-sm font-medium text-slate-100" data-value={value || 'unknown'}>
        {value || <span className="text-slate-500">—</span>}
      </span>
    </div>
  );
}

function CountTile({ label, value }) {
  return (
    <div
      className="rounded-lg border border-slate-700/40 bg-slate-800/40 p-3 text-center"
      data-testid={`runtime-overview-count-${label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <div className="text-2xl font-semibold text-slate-100">{value ?? 0}</div>
      <div className="mt-1 text-xs uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  );
}

/**
 * @param {Object}   props
 * @param {Object?}  props.status     The /runtime/status response payload, or null.
 * @param {boolean}  props.loading    True while the initial fetch is in flight.
 * @param {Object?}  props.error      Non-null when the fetch failed. Shape:
 *                                    { status, code, message } from finance.js.
 * @param {Function} props.onRefresh  Manual refresh callback (no auto-polling
 *                                    in Slice 1 per design freeze §9.1).
 * @param {Date?}    props.lastRefreshedAt  Client-side timestamp of the last
 *                                          successful refresh. Rendered as
 *                                          "Last refreshed: X ago" per §9.2.
 */
export default function RuntimeOverview({
  status = null,
  loading = false,
  error = null,
  onRefresh,
  lastRefreshedAt = null,
}) {
  const runtime = status?.runtime || {};
  const counts = status?.counts || {};

  return (
    <Card
      data-testid="finance-runtime-overview"
      className="border-slate-700/40 bg-slate-900/60 text-slate-100"
    >
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
        <div>
          <CardTitle className="text-base font-semibold text-slate-100">Runtime overview</CardTitle>
          <p className="mt-1 text-xs text-slate-400">
            Live view of the Finance v2 runtime posture for this tenant. Read-only — no mutating
            affordance exists on this card.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={loading}
          data-testid="finance-runtime-overview-refresh"
          aria-label="Refresh runtime status"
          className="border-slate-600 bg-slate-800/60 text-slate-100 hover:bg-slate-700"
        >
          <RefreshCcw
            className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
          <span className="ml-1.5 text-xs">Refresh</span>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <div
            data-testid="finance-runtime-overview-error"
            className="rounded-md border border-red-800/50 bg-red-900/20 p-3 text-sm text-red-100"
          >
            <div className="font-medium">Could not load runtime status.</div>
            <p className="mt-1 text-xs text-red-200/80">
              {error.message || 'Unknown error.'} (status {error.status ?? '—'})
            </p>
          </div>
        ) : null}

        <section aria-label="Runtime posture" className="space-y-0">
          <PostureRow
            label="Tenant id"
            value={status?.tenant_id || (loading ? 'Loading…' : null)}
            dataTestKey="tenant"
          />
          <PostureRow label="Mode" value={runtime.mode} dataTestKey="mode" />
          {runtime.mode === MODE_PLACEHOLDER ? (
            <p
              className="-mt-1 pb-2 text-[10px] text-amber-300/80"
              data-testid="runtime-overview-mode-placeholder-note"
              data-design-ref={FINANCE_API_GAPS.runtimeMode.designRef}
            >
              The {`"${MODE_PLACEHOLDER}"`} value is a backend placeholder, not an authoritative
              mode signal — see gap {FINANCE_API_GAPS.runtimeMode.designRef}.
            </p>
          ) : null}
          <PostureRow label="Persistence" value={runtime.persistence} dataTestKey="persistence" />
          <PostureRow
            label="Provider sync"
            value={runtime.provider_sync}
            dataTestKey="provider-sync"
          />
          <PostureRow label="Governance" value={runtime.governance} dataTestKey="governance" />
        </section>

        <section aria-label="Entity counts" className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {COUNT_TILES.map(({ key, label }) => (
            <CountTile key={key} label={label} value={counts[key]} />
          ))}
        </section>

        {lastRefreshedAt ? (
          <p
            className="text-xs text-slate-500"
            data-testid="finance-runtime-overview-last-refreshed"
          >
            Last refreshed at {lastRefreshedAt.toLocaleTimeString()} (client clock; no server
            last-event-at is published yet)
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
