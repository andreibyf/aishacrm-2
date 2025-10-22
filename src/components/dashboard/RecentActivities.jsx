import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Phone, Mail, Calendar, Activity as ActivityIcon } from "lucide-react";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart as RBarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer, LabelList, Cell } from "recharts";

import { Activity } from "@/api/entities";
import { useApiManager } from "../shared/ApiManager";
import { useEmployeeScope } from "../shared/EmployeeScopeContext";

import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

const activityIcons = {
  call: Phone,
  email: Mail,
  meeting: Calendar,
  task: ActivityIcon,
  note: ActivityIcon,
  demo: ActivityIcon,
  proposal: ActivityIcon,
  scheduled_ai_call: Phone
};

const activityColors = {
  call: "bg-blue-100 text-blue-700 border-blue-200",
  email: "bg-purple-100 text-purple-700 border-purple-200",
  meeting: "bg-emerald-100 text-emerald-700 border-emerald-200",
  task: "bg-orange-100 text-orange-700 border-orange-200",
  note: "bg-slate-100 text-slate-700 border-slate-200",
  demo: "bg-pink-100 text-pink-700 border-pink-200",
  proposal: "bg-amber-100 text-amber-700 border-amber-200",
  scheduled_ai_call: "bg-cyan-100 text-cyan-700 border-cyan-200"
};

const priorityColors = {
  low: "bg-blue-100 text-blue-800 border-blue-200",
  normal: "bg-emerald-100 text-emerald-800 border-emerald-200",
  high: "bg-orange-100 text-orange-800 border-orange-200",
  urgent: "bg-red-100 text-red-800 border-red-200"
};

