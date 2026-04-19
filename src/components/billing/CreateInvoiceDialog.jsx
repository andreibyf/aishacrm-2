/**
 * CreateInvoiceDialog
 *
 * Superadmin-only: create a draft invoice for a tenant. Manages a
 * dynamic list of line_items (add/remove rows), plus currency, due_days,
 * tax, and memo. Validation runs client-side; backend does authoritative
 * validation too.
 *
 * Props:
 *   open     -- boolean
 *   onClose  -- callback
 *   tenantId -- the tenant UUID the invoice is for
 *   onCreate -- async (tenantId, payload) -> returns the created invoice
 */

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatCents } from './billingFormatters';

const EMPTY_LINE = {
  item_type: 'subscription',
  description: '',
  quantity: 1,
  unit_price_cents: 0,
};

function parseIntOrZero(value) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : 0;
}

export default function CreateInvoiceDialog({ open, onClose, tenantId, onCreate }) {
  const [lines, setLines] = useState([{ ...EMPTY_LINE }]);
  const [currency, setCurrency] = useState('USD');
  const [dueDays, setDueDays] = useState(14);
  const [taxCents, setTaxCents] = useState(0);
  const [memo, setMemo] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setLines([{ ...EMPTY_LINE }]);
    setCurrency('USD');
    setDueDays(14);
    setTaxCents(0);
    setMemo('');
  }

  function handleClose() {
    if (submitting) return;
    reset();
    onClose?.();
  }

  function updateLine(idx, patch) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, { ...EMPTY_LINE }]);
  }

  function removeLine(idx) {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)));
  }

  const subtotalCents = lines.reduce(
    (sum, l) => sum + (l.quantity || 0) * (l.unit_price_cents || 0),
    0,
  );
  const totalCents = subtotalCents + (taxCents || 0);

  const isValid =
    tenantId &&
    lines.length > 0 &&
    lines.every(
      (l) => l.description.trim() && l.quantity > 0 && l.unit_price_cents >= 0,
    );

  async function handleSubmit() {
    if (!isValid || submitting) return;
    setSubmitting(true);
    try {
      await onCreate(tenantId, {
        line_items: lines,
        currency,
        due_days: dueDays,
        tax_total_cents: taxCents,
        memo: memo.trim() || undefined,
      });
      toast.success('Invoice created (draft)');
      reset();
      onClose?.();
    } catch (err) {
      toast.error(err.message || 'Failed to create invoice');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="bg-slate-900 border-slate-700 text-slate-100 max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create invoice</DialogTitle>
          <DialogDescription className="text-slate-400">
            Creates a draft invoice. Issue it afterwards to notify the tenant.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-slate-300">Line items</Label>
            <div className="mt-2 space-y-2">
              {lines.map((line, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <Input
                    className="col-span-6 bg-slate-800 border-slate-700"
                    placeholder="Description"
                    value={line.description}
                    onChange={(e) => updateLine(idx, { description: e.target.value })}
                  />
                  <Input
                    type="number"
                    min="1"
                    className="col-span-2 bg-slate-800 border-slate-700"
                    placeholder="Qty"
                    value={line.quantity}
                    onChange={(e) => updateLine(idx, { quantity: parseIntOrZero(e.target.value) })}
                  />
                  <Input
                    type="number"
                    min="0"
                    className="col-span-3 bg-slate-800 border-slate-700"
                    placeholder="Unit price (cents)"
                    value={line.unit_price_cents}
                    onChange={(e) => updateLine(idx, { unit_price_cents: parseIntOrZero(e.target.value) })}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="col-span-1 text-slate-400 hover:text-rose-300"
                    onClick={() => removeLine(idx)}
                    disabled={lines.length === 1 || submitting}
                    aria-label="Remove line"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={addLine}
              disabled={submitting}
              className="mt-2 bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
            >
              <Plus className="w-4 h-4 mr-1" /> Add line
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-slate-300">Currency</Label>
              <Select value={currency} onValueChange={setCurrency} disabled={submitting}>
                <SelectTrigger className="bg-slate-800 border-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 text-slate-100">
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="GBP">GBP</SelectItem>
                  <SelectItem value="CAD">CAD</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-slate-300">Due in (days)</Label>
              <Input
                type="number"
                min="0"
                className="bg-slate-800 border-slate-700"
                value={dueDays}
                onChange={(e) => setDueDays(parseIntOrZero(e.target.value))}
                disabled={submitting}
              />
            </div>
            <div>
              <Label className="text-slate-300">Tax (cents)</Label>
              <Input
                type="number"
                min="0"
                className="bg-slate-800 border-slate-700"
                value={taxCents}
                onChange={(e) => setTaxCents(parseIntOrZero(e.target.value))}
                disabled={submitting}
              />
            </div>
          </div>

          <div>
            <Label className="text-slate-300">Memo (optional)</Label>
            <Textarea
              className="bg-slate-800 border-slate-700"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="Internal note or customer-visible memo"
              disabled={submitting}
            />
          </div>

          <div className="rounded-md border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm">
            <div className="flex justify-between text-slate-300">
              <span>Subtotal</span>
              <span>{formatCents(subtotalCents, currency)}</span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Tax</span>
              <span>{formatCents(taxCents, currency)}</span>
            </div>
            <div className="flex justify-between text-slate-100 font-semibold mt-1 pt-1 border-t border-slate-700">
              <span>Total</span>
              <span>{formatCents(totalCents, currency)}</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={submitting}
            className="bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!isValid || submitting}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Create draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
