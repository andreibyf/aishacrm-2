/**
 * NewInvoiceForm — admin/superadmin + Test-mode affordance to create a draft
 * invoice. Amounts entered in dollars, sent in cents. On approval (after submit)
 * the invoice posts a balanced AR journal (Dr Accounts Receivable / Cr Sales
 * Revenue / Cr Tax Payable). On success the invoice appears in Draft invoices.
 */
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { createDraftInvoice } from '@/api/financeWrites';
import { financeWriteErrorMessage } from './financeWriteErrors';

function dollarsToCents(value) {
  const n = parseFloat(String(value ?? '').replace(/,/g, ''));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

export default function NewInvoiceForm({ tenantId, onCreated }) {
  const [form, setForm] = useState({
    customer_id: '',
    invoice_number: '',
    subtotal: '',
    tax: '',
    memo: '',
  });
  const [busy, setBusy] = useState(false);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const subtotalCents = dollarsToCents(form.subtotal);
  const taxCents = dollarsToCents(form.tax);
  const totalCents = subtotalCents + taxCents;
  const valid = form.customer_id.trim() && subtotalCents > 0;

  const fmt = (cents) => (cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 });

  const submit = async () => {
    if (!tenantId) return;
    setBusy(true);
    try {
      await createDraftInvoice(tenantId, {
        customer_id: form.customer_id.trim(),
        invoice_number: form.invoice_number.trim() || null,
        currency: 'usd',
        subtotal_cents: subtotalCents,
        tax_cents: taxCents,
        total_cents: totalCents,
        memo: form.memo.trim() || null,
        line_items: [{ description: form.memo.trim() || 'Invoice', amount_cents: subtotalCents }],
      });
      toast.success('Draft invoice created — submit it for approval below.');
      setForm({ customer_id: '', invoice_number: '', subtotal: '', tax: '', memo: '' });
      onCreated?.();
    } catch (err) {
      toast.error(financeWriteErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card data-testid="finance-new-invoice-form" className="border-border bg-card text-foreground">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold text-foreground">New invoice</CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">
          Creates a draft invoice. Submitting + approving it posts an AR journal (Dr Accounts
          Receivable / Cr Revenue / Cr Tax).
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input
            aria-label="Customer"
            placeholder="Customer ID"
            value={form.customer_id}
            onChange={(e) => set('customer_id', e.target.value)}
            className="flex-1 border-border bg-muted text-foreground"
          />
          <Input
            aria-label="Invoice number"
            placeholder="Invoice # (optional)"
            value={form.invoice_number}
            onChange={(e) => set('invoice_number', e.target.value)}
            className="flex-1 border-border bg-muted text-foreground"
          />
        </div>
        <div className="flex gap-2">
          <Input
            aria-label="Subtotal"
            placeholder="Subtotal"
            inputMode="decimal"
            value={form.subtotal}
            onChange={(e) => set('subtotal', e.target.value)}
            className="w-32 border-border bg-muted text-right text-foreground"
          />
          <Input
            aria-label="Tax"
            placeholder="Tax"
            inputMode="decimal"
            value={form.tax}
            onChange={(e) => set('tax', e.target.value)}
            className="w-32 border-border bg-muted text-right text-foreground"
          />
          <span
            className="self-center text-xs text-muted-foreground"
            data-testid="finance-new-invoice-total"
          >
            Total {fmt(totalCents)}
          </span>
        </div>
        <Input
          aria-label="Memo"
          placeholder="Memo / description (optional)"
          value={form.memo}
          onChange={(e) => set('memo', e.target.value)}
          className="border-border bg-muted text-foreground"
        />
        <Button
          type="button"
          onClick={submit}
          disabled={busy || !valid}
          data-testid="finance-new-invoice-submit"
          className="bg-emerald-600 text-white hover:bg-emerald-700"
        >
          {busy ? 'Creating…' : 'Create draft invoice'}
        </Button>
      </CardContent>
    </Card>
  );
}
