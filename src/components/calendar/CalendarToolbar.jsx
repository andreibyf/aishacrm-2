import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";
import { format } from "date-fns";

export default function CalendarToolbar({ currentDate, onPrev, onNext, onToday, view, onViewChange }) {
  return (
    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={onPrev} className="bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700">
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <Button variant="outline" onClick={onNext} className="bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700">
          <ChevronRight className="w-4 h-4" />
        </Button>
        <Button variant="outline" onClick={onToday} className="bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700">
          Today
        </Button>
        <div className="flex items-center gap-2 ml-2">
          <CalendarIcon className="w-5 h-5 text-slate-400" />
          <h2 className="text-xl font-semibold text-slate-100">{format(currentDate, "MMMM yyyy")}</h2>
        </div>
      </div>

      <Tabs value={view} onValueChange={onViewChange}>
        <TabsList className="bg-slate-800 border border-slate-700 rounded-full p-1">
          <TabsTrigger value="month" className="text-xs px-3 py-1.5 text-slate-300 data-[state=active]:text-white data-[state=active]:bg-slate-700 rounded-full">Month</TabsTrigger>
          <TabsTrigger value="week" className="text-xs px-3 py-1.5 text-slate-300 data-[state=active]:text-white data-[state=active]:bg-slate-700 rounded-full">Week</TabsTrigger>
          <TabsTrigger value="day" className="text-xs px-3 py-1.5 text-slate-300 data-[state=active]:text-white data-[state=active]:bg-slate-700 rounded-full">Day</TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}