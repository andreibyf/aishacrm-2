
import { format, startOfWeek, addDays, isToday } from "date-fns";

// Matching the stat card colors - semi-transparent backgrounds
const statusColors = {
  scheduled: "bg-blue-900/20 text-blue-300 border-blue-700",
  in_progress: "bg-yellow-900/20 text-yellow-300 border-yellow-700",
  overdue: "bg-red-900/20 text-red-300 border-red-700",
  completed: "bg-emerald-900/20 text-emerald-300 border-emerald-700",
  cancelled: "bg-slate-900/20 text-slate-300 border-slate-700"
};

export default function WeekView({ currentDate, activities, onActivityClick }) {
  const start = startOfWeek(currentDate, { weekStartsOn: 0 });
  const days = Array.from({ length: 7 }).map((_, i) => addDays(start, i));

  const getActs = (date) => {
    const key = format(date, "yyyy-MM-dd");
    return activities.filter(a => a._dateKey === key);
  };

  return (
    <div className="rounded-lg overflow-hidden border border-slate-800">
      <div className="grid grid-cols-7">
        {days.map(d => (
          <div key={d.toISOString()} className={`text-xs uppercase tracking-wide font-semibold p-2 text-center border-b border-slate-800 ${isToday(d) ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300'}`}>
            <span>{format(d, "EEE dd")}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px">
        {days.map(d => (
          <div key={d.toISOString()} className={`min-h-[220px] p-2 border border-slate-800 ${isToday(d) ? 'bg-slate-800/50' : 'bg-slate-900'}`}>
            <div className="space-y-2">
              {getActs(d).map(a => (
                <button
                  key={a.id}
                  onClick={() => onActivityClick(a)}
                  className="w-full text-left rounded-md px-2 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-400"
                  title={a.subject}
                >
                  <div className="text-[11px] text-slate-300 truncate">{a.subject}</div>
                  {a.due_time && <div className="text-[10px] text-slate-500">{a.due_time}</div>}
                  <div className="mt-1 flex flex-wrap gap-1">
                    {a.type && <span className="text-[10px] text-slate-400 border border-slate-600 rounded px-1">{a.type}</span>}
                    {a.status && (
                      <span className={`text-[10px] rounded px-1 border ${statusColors[a.status] || 'border-slate-600'}`}>
                        {a.status}
                      </span>
                    )}
                  </div>
                </button>
              ))}
              {getActs(d).length === 0 && <div className="text-[12px] text-slate-500 italic">No activities</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
