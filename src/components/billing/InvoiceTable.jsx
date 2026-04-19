/**
 * InvoiceTable
 *
 * Renders a table of invoices with a clickable row -> drawer pattern.
 * Used in both the tenant portal (read-only view) and the superadmin
 * console (with inline action buttons).
 *
 * Props:
 *   invoices    -- array of invoice objects
 *   loading     -- show skeleton rows while true
 *   onRowClick  -- callback(invoice) for opening detail drawer
 *   renderActions -- optional (invoice) => ReactNode; cell shown in last column
 */

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { FileText } from 'lucide-react';
import { formatCents, formatDate, statusBadgeClass } from './billingFormatters';

function InvoiceRow({ invoice, onRowClick, renderActions }) {
  const clickable = typeof onRowClick === 'function';
  return (
    <TableRow
      onClick={clickable ? () => onRowClick(invoice) : undefined}
      className={`border-slate-700 ${clickable ? 'cursor-pointer hover:bg-slate-700/40' : ''}`}
      data-testid={`invoice-row-${invoice.invoice_number || invoice.id}`}
    >
      <TableCell className="font-mono text-xs text-slate-300">
        {invoice.invoice_number || invoice.id}
      </TableCell>
      <TableCell className="text-slate-300">{formatDate(invoice.issued_at || invoice.created_at)}</TableCell>
      <TableCell className="text-slate-300">{formatDate(invoice.due_at)}</TableCell>
      <TableCell className="text-right font-medium text-slate-100">
        {formatCents(invoice.total_cents, invoice.currency || 'USD')}
      </TableCell>
      <TableCell>
        <Badge className={`${statusBadgeClass(invoice.status)} border`}>{invoice.status}</Badge>
      </TableCell>
      {renderActions ? (
        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
          {renderActions(invoice)}
        </TableCell>
      ) : null}
    </TableRow>
  );
}

function SkeletonRow({ showActions }) {
  return (
    <TableRow className="border-slate-700">
      <TableCell><Skeleton className="h-4 w-24 bg-slate-700" /></TableCell>
      <TableCell><Skeleton className="h-4 w-20 bg-slate-700" /></TableCell>
      <TableCell><Skeleton className="h-4 w-20 bg-slate-700" /></TableCell>
      <TableCell className="text-right"><Skeleton className="h-4 w-16 bg-slate-700 ml-auto" /></TableCell>
      <TableCell><Skeleton className="h-5 w-14 bg-slate-700" /></TableCell>
      {showActions ? (
        <TableCell className="text-right"><Skeleton className="h-8 w-20 bg-slate-700 ml-auto" /></TableCell>
      ) : null}
    </TableRow>
  );
}

export default function InvoiceTable({ invoices, loading = false, onRowClick, renderActions }) {
  const hasActions = typeof renderActions === 'function';

  return (
    <div className="rounded-md border border-slate-700 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="border-slate-700 bg-slate-900/50 hover:bg-slate-900/50">
            <TableHead className="text-slate-400">Invoice</TableHead>
            <TableHead className="text-slate-400">Issued</TableHead>
            <TableHead className="text-slate-400">Due</TableHead>
            <TableHead className="text-slate-400 text-right">Total</TableHead>
            <TableHead className="text-slate-400">Status</TableHead>
            {hasActions ? <TableHead className="text-slate-400 text-right">Actions</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <>
              <SkeletonRow showActions={hasActions} />
              <SkeletonRow showActions={hasActions} />
              <SkeletonRow showActions={hasActions} />
            </>
          ) : invoices && invoices.length > 0 ? (
            invoices.map((inv) => (
              <InvoiceRow
                key={inv.id}
                invoice={inv}
                onRowClick={onRowClick}
                renderActions={renderActions}
              />
            ))
          ) : (
            <TableRow className="border-slate-700">
              <TableCell colSpan={hasActions ? 6 : 5} className="text-center py-10">
                <FileText className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <p className="text-sm text-slate-400">No invoices yet.</p>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
