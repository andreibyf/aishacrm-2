import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw, Phone, Mail, Calendar, Activity as ActivityIcon } from 'lucide-react';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  BarChart as RBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  ResponsiveContainer,
  LabelList,
  Cell,
} from 'recharts';

import { Activity } from '@/api/entities';
import { useApiManager } from '../shared/ApiManager';
import { useEmployeeScope } from '../shared/EmployeeScopeContext';
import { useUser } from '@/components/shared/useUser';
import { useAuthCookiesReady } from '@/components/shared/useAuthCookiesReady';
import { useStatusCardPreferences } from '@/hooks/useStatusCardPreferences';
import { useEntityLabel } from '@/components/shared/entityLabelsHooks';

import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

const activityIcons = {
  call: Phone,
  email: Mail,
  meeting: Calendar,
  task: ActivityIcon,
  note: ActivityIcon,
  demo: ActivityIcon,
  proposal: ActivityIcon,
  scheduled_ai_call: Phone,
};

const activityColors = {
  call: 'bg-blue-100 text-blue-700 border-blue-200',
  email: 'bg-purple-100 text-purple-700 border-purple-200',
  meeting: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  task: 'bg-orange-100 text-orange-700 border-orange-200',
  note: 'bg-slate-100 text-slate-700 border-slate-200',
  demo: 'bg-pink-100 text-pink-700 border-pink-200',
  proposal: 'bg-amber-100 text-amber-700 border-amber-200',
  scheduled_ai_call: 'bg-cyan-100 text-cyan-700 border-cyan-200',
};

const priorityColors = {
  low: 'bg-blue-100 text-blue-800 border-blue-200',
  normal: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  high: 'bg-orange-100 text-orange-800 border-orange-200',
  urgent: 'bg-red-100 text-red-800 border-red-200',
};

