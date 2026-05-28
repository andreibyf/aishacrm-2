/**
 * ApprovalQueuePanel (UI Slice 1 / UI-1C)
 *
 * §7.6 Approval queue tab — gap state only. No GET /approvals endpoint
 * exists today (§8.2.3). Slice 1 deliberately does NOT call POST
 * /approvals/:id/approve; that mutating endpoint is excluded from
 * finance.js and there is no approve / reject / claim affordance
 * anywhere in this panel (design freeze §13).
 */

import { FINANCE_API_GAPS } from '@/api/finance';
import GapStateCard from './GapStateCard';

export default function ApprovalQueuePanel() {
  return (
    <div data-testid="finance-approval-queue-panel">
      <GapStateCard title="Approval queue" gap={FINANCE_API_GAPS.approvals} />
    </div>
  );
}
