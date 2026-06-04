/**
 * FinanceCreatePanel
 *
 * Test-mode create affordances for the Finance Ops console. Renders only when
 * the tenant is in TEST mode (the page gates it), so everything created here is
 * sandbox/test data. Offers three quick "make an entry" actions backed by the
 * existing Finance v2 mutating endpoints (via src/api/financeWrites.js):
 *   - Simulate deal-won  → journal entry + approval + draft adapter job
 *   - Journal draft      → a balanced 2-line journal draft
 *   - Draft invoice      → a draft invoice
 *
 * On success it calls `onCreated` so the page can refresh counts.
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, PlusCircle } from 'lucide-react';
import { simulateDealWon, createJournalDraft, createDraftInvoice } from '@/api/financeWrites';

function dollarsToCents(value) {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

const inputCls =
  'mt-1 w-full rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-slate-100 placeholder:text-slate-500';

export default function FinanceCreatePanel({ tenantId, onCreated }) {
  const [busy, setBusy] = useState(null);
  const [feedback, setFeedback] = useState(null);

  const [dealAmount, setDealAmount] = useState('2500');
  const [debitAcct, setDebitAcct] = useState('Cash');
  const [creditAcct, setCreditAcct] = useState('Revenue');
  const [journalAmount, setJournalAmount] = useState('1000');
  const [customer, setCustomer] = useState('CUST-001');
  const [invoiceAmount, setInvoiceAmount] = useState('5000');

  async function run(action, fn) {
    setBusy(action);
    setFeedback(null);
    try {
      await fn();
      // Transient: shown while the page refetches counts/tabs.
      setFeedback({ kind: 'success', message: 'Created sandbox entry. Refreshing…' });
      if (onCreated) await onCreated();
      // Settled: the refresh finished — replace the "Refreshing…" text so it does
      // not look like it is perpetually refreshing.
      setFeedback({
        kind: 'success',
        message: 'Created sandbox entry ✓ — check the tabs to review it.',
      });
    } catch (err) {
      setFeedback({ kind: 'error', message: err?.message || 'Create failed.' });
    } finally {
      setBusy(null);
    }
  }

  function positiveCents(value, label) {
    const cents = dollarsToCents(value);
    if (!Number.isFinite(cents) || cents <= 0) {
      setFeedback({ kind: 'error', message: `Enter a positive ${label} amount.` });
      return null;
    }
    return cents;
  }

  const onSimulate = () => {
    const cents = positiveCents(dealAmount, 'deal');
    if (cents == null) return;
    run('deal', () => simulateDealWon(tenantId, { amount_cents: cents, currency: 'usd' }));
  };

  const onJournal = () => {
    const cents = positiveCents(journalAmount, 'journal');
    if (cents == null) return;
    run('journal', () =>
      createJournalDraft(tenantId, {
        memo: 'Test journal draft',
        currency: 'usd',
        lines: [
          { account_name: debitAcct, classification: 'Asset', debit_cents: cents, credit_cents: 0 },
          {
            account_name: creditAcct,
            classification: 'Revenue',
            debit_cents: 0,
            credit_cents: cents,
          },
        ],
      }),
    );
  };

  const onInvoice = () => {
    const cents = positiveCents(invoiceAmount, 'invoice');
    if (cents == null) return;
    run('invoice', () =>
      createDraftInvoice(tenantId, {
        customer_id: customer,
        currency: 'usd',
        subtotal_cents: cents,
        total_cents: cents,
      }),
    );
  };

  return (
    <Card
      data-testid="finance-create-panel"
      className="border-amber-500/40 bg-slate-900/60 text-slate-100"
    >
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <PlusCircle className="h-4 w-4 text-amber-300" aria-hidden="true" />
          Create test entries
        </CardTitle>
        <CardDescription className="text-xs text-slate-400">
          Test mode only — these create sandbox finance records you can review across the tabs and
          clear later. Not real data.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {feedback ? (
          <div
            data-testid="finance-create-feedback"
            className={`rounded-md px-3 py-2 text-xs ${
              feedback.kind === 'success'
                ? 'border border-emerald-700/50 bg-emerald-900/20 text-emerald-200'
                : 'border border-red-800/50 bg-red-900/20 text-red-200'
            }`}
          >
            {feedback.message}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="text-xs text-slate-400">
            Deal amount (USD)
            <input
              className={inputCls}
              value={dealAmount}
              onChange={(e) => setDealAmount(e.target.value)}
              inputMode="decimal"
              data-testid="finance-create-deal-amount"
            />
          </label>
          <Button
            type="button"
            onClick={onSimulate}
            disabled={busy === 'deal'}
            data-testid="finance-create-deal-btn"
            className="bg-amber-600 text-white hover:bg-amber-700"
          >
            {busy === 'deal' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Simulate deal-won'}
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
          <label className="text-xs text-slate-400">
            Debit account
            <input
              className={inputCls}
              value={debitAcct}
              onChange={(e) => setDebitAcct(e.target.value)}
            />
          </label>
          <label className="text-xs text-slate-400">
            Credit account
            <input
              className={inputCls}
              value={creditAcct}
              onChange={(e) => setCreditAcct(e.target.value)}
            />
          </label>
          <label className="text-xs text-slate-400">
            Amount (USD)
            <input
              className={inputCls}
              value={journalAmount}
              onChange={(e) => setJournalAmount(e.target.value)}
              inputMode="decimal"
              data-testid="finance-create-journal-amount"
            />
          </label>
          <Button
            type="button"
            onClick={onJournal}
            disabled={busy === 'journal'}
            data-testid="finance-create-journal-btn"
            className="bg-slate-700 text-slate-100 hover:bg-slate-600"
          >
            {busy === 'journal' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Journal draft'}
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="text-xs text-slate-400">
            Customer
            <input
              className={inputCls}
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
            />
          </label>
          <label className="text-xs text-slate-400">
            Amount (USD)
            <input
              className={inputCls}
              value={invoiceAmount}
              onChange={(e) => setInvoiceAmount(e.target.value)}
              inputMode="decimal"
              data-testid="finance-create-invoice-amount"
            />
          </label>
          <Button
            type="button"
            onClick={onInvoice}
            disabled={busy === 'invoice'}
            data-testid="finance-create-invoice-btn"
            className="bg-slate-700 text-slate-100 hover:bg-slate-600"
          >
            {busy === 'invoice' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Draft invoice'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
