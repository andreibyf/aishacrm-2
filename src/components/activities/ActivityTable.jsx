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
import { Edit, Eye, Loader2, Trash2 } from 'lucide-react';
import AssignedToDisplay from '../shared/AssignedToDisplay';

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
  deletingId = null,
  updatingId = null,
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
              <TableHead className="text-left p-3 font-medium text-slate-300">
                Assigned To
              </TableHead>
              <TableHead className="w-24 p-3 font-medium text-slate-300">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {activities.map((activity) => (
              <TableRow
                key={activity.id}
                className={`hover:bg-slate-700/30 transition-colors border-b border-slate-800 ${deletingId === activity.id || updatingId === activity.id ? 'opacity-50 pointer-events-none' : ''}`}
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
                  <div className="font-semibold whitespace-normal break-words">
                    {activity.subject}
                  </div>
                  {activity.description && (
                    <div className="text-xs text-slate-400 whitespace-normal break-words max-w-xs">
                      {activity.description}
                    </div>
                  )}
                </TableCell>
                <TableCell
                  className="cursor-pointer p-3"
                  onClick={() => handleViewDetails(activity)}
                >
                  <Badge className={`${typeColors[activity.type]} capitalize text-xs`}>
                    {activity.type}
                  </Badge>
                </TableCell>
                <TableCell
                  className="cursor-pointer p-3"
                  onClick={() => handleViewDetails(activity)}
                >
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
                  <AssignedToDisplay
                    assignedToName={activity.assigned_to_name}
                    assignedTo={activity.assigned_to}
                    employeesMap={employeesMap}
                    usersMap={usersMap}
                  />
                </TableCell>
                <TableCell className="p-3">
                  {(deletingId === activity.id || updatingId === activity.id) ? (
                    <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>{deletingId === activity.id ? 'Deleting…' : 'Updating…'}</span>
                    </div>
                  ) : (
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
                          className="h-8 w-8 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700"
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
                          className="h-8 w-8 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700"
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
                          className="h-8 w-8 text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/20"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Delete activity</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
