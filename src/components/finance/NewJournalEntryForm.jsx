/**
 * NewJournalEntryForm — admin/superadmin + Test-mode affordance to create a
 * manual journal draft. Amounts are entered in dollars and sent in integer
 * cents. Client-side balance check mirrors the server (Σ debit === Σ credit);
 * the server is the authority. On success the draft appears in Journal drafts,
 * where it can be submitted for approval and posted.
 */
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { createJournalDraft } from '@/api/financeWrites';
import { financeWriteErrorMessage } from './financeWriteErrors';

const CLASSIFICATIONS = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'];

function dollarsToCents(value) {
  const n = parseFloat(String(value ?? '').replace(/,/g, ''));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

function blankLine() {
  return { account_name: '', classification: 'Asset', debit: '', credit: '' };
}

export default function NewJournalEntryForm({ tenantId, onCreated }) {
  const [memo, setMemo] = useState('');
  const [lines, setLines] = useState([
    { ...blankLine(), classification: 'Asset' },
    { ...blankLine(), classification: 'Revenue' },
  ]);
  const [busy, setBusy] = useState(false);

  const update = (idx, key, value) =>
    setLines((rows) => rows.map((r, i) => (i === idx ? { ...r, [key]: value } : r)));
  const addLine = () => setLines((rows) => [...rows, blankLine()]);
  const removeLine = (idx) => setLines((rows) => rows.filter((_, i) => i !== idx));

  const totalDebit = lines.reduce((s, l) => s + dollarsToCents(l.debit), 0);
  const totalCredit = lines.reduce((s, l) => s + dollarsToCents(l.credit), 0);
  const balanced = totalDebit > 0 && totalDebit === totalCredit;
  const allNamed = lines.every((l) => l.account_name.trim());

  const fmt = (cents) => (cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 });

  const submit = async () => {
    if (!tenantId) return;
    setBusy(true);
    try {
      const payload = {
        currency: 'usd',
        memo: memo.trim() || null,
        lines: lines.map((l) => ({
          account_name: l.account_name.trim(),
          classification: l.classification,
          debit_cents: dollarsToCents(l.debit),
          credit_cents: dollarsToCents(l.credit),
        })),
      };
      await createJournalDraft(tenantId, payload);
      toast.success('Journal draft created — submit it for approval below.');
      setMemo('');
      setLines([
        { ...blankLine(), classification: 'Asset' },
        { ...blankLine(), classification: 'Revenue' },
      ]);
      onCreated?.();
    } catch (err) {
      toast.error(financeWriteErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      data-testid="finance-new-journal-form"
      className="border-slate-700/40 bg-slate-900/60 text-slate-100"
    >
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold text-slate-100">New journal entry</CardTitle>
        <p className="mt-1 text-xs text-slate-400">
          Enter balanced debit/credit lines (in dollars). Creates a draft you then submit for
          approval.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          aria-label="Memo"
          placeholder="Memo (optional)"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          className="border-slate-600 bg-slate-800/60 text-slate-100"
        />

        <div className="space-y-2">
          {lines.map((line, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <Input
                aria-label={`Account ${idx + 1}`}
                placeholder="Account name"
                value={line.account_name}
                onChange={(e) => update(idx, 'account_name', e.target.value)}
                className="flex-1 border-slate-600 bg-slate-800/60 text-slate-100"
              />
              <select
                aria-label={`Classification ${idx + 1}`}
                value={line.classification}
                onChange={(e) => update(idx, 'classification', e.target.value)}
                className="rounded-md border border-slate-600 bg-slate-800/60 px-2 py-1.5 text-xs text-slate-100"
              >
                {CLASSIFICATIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <Input
                aria-label={`Debit ${idx + 1}`}
                placeholder="Debit"
                inputMode="decimal"
                value={line.debit}
                onChange={(e) => update(idx, 'debit', e.target.value)}
                className="w-24 border-slate-600 bg-slate-800/60 text-right text-slate-100"
              />
              <Input
                aria-label={`Credit ${idx + 1}`}
                placeholder="Credit"
                inputMode="decimal"
                value={line.credit}
                onChange={(e) => update(idx, 'credit', e.target.value)}
                className="w-24 border-slate-600 bg-slate-800/60 text-right text-slate-100"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Remove line ${idx + 1}`}
                onClick={() => removeLine(idx)}
                disabled={lines.length <= 2}
                className="h-8 w-8 p-0 text-slate-400 hover:bg-slate-700"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={addLine}
            className="text-slate-300 hover:bg-slate-700"
          >
            <Plus className="mr-1 h-4 w-4" /> Add line
          </Button>
          <span
            className={`text-xs ${balanced ? 'text-emerald-400' : 'text-amber-400'}`}
            data-testid="finance-new-journal-balance"
          >
            Debit {fmt(totalDebit)} · Credit {fmt(totalCredit)}{' '}
            {balanced ? '✓ balanced' : '— not balanced'}
          </span>
        </div>

        <Button
          type="button"
          onClick={submit}
          disabled={busy || !balanced || !allNamed}
          data-testid="finance-new-journal-submit"
          className="bg-emerald-600 text-white hover:bg-emerald-700"
        >
          {busy ? 'Creating…' : 'Create draft'}
        </Button>
      </CardContent>
    </Card>
  );
}
