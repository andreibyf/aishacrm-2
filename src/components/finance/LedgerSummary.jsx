/**
 * LedgerSummary (UI Slice 1 / UI-1C)
 *
 * Renders the §7.2 Ledger summary tab. Live data via three Finance v2 GET
 * endpoints (§8.1.3 / §8.1.4 / §8.1.5):
 *
 *   - GET /api/v2/finance/ledger        -> { accounts[], totals:{debit_cents,credit_cents} }
 *   - GET /api/v2/finance/profit-loss   -> { revenue_accounts[], expense_accounts[],
 *                                            totals:{revenue_cents,expense_cents,net_income_cents} }
 *   - GET /api/v2/finance/balance-sheet -> { assets[], liabilities[], equity[],
 *                                            totals:{assets_cents,liabilities_cents,
 *                                                    equity_cents,is_balanced} }
 *
 * Operator-facing presentation (Codex UI-1D P2): the backend speaks in
 * integer cents and account arrays; this panel formats those into currency
 * figures with readable labels and per-section empty states, rather than
 * dumping the raw API field shapes. No mutating affordance. Manual refresh
 * re-runs all three GETs in parallel.
 */

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCcw } from 'lucide-react';
import * as finance from '@/api/finance';

/** Format an integer-cents value as USD currency, defaulting null/NaN to $0.00. */
function formatCents(cents) {
  const n = Number.isFinite(cents) ? cents : 0;
  return (n / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

function SummaryRow({ label, value, testId }) {
  return (
    <div
      className="flex items-center justify-between border-b border-slate-700/40 py-1.5 last:border-b-0"
      {...(testId ? { 'data-testid': testId } : {})}
    >
      <span className="text-xs text-slate-400">{label}</span>
      <span className="text-sm font-medium text-slate-100">{value}</span>
    </div>
  );
}

function AccountRows({ accounts, valueOf }) {
  if (accounts.length === 0) return null;
  return (
    <div className="space-y-0">
      {accounts.map((a, i) => (
        <SummaryRow
          key={a.account_name || a.account_code || i}
          label={a.account_name || a.account_code || `Account ${i + 1}`}
          value={formatCents(valueOf(a))}
        />
      ))}
    </div>
  );
}

function LedgerBody({ data }) {
  const accounts = asArray(data?.accounts);
  const totals = data?.totals || {};
  return (
    <div className="space-y-2">
      {accounts.length === 0 ? (
        <p className="text-xs text-slate-500" data-testid="ledger-section-empty">
          No ledger accounts available for this tenant yet.
        </p>
      ) : (
        <AccountRows accounts={accounts} valueOf={(a) => a.balance_cents} />
      )}
      <SummaryRow label="Debits" value={formatCents(totals.debit_cents)} />
      <SummaryRow label="Credits" value={formatCents(totals.credit_cents)} />
    </div>
  );
}

function ProfitLossBody({ data }) {
  const revenue = asArray(data?.revenue_accounts);
  const expense = asArray(data?.expense_accounts);
  const totals = data?.totals || {};
  return (
    <div className="space-y-2">
      {revenue.length === 0 && expense.length === 0 ? (
        <p className="text-xs text-slate-500" data-testid="ledger-section-empty">
          No revenue or expense accounts available yet.
        </p>
      ) : null}
      <SummaryRow label="Revenue" value={formatCents(totals.revenue_cents)} />
      <SummaryRow label="Expenses" value={formatCents(totals.expense_cents)} />
      <SummaryRow label="Net income" value={formatCents(totals.net_income_cents)} />
    </div>
  );
}

function BalanceSheetBody({ data }) {
  const assets = asArray(data?.assets);
  const liabilities = asArray(data?.liabilities);
  const equity = asArray(data?.equity);
  const totals = data?.totals || {};
  // Three-valued balance state. Never default an absent/failed sheet to
  // "balanced" — that would hide a calculation or load error (beta blocker:
  // "empty states must not hide calculation errors"). Only an explicit
  // is_balanced boolean drives Yes / unbalanced-warning; anything else is
  // Unknown.
  let balanceLabel;
  let balanceClass;
  if (!data || totals.is_balanced === undefined || totals.is_balanced === null) {
    balanceLabel = 'Unknown';
    balanceClass = 'text-slate-400';
  } else if (totals.is_balanced === false) {
    balanceLabel = 'No — unbalanced (ledger integrity issue)';
    balanceClass = 'text-amber-300 font-semibold';
  } else {
    balanceLabel = 'Yes';
    balanceClass = 'text-slate-100';
  }
  return (
    <div className="space-y-2">
      {assets.length === 0 && liabilities.length === 0 && equity.length === 0 ? (
        <p className="text-xs text-slate-500" data-testid="ledger-section-empty">
          No assets, liabilities, or equity accounts available yet.
        </p>
      ) : null}
      <SummaryRow label="Assets" value={formatCents(totals.assets_cents)} />
      <SummaryRow label="Liabilities" value={formatCents(totals.liabilities_cents)} />
      <SummaryRow label="Equity" value={formatCents(totals.equity_cents)} />
      <div className="flex items-center justify-between py-1.5" data-testid="ledger-balance-state">
        <span className="text-xs text-slate-400">Balanced</span>
        <span className={`text-sm ${balanceClass}`}>{balanceLabel}</span>
      </div>
    </div>
  );
}

function Section({ title, loading, error, testId, children }) {
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
        children
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
            Read-only ledger / profit &amp; loss / balance-sheet snapshot for this tenant. Amounts
            are shown in USD.
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
          loading={state.loading}
          error={state.error.ledger}
          testId="finance-ledger-summary-section-ledger"
        >
          <LedgerBody data={state.ledger} />
        </Section>
        <Section
          title="Profit &amp; Loss"
          loading={state.loading}
          error={state.error.profitLoss}
          testId="finance-ledger-summary-section-pl"
        >
          <ProfitLossBody data={state.profitLoss} />
        </Section>
        <Section
          title="Balance sheet"
          loading={state.loading}
          error={state.error.balanceSheet}
          testId="finance-ledger-summary-section-balance"
        >
          <BalanceSheetBody data={state.balanceSheet} />
        </Section>
      </CardContent>
    </Card>
  );
}
