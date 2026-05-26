/**
 * AuditTimelinePanel (UI Slice 1 / UI-1C)
 *
 * §7.8 Audit timeline tab — gap state only. No GET /audit-events or
 * audit-timeline list endpoint exists today (§8.2.5). The
 * auditTimelineProjection is the natural backing source. No per-event
 * drill-down, no actor / time-range filter, no export in Slice 1.
 */

import { FINANCE_API_GAPS } from '@/api/finance';
import GapStateCard from './GapStateCard';

export default function AuditTimelinePanel() {
  return (
    <div data-testid="finance-audit-timeline-panel">
      <GapStateCard title="Audit timeline" gap={FINANCE_API_GAPS.auditEvents} />
    </div>
  );
}
