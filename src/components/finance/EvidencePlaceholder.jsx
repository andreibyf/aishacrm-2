/**
 * EvidencePlaceholder (Finance Read API Slice 1 / UI-1C)
 *
 * §7.11 Evidence / audit pack tab — now live via GET /api/v2/finance/evidence
 * -packs (design freeze §6.8, FIXED). Builds ONE tamper-evident evidence pack
 * on demand from the tenant event stream and shows its metadata + integrity
 * hashes. There is no historical pack registry (none exists) and no generate /
 * share affordance; building a pack is a pure read. The controls are Refresh
 * (rebuild for the current scope) and a read-only CSV Export of the displayed
 * pack metadata + integrity hashes (no secrets).
 */

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCcw } from 'lucide-react';
import * as finance from '@/api/finance';
import FinanceExportButtons from './FinanceExportButtons';
import { displayCell } from './financeCsv';

/**
 * CSV records for the displayed evidence-pack fields, mirroring the on-screen
 * cell text (empty -> '—', artifact_count 0 -> '0'). Integrity hashes are
 * tamper-evidence values, not secrets; no credential/token field is ever
 * surfaced (the API does not return any).
 */
function evidenceRecords(pack) {
  if (!pack) return [];
  return [
    { Field: 'Pack ID', Value: displayCell(pack.pack_id) },
    { Field: 'Generated at', Value: displayCell(pack.generated_at) },
    { Field: 'Artifact count', Value: displayCell(pack.artifact_count) },
    { Field: 'Pack hash', Value: displayCell(pack.integrity?.pack_hash) },
    { Field: 'Events hash', Value: displayCell(pack.integrity?.events_hash) },
    { Field: 'Approvals hash', Value: displayCell(pack.integrity?.approvals_hash) },
  ];
}

function Row({ label, value, testId }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-border bg-muted px-3 py-2">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span
        className="break-all text-right text-xs font-medium text-foreground"
        data-testid={testId}
      >
        {value != null && value !== '' ? String(value) : '—'}
      </span>
    </div>
  );
}

export default function EvidencePlaceholder({ tenantId }) {
  const [state, setState] = useState({ pack: null, loading: false, error: null });

  const load = useCallback(
    async (signal) => {
      if (!tenantId) return;
      setState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const data = await finance.getEvidencePack(tenantId, { signal });
        if (signal?.aborted) return;
        setState({ pack: data?.pack ?? null, loading: false, error: null });
      } catch (err) {
        if (err?.name === 'AbortError' || signal?.aborted) return;
        setState({ pack: null, loading: false, error: err });
      }
    },
    [tenantId],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  const pack = state.pack;

  return (
    <div data-testid="finance-evidence-placeholder">
      <Card className="border-border bg-card text-foreground">
        <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
          <div>
            <CardTitle className="text-base font-semibold text-foreground">
              Evidence / audit pack
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              On-demand tamper-evident evidence pack built from this tenant&apos;s event stream.
              There is no stored pack history; this is a fresh read-only build. No generate /
              download action.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <FinanceExportButtons
              records={evidenceRecords(pack)}
              area="evidence-pack"
              tenantId={tenantId}
              title="Evidence"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => load()}
              disabled={state.loading}
              data-testid="finance-evidence-refresh"
              aria-label="Rebuild evidence pack"
              className="border-border bg-muted text-foreground hover:bg-accent"
            >
              <RefreshCcw
                className={`h-3.5 w-3.5 ${state.loading ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span className="ml-1.5 text-xs">Refresh</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-foreground">
          {state.error ? (
            <div
              data-testid="finance-evidence-error"
              className="rounded-md border border-red-300 dark:border-red-800/50 bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-800 dark:text-red-100"
            >
              <div className="font-medium">Could not build evidence pack.</div>
              <p className="mt-1 text-xs text-red-700/80 dark:text-red-200/80">
                {state.error.message || 'Unknown error.'} (status {state.error.status ?? '—'})
              </p>
            </div>
          ) : !pack ? (
            <p className="text-xs text-muted-foreground" data-testid="finance-evidence-loading">
              {state.loading ? 'Building…' : 'No pack built yet.'}
            </p>
          ) : (
            <div className="space-y-2" data-testid="finance-evidence-pack">
              <Row label="Pack ID" value={pack.pack_id} testId="finance-evidence-pack-id" />
              <Row label="Generated at" value={pack.generated_at} />
              <Row
                label="Artifact count"
                value={pack.artifact_count}
                testId="finance-evidence-artifact-count"
              />
              <Row label="Pack hash" value={pack.integrity?.pack_hash} />
              <Row label="Events hash" value={pack.integrity?.events_hash} />
              <Row label="Approvals hash" value={pack.integrity?.approvals_hash} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
