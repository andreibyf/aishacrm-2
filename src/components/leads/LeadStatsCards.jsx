import StatusHelper from '../shared/StatusHelper';

/**
 * LeadStatsCards - Displays stats cards for lead counts by status
 *
 * Shows 7 clickable cards (total, new, contacted, qualified, unqualified, converted, lost)
 * that filter the leads list when clicked.
 *
 * @param {Object} totalStats - Stats object with counts for each status
 * @param {string} statusFilter - Current active status filter
 * @param {Function} onStatusFilterClick - Handler for clicking a stat card
 * @param {string} leadsLabel - Plural label for leads entity
 * @param {Function} isCardVisible - Check if card should be shown
 * @param {Function} getCardLabel - Get custom label for card
 */
export default function LeadStatsCards({
  totalStats,
  statusFilter,
  onStatusFilterClick,
  leadsLabel,
  isCardVisible,
  getCardLabel,
}) {
  const statsCards = [
    {
      label: `Total ${leadsLabel}`,
      value: totalStats.total,
      filter: 'all',
      bgColor: 'bg-slate-800',
      tooltip: 'total_all',
    },
    {
      label: 'New',
      value: totalStats.new,
      filter: 'new',
      bgColor: 'bg-blue-900/20',
      borderColor: 'border-blue-700',
      tooltip: 'lead_new',
    },
    {
      label: 'Contacted',
      value: totalStats.contacted,
      filter: 'contacted',
      bgColor: 'bg-indigo-900/20',
      borderColor: 'border-indigo-700',
      tooltip: 'lead_contacted',
    },
    {
      label: 'Qualified',
      value: totalStats.qualified,
      filter: 'qualified',
      bgColor: 'bg-emerald-900/20',
      borderColor: 'border-emerald-700',
      tooltip: 'lead_qualified',
    },
    {
      label: 'Unqualified',
      value: totalStats.unqualified,
      filter: 'unqualified',
      bgColor: 'bg-yellow-900/20',
      borderColor: 'border-yellow-700',
      tooltip: 'lead_unqualified',
    },
    {
      label: 'Converted',
      value: totalStats.converted,
      filter: 'converted',
      bgColor: 'bg-green-900/20',
      borderColor: 'border-green-700',
      tooltip: 'lead_converted',
    },
    {
      label: 'Lost',
      value: totalStats.lost,
      filter: 'lost',
      bgColor: 'bg-red-900/20',
      borderColor: 'border-red-700',
      tooltip: 'lead_lost',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-7 gap-4">
      {statsCards
        .filter((stat) => isCardVisible(stat.tooltip))
        .map((stat) => (
          <div
            key={stat.label}
            className={`${stat.bgColor} ${
              stat.borderColor || 'border-slate-700'
            } border rounded-lg p-4 cursor-pointer hover:scale-105 transition-all ${
              statusFilter === stat.filter
                ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-900'
                : ''
            }`}
            onClick={() => onStatusFilterClick(stat.filter)}
          >
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm text-slate-400">{getCardLabel(stat.tooltip) || stat.label}</p>
              <StatusHelper statusKey={stat.tooltip} />
            </div>
            <p className="text-2xl font-bold text-slate-100">{stat.value}</p>
          </div>
        ))}
    </div>
  );
}
