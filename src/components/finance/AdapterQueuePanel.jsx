/**
 * AdapterQueuePanel (UI Slice 1 / UI-1C)
 *
 * §7.7 Adapter queue tab — gap state only. No GET /adapter-jobs or
 * /adapter-queue projection-list endpoint exists today (§8.2.4). The
 * adapterQueueProjection is the natural backing source (projection-
 * contracts.md §7). No retry / cancel / re-emit affordance in Slice 1.
 */

import { FINANCE_API_GAPS } from '@/api/finance';
import GapStateCard from './GapStateCard';

export default function AdapterQueuePanel() {
  return (
    <div data-testid="finance-adapter-queue-panel">
      <GapStateCard title="Adapter queue" gap={FINANCE_API_GAPS.adapterJobs} />
    </div>
  );
}
