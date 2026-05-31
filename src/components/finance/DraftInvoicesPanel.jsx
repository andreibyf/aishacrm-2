/**
 * DraftInvoicesPanel (Finance Read API Slice 1 / UI-1C)
 *
 * §7.3 Draft invoices tab — now live via GET /api/v2/finance/draft-invoices
 * (design freeze §6.1). Read-only: lists draft invoices for the tenant. No
 * create / edit / send affordance (the POST/PATCH endpoints remain absent
 * from src/api/finance.js).
 */

import * as finance from '@/api/finance';
import FinanceTablePanel from './FinanceTablePanel';

const COLUMNS = [
  { key: 'id', label: 'ID' },
  { key: 'status', label: 'Status' },
  { key: 'customer_id', label: 'Customer ID' },
  { key: 'customer_name', label: 'Customer Name' },
  { key: 'currency', label: 'Currency' },
  { key: 'amount_cents', label: 'Amount (cents)' },
  { key: 'created_at', label: 'Created' },
  { key: 'updated_at', label: 'Updated' },
];

export default function DraftInvoicesPanel({ tenantId }) {
  return (
    <div data-testid="finance-draft-invoices-panel">
      <FinanceTablePanel
        tenantId={tenantId}
        testId="finance-draft-invoices"
        title="Draft invoices"
        description="Read-only list of draft invoices for this tenant. Create and edit actions are deferred to a later slice."
        emptyText="No draft invoices for this tenant yet."
        columns={COLUMNS}
        fetcher={finance.getDraftInvoices}
        selectRows={(data) => (Array.isArray(data?.invoices) ? data.invoices : [])}
      />
    </div>
  );
}
