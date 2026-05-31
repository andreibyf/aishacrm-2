/**
 * AdapterQueuePanel (Finance Read API Slice 1 / UI-1C)
 *
 * §7.7 Adapter queue tab — now live via GET /api/v2/finance/adapter-jobs
 * (design freeze §6.4). Read-only: lists adapter jobs across the canonical
 * status set. No retry / cancel / re-emit affordance.
 */

import * as finance from '@/api/finance';
import FinanceTablePanel from './FinanceTablePanel';

const COLUMNS = [
  { key: 'id', label: 'ID' },
  { key: 'operation', label: 'Operation' },
  { key: 'status', label: 'Status' },
  { key: 'attempts', label: 'Attempts' },
  { key: 'next_attempt_at', label: 'Next Attempt' },
  { key: 'last_error', label: 'Last Error' },
  { key: 'created_at', label: 'Created' },
];

export default function AdapterQueuePanel({ tenantId }) {
  return (
    <div data-testid="finance-adapter-queue-panel">
      <FinanceTablePanel
        tenantId={tenantId}
        testId="finance-adapter-queue"
        title="Adapter queue"
        description="Read-only list of adapter jobs for this tenant. Retry and cancel actions are not available in this slice."
        emptyText="No adapter jobs for this tenant yet."
        columns={COLUMNS}
        fetcher={finance.getAdapterJobs}
        selectRows={(data) => (Array.isArray(data?.adapter_jobs) ? data.adapter_jobs : [])}
      />
    </div>
  );
}
