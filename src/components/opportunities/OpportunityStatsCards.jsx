import StatusHelper from '../shared/StatusHelper';

/**
 * OpportunityStatsCards - Displays stage-based stats cards for opportunities
 *
 * Shows total count and per-stage counts with click-to-filter behavior.
 * Respects card visibility and custom label preferences.
 */
export default function OpportunityStatsCards({
  totalStats,
  stageFilter,
  onStageFilterClick,
  opportunitiesLabel,
  isCardVisible,
  getCardLabel,
}) {
  const stats = [
    {
      label: `Total ${opportunitiesLabel}`,
      value: totalStats.total,
      filter: 'all',
      bgColor: 'bg-slate-800',
      tooltip: 'total_all',
    },
    {
      label: 'Prospecting',
      value: totalStats.prospecting,
      filter: 'prospecting',
      bgColor: 'bg-blue-900/20',
      borderColor: 'border-blue-700',
      tooltip: 'opportunity_prospecting',
    },
    {
      label: 'Qualification',
      value: totalStats.qualification,
      filter: 'qualification',
      bgColor: 'bg-indigo-900/20',
      borderColor: 'border-indigo-700',
      tooltip: 'opportunity_qualification',
    },
    {
      label: 'Proposal',
      value: totalStats.proposal,
      filter: 'proposal',
      bgColor: 'bg-purple-900/20',
      borderColor: 'border-purple-700',
      tooltip: 'opportunity_proposal',
    },
    {
      label: 'Negotiation',
      value: totalStats.negotiation,
      filter: 'negotiation',
      bgColor: 'bg-yellow-900/20',
      borderColor: 'border-yellow-700',
      tooltip: 'opportunity_negotiation',
    },
    {
      label: 'Closed Won',
      value: totalStats.closed_won,
      filter: 'closed_won',
      bgColor: 'bg-emerald-900/20',
      borderColor: 'border-emerald-700',
      tooltip: 'opportunity_won',
    },
    {
      label: 'Closed Lost',
      value: totalStats.closed_lost,
      filter: 'closed_lost',
      bgColor: 'bg-red-900/20',
      borderColor: 'border-red-700',
      tooltip: 'opportunity_lost',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-7 gap-4">
      {stats
        .filter((stat) => stat.tooltip === 'total_all' || isCardVisible(stat.tooltip))
        .map((stat) => (
          <div
            key={stat.label}
            className={`${stat.bgColor} ${
              stat.borderColor || 'border-slate-700'
            } border rounded-lg p-4 cursor-pointer hover:scale-105 transition-all ${
              stageFilter === stat.filter
                ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-900'
                : ''
            }`}
            onClick={() => onStageFilterClick(stat.filter)}
          >
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm text-slate-400">
                {getCardLabel(stat.tooltip) || stat.label}
              </p>
              <StatusHelper statusKey={stat.tooltip} />
            </div>
            <p className="text-2xl font-bold text-slate-100">{stat.value}</p>
          </div>
        ))}
    </div>
  );
}
