import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import StatusHelper from '../shared/StatusHelper';

const statusDescriptions = {
  total_all: 'Total number of activities.',
  activity_scheduled: 'Activities planned for a future date or time, not yet started.',
  activity_in_progress: 'Activities that are currently being worked on.',
  activity_overdue: 'Activities that have passed their due date and are not yet completed.',
  activity_completed: 'Activities that have been successfully finished.',
  activity_cancelled: 'Activities that were planned but later cancelled.',
};

/**
 * ActivityStatsCards - Displays status-based stats cards for activities
 */
export default function ActivityStatsCards({
  totalStats,
  statusFilter,
  onStatusFilterClick,
  activitiesLabel,
  isCardVisible,
  getCardLabel,
}) {
  const stats = [
    {
      label: `Total ${activitiesLabel}`,
      value: totalStats.total,
      filter: 'all',
      bgColor: 'bg-slate-800',
      tooltip: 'total_all',
    },
    {
      label: 'Scheduled',
      value: totalStats.scheduled,
      filter: 'scheduled',
      bgColor: 'bg-blue-900/20',
      borderColor: 'border-blue-700',
      tooltip: 'activity_scheduled',
    },
    {
      label: 'In Progress',
      value: totalStats.in_progress,
      filter: 'in_progress',
      bgColor: 'bg-yellow-900/20',
      borderColor: 'border-yellow-700',
      tooltip: 'activity_in_progress',
    },
    {
      label: 'Overdue',
      value: totalStats.overdue,
      filter: 'overdue',
      bgColor: 'bg-red-900/20',
      borderColor: 'border-red-700',
      tooltip: 'activity_overdue',
    },
    {
      label: 'Completed',
      value: totalStats.completed,
      filter: 'completed',
      bgColor: 'bg-emerald-900/20',
      borderColor: 'border-emerald-700',
      tooltip: 'activity_completed',
    },
    {
      label: 'Cancelled',
      value: totalStats.cancelled,
      filter: 'cancelled',
      bgColor: 'bg-slate-900/20',
      borderColor: 'border-slate-700',
      tooltip: 'activity_cancelled',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
      {stats
        .filter((stat) => stat.tooltip === 'total_all' || isCardVisible(stat.tooltip))
        .map((stat) => (
          <Tooltip key={stat.label}>
            <TooltipTrigger asChild>
              <div
                className={`${stat.bgColor} ${stat.borderColor || 'border-slate-700'} border rounded-lg p-4 cursor-pointer hover:scale-105 transition-all ${
                  statusFilter === stat.filter
                    ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-900'
                    : ''
                }`}
                onClick={() => onStatusFilterClick(stat.filter)}
              >
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm text-slate-400">
                    {getCardLabel(stat.tooltip) || stat.label}
                  </p>
                  <StatusHelper statusKey={stat.tooltip} />
                </div>
                <p className="text-2xl font-bold text-slate-100">{stat.value}</p>
              </div>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p>
                Click to filter by {stat.label.toLowerCase()}.{' '}
                {stat.tooltip && statusDescriptions[stat.tooltip]}
              </p>
            </TooltipContent>
          </Tooltip>
        ))}
    </div>
  );
}
