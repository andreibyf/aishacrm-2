/**
 * LedgerSummary (UI Slice 1 / UI-1C)
 *
 * Renders the §7.2 Ledger summary tab. Live data via three Finance v2 GET
 * endpoints (§8.1.3 / §8.1.4 / §8.1.5):
 *
 *   - GET /api/v2/finance/ledger        -> ledger object
 *   - GET /api/v2/finance/profit-loss   -> P&L object
 *   - GET /api/v2/finance/balance-sheet -> balance sheet object
 *
 * The three payloads are opaque per design freeze §7.2 — the in-memory
 * domain service shape may differ from the projection-backed shape that
 * lands later. The panel renders each payload generically as a key/value
 * table, with empty-state copy when a section's payload has no own
 * enumerable keys.
 *
 * No mutating affordance. Manual refresh re-runs all three GETs in
 * parallel.
 */

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCcw } from 'lucide-react';
import * as finance from '@/api/finance';

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function OpaqueKVTable({ data, emptyLabel }) {
  if (data == null) return null;
  if (!isPlainObject(data) || Object.keys(data).length === 0) {
    return (
      <p className="text-xs text-slate-500" data-testid="ledger-section-empty">
        {emptyLabel}
      </p>
    );
  }
  return (
    <table className="w-full text-xs">
      <tbody>
        {Object.entries(data).map(([k, v]) => (
          <tr key={k} className="border-b border-slate-700/40 last:border-b-0">
            <td className="py-1.5 pr-3 text-slate-400">{k}</td>
            <td className="py-1.5 text-slate-100">
              {typeof v === 'object' ? JSON.stringify(v) : String(v)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Section({ title, payload, loading, error, emptyLabel, testId }) {
  return (
    <div data-testid={testId} className="space-y-2">
      <div className="text-xs uppercase tracking-wide text-slate-400">{title}</div>
      {loading ? (
        <p className="text-xs text-slate-500">Loading…</p>
      ) : error ? (
        <p className="text-xs text-red-300" data-testid={`${testId}-error`}>
          {error.message || 'Failed to load.'} (status {error.status ?? '—'})
        </p>
      ) : (
        <OpaqueKVTable data={payload} emptyLabel={emptyLabel} />
      )}
    </div>
  );
}

export default function LedgerSummary({ tenantId }) {
  const [state, setState] = useState({
    ledger: null,
    profitLoss: null,
    balanceSheet: null,
    error: {
      ledger: null,
      profitLoss: null,
      balanceSheet: null,
    },
    loading: false,
  });

  const fetchAll = useCallback(
    async (signal) => {
      if (!tenantId) return;
      setState((prev) => ({ ...prev, loading: true }));
      const [ledgerRes, plRes, bsRes] = await Promise.allSettled([
        finance.getLedger(tenantId, { signal }),
        finance.getProfitLoss(tenantId, { signal }),
        finance.getBalanceSheet(tenantId, { signal }),
      ]);
      if (signal?.aborted) return;
      setState({
        ledger: ledgerRes.status === 'fulfilled' ? ledgerRes.value : null,
        profitLoss: plRes.status === 'fulfilled' ? plRes.value : null,
        balanceSheet: bsRes.status === 'fulfilled' ? bsRes.value : null,
        error: {
          ledger: ledgerRes.status === 'rejected' ? ledgerRes.reason : null,
          profitLoss: plRes.status === 'rejected' ? plRes.reason : null,
          balanceSheet: bsRes.status === 'rejected' ? bsRes.reason : null,
        },
        loading: false,
      });
    },
    [tenantId],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    fetchAll(ctrl.signal);
    return () => ctrl.abort();
  }, [fetchAll]);

  return (
    <Card
      data-testid="finance-ledger-summary"
      className="border-slate-700/40 bg-slate-900/60 text-slate-100"
    >
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
        <div>
          <CardTitle className="text-base font-semibold text-slate-100">Ledger summary</CardTitle>
          <p className="mt-1 text-xs text-slate-400">
            Read-only ledger / P&amp;L / balance-sheet snapshots from the Finance v2 in-memory
            domain service. Field shapes are forwarded as-is.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fetchAll()}
          disabled={state.loading}
          data-testid="finance-ledger-summary-refresh"
          aria-label="Refresh ledger summary"
          className="border-slate-600 bg-slate-800/60 text-slate-100 hover:bg-slate-700"
        >
          <RefreshCcw
            className={`h-3.5 w-3.5 ${state.loading ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
          <span className="ml-1.5 text-xs">Refresh</span>
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        <Section
          title="Ledger"
          payload={state.ledger}
          loading={state.loading}
          error={state.error.ledger}
          emptyLabel="Ledger is empty for this tenant."
          testId="finance-ledger-summary-section-ledger"
        />
        <Section
          title="Profit &amp; Loss"
          payload={state.profitLoss}
          loading={state.loading}
          error={state.error.profitLoss}
          emptyLabel="No P&L data for this tenant yet."
          testId="finance-ledger-summary-section-pl"
        />
        <Section
          title="Balance sheet"
          payload={state.balanceSheet}
          loading={state.loading}
          error={state.error.balanceSheet}
          emptyLabel="No balance-sheet data for this tenant yet."
          testId="finance-ledger-summary-section-balance"
        />
      </CardContent>
    </Card>
  );
}
