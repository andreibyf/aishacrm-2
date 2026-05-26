/**
 * DraftInvoicesPanel (UI Slice 1 / UI-1C)
 *
 * §7.3 Draft invoices tab — gap state only. No GET /draft-invoices endpoint
 * exists today (§8.2.1). Slice 1 deliberately does NOT call POST
 * /draft-invoices or PATCH /draft-invoices/:id; those mutating endpoints
 * are excluded from src/api/finance.js per design freeze §1.
 */

import { FINANCE_API_GAPS } from '@/api/finance';
import GapStateCard from './GapStateCard';

export default function DraftInvoicesPanel() {
  return (
    <div data-testid="finance-draft-invoices-panel">
      <GapStateCard title="Draft invoices" gap={FINANCE_API_GAPS.draftInvoices} />
    </div>
  );
}