function RecentActivities(props) {
  const { tenantFilter: tenantFilterProp, showTestData: showTestDataProp } = props || {};
  const memoTenantFilter = useMemo(
    () => (tenantFilterProp ? tenantFilterProp : {}),
    [tenantFilterProp],
  );
  const memoShowTestData = useMemo(
    () => (typeof showTestDataProp !== 'undefined' ? showTestDataProp : false),
    [showTestDataProp],
  );

  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(Date.now());

  const [viewMode, setViewMode] = useState('summary');
  const [timeframeWeeks, setTimeframeWeeks] = useState('4');

  const { cachedRequest } = useApiManager();
  const { selectedEmail } = useEmployeeScope();
  const { loading: userLoading } = useUser();
  const { authCookiesReady } = useAuthCookiesReady();
  const { getVisibleCardsForEntity } = useStatusCardPreferences();
  const { plural: activitiesLabel } = useEntityLabel('activities');
  const flipAttemptedRef = useRef(false);

  const backgroundScheduledRef = useRef(false);

  // Race condition fix: Track mounted state to prevent state updates after unmount
  const isMountedRef = useRef(true);
  const backgroundTimeoutRef = useRef(null);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (backgroundTimeoutRef.current) {
        clearTimeout(backgroundTimeoutRef.current);
        backgroundTimeoutRef.current = null;
      }
    };
  }, []);

  const fetchActivities = useCallback(
    async (forceFull = false) => {
      // Race condition fix: Don't update state if unmounted
      if (!isMountedRef.current) return;

      // Use prefetched data immediately without waiting for auth
      // (Dashboard already handles auth before passing prefetched data)
      if (
        !forceFull &&
        Array.isArray(props?.prefetchedActivities) &&
        props.prefetchedActivities.length > 0
      ) {
        const pref = props.prefetchedActivities;
        if (!isMountedRef.current) return;
        setActivities(pref.map((a) => ({ ...a })));
        setLastUpdated(Date.now());
        setLoading(false);
        if (!backgroundScheduledRef.current) {
          backgroundScheduledRef.current = true;
          // Clear any existing timeout before scheduling a new one
          if (backgroundTimeoutRef.current) {
            clearTimeout(backgroundTimeoutRef.current);
          }
          backgroundTimeoutRef.current = setTimeout(() => {
            backgroundTimeoutRef.current = null;
            // Single background refresh to hydrate with full data
            if (isMountedRef.current) {
              fetchActivities(true);
            }
          }, 300);
        }
        return;
      }

      // Wait for user to be loaded before fetching data (for non-prefetch path)
      if (userLoading || !authCookiesReady) {
        return;
      }

      if (isMountedRef.current) setLoading(true);
      try {
        // Guard: Don't fetch if no tenant_id is present
        // When forceFull (background refresh), just return silently to preserve prefetched data
        if (!memoTenantFilter?.tenant_id) {
          if (!forceFull && isMountedRef.current) {
            // Only clear activities on initial load, not background refresh
            setActivities([]);
            setLastUpdated(Date.now());
            setLoading(false);
          }
          return;
        }

        const effectiveFilter = memoShowTestData
          ? { ...memoTenantFilter, limit: 200 }
          : { ...memoTenantFilter, is_test_data: false, limit: 200 };

        const recentActivities = await cachedRequest(
          'Activity',
          'filter',
          {
            filter: effectiveFilter,
            sort: '-created_date',
            limit: 200,
          },
          () => Activity.filter(effectiveFilter, '-created_date', 200),
        );

        // Race condition fix: Check mounted after async operation
        if (!isMountedRef.current) return;

        const now = new Date();
        const toDueDate = (a) => {
          if (!a?.due_date) return null;
          // FIXED: If due_date contains a full ISO datetime with timezone offset,
          // parse it directly - the Date constructor handles the offset correctly
          if (
            a.due_date.includes('T') &&
            (a.due_date.includes('+') || a.due_date.includes('-', 10))
          ) {
            const dt = new Date(a.due_date);
            return isNaN(dt.getTime()) ? null : dt;
          }
          // Legacy: separate due_date and due_time fields
          const datePart = String(a.due_date).split('T')[0];
          const hhmm = a.due_time && /^\d{2}:\d{2}$/.test(a.due_time) ? a.due_time : '23:59';
          const dt = new Date(`${datePart}T${hhmm}:00.000Z`);
          return isNaN(dt.getTime()) ? null : dt;
        };

        const mutableActivities = Array.isArray(recentActivities)
          ? recentActivities.map((a) => ({ ...a }))
          : [];

        if (!flipAttemptedRef.current) {
          // Check for both 'scheduled' and 'planned' status (AI flows use 'planned')
          const flipCandidates = mutableActivities.filter(
            (a) =>
              (a.status === 'scheduled' || a.status === 'planned') &&
              toDueDate(a) &&
              toDueDate(a) < now,
          );
          const limited = flipCandidates.slice(0, 5);
          if (limited.length > 0) {
            for (const a of limited) {
              // Check mounted before each async operation
              if (!isMountedRef.current) return;
              await Activity.update(a.id, { status: 'overdue' });
              a.status = 'overdue';
            }
          }
          flipAttemptedRef.current = true;
        }

        // Final mounted check before setting state
        if (!isMountedRef.current) return;
        setActivities(mutableActivities);
        setLastUpdated(Date.now());
      } catch (error) {
        console.error('RecentActivities: fetch failed:', error);
        if (isMountedRef.current) setActivities([]);
      } finally {
        if (isMountedRef.current) setLoading(false);
      }
    },
    [
      memoTenantFilter,
      memoShowTestData,
      cachedRequest,
      props.prefetchedActivities,
      userLoading,
      authCookiesReady,
    ],
  );

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchActivities(true);
    }, 180000);
    return () => clearInterval(interval);
  }, [fetchActivities]);

  const timeframeDays = parseInt(timeframeWeeks, 10) * 7;
  const cutoffMs = Date.now() - timeframeDays * 24 * 60 * 60 * 1000;

  const scopedActivities = React.useMemo(() => {
    if (!selectedEmail || selectedEmail === 'all') {
      return activities;
    }

    const filtered = (activities || []).filter((a) => {
      // Include activities assigned to the selected employee OR unassigned activities
      const matches = a.assigned_to === selectedEmail || !a.assigned_to;
      return matches;
    });

    return filtered;
  }, [activities, selectedEmail]);

  const activitiesInWindow = React.useMemo(() => {
    const filtered = (scopedActivities || []).filter((a) => {
      const createdDate = new Date(a.created_date);
      const t = createdDate.getTime();
      const isValid = !Number.isNaN(t);
      const isInWindow = t >= cutoffMs;
      return isValid && isInWindow;
    });

    return filtered;
  }, [scopedActivities, cutoffMs]);

  // Get visible activity statuses from preferences
  const visibleActivityCards = useMemo(
    () => getVisibleCardsForEntity('activities'),
    [getVisibleCardsForEntity],
  );

  const summaryData = React.useMemo(() => {
    // Map statusKey to handle 'in_progress' vs 'in-progress' difference
    // Also normalize 'planned' → 'scheduled' (AI flows use 'planned', UI expects 'scheduled')
    const statusKeyMap = {
      in_progress: 'in-progress',
      scheduled: 'scheduled',
      planned: 'scheduled', // AI flows use 'planned', treat as 'scheduled'
      overdue: 'overdue',
      completed: 'completed',
      cancelled: 'cancelled',
    };

    // Defensive guard: ensure activitiesInWindow is an array before reducing
    const safeActivities = Array.isArray(activitiesInWindow) ? activitiesInWindow : [];
    const counts = safeActivities.reduce((acc, a) => {
      // Normalize status: 'planned' → 'scheduled' for counting
      const rawStatus = a?.status || 'scheduled';
      const k = statusKeyMap[rawStatus] || rawStatus;
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});

    // Defensive guard: ensure visibleActivityCards is an array
    const safeCards = Array.isArray(visibleActivityCards) ? visibleActivityCards : [];
    // Only show statuses that are visible in preferences
    return safeCards.map((card) => {
      const chartKey = statusKeyMap[card?.statusKey] || card?.statusKey || 'scheduled';
      return {
        status: card?.label || chartKey,
        key: chartKey,
        value: counts[chartKey] || 0,
      };
    });
  }, [activitiesInWindow, visibleActivityCards]);

  const barColors = {
    scheduled: '#3B82F6',
    'in-progress': '#06B6D4',
    overdue: '#F97316',
    completed: '#10B981',
    cancelled: '#94A3B8',
  };

  const descriptionText =
    memoTenantFilter && memoTenantFilter.tenant_id
      ? `Client: ${memoTenantFilter.tenant_id.slice(0, 8)}...`
      : 'All clients';

  const handleRefresh = async () => {
    // First, trigger the mark-overdue endpoint to update past-due activities
    try {
      const baseUrl = import.meta.env.VITE_BACKEND_URL || '';
      const response = await fetch(`${baseUrl}/api/v2/activities/mark-overdue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tenant_id: memoTenantFilter?.tenant_id || null }),
      });
      if (response.ok) {
        const result = await response.json();
        if (result.data?.updated_count > 0) {
          console.log(
            `RecentActivities: Marked ${result.data.updated_count} activities as overdue`,
          );
        }
      }
    } catch (err) {
      console.warn('RecentActivities: Failed to mark overdue activities:', err.message);
    }
    // Then fetch the updated activities list
    flipAttemptedRef.current = false; // Reset flip attempt to allow re-check
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
    <Card className="shadow-lg border-0 bg-slate-800 border-slate-700 h-full flex flex-col">
      <CardHeader className="border-b border-slate-700 pb-3">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-slate-100">
              <ActivityIcon className="w-5 h-5 text-indigo-400 flex-shrink-0" />
              Recent Activities
            </CardTitle>
            <CardDescription className="text-slate-400 text-sm mt-1">
              {descriptionText} • Last {timeframeWeeks} week{timeframeWeeks === '1' ? '' : 's'}
            </CardDescription>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <Select value={timeframeWeeks} onValueChange={setTimeframeWeeks}>
              <SelectTrigger className="w-28 bg-slate-700 border-slate-600 text-slate-200 text-sm h-8">
                <SelectValue placeholder="Timeframe" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700 text-slate-200">
                <SelectItem value="1">1 week</SelectItem>
                <SelectItem value="2">2 weeks</SelectItem>
                <SelectItem value="3">3 weeks</SelectItem>
                <SelectItem value="4">4 weeks</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex rounded-md overflow-hidden border border-slate-700">
              <Button
                variant={viewMode === 'summary' ? 'default' : 'ghost'}
                size="sm"
                className={`h-8 px-3 ${viewMode === 'summary' ? 'bg-indigo-600 hover:bg-indigo-700' : 'text-slate-300 hover:bg-slate-700'}`}
                onClick={() => setViewMode('summary')}
              >
                Summary
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'ghost'}
                size="sm"
                className={`h-8 px-3 ${viewMode === 'list' ? 'bg-indigo-600 hover:bg-indigo-700' : 'text-slate-300 hover:bg-slate-700'}`}
                onClick={() => setViewMode('list')}
              >
                List
              </Button>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              className="text-slate-400 hover:text-slate-200 hover:bg-slate-700 h-8 w-8 p-0"
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pb-3">
        {viewMode === 'summary' ? (
          activitiesInWindow.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <ActivityIcon className="w-12 h-12 mx-auto mb-4 text-slate-600" />
              <p className="text-slate-400">No activity in the selected timeframe</p>
              <p className="text-sm text-slate-500">Try expanding the timeframe</p>
            </div>
          ) : (
            <>
              <div className="h-[26rem] max-w-3xl mx-auto mt-6 flex items-center">
                <ResponsiveContainer width="100%" height="100%">
                  <RBarChart
                    data={summaryData}
                    margin={{ top: 20, right: 30, left: 10, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                    <XAxis
                      dataKey="status"
                      tick={{ fontSize: 13, fill: '#94a3b8' }}
                      stroke="#475569"
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 13, fill: '#94a3b8' }}
                      stroke="#475569"
                      domain={[0, (dataMax) => Math.max(6, Math.ceil(dataMax * 1.2))]}
                      allowDataOverflow={false}
                    />
                    <RTooltip
                      contentStyle={{
                        backgroundColor: '#1e293b',
                        border: '1px solid #475569',
                        borderRadius: '8px',
                        color: '#f1f5f9',
                      }}
                      formatter={(value) => [`${value}`, 'Count']}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                      {summaryData.map((d, i) => (
                        <Cell key={`cell-${d.key}-${i}`} fill={barColors[d.key] || '#6366f1'} />
                      ))}
                      <LabelList
                        dataKey="value"
                        position="top"
                        style={{ fill: '#cbd5e1', fontSize: '14px', fontWeight: '500' }}
                      />
                    </Bar>
                  </RBarChart>
                </ResponsiveContainer>
              </div>
              <div className="text-center pt-3 border-t border-slate-700 mt-3">
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600"
                >
                  <Link to={createPageUrl('Activities')}>View All {activitiesLabel}</Link>
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
                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                  {activitiesInWindow.map((activity) => {
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
                            <p className="text-sm text-slate-400 mt-1 line-clamp-2">
                              {activity.description}
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            <Badge
                              variant="outline"
                              className={`${activityColors[activity.type] || activityColors.note} border-slate-600`}
                            >
                              {String(activity.type || '').replace(/_/g, ' ')}
                            </Badge>
                            {activity.priority && activity.priority !== 'normal' && (
                              <Badge
                                variant="outline"
                                className={`${priorityColors[activity.priority] || priorityColors.normal} border-slate-600`}
                              >
                                {activity.priority}
                              </Badge>
                            )}
                            <span className="text-xs text-slate-500">
                              {format(new Date(activity.created_date), 'MMM d, h:mm a')}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div className="text-center pt-2">
                    <p className="text-xs text-slate-500">
                      Last updated: {format(new Date(lastUpdated), 'h:mm:ss a')}
                    </p>
                  </div>
                </div>
                <div className="text-center pt-4 border-t border-slate-700 mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600"
                  >
                    <Link to={createPageUrl('Activities')}>View All {activitiesLabel}</Link>
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

export default React.memo(RecentActivities);
