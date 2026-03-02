import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Edit, Eye, Trash2 } from 'lucide-react';

const statusColors = {
  scheduled: 'bg-blue-900/20 text-blue-300 border-blue-700',
  in_progress: 'bg-yellow-900/20 text-yellow-300 border-yellow-700',
  'in-progress': 'bg-yellow-900/20 text-yellow-300 border-yellow-700',
  overdue: 'bg-red-900/20 text-red-300 border-red-700',
  completed: 'bg-emerald-900/20 text-emerald-300 border-emerald-700',
  cancelled: 'bg-slate-900/20 text-slate-300 border-slate-700',
  failed: 'bg-red-900/20 text-red-300 border-red-700',
};

const typeColors = {
  call: 'bg-indigo-600 text-white',
  email: 'bg-purple-600 text-white',
  meeting: 'bg-blue-600 text-white',
  task: 'bg-green-600 text-white',
  note: 'bg-slate-600 text-white',
  demo: 'bg-orange-600 text-white',
  proposal: 'bg-pink-600 text-white',
  scheduled_ai_call: 'bg-indigo-600 text-white',
  scheduled_ai_email: 'bg-purple-600 text-white',
};

/**
 * ActivityTable - Table view for activities with selection and actions
 *
 * Columns: checkbox, subject, type, status, due date, related to, assigned to, actions
 */
export default function ActivityTable({
  activities,
  selectedActivities,
  selectAllMode,
  toggleSelectAll,
  toggleSelection,
  employeesMap,
  usersMap,
  handleViewDetails,
  setEditingActivity,
  setIsFormOpen,
  handleDelete,
  activityLabel,
  formatDisplayDate,
  getRelatedEntityLink,
}) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-slate-700/50">
            <TableRow>
              <TableHead className="w-12 p-3">
                <Checkbox
                  checked={
                    selectedActivities.size === activities.length &&
                    activities.length > 0 &&
                    !selectAllMode
                  }
                  onCheckedChange={toggleSelectAll}
                  className="border-slate-600"
                />
              </TableHead>
              <TableHead className="text-left p-3 font-medium text-slate-300">Activity</TableHead>
              <TableHead className="text-left p-3 font-medium text-slate-300">Type</TableHead>
              <TableHead className="text-left p-3 font-medium text-slate-300">Status</TableHead>
              <TableHead className="text-left p-3 font-medium text-slate-300">Due Date</TableHead>
              <TableHead className="text-left p-3 font-medium text-slate-300">Related To</TableHead>
              <TableHead className="text-left p-3 font-medium text-slate-300">Assigned To</TableHead>
              <TableHead className="w-24 p-3 font-medium text-slate-300">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {activities.map((activity) => (
              <TableRow
                key={activity.id}
                className="hover:bg-slate-700/30 transition-colors border-b border-slate-800"
              >
                <TableCell className="text-center p-3">
                  <Checkbox
                    checked={selectedActivities.has(activity.id) || selectAllMode}
                    onCheckedChange={() => toggleSelection(activity.id)}
                    className="border-slate-600 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                  />
                </TableCell>
                <TableCell
                  className="font-medium text-slate-200 cursor-pointer p-3"
                  onClick={() => handleViewDetails(activity)}
                >
                  <div className="font-semibold">{activity.subject}</div>
                  {activity.description && (
                    <div className="text-xs text-slate-400 truncate max-w-xs">
                      {activity.description}
                    </div>
                  )}
                </TableCell>
                <TableCell className="cursor-pointer p-3" onClick={() => handleViewDetails(activity)}>
                  <Badge className={`${typeColors[activity.type]} capitalize text-xs`}>
                    {activity.type}
                  </Badge>
                </TableCell>
                <TableCell className="cursor-pointer p-3" onClick={() => handleViewDetails(activity)}>
                  <Badge
                    className={`${statusColors[activity.status]} contrast-badge capitalize text-xs`}
                    data-variant="status"
                    data-status={activity.status}
                  >
                    {activity.status?.replace(/_/g, ' ')}
                  </Badge>
                </TableCell>
                <TableCell
                  className="text-slate-300 cursor-pointer p-3"
                  onClick={() => handleViewDetails(activity)}
                >
                  {formatDisplayDate(activity)}
                </TableCell>
                <TableCell
                  className="text-slate-300 cursor-pointer p-3"
                  onClick={() => handleViewDetails(activity)}
                >
                  {getRelatedEntityLink(activity) || '—'}
                </TableCell>
                <TableCell
                  className="text-slate-300 cursor-pointer p-3"
                  onClick={() => handleViewDetails(activity)}
                >
                  {(() => {
                    if (!activity.assigned_to) {
                      return <span className="text-slate-500">Unassigned</span>;
                    }

                    const employeeName = employeesMap[activity.assigned_to];
                    if (employeeName) return employeeName;

                    const userName = usersMap[activity.assigned_to];
                    if (userName) return userName;

                    if (activity.assigned_to_name) return activity.assigned_to_name;

                    if (import.meta.env.DEV) {
                      console.log('[ActivityTable] Missing employee lookup:', {
                        activityId: activity.id,
                        assigned_to: activity.assigned_to,
                      });
                    }

                    const assignedValue = String(activity.assigned_to);
                    if (assignedValue.includes('@')) {
                      return (
                        <span className="text-amber-400 text-xs" title={assignedValue}>
                          {assignedValue}
                        </span>
                      );
                    } else if (assignedValue.length > 20) {
                      return (
                        <span className="text-amber-400 text-xs" title={assignedValue}>
                          {assignedValue.substring(0, 8)}...
                        </span>
                      );
                    }
                    return <span className="text-amber-400 text-xs">{assignedValue}</span>;
                  })()}
                </TableCell>
                <TableCell className="p-3">
                  <div className="flex items-center gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingActivity(activity);
                            setIsFormOpen(true);
                          }}
                          aria-label="Edit"
                          className="h-8 w-8 text-slate-400 hover:text-slate-200 hover:bg-slate-700"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Edit {activityLabel.toLowerCase()}</p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewDetails(activity);
                          }}
                          aria-label="View"
                          className="h-8 w-8 text-slate-400 hover:text-slate-200 hover:bg-slate-700"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>View details</p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(activity.id);
                          }}
                          aria-label="Delete"
                          className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-900/20"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Delete activity</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
