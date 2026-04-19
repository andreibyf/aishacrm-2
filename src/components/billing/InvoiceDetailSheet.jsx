/**
 * InvoiceDetailSheet
 *
 * Side drawer (shadcn Sheet) showing a single invoice's line items,
 * payment history, and metadata.
 *
 * Props:
 *   open        -- boolean
 *   onClose     -- callback
 *   invoice     -- full invoice object with line_items + payments
 *   loading     -- show skeletons while the fetch resolves
 */

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCents, formatDate, statusBadgeClass } from './billingFormatters';

export default function InvoiceDetailSheet({ open, onClose, invoice, loading = false }) {
  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose?.(); }}>
      <SheetContent className="bg-slate-900 border-slate-700 text-slate-100 w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-slate-100">
            {invoice?.invoice_number || 'Invoice'}
          </SheetTitle>
          <SheetDescription className="text-slate-400">
            Invoice details, line items and payment history.
          </SheetDescription>
        </SheetHeader>

        {loading || !invoice ? (
          <div className="mt-6 space-y-3">
            <Skeleton className="h-4 w-32 bg-slate-700" />
            <Skeleton className="h-4 w-48 bg-slate-700" />
            <Skeleton className="h-24 w-full bg-slate-700" />
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            <div className="flex items-center justify-between">
              <Badge className={`${statusBadgeClass(invoice.status)} border`}>
                {invoice.status}
              </Badge>
              <div className="text-right">
                <p className="text-xs text-slate-500">Total due</p>
                <p className="text-xl font-semibold text-slate-100">
                  {formatCents(invoice.total_cents, invoice.currency || 'USD')}
                </p>
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-slate-500">Issued</dt>
                <dd className="text-slate-200">{formatDate(invoice.issued_at)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Due</dt>
                <dd className="text-slate-200">{formatDate(invoice.due_at)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Subtotal</dt>
                <dd className="text-slate-200">{formatCents(invoice.subtotal_cents, invoice.currency)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Tax</dt>
                <dd className="text-slate-200">{formatCents(invoice.tax_total_cents, invoice.currency)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Paid</dt>
                <dd className="text-slate-200">{formatCents(invoice.amount_paid_cents, invoice.currency)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Balance due</dt>
                <dd className="text-slate-200">{formatCents(invoice.balance_due_cents, invoice.currency)}</dd>
              </div>
            </dl>

            <section>
              <h3 className="text-sm font-semibold text-slate-300 mb-2">Line items</h3>
              <div className="rounded border border-slate-700 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-700 bg-slate-800/80 hover:bg-slate-800/80">
                      <TableHead className="text-slate-400">Description</TableHead>
                      <TableHead className="text-slate-400 text-right">Qty</TableHead>
                      <TableHead className="text-slate-400 text-right">Unit</TableHead>
                      <TableHead className="text-slate-400 text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(invoice.line_items || []).map((li) => (
                      <TableRow key={li.id} className="border-slate-700">
                        <TableCell className="text-slate-200">{li.description}</TableCell>
                        <TableCell className="text-right text-slate-300">{li.quantity ?? 1}</TableCell>
                        <TableCell className="text-right text-slate-300">
                          {formatCents(li.unit_price_cents, invoice.currency)}
                        </TableCell>
                        <TableCell className="text-right text-slate-100">
                          {formatCents(
                            (li.quantity ?? 1) * (li.unit_price_cents ?? 0),
                            invoice.currency,
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {(!invoice.line_items || invoice.line_items.length === 0) && (
                      <TableRow className="border-slate-700">
                        <TableCell colSpan={4} className="text-center text-slate-500 py-4">
                          No line items.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </section>

            {Array.isArray(invoice.payments) && invoice.payments.length > 0 ? (
              <section>
                <h3 className="text-sm font-semibold text-slate-300 mb-2">Payments</h3>
                <div className="rounded border border-slate-700 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-700 bg-slate-800/80 hover:bg-slate-800/80">
                        <TableHead className="text-slate-400">Date</TableHead>
                        <TableHead className="text-slate-400">Method</TableHead>
                        <TableHead className="text-slate-400">Status</TableHead>
                        <TableHead className="text-slate-400 text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoice.payments.map((p) => (
                        <TableRow key={p.id} className="border-slate-700">
                          <TableCell className="text-slate-300">{formatDate(p.created_at)}</TableCell>
                          <TableCell className="text-slate-300">{p.payment_method_type || '—'}</TableCell>
                          <TableCell>
                            <Badge className={`${statusBadgeClass(p.status)} border`}>{p.status}</Badge>
                          </TableCell>
                          <TableCell className="text-right text-slate-100">
                            {formatCents(p.amount_cents, invoice.currency)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </section>
            ) : null}

            {invoice.memo ? (
              <section>
                <h3 className="text-sm font-semibold text-slate-300 mb-1">Memo</h3>
                <p className="text-sm text-slate-400 whitespace-pre-wrap">{invoice.memo}</p>
              </section>
            ) : null}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
