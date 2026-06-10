/**
 * JournalEntriesList (UI Slice 1 / UI-1C)
 *
 * Renders the §7.5 Journal entries tab. Live data via
 * GET /api/v2/finance/journal-entries (§8.1.2). The domain service
 * guarantees `id`, `aggregate_id`, `status`, `created_at` on every row;
 * additional fields are forwarded as-is and rendered per-row when present.
 *
 * Read-only. No reverse / re-post / drill-down. No detail-row deep linking
 * in Slice 1 (design freeze §7.5 "Out of scope").
 */

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCcw } from 'lucide-react';
import * as finance from '@/api/finance';
import { reverseJournalEntry } from '@/api/financeWrites';
import FinanceExportButtons from './FinanceExportButtons';
import FinanceRowActionButton from './FinanceRowActionButton';
import { columnsToRecords } from './financeCsv';

const COLUMN_DEFS = [
  { key: 'id', label: 'ID' },
  { key: 'aggregate_id', label: 'Aggregate ID' },
  { key: 'status', label: 'Status' },
  { key: 'created_at', label: 'Created' },
];

function compareByCreatedDesc(a, b) {
  const aT = a?.created_at ? new Date(a.created_at).getTime() : 0;
  const bT = b?.created_at ? new Date(b.created_at).getTime() : 0;
  return bT - aT;
}

// `canWrite` (admin/superadmin + Test mode) turns on a per-row Reverse action on
// posted entries — it creates a reversal that must be approved in the queue.
export default function JournalEntriesList({ tenantId, canWrite = false }) {
  const [state, setState] = useState({
    entries: [],
    loading: false,
    error: null,
  });

  const fetchEntries = useCallback(
    async (signal) => {
      if (!tenantId) return;
      setState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const data = await finance.getJournalEntries(tenantId, { signal });
        if (signal?.aborted) return;
        const list = Array.isArray(data?.journal_entries) ? data.journal_entries : [];
        // Sort newest first per design freeze §7.5; mutation-safe via slice().
        const sorted = list.slice().sort(compareByCreatedDesc);
        setState({ entries: sorted, loading: false, error: null });
      } catch (err) {
        if (err?.name === 'AbortError' || signal?.aborted) return;
        setState({ entries: [], loading: false, error: err });
      }
    },
    [tenantId],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    fetchEntries(ctrl.signal);
    return () => ctrl.abort();
  }, [fetchEntries]);

  return (
    <Card
      data-testid="finance-journal-entries"
      className="border-slate-700/40 bg-slate-900/60 text-slate-100"
    >
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
        <div>
          <CardTitle className="text-base font-semibold text-slate-100">Journal entries</CardTitle>
          <p className="mt-1 text-xs text-slate-400">
            Read-only list of journal entries for this tenant across draft, pending approval,
            posted, and reversed states. Newest first. Row-level detail and reverse actions are
            deferred to a later slice.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <FinanceExportButtons
            records={columnsToRecords(COLUMN_DEFS, state.entries)}
            area="journal-entries"
            tenantId={tenantId}
            title="Journal entries"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fetchEntries()}
            disabled={state.loading}
            data-testid="finance-journal-entries-refresh"
            aria-label="Refresh journal entries"
            className="border-slate-600 bg-slate-800/60 text-slate-100 hover:bg-slate-700"
          >
            <RefreshCcw
              className={`h-3.5 w-3.5 ${state.loading ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span className="ml-1.5 text-xs">Refresh</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {state.error ? (
          <div
            data-testid="finance-journal-entries-error"
            className="rounded-md border border-red-800/50 bg-red-900/20 p-3 text-sm text-red-100"
          >
            <div className="font-medium">Could not load journal entries.</div>
            <p className="mt-1 text-xs text-red-200/80">
              {state.error.message || 'Unknown error.'} (status {state.error.status ?? '—'})
            </p>
          </div>
        ) : state.loading && state.entries.length === 0 ? (
          <p className="text-xs text-slate-400" data-testid="finance-journal-entries-loading">
            Loading…
          </p>
        ) : state.entries.length === 0 ? (
          <p className="text-xs text-slate-400" data-testid="finance-journal-entries-empty">
            No journal entries are available for this tenant yet.
          </p>
        ) : (
          <table className="w-full text-xs" data-testid="finance-journal-entries-table">
            <thead>
              <tr className="border-b border-slate-700/60 text-left text-slate-400">
                {COLUMN_DEFS.map((c) => (
                  <th key={c.key} className="py-2 pr-3 font-medium uppercase tracking-wide">
                    {c.label}
                  </th>
                ))}
                {canWrite ? (
                  <th className="py-2 pr-3 text-right font-medium uppercase tracking-wide">
                    Actions
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {state.entries.map((row, idx) => (
                <tr
                  key={row.id || idx}
                  className="border-b border-slate-700/40 last:border-b-0"
                  data-testid={`finance-journal-entries-row-${row.id || idx}`}
                >
                  {COLUMN_DEFS.map((c) => (
                    <td key={c.key} className="py-1.5 pr-3 text-slate-100">
                      {row[c.key] != null ? String(row[c.key]) : '—'}
                    </td>
                  ))}
                  {canWrite ? (
                    <td className="py-1.5 pr-3 text-right">
                      {row.status === 'posted' ? (
                        <FinanceRowActionButton
                          label="Reverse"
                          confirmMessage="Reverse this posted entry? This creates a reversal that must be approved in the queue."
                          successMessage="Reversal requested — approve it in the Approval queue."
                          onAct={() =>
                            reverseJournalEntry(tenantId, row.id, {
                              reason: 'Reversed from console',
                            })
                          }
                          reload={() => fetchEntries()}
                          testId={`finance-reverse-${row.id}`}
                        />
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
