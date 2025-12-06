
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isToday } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { formatUtcTimeToLocal } from "@/components/shared/timezoneUtils";

// Matching the stat card colors - semi-transparent backgrounds
const statusColors = {
  scheduled: "bg-blue-900/20 text-blue-300 border-blue-700",
  in_progress: "bg-yellow-900/20 text-yellow-300 border-yellow-700",
  overdue: "bg-red-900/20 text-red-300 border-red-700",
  completed: "bg-emerald-900/20 text-emerald-300 border-emerald-700",
  cancelled: "bg-slate-900/20 text-slate-300 border-slate-700"
};

function DayCell({ date, inCurrentMonth, activitiesForDay, onActivityClick }) {
  return (
    <div className={`border border-slate-800 min-h-[120px] p-2 ${inCurrentMonth ? "bg-slate-900 calendar-cell-in" : "bg-slate-900/70 calendar-cell-out"}`}>
      <div className="flex items-center justify-between mb-1">
        <span className={`text-xs font-semibold ${isToday(date) ? "text-accent" : "text-slate-400"}`}>
          {format(date, "d")}
        </span>
        {isToday(date) && <span className="bg-amber-200 text-sky-600 px-1.5 py-0.5 rounded-full">Today</span>}
      </div>
      <div className="space-y-1">
        {activitiesForDay.slice(0, 4).map((a) =>
        <button
          key={a.id}
          onClick={() => onActivityClick(a)}
          className="w-full text-left rounded-md px-2 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-400"
          title={a.subject}>

            <div className="text-[11px] text-slate-300 truncate">{a.subject}</div>
            {a.due_time && <div className="text-[10px] text-slate-500">{formatUtcTimeToLocal(a.due_time, a.due_date)}</div>}
            <div className="mt-1 flex flex-wrap gap-1">
              <Badge variant="outline" className="text-[10px] border-slate-600">{a.type}</Badge>
              {a.status &&
            <Badge
              className={`text-[10px] border ${statusColors[a.status] || 'border-slate-600'}`}>

                  {a.status}
                </Badge>
            }
            </div>
          </button>
        )}
        {activitiesForDay.length > 4 &&
        <div className="text-[11px] text-slate-500">+{activitiesForDay.length - 4} more</div>
        }
      </div>
    </div>);

}

export default function MonthGrid({ currentDate, activities, onActivityClick }) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const rows = [];
  let day = gridStart;
  while (day <= gridEnd) {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const dateStr = format(day, "yyyy-MM-dd");
      const acts = activities.filter((a) => a._dateKey === dateStr);
      days.push(
        <DayCell
          key={day.toISOString()}
          date={day}
          inCurrentMonth={isSameMonth(day, monthStart)}
          activitiesForDay={acts}
          onActivityClick={onActivityClick} />

      );
      day = addDays(day, 1);
    }
    rows.push(
      <div key={day.toISOString()} className="grid grid-cols-7 gap-px">
        {days}
      </div>
    );
  }

  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="rounded-lg overflow-hidden border border-slate-800">
      <div className="grid grid-cols-7">
        {weekdays.map((d) =>
        <div key={d} className="bg-slate-800 text-slate-300 text-xs uppercase tracking-wide font-semibold p-2 text-center border-b border-slate-800">
            {d}
          </div>
        )}
      </div>
      <div className="divide-y divide-slate-800">
        {rows}
      </div>
    </div>);

}