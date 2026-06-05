/**
 * JournalDraftsPanel (Finance Read API Slice 1 / UI-1C)
 *
 * §7.4 Journal drafts tab — now live via GET /api/v2/finance/journal-drafts
 * (design freeze §6.2): the draft + pending_approval slice of journal entries.
 * Read-only: no create / post / approve affordance.
 */

import * as finance from '@/api/finance';
import FinanceTablePanel from './FinanceTablePanel';
import { formatCentsAmount } from './financeFormat';

const COLUMNS = [
  { key: 'id', label: 'ID' },
  { key: 'aggregate_id', label: 'Aggregate ID' },
  { key: 'status', label: 'Status' },
  { key: 'account_code', label: 'Account Code' },
  // Stored as integer cents; displayed with the decimal placed (250000 -> 2,500.00).
  // Currency is rendered in its own column, so no symbol here.
  { key: 'amount_cents', label: 'Amount', render: (r) => formatCentsAmount(r.amount_cents) },
  { key: 'currency', label: 'Currency' },
  { key: 'created_at', label: 'Created' },
];

export default function JournalDraftsPanel({ tenantId }) {
  return (
    <div data-testid="finance-journal-drafts-panel">
      <FinanceTablePanel
        tenantId={tenantId}
        testId="finance-journal-drafts"
        title="Journal drafts"
        description="Read-only list of draft and pending-approval journal entries for this tenant."
        emptyText="No journal drafts for this tenant yet."
        columns={COLUMNS}
        exportArea="journal-drafts"
        fetcher={finance.getJournalDrafts}
        selectRows={(data) => (Array.isArray(data?.journal_drafts) ? data.journal_drafts : [])}
      />
    </div>
  );
}
