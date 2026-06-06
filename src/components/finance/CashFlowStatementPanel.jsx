/**
 * CashFlowStatementPanel (Cash Flow Bridge B / Slice 2)
 *
 * Read-only cash-flow STATEMENT — GET /api/v2/finance/cash-flow. Derived from the
 * tenant's posted finance journal lines on cash/bank accounts; reconciles to the
 * balance sheet's Cash line. Operator-facing: integer cents are formatted to
 * currency. No mutating affordance. Honest empty state — a draft/pending journal
 * is NOT cash until it is posted, so the statement is empty until journals post.
 */

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCcw } from 'lucide-react';
import * as finance from '@/api/finance';
import FinanceCsvExportButton from './FinanceCsvExportButton';

function formatCents(cents) {
  const n = Number.isFinite(cents) ? cents : 0;
  return (n / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

function cashFlowRecords(stmt) {
  if (!stmt) return [];
  const rec = (Period, Line, Inflow, Outflow, Net) => ({ Period, Line, Inflow, Outflow, Net });
  const out = [];
  asArray(stmt.periods).forEach((p) => {
    out.push(rec(p.period, 'Total', formatCents(p.inflow_cents), formatCents(p.outflow_cents), formatCents(p.net_cents)));
    asArray(p.by_category).forEach((c) =>
      out.push(rec(p.period, c.classification, formatCents(c.inflow_cents), formatCents(c.outflow_cents), '')),
    );
  });
  out.push(rec('All periods', 'Total', formatCents(stmt.totals?.inflow_cents), formatCents(stmt.totals?.outflow_cents), formatCents(stmt.totals?.net_cents)));
  return out;
}

export default function CashFlowStatementPanel({ tenantId }) {
  const [state, setState] = useState({ data: null, loading: false, error: null });

  const load = useCallback(
    async (signal) => {
      if (!tenantId) return;
      setState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const res = await finance.getCashFlow(tenantId, { signal });
        if (signal?.aborted) return;
        setState({ data: res?.cash_flow ?? res ?? null, loading: false, error: null });
      } catch (err) {
        if (err?.name === 'AbortError' || signal?.aborted) return;
        setState({ data: null, loading: false, error: err });
      }
    },
    [tenantId],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  const stmt = state.data;
  const periods = asArray(stmt?.periods);

  return (
    <div data-testid="finance-cash-flow-panel">
      <Card className="border-slate-700/40 bg-slate-900/60 text-slate-100">
        <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
          <div>
            <CardTitle className="text-base font-semibold">Cash flow</CardTitle>
            <p className="mt-1 text-xs text-slate-400">
              Read-only cash-flow statement derived from this tenant&apos;s posted journal lines on
              cash/bank accounts. Reconciles to the balance sheet&apos;s Cash line. Amounts in USD.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <FinanceCsvExportButton
              records={cashFlowRecords(stmt)}
              area="cash-flow"
              tenantId={tenantId}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => load()}
              disabled={state.loading}
              data-testid="finance-cash-flow-refresh"
              aria-label="Refresh cash flow"
              className="border-slate-600 bg-slate-800/60 text-slate-100 hover:bg-slate-700"
            >
              <RefreshCcw className={`h-3.5 w-3.5 ${state.loading ? 'animate-spin' : ''}`} aria-hidden="true" />
              <span className="ml-1.5 text-xs">Refresh</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {state.error ? (
            <div
              data-testid="finance-cash-flow-error"
              className="rounded-md border border-red-800/50 bg-red-900/20 p-3 text-sm text-red-100"
            >
              <div className="font-medium">Could not load cash flow.</div>
              <p className="mt-1 text-xs text-red-200/80">
                {state.error.message || 'Unknown error.'} (status {state.error.status ?? '—'})
              </p>
            </div>
          ) : state.loading && !stmt ? (
            <p className="text-xs text-slate-400" data-testid="finance-cash-flow-loading">
              Loading…
            </p>
          ) : periods.length === 0 ? (
            <p className="text-xs text-slate-400" data-testid="finance-cash-flow-empty">
              No posted cash movements yet — cash flow appears once journals are posted.
            </p>
          ) : (
            <div className="space-y-4" data-testid="finance-cash-flow-statement">
              <div className="grid grid-cols-3 gap-2 text-sm">
                <Total label="Inflow" value={formatCents(stmt.totals?.inflow_cents)} testId="finance-cash-flow-total-inflow" />
                <Total label="Outflow" value={formatCents(stmt.totals?.outflow_cents)} testId="finance-cash-flow-total-outflow" />
                <Total label="Net" value={formatCents(stmt.totals?.net_cents)} testId="finance-cash-flow-total-net" />
              </div>
              {periods.map((p) => (
                <div key={p.period} className="rounded-md border border-slate-700/40 p-3" data-testid={`finance-cash-flow-period-${p.period}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-100">{p.period}</span>
                    <span className="text-xs text-slate-400">
                      in {formatCents(p.inflow_cents)} · out {formatCents(p.outflow_cents)} · net{' '}
                      <span className="font-medium text-slate-100">{formatCents(p.net_cents)}</span>
                    </span>
                  </div>
                  {asArray(p.by_category).length > 0 ? (
                    <table className="mt-2 w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-700/60 text-left text-slate-400">
                          <th className="py-1 pr-3 font-medium uppercase tracking-wide">Category</th>
                          <th className="py-1 pr-3 font-medium uppercase tracking-wide">Inflow</th>
                          <th className="py-1 pr-3 font-medium uppercase tracking-wide">Outflow</th>
                        </tr>
                      </thead>
                      <tbody>
                        {p.by_category.map((c) => (
                          <tr key={c.classification} className="border-b border-slate-700/40 last:border-b-0">
                            <td className="py-1 pr-3 text-slate-100">{c.classification}</td>
                            <td className="py-1 pr-3 text-slate-100">{formatCents(c.inflow_cents)}</td>
                            <td className="py-1 pr-3 text-slate-100">{formatCents(c.outflow_cents)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Total({ label, value, testId }) {
  return (
    <div className="rounded-md border border-slate-700/40 px-3 py-2" data-testid={testId}>
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-sm font-semibold text-slate-100">{value}</div>
    </div>
  );
}
