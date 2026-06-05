/**
 * ChartOfAccountsPanel (Finance COA Slice 1)
 *
 * Read-only chart of accounts — GET /api/v2/finance/accounts. Lists the tenant's
 * baseline system accounts plus any accounts auto-created by journal-draft
 * resolution. Read-only by construction: no create / edit / deactivate
 * affordance (an editable COA manager is a deferred future slice).
 */

import * as finance from '@/api/finance';
import FinanceTablePanel from './FinanceTablePanel';

const yesNo = (v) => (v ? 'Yes' : 'No');

const COLUMNS = [
  { key: 'account_code', label: 'Code' },
  { key: 'name', label: 'Name' },
  { key: 'classification', label: 'Classification' },
  { key: 'account_type', label: 'Type' },
  { key: 'parent_account_id', label: 'Parent' },
  { key: 'is_system', label: 'System', render: (r) => yesNo(r.is_system) },
  { key: 'is_active', label: 'Active', render: (r) => yesNo(r.is_active) },
];

export default function ChartOfAccountsPanel({ tenantId }) {
  return (
    <div data-testid="finance-chart-of-accounts-panel">
      <FinanceTablePanel
        tenantId={tenantId}
        testId="finance-chart-of-accounts"
        title="Chart of accounts"
        description="Read-only chart of accounts for this tenant — baseline accounts plus any auto-created from journal activity. Account codes anchor journal lines; editing accounts is deferred to a later slice."
        emptyText="No accounts for this tenant yet."
        columns={COLUMNS}
        exportArea="chart-of-accounts"
        fetcher={finance.getAccounts}
        selectRows={(data) => (Array.isArray(data?.accounts) ? data.accounts : [])}
      />
    </div>
  );
}
