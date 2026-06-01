/**
 * ApprovalQueuePanel (Finance Read API Slice 1 / UI-1C)
 *
 * §7.6 Approval queue tab — now live via GET /api/v2/finance/approvals
 * (design freeze §6.3). Read-only: shows pending approvals by default. There
 * is NO approve / reject / claim affordance anywhere in this panel — those
 * mutating endpoints remain absent from src/api/finance.js (design freeze §13).
 */

import * as finance from '@/api/finance';
import FinanceTablePanel from './FinanceTablePanel';

const COLUMNS = [
  { key: 'id', label: 'ID' },
  { key: 'status', label: 'Status' },
  { key: 'subject_type', label: 'Subject Type' },
  { key: 'subject_id', label: 'Subject ID' },
  { key: 'requested_by', label: 'Requested By' },
  { key: 'requested_at', label: 'Requested At' },
  { key: 'decided_by', label: 'Decided By' },
  { key: 'decided_at', label: 'Decided At' },
];

export default function ApprovalQueuePanel({ tenantId }) {
  return (
    <div data-testid="finance-approval-queue-panel">
      <FinanceTablePanel
        tenantId={tenantId}
        testId="finance-approval-queue"
        title="Approval queue"
        description="Read-only list of pending approvals for this tenant. Approve and reject actions are not available in this slice."
        emptyText="No pending approvals for this tenant."
        columns={COLUMNS}
        exportArea="approvals"
        fetcher={(tenantId, opts) => finance.getApprovals(tenantId, { status: 'pending', ...opts })}
        selectRows={(data) => (Array.isArray(data?.approvals) ? data.approvals : [])}
      />
    </div>
  );
}
