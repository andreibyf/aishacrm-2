/**
 * FinanceTablePanel (Finance Read API Slice 1 / UI-1C)
 *
 * Reusable read-only table panel for the Finance Ops console. Extracted from
 * the JournalEntriesList pattern (fetch-on-mount via AbortController, Refresh
 * button, loading / empty / error / table states) so every newly-live read
 * tab presents identical chrome.
 *
 * Read-only by construction: the only interactive controls are Refresh and,
 * when `exportArea` is set, a CSV Export button (a read-only serialization of
 * the already-displayed rows). No mutating affordance is rendered or accepted.
 *
 * @param {object} props
 * @param {string} props.tenantId
 * @param {string} props.testId        wrapper data-testid (kept stable so the
 *   page smoke test keeps keying on it)
 * @param {string} props.title
 * @param {string} props.description
 * @param {string} props.emptyText
 * @param {Array<{key:string,label:string,render?:(row)=>any}>} props.columns
 * @param {(tenantId:string, opts:{signal:AbortSignal}) => Promise<object>} props.fetcher
 * @param {(data:object) => Array<object>} props.selectRows
 */
import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCcw } from 'lucide-react';
import FinanceExportButtons from './FinanceExportButtons';
import { columnsToRecords } from './financeCsv';

export default function FinanceTablePanel({
  tenantId,
  testId,
  title,
  description,
  emptyText,
  columns,
  fetcher,
  selectRows,
  exportArea,
}) {
  const [state, setState] = useState({ rows: [], loading: false, error: null });

  const load = useCallback(
    async (signal) => {
      if (!tenantId) return;
      setState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const data = await fetcher(tenantId, { signal });
        if (signal?.aborted) return;
        const rows = selectRows(data) || [];
        setState({ rows, loading: false, error: null });
      } catch (err) {
        if (err?.name === 'AbortError' || signal?.aborted) return;
        setState({ rows: [], loading: false, error: err });
      }
    },
    [tenantId, fetcher, selectRows],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  return (
    <Card data-testid={testId} className="border-slate-700/40 bg-slate-900/60 text-slate-100">
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
        <div>
          <CardTitle className="text-base font-semibold text-slate-100">{title}</CardTitle>
          {description ? <p className="mt-1 text-xs text-slate-400">{description}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          {exportArea ? (
            <FinanceExportButtons
              records={columnsToRecords(columns, state.rows)}
              area={exportArea}
              tenantId={tenantId}
              title={title}
            />
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => load()}
            disabled={state.loading}
            data-testid={`${testId}-refresh`}
            aria-label={`Refresh ${title}`}
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
            data-testid={`${testId}-error`}
            className="rounded-md border border-red-800/50 bg-red-900/20 p-3 text-sm text-red-100"
          >
            <div className="font-medium">Could not load {title.toLowerCase()}.</div>
            <p className="mt-1 text-xs text-red-200/80">
              {state.error.message || 'Unknown error.'} (status {state.error.status ?? '—'})
            </p>
          </div>
        ) : state.loading && state.rows.length === 0 ? (
          <p className="text-xs text-slate-400" data-testid={`${testId}-loading`}>
            Loading…
          </p>
        ) : state.rows.length === 0 ? (
          <p className="text-xs text-slate-400" data-testid={`${testId}-empty`}>
            {emptyText}
          </p>
        ) : (
          <table className="w-full text-xs" data-testid={`${testId}-table`}>
            <thead>
              <tr className="border-b border-slate-700/60 text-left text-slate-400">
                {columns.map((c) => (
                  <th key={c.key} className="py-2 pr-3 font-medium uppercase tracking-wide">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {state.rows.map((row, idx) => (
                <tr
                  key={row.id || idx}
                  className="border-b border-slate-700/40 last:border-b-0"
                  data-testid={`${testId}-row-${row.id || idx}`}
                >
                  {columns.map((c) => {
                    const value = c.render ? c.render(row) : row[c.key];
                    return (
                      <td key={c.key} className="py-1.5 pr-3 text-slate-100">
                        {value != null && value !== '' ? String(value) : '—'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
