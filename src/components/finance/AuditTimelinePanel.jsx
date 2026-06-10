/**
 * AuditTimelinePanel (Finance Read API Slice 1 / UI-1C)
 *
 * §7.8 Audit timeline tab — now live via GET /api/v2/finance/audit-events
 * (design freeze §6.5). Cursor-paginated, newest first. Read-only: the only
 * controls are Refresh, Load more (cursor advance), and CSV Export (a read-only
 * serialization of the currently-loaded events). No per-event mutation.
 */

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCcw } from 'lucide-react';
import * as finance from '@/api/finance';
import FinanceExportButtons from './FinanceExportButtons';
import { columnsToRecords } from './financeCsv';

const COLUMNS = [
  { key: 'occurred_at', label: 'Occurred At' },
  { key: 'event_type', label: 'Event Type' },
  { key: 'aggregate_type', label: 'Aggregate Type' },
  { key: 'aggregate_id', label: 'Aggregate ID' },
  { key: 'actor', label: 'Actor' },
];

export default function AuditTimelinePanel({ tenantId }) {
  const [state, setState] = useState({
    events: [],
    nextCursor: null,
    loading: false,
    error: null,
  });

  const load = useCallback(
    async ({ cursor = null, append = false, signal } = {}) => {
      if (!tenantId) return;
      setState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const data = await finance.getAuditEvents(tenantId, { cursor, signal });
        if (signal?.aborted) return;
        const batch = Array.isArray(data?.events) ? data.events : [];
        setState((prev) => ({
          events: append ? [...prev.events, ...batch] : batch,
          nextCursor: data?.next_cursor ?? null,
          loading: false,
          error: null,
        }));
      } catch (err) {
        if (err?.name === 'AbortError' || signal?.aborted) return;
        setState((prev) => ({ ...prev, loading: false, error: err }));
      }
    },
    [tenantId],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    load({ signal: ctrl.signal });
    return () => ctrl.abort();
  }, [load]);

  return (
    <div data-testid="finance-audit-timeline-panel">
      <Card className="border-border bg-card text-foreground">
        <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
          <div>
            <CardTitle className="text-base font-semibold text-foreground">
              Audit timeline
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Read-only finance event timeline for this tenant. Newest first. In-memory events are
              bounded by process restart until persistent reads land.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <FinanceExportButtons
              records={columnsToRecords(COLUMNS, state.events)}
              area="audit-events"
              tenantId={tenantId}
              title="Audit timeline"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => load()}
              disabled={state.loading}
              data-testid="finance-audit-timeline-refresh"
              aria-label="Refresh audit timeline"
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
        <CardContent className="space-y-3">
          {state.error ? (
            <div
              data-testid="finance-audit-timeline-error"
              className="rounded-md border border-red-300 dark:border-red-800/50 bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-800 dark:text-red-100"
            >
              <div className="font-medium">Could not load audit timeline.</div>
              <p className="mt-1 text-xs text-red-700/80 dark:text-red-200/80">
                {state.error.message || 'Unknown error.'} (status {state.error.status ?? '—'})
              </p>
            </div>
          ) : state.loading && state.events.length === 0 ? (
            <p
              className="text-xs text-muted-foreground"
              data-testid="finance-audit-timeline-loading"
            >
              Loading…
            </p>
          ) : state.events.length === 0 ? (
            <p className="text-xs text-muted-foreground" data-testid="finance-audit-timeline-empty">
              No audit events for this tenant yet.
            </p>
          ) : (
            <>
              <table className="w-full text-xs" data-testid="finance-audit-timeline-table">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    {COLUMNS.map((c) => (
                      <th key={c.key} className="py-2 pr-3 font-medium uppercase tracking-wide">
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {state.events.map((row, idx) => (
                    <tr
                      key={row.id || idx}
                      className="border-b border-border last:border-b-0"
                      data-testid={`finance-audit-timeline-row-${row.id || idx}`}
                    >
                      {COLUMNS.map((c) => (
                        <td key={c.key} className="py-1.5 pr-3 text-foreground">
                          {row[c.key] != null && row[c.key] !== '' ? String(row[c.key]) : '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {state.nextCursor ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => load({ cursor: state.nextCursor, append: true })}
                  disabled={state.loading}
                  data-testid="finance-audit-timeline-load-more"
                  className="border-border bg-muted text-foreground hover:bg-accent"
                >
                  <span className="text-xs">Load more</span>
                </Button>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
