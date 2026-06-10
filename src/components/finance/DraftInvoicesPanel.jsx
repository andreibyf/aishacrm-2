/**
 * DraftInvoicesPanel (Finance Read API Slice 1 / UI-1C)
 *
 * §7.3 Draft invoices tab — now live via GET /api/v2/finance/draft-invoices
 * (design freeze §6.1). Read-only: lists draft invoices for the tenant. No
 * create / edit / send affordance (the POST/PATCH endpoints remain absent
 * from src/api/finance.js).
 */

import * as finance from '@/api/finance';
import { submitDraftInvoice } from '@/api/financeWrites';
import FinanceTablePanel from './FinanceTablePanel';
import FinanceRowActionButton from './FinanceRowActionButton';
import { formatCentsAmount } from './financeFormat';

const COLUMNS = [
  { key: 'id', label: 'ID' },
  { key: 'status', label: 'Status' },
  { key: 'customer_id', label: 'Customer ID' },
  { key: 'customer_name', label: 'Customer Name' },
  { key: 'currency', label: 'Currency' },
  // Stored as integer cents; displayed with the decimal placed (250000 -> 2,500.00).
  // Currency is rendered in its own column, so no symbol here.
  { key: 'amount_cents', label: 'Amount', render: (r) => formatCentsAmount(r.amount_cents) },
  { key: 'created_at', label: 'Created' },
  { key: 'updated_at', label: 'Updated' },
];

// `canWrite` turns on a per-row "Submit for approval" action on draft invoices;
// approving the resulting queue item posts the invoice's AR journal.
export default function DraftInvoicesPanel({ tenantId, canWrite = false }) {
  const renderRowActions = canWrite
    ? (row, { reload }) =>
        row.status === 'draft' ? (
          <FinanceRowActionButton
            label="Submit for approval"
            successMessage="Submitted for approval."
            onAct={() => submitDraftInvoice(tenantId, row.id)}
            reload={reload}
            testId={`finance-submit-invoice-${row.id}`}
          />
        ) : null
    : undefined;

  return (
    <div data-testid="finance-draft-invoices-panel">
      <FinanceTablePanel
        tenantId={tenantId}
        testId="finance-draft-invoices"
        title="Draft invoices"
        description="Draft invoices for this tenant."
        emptyText="No draft invoices for this tenant yet."
        columns={COLUMNS}
        exportArea="draft-invoices"
        fetcher={finance.getDraftInvoices}
        selectRows={(data) => (Array.isArray(data?.invoices) ? data.invoices : [])}
        renderRowActions={renderRowActions}
      />
    </div>
  );
}
