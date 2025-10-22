
import React from "react";
import { format } from "date-fns";
import { Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

// Matching the stat card colors - semi-transparent backgrounds
const statusColors = {
  scheduled: "bg-blue-900/20 text-blue-300 border-blue-700",
  in_progress: "bg-yellow-900/20 text-yellow-300 border-yellow-700",
  overdue: "bg-red-900/20 text-red-300 border-red-700",
  completed: "bg-emerald-900/20 text-emerald-300 border-emerald-700",
  cancelled: "bg-slate-900/20 text-slate-300 border-slate-700"
};

export default function DayView({ currentDate, activities, onActivityClick }) {
  const key = format(currentDate, "yyyy-MM-dd");
  const items = activities
    .filter(a => a._dateKey === key)
    .sort((a, b) => (a.due_time || "").localeCompare(b.due_time || ""));

  return (
    <div className="rounded-lg overflow-hidden border border-slate-800">
      <div className="bg-slate-800 text-slate-300 text-xs uppercase tracking-wide font-semibold p-2 border-b border-slate-800">
        {format(currentDate, "EEEE, MMMM d, yyyy")}
      </div>
      <div className="p-3 space-y-2 bg-slate-900 min-h-[240px]">
        {items.length === 0 && <div className="text-slate-500 text-sm italic">No activities scheduled.</div>}
        {items.map(a => (
          <button
            key={a.id}
            onClick={() => onActivityClick(a)}
            className="w-full text-left rounded-md px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-400"
          >
            <div className="flex items-center justify-between">
              <div className="text-slate-200 font-medium">{a.subject}</div>
              {a.due_time && (
                <div className="flex items-center gap-1 text-slate-400 text-sm">
                  <Clock className="w-3 h-3" />
                  {a.due_time}
                </div>
              )}
            </div>
            <div className="mt-1 flex gap-2">
              <Badge variant="outline" className="text-xs border-slate-600">
                {a.type}
              </Badge>
              {a.status && (
                <Badge className={`text-xs border ${statusColors[a.status] || 'border-slate-600'}`}>
                  {a.status}
                </Badge>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

