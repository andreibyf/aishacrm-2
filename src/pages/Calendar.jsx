import { useEffect, useMemo, useState, useCallback } from "react";
import { Activity } from "@/api/entities";
import { getTenantFilter as getTenantFilterHelper } from "../components/shared/tenantUtils";
import { useTenant } from "../components/shared/tenantContext";
import { useApiManager } from "../components/shared/ApiManager";
import { useUser } from "@/components/shared/useUser.js";
import CalendarToolbar from "../components/calendar/CalendarToolbar";
import MonthGrid from "../components/calendar/MonthGrid";
import WeekView from "../components/calendar/WeekView";
import DayView from "../components/calendar/DayView";
import ActivityDetailPanel from "../components/activities/ActivityDetailPanel";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addMonths, addWeeks, addDays } from "date-fns";
import CalendarQuickActions from "../components/calendar/CalendarQuickActions";

export default function CalendarPage() {
  const { user: currentUser } = useUser();
  const [view, setView] = useState("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [activities, setActivities] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const { selectedTenantId } = useTenant();
  const { cachedRequest } = useApiManager();

  // User provided by context

  const loadActivities = useCallback(async () => {
    if (!currentUser) return;

    const tenantFilter = getTenantFilterHelper(currentUser, selectedTenantId);
    let filter = { ...tenantFilter };

    // Guard: Don't load if no tenant_id for superadmin (must select a tenant first)
    if ((currentUser.role === 'superadmin' || currentUser.role === 'admin') && !filter.tenant_id) {
      if (import.meta.env.DEV) {
        console.log("[Calendar] Skipping data load - no tenant selected");
      }
      setActivities([]);
      return;
    }

    const isAdminLike = currentUser.role === "admin" || currentUser.role === "superadmin";
    const isManager = currentUser.employee_role === "manager";
    const seeAll = isAdminLike || isManager;

    if (!seeAll) {
      filter = { ...filter, assigned_to: currentUser.email };
    }

    const list = await cachedRequest("Activity", "filter", { filter }, () => Activity.filter(filter));
    
    // Normalize dates: use due_date if available, otherwise default to today
    const todayStr = format(new Date(), "yyyy-MM-dd");
    const normalized = (list || [])
      .map(a => {
        // If activity has due_date, use it; otherwise show on today
        const dateSource = a.due_date || todayStr;
        // Parse the date (which is in YYYY-MM-DD format)
        // Create a date object treating the date as local (not UTC)
        const [year, month, day] = dateSource.split('-').map(Number);
        const localDate = new Date(year, month - 1, day);
        
        // Format as YYYY-MM-DD for grouping (this will be in local timezone)
        const dateKey = format(localDate, "yyyy-MM-dd");
        
        if (import.meta.env.DEV) {
          console.log('[Calendar] Activity:', a.subject, 'due_date:', a.due_date, '_dateKey:', dateKey);
        }
        
        return {
          ...a,
          _dateKey: dateKey,
        };
      });
    
    console.log('[Calendar] Loaded activities:', normalized.length);
    setActivities(normalized);
  }, [currentUser, selectedTenantId, cachedRequest]);

  useEffect(() => {
    loadActivities();
  }, [loadActivities]);

  const onPrev = () => {
    if (view === "month") setCurrentDate(d => addMonths(d, -1));
    else if (view === "week") setCurrentDate(d => addWeeks(d, -1));
    else setCurrentDate(d => addDays(d, -1));
  };
  const onNext = () => {
    if (view === "month") setCurrentDate(d => addMonths(d, 1));
    else if (view === "week") setCurrentDate(d => addWeeks(d, 1));
    else setCurrentDate(d => addDays(d, 1));
  };
  const onToday = () => setCurrentDate(new Date());

  const visibleRange = useMemo(() => {
    if (view === "month") {
      const start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 0 });
      const end = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 0 });
      return { start, end };
    } else if (view === "week") {
      const start = startOfWeek(currentDate, { weekStartsOn: 0 });
      const end = endOfWeek(currentDate, { weekStartsOn: 0 });
      return { start, end };
    } else {
      const start = new Date(currentDate);
      const end = new Date(currentDate);
      return { start, end };
    }
  }, [view, currentDate]);

  const activitiesInRange = useMemo(() => {
    const s = +new Date(format(visibleRange.start, "yyyy-MM-dd"));
    const e = +new Date(format(visibleRange.end, "yyyy-MM-dd"));
    return activities.filter(a => {
      const d = +new Date(a._dateKey);
      return d >= s && d <= e;
    });
  }, [activities, visibleRange]);

  const handleActivityClick = (a) => {
    setSelected(a);
    setDetailOpen(true);
  };

  return (
    <div className="min-h-screen bg-slate-900 p-4 lg:p-8 space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-100">Calendar</h1>
          <p className="text-slate-400 mt-1 text-sm">
            View Activities by due date. Tiers 3–4 see all; Tiers 1–2 see their own.
          </p>
        </div>
        <Link to={createPageUrl("Integrations")}>
          <Button variant="outline" className="bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700">
            Manage External Calendar Integration
          </Button>
        </Link>
      </div>

      <CalendarToolbar
        currentDate={currentDate}
        onPrev={onPrev}
        onNext={onNext}
        onToday={onToday}
        view={view}
        onViewChange={setView}
      />

      <CalendarQuickActions />

      {view === "month" && (
        <MonthGrid
          currentDate={currentDate}
          activities={activitiesInRange}
          onActivityClick={handleActivityClick}
        />
      )}
      {view === "week" && (
        <WeekView
          currentDate={currentDate}
          activities={activitiesInRange}
          onActivityClick={handleActivityClick}
        />
      )}
      {view === "day" && (
        <DayView
          currentDate={currentDate}
          activities={activitiesInRange}
          onActivityClick={handleActivityClick}
        />
      )}

      {selected && (
        <ActivityDetailPanel
          activity={selected}
          open={detailOpen}
          onOpenChange={(open) => {
            if (!open) {
              setDetailOpen(false);
              setSelected(null);
            }
          }}
          user={currentUser}
        />
      )}
    </div>
  );
}