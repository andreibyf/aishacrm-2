
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Calendar, Clock, MoreHorizontal, Edit, Trash2, Eye, CheckCircle, Phone, Mail, Users, FileText } from "lucide-react";
import { format, isPast, isToday } from "date-fns";

// Matching the stat card colors - semi-transparent backgrounds
const statusColors = {
  scheduled: "bg-blue-900/20 text-blue-300 border-blue-700",
  in_progress: "bg-yellow-900/20 text-yellow-300 border-yellow-700",
  overdue: "bg-red-900/20 text-red-300 border-red-700",
  completed: "bg-emerald-900/20 text-emerald-300 border-emerald-700",
  cancelled: "bg-slate-900/20 text-slate-300 border-slate-700"
};

const priorityColors = {
  low: "bg-slate-600 text-white",
  normal: "bg-blue-600 text-white",
  high: "bg-orange-600 text-white",
  urgent: "bg-red-600 text-white"
};

const typeIcons = {
  call: Phone,
  email: Mail,
  meeting: Users,
  task: CheckCircle,
  note: FileText
};

export default function ActivityCard({
  activity,
  relatedName,
  assignedUserName,
  onEdit,
  onDelete,
  onViewDetails,
  onComplete,
  isSelected,
  onSelect
}) {
  const TypeIcon = typeIcons[activity.type] || Calendar;
  
  const isDue = activity.due_date && isPast(new Date(activity.due_date)) && activity.status !== 'completed';
  const isTodayActivity = activity.due_date && isToday(new Date(activity.due_date));

  return (
    <Card className="bg-slate-800 border-slate-700 hover:shadow-lg transition-all duration-200">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <Checkbox
              checked={isSelected}
              onCheckedChange={onSelect}
              className="mt-1 border-slate-600 data-[state=checked]:bg-blue-600 flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <h3 
                className="font-semibold text-slate-100 mb-1 cursor-pointer hover:text-blue-400 transition-colors break-words line-clamp-2"
                onClick={onViewDetails}
              >
                {activity.subject}
              </h3>
              {relatedName && (
                <p className="text-sm text-slate-400 break-words line-clamp-1">{relatedName}</p>
              )}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-200 hover:bg-slate-700 flex-shrink-0">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-slate-800 border-slate-700 text-slate-200">
              {activity.status !== 'completed' && onComplete && (
                <DropdownMenuItem onClick={() => onComplete(activity)} className="hover:bg-slate-700">
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Mark Complete
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={onEdit} className="hover:bg-slate-700">
                <Edit className="w-4 h-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onViewDetails} className="hover:bg-slate-700">
                <Eye className="w-4 h-4 mr-2" />
                View Details
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDelete} className="text-red-400 hover:bg-slate-700 focus:text-red-400">
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-1">
            <Badge 
              variant="outline" 
              className={`${statusColors[activity.status.replace(/-/g, '_')] || statusColors.scheduled} contrast-badge`}
              data-variant="status"
              data-status={activity.status.replace(/-/g, '_')}
            >
              {activity.status?.replace(/_/g, ' ')}
            </Badge>
          </div>
          
          <Badge variant="outline" className="border-slate-600 text-slate-300">
            <TypeIcon className="w-3 h-3 mr-1" />
            {activity.type}
          </Badge>
          
          <Badge 
            className={`${priorityColors[activity.priority] || priorityColors.normal} contrast-badge`}
            data-variant="priority"
            data-priority={activity.priority}
          >
            {activity.priority}
          </Badge>
        </div>

        {activity.due_date && (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Calendar className="w-4 h-4 flex-shrink-0" />
            <span className={isDue ? 'text-red-400 font-semibold' : isTodayActivity ? 'text-yellow-400 font-semibold' : ''}>
              {(() => {
                try {
                  const d = new Date(activity.due_date);
                  if (isNaN(d.getTime())) return activity.due_date;
                  return format(d, 'MMM d, yyyy');
                } catch {
                  return activity.due_date;
                }
              })()}
              {activity.due_time && ` at ${activity.due_time}`}
            </span>
          </div>
        )}

        {activity.duration && (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Clock className="w-4 h-4 flex-shrink-0" />
            <span>{activity.duration} minutes</span>
          </div>
        )}

        {assignedUserName && (
          <div className="text-sm text-slate-400 pt-2 border-t border-slate-700 break-words">
            Assigned: {assignedUserName}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