export default function RecentActivities(props) {
  const { tenantFilter: tenantFilterProp, showTestData: showTestDataProp } = props || {};
  const memoTenantFilter = useMemo(() => (tenantFilterProp ? tenantFilterProp : {}), [tenantFilterProp]);
  const memoShowTestData = useMemo(
    () => (typeof showTestDataProp !== "undefined" ? showTestDataProp : false),
    [showTestDataProp]
  );

  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(Date.now());

  const [viewMode, setViewMode] = useState("summary");
  const [timeframeWeeks, setTimeframeWeeks] = useState("4");

  const { cachedRequest } = useApiManager();
  const { selectedEmail } = useEmployeeScope();
  const flipAttemptedRef = useRef(false);

  const fetchActivities = useCallback(async () => {
    setLoading(true);
    try {
      if (Array.isArray(props?.prefetchedActivities)) {
        const pref = props.prefetchedActivities || [];
        setActivities(pref.map(a => ({ ...a })));
        setLastUpdated(Date.now());
        setLoading(false);
        return;
      }

      const effectiveFilter = memoShowTestData
        ? { ...memoTenantFilter }
        : { ...memoTenantFilter, is_test_data: { $ne: true } };
      
      const recentActivities = await cachedRequest(
        "Activity",
        "filter",
        {
          filter: effectiveFilter,
          sort: "-created_date",
          limit: 200
        },
        () => Activity.filter(effectiveFilter, "-created_date", 200)
      );

      const now = new Date();
      const toDueDate = (a) => {
        if (!a?.due_date) return null;
        const datePart = String(a.due_date).split("T")[0];
        const hhmm = a.due_time && /^\d{2}:\d{2}$/.test(a.due_time) ? a.due_time : "23:59";
        const dt = new Date(`${datePart}T${hhmm}:00.000Z`);
        return isNaN(dt.getTime()) ? null : dt;
      };
      
      const mutableActivities = (recentActivities || []).map(a => ({ ...a }));

      if (!flipAttemptedRef.current) {
        const flipCandidates = mutableActivities.filter(a => a.status === "scheduled" && toDueDate(a) && toDueDate(a) < now);
        const limited = flipCandidates.slice(0, 5);
        if (limited.length > 0) {
          for (const a of limited) {
            await Activity.update(a.id, { status: "overdue" });
            a.status = "overdue";
          }
        }
        flipAttemptedRef.current = true;
      }

      setActivities(mutableActivities);
      setLastUpdated(Date.now());
    } catch (error) {
      console.error("RecentActivities: fetch failed:", error);
      setActivities([]);
    } finally {
      setLoading(false);
    }
  }, [memoTenantFilter, memoShowTestData, cachedRequest, props?.prefetchedActivities, tenantFilterProp]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchActivities();
    }, 180000);
    return () => clearInterval(interval);
  }, [fetchActivities]);

  const timeframeDays = parseInt(timeframeWeeks, 10) * 7;
  const cutoffMs = Date.now() - timeframeDays * 24 * 60 * 60 * 1000;

  const scopedActivities = React.useMemo(() => {
    if (!selectedEmail || selectedEmail === 'all') {
      return activities;
    }
    
    const filtered = (activities || []).filter(a => {
      const matches = a.assigned_to === selectedEmail;
      return matches;
    });
    
    return filtered;
  }, [activities, selectedEmail]);

  const activitiesInWindow = React.useMemo(() => {
    const filtered = (scopedActivities || []).filter(a => {
      const createdDate = new Date(a.created_date);
      const t = createdDate.getTime();
      const isValid = !Number.isNaN(t);
      const isInWindow = t >= cutoffMs;
      return isValid && isInWindow;
    });
    
    return filtered;
  }, [scopedActivities, cutoffMs, timeframeWeeks, timeframeDays]);

  const summaryData = React.useMemo(() => {
    const order = ["scheduled", "overdue", "in-progress", "completed", "cancelled", "failed"];
    const label = {
      scheduled: "Scheduled",
      overdue: "Overdue",
      "in-progress": "In Progress",
      completed: "Completed",
      cancelled: "Cancelled",
      failed: "Failed"
    };
    const counts = activitiesInWindow.reduce((acc, a) => {
      const k = a.status || "scheduled";
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});
    return order.map(k => ({ status: label[k], key: k, value: counts[k] || 0 }));
  }, [activitiesInWindow]);

  const barColors = {
    scheduled: '#3B82F6',
    overdue: '#F97316',
    'in-progress': '#06B6D4',
    completed: '#10B981',
    cancelled: '#94A3B8',
    failed: '#EF4444'
  };

  const descriptionText =
    memoTenantFilter && memoTenantFilter.tenant_id
      ? `Showing recent activities for Client ID: ${memoTenantFilter.tenant_id}`
      : "Showing recent activities for all clients";

  const handleRefresh = () => {
    fetchActivities();
  };

  if (loading && activities.length === 0) {
    return (
      <Card className="shadow-lg border-0 bg-slate-800 border-slate-700">
        <CardHeader className="border-b border-slate-700">
          <CardTitle className="flex items-center gap-2 text-slate-100">
            <ActivityIcon className="w-5 h-5 text-indigo-400" />
            Recent Activities
          </CardTitle>
          <CardDescription className="text-slate-400">Loading recent activities...</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="w-10 h-10 rounded-full bg-slate-700" />
              <div className="flex-1">
                <Skeleton className="h-4 w-full mb-1 bg-slate-700" />
                <Skeleton className="h-3 w-20 bg-slate-700" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-lg border-0 bg-slate-800 border-slate-700">
      <CardHeader className="border-b border-slate-700">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-slate-100">
              <ActivityIcon className="w-5 h-5 text-indigo-400" />
              Recent Activities
            </CardTitle>
            <CardDescription className="text-slate-400">
              {descriptionText} • Last {timeframeWeeks} week{timeframeWeeks === "1" ? "" : "s"}
            </CardDescription>
          </div>

          <div className="flex items-center gap-2">
            <Select value={timeframeWeeks} onValueChange={setTimeframeWeeks}>
              <SelectTrigger className="w-32 bg-slate-700 border-slate-600 text-slate-200">
                <SelectValue placeholder="Timeframe" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700 text-slate-200">
                <SelectItem value="1">Last 1 week</SelectItem>
                <SelectItem value="2">Last 2 weeks</SelectItem>
                <SelectItem value="3">Last 3 weeks</SelectItem>
                <SelectItem value="4">Last 4 weeks</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex rounded-md overflow-hidden border border-slate-700">
              <Button
                variant={viewMode === "summary" ? "default" : "ghost"}
                size="sm"
                className={viewMode === "summary" ? "bg-indigo-600 hover:bg-indigo-700" : "text-slate-300 hover:bg-slate-700"}
                onClick={() => setViewMode("summary")}
              >
                Summary
              </Button>
              <Button
                variant={viewMode === "list" ? "default" : "ghost"}
                size="sm"
                className={viewMode === "list" ? "bg-indigo-600 hover:bg-indigo-700" : "text-slate-300 hover:bg-slate-700"}
                onClick={() => setViewMode("list")}
              >
                List
              </Button>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              className="text-slate-400 hover:text-slate-200 hover:bg-slate-700"
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {viewMode === "summary" ? (
          activitiesInWindow.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <ActivityIcon className="w-12 h-12 mx-auto mb-4 text-slate-600" />
              <p className="text-slate-400">No activity in the selected timeframe</p>
              <p className="text-sm text-slate-500">Try expanding the timeframe</p>
            </div>
          ) : (
            <>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <RBarChart data={summaryData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                    <XAxis dataKey="status" tick={{ fontSize: 12, fill: '#94a3b8' }} stroke="#475569" />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#94a3b8' }} stroke="#475569" />
                    <RTooltip
                      contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px', color: '#f1f5f9' }}
                      formatter={(value) => [`${value}`, 'Count']}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {summaryData.map((d, i) => (
                        <Cell key={`cell-${d.key}-${i}`} fill={barColors[d.key] || '#6366f1'} />
                      ))}
                      <LabelList dataKey="value" position="top" style={{ fill: '#cbd5e1', fontSize: '12px' }} />
                    </Bar>
                  </RBarChart>
                </ResponsiveContainer>
              </div>
              <div className="text-center pt-4 border-t border-slate-700 mt-4">
                <Button variant="outline" size="sm" asChild className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600">
                  <Link to={createPageUrl("Activities")}>
                    View All Activities
                  </Link>
                </Button>
              </div>
            </>
          )
        ) : (
          <>
            {activitiesInWindow.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <ActivityIcon className="w-12 h-12 mx-auto mb-4 text-slate-600" />
                <p className="text-slate-400">No recent activities</p>
                <p className="text-sm text-slate-500">Activities will appear here as you work</p>
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  {activitiesInWindow.slice(0, 10).map((activity) => {
                    const Icon = activityIcons[activity.type] || ActivityIcon;
                    const colorClass = activityColors[activity.type] || activityColors.note;

                    return (
                      <div
                        key={activity.id}
                        className="flex items-start gap-3 p-3 rounded-lg hover:bg-slate-700/50 transition-colors border border-slate-700/50"
                      >
                        <div className={`p-2 rounded-full ${colorClass} border border-slate-600`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-200 truncate">{activity.subject}</p>
                          {activity.description && (
                            <p className="text-sm text-slate-400 mt-1 line-clamp-2">{activity.description}</p>
                          )}
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            <Badge variant="outline" className={`${activityColors[activity.type] || activityColors.note} border-slate-600`}>
                              {String(activity.type || "").replace(/_/g, " ")}
                            </Badge>
                            {activity.priority && activity.priority !== "normal" && (
                              <Badge variant="outline" className={`${priorityColors[activity.priority] || priorityColors.normal} border-slate-600`}>
                                {activity.priority}
                              </Badge>
                            )}
                            <span className="text-xs text-slate-500">
                              {format(new Date(activity.created_date), "MMM d, h:mm a")}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div className="text-center pt-2">
                    <p className="text-xs text-slate-500">Last updated: {format(new Date(lastUpdated), "h:mm:ss a")}</p>
                  </div>
                </div>
                <div className="text-center pt-4 border-t border-slate-700 mt-4">
                  <Button variant="outline" size="sm" asChild className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600">
                    <Link to={createPageUrl("Activities")}>
                      View All Activities
                    </Link>
                  </Button>
                </div>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}