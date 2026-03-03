import StatusHelper from '../shared/StatusHelper';

const statsConfig = [
  { key: 'total', label: 'Total', filter: 'all', tooltip: 'total_all', bgColor: 'bg-slate-800', borderColor: 'border-slate-700' },
  { key: 'prospect', label: 'Prospects', filter: 'prospect', tooltip: 'account_prospect', bgColor: 'bg-blue-900/20', borderColor: 'border-blue-700' },
  { key: 'customer', label: 'Customers', filter: 'customer', tooltip: 'account_customer', bgColor: 'bg-emerald-900/20', borderColor: 'border-emerald-700' },
  { key: 'partner', label: 'Partners', filter: 'partner', tooltip: 'account_partner', bgColor: 'bg-purple-900/20', borderColor: 'border-purple-700' },
  { key: 'competitor', label: 'Competitors', filter: 'competitor', tooltip: 'account_competitor', bgColor: 'bg-red-900/20', borderColor: 'border-red-700' },
  { key: 'inactive', label: 'Inactive', filter: 'inactive', tooltip: 'account_inactive', bgColor: 'bg-gray-900/20', borderColor: 'border-gray-700' },
];

/**
 * AccountStatsCards - Displays type-based stats cards for accounts (6 columns)
 */
export default function AccountStatsCards({
  totalStats,
  typeFilter,
  onTypeFilterClick,
  accountsLabel,
  isCardVisible,
  getCardLabel,
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
      {statsConfig
        .filter((stat) => stat.tooltip === 'total_all' || isCardVisible(stat.tooltip))
        .map((stat) => (
          <div
            key={stat.key}
            className={`${stat.bgColor} ${stat.borderColor} border rounded-lg p-4 cursor-pointer hover:scale-105 transition-all ${
              typeFilter === stat.filter ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-900' : ''
            }`}
            onClick={() => onTypeFilterClick(stat.filter)}
          >
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm text-slate-400">
                {stat.tooltip === 'total_all'
                  ? `Total ${accountsLabel}`
                  : getCardLabel(stat.tooltip) || stat.label}
              </p>
              <StatusHelper statusKey={stat.tooltip} />
            </div>
            <p className="text-2xl font-bold text-slate-100">{totalStats[stat.key] ?? 0}</p>
          </div>
        ))}
    </div>
  );
}
