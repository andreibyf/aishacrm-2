import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity as ActivityIcon, Calendar, CheckCircle, Lightbulb, Zap } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { format, isThisWeek, isToday, startOfWeek, subWeeks } from 'date-fns';
import { Activity, Employee } from '@/api/entities';

const COLORS_MAP = [
  ['#60a5fa', '#3b82f6'], // blue
  ['#34d399', '#10b981'], // emerald
  ['#fbbf24', '#f59e0b'], // amber
  ['#f87171', '#ef4444'], // red
  ['#a78bfa', '#8b5cf6'], // violet
  ['#2dd4bf', '#059669'], // teal
];

export default function ProductivityAnalytics({ tenantFilter }) {
  const [activities, setActivities] = useState([]);
  const [activitiesPerUser, setActivitiesPerUser] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!tenantFilter?.tenant_id) return;

    const fetchProductivityData = async () => {
      setIsLoading(true);
      try {
        // DEFENSIVE UNWRAPPING - handle both array and wrapped responses
        const unwrap = (result) => {
          // Already an array - return as-is
          if (Array.isArray(result)) return result;

          // Wrapped in { data: [...] } shape
          if (result?.data && Array.isArray(result.data)) return result.data;

          // Wrapped in { status: "success", data: [...] } shape
          if (result?.status === 'success' && Array.isArray(result.data)) return result.data;

          // Activities-specific: { activities: [...], total, counts } shape
          if (result?.activities && Array.isArray(result.activities)) return result.activities;

          // Employees-specific: { employees: [...] } shape
          if (result?.employees && Array.isArray(result.employees)) return result.employees;

          // Wrapped in { data: { activities: [...] } } shape (V2 API format)
          if (result?.data?.activities && Array.isArray(result.data.activities))
            return result.data.activities;

          return [];
        };

        const [rawActivitiesResult, employeesResult] = await Promise.all([
          Activity.filter(tenantFilter),
          Employee.filter(tenantFilter),
        ]);

        // Handle API response - ensure we have arrays with explicit validation
        const rawActivities = Array.isArray(unwrap(rawActivitiesResult))
          ? unwrap(rawActivitiesResult)
          : [];
        const employees = Array.isArray(unwrap(employeesResult)) ? unwrap(employeesResult) : [];

        setActivities(rawActivities);

        // Process data for activitiesPerUser — activities use assigned_to (employees.id)
        const employeeMap = employees.reduce((acc, emp) => {
          const name =
            [emp.first_name, emp.last_name].filter(Boolean).join(' ') || emp.email || emp.name;
          acc[emp.id] = name;
          return acc;
        }, {});

        const activitiesByUser = rawActivities.reduce((acc, activity) => {
          const assignee = activity.assigned_to;
          if (!assignee) return acc; // Skip unassigned activities
          if (!acc[assignee]) {
            acc[assignee] = {
              name: employeeMap[assignee] || `Unknown (${assignee.substring(0, 8)}...)`,
              total: 0,
              completed: 0,
            };
          }
          acc[assignee].total++;
          if (activity.status === 'completed') {
            acc[assignee].completed++;
          }
          return acc;
        }, {});

        const processedActivitiesPerUser = Object.entries(activitiesByUser).map(
          ([userId, data]) => ({
            userId: userId,
            name: data.name,
            totalActivities: data.total,
            completedActivities: data.completed,
            completionRate: data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0,
          }),
        );
        setActivitiesPerUser(processedActivitiesPerUser);
      } catch (error) {
        console.error('Failed to fetch productivity data:', error);
        setActivities([]);
        setActivitiesPerUser([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProductivityData();
  }, [tenantFilter?.tenant_id, tenantFilter]);

  // Calculate key productivity metrics with defensive array checks
  const safeActivities = Array.isArray(activities) ? activities : [];
  const completedActivities = safeActivities.filter((act) => act.status === 'completed');
  const completionRate =
    safeActivities.length > 0 ? (completedActivities.length / safeActivities.length) * 100 : 0;
  const todaysActivities = safeActivities.filter(
    (act) => act.due_date && isToday(new Date(act.due_date)),
  );
  const thisWeekActivities = safeActivities.filter(
    (act) => act.due_date && isThisWeek(new Date(act.due_date)),
  );

  // Activity type distribution
  const getActivityTypeData = () => {
    const types = {};
    const activitiesList = Array.isArray(activities) ? activities : [];
    activitiesList.forEach((activity) => {
      const type = activity.type || 'other';
      if (!types[type]) {
        types[type] = { total: 0, completed: 0 };
      }
      types[type].total++;
      if (activity.status === 'completed') {
        types[type].completed++;
      }
    });

    return Object.entries(types).map(([name, data]) => ({
      type: name,
      total: data.total,
      completed: data.completed,
      completionRate: data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0,
    }));
  };

  // Weekly activity trends
  const getWeeklyActivityTrend = () => {
    const activitiesList = Array.isArray(activities) ? activities : [];
    const weeklyData = [];
    // Go back 7 weeks from the current week
    for (let i = 7; i >= 0; i--) {
      const weekStart = startOfWeek(subWeeks(new Date(), i), {
        weekStartsOn: 1,
      }); // Monday start
      // To get activities strictly within a week, define weekEnd as the start of the next week
      const weekEnd = startOfWeek(subWeeks(new Date(), i - 1), {
        weekStartsOn: 1,
      });
      const weekName = format(weekStart, 'MMM dd'); // Display the start date of the week

      const weekActivities = activitiesList.filter((activity) => {
        const actCreatedDate = new Date(activity.created_date);
        return actCreatedDate >= weekStart && actCreatedDate < weekEnd;
      });

      const completed = weekActivities.filter((act) => act.status === 'completed').length;

      weeklyData.push({
        week: weekName,
        activities: weekActivities.length,
        completed: completed,
        completionRate:
          weekActivities.length > 0 ? Math.round((completed / weekActivities.length) * 100) : 0,
      });
    }
    return weeklyData;
  };

  // Priority distribution
  const getPriorityDistribution = () => {
    const activitiesList = Array.isArray(activities) ? activities : [];
    const priorities = {};
    activitiesList.forEach((activity) => {
      const priority = activity.priority || 'normal';
      priorities[priority] = (priorities[priority] || 0) + 1;
    });
    return Object.entries(priorities).map(([name, value]) => ({ name, value }));
  };

  // Activity efficiency metrics
  const getEfficiencyMetrics = () => {
    const activitiesList = Array.isArray(activities) ? activities : [];
    const metrics = {
      onTime: 0,
      late: 0,
      upcoming: 0,
    };

    activitiesList.forEach((activity) => {
      if (!activity.due_date) return;

      const dueDate = new Date(activity.due_date);
      const now = new Date();

      if (activity.status === 'completed' && dueDate >= now) {
        // Completed on or before due date
        metrics.onTime++;
      } else if (activity.status === 'completed' && dueDate < now) {
        // Completed but late
        metrics.late++; // Count as late even if completed
      } else if (activity.status !== 'completed' && dueDate < now) {
        // Not completed and overdue
        metrics.late++;
      } else if (activity.status !== 'completed' && dueDate >= now) {
        // Not completed and upcoming
        metrics.upcoming++;
      }
    });

    return [
      { name: 'On Time', value: metrics.onTime },
      { name: 'Overdue', value: metrics.late },
      { name: 'Upcoming', value: metrics.upcoming },
    ];
  };

  const typeData = getActivityTypeData();
  const weeklyData = getWeeklyActivityTrend();
  const priorityData = getPriorityDistribution();
  const efficiencyData = getEfficiencyMetrics();

  // Calculate insights statistics
  const stats = {
    highestCompletionDate: null,
    completionRate: completionRate,
    mostProductiveType: 'N/A',
    overdueCount: 0,
  };

  if (weeklyData.length > 0) {
    const highestWeek = weeklyData.reduce(
      (max, week) =>
        (week.completionRate === undefined ? -1 : week.completionRate) >
        (max.completionRate === undefined ? -1 : max.completionRate)
          ? week
          : max,
      { completionRate: -1 }, // Initial value for max.completionRate if all are undefined
    );
    if (highestWeek.week && highestWeek.completionRate !== -1) {
      stats.highestCompletionDate = highestWeek.week;
    }
  }

  if (typeData.length > 0) {
    const mostProductive = typeData.reduce(
      (max, type) =>
        (type.completionRate === undefined ? -1 : type.completionRate) >
        (max.completionRate === undefined ? -1 : max.completionRate)
          ? type
          : max,
      { completionRate: -1 },
    );
    if (mostProductive.type && mostProductive.completionRate !== -1) {
      stats.mostProductiveType = mostProductive.type;
    }
  }

  const overdueEntry = efficiencyData.find((e) => e.name === 'Overdue');
  if (overdueEntry) {
    stats.overdueCount = overdueEntry.value;
  }

  const insights = [
    {
      type: 'completion',
      bgColor: 'bg-blue-900/30',
      textColor: 'text-blue-200',
      borderColor: 'border-blue-700',
      message: stats.highestCompletionDate
        ? `Your highest completion rate was during the week of ${stats.highestCompletionDate}. Schedule important tasks during these periods.`
        : 'Track your activities to see completion patterns.',
    },
    {
      type: 'improvement',
      bgColor: 'bg-green-900/30',
      textColor: 'text-green-200',
      borderColor: 'border-green-700',
      message:
        stats.completionRate < 70
          ? `Your completion rate of ${stats.completionRate.toFixed(
              1,
            )}% needs improvement. Consider reducing task volume or extending deadlines.`
          : `Great job! Your ${stats.completionRate.toFixed(
              1,
            )}% completion rate shows strong execution.`,
    },
    {
      type: 'focus',
      bgColor: 'bg-purple-900/30',
      textColor: 'text-purple-200',
      borderColor: 'border-purple-700',
      message:
        stats.mostProductiveType !== 'N/A'
          ? `Most productive activity type: "${stats.mostProductiveType}". Focus more energy on high-performing tasks.`
          : 'Complete more activities to identify your most productive task types.',
    },
    {
      type: 'deadline',
      bgColor: 'bg-amber-900/30',
      textColor: 'text-amber-200',
      borderColor: 'border-amber-700',
      message:
        stats.overdueCount > 0
          ? `You have ${stats.overdueCount} overdue tasks. Consider using time-blocking and setting realistic deadlines to improve efficiency.`
          : 'No overdue tasks! Your deadline management is excellent.',
    },
  ];

  if (isLoading) {
    return (
      <Card className="shadow-lg bg-slate-800 border-slate-700">
        <CardContent className="p-6 text-center text-slate-400">
          <p>Loading productivity data...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Key Productivity Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="shadow-lg bg-slate-800 border-slate-700">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-400">Total Activities</p>
                <p className="text-2xl font-bold text-slate-100">{safeActivities.length}</p>
              </div>
              <ActivityIcon className="w-8 h-8 text-blue-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-lg bg-slate-800 border-slate-700">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-400">Completion Rate</p>
                <p className="text-2xl font-bold text-slate-100">{completionRate.toFixed(1)}%</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-lg bg-slate-800 border-slate-700">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-400">Today&apos;s Tasks</p>
                <p className="text-2xl font-bold text-slate-100">{todaysActivities.length}</p>
              </div>
              <Calendar className="w-8 h-8 text-purple-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-lg bg-slate-800 border-slate-700">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-400">This Week</p>
                <p className="text-2xl font-bold text-slate-100">{thisWeekActivities.length}</p>
              </div>
              <Zap className="w-8 h-8 text-orange-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-lg bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-lg text-slate-100">Weekly Activity Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={weeklyData}>
                <defs>
                  <linearGradient id="colorActivities" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorCompleted" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis
                  dataKey="week"
                  tick={{ fontSize: 12, fill: '#94a3b8' }}
                  axisLine={{ stroke: '#475569' }}
                  tickLine={false}
                  dy={10}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: '#94a3b8' }}
                  axisLine={{ stroke: '#475569' }}
                  tickLine={false}
                  dx={-10}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #475569',
                    borderRadius: '8px',
                    color: '#f1f5f9',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
                  }}
                  labelStyle={{ color: '#f1f5f9' }}
                />
                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                <Line
                  type="monotone"
                  dataKey="activities"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 6 }}
                />
                <Line
                  type="monotone"
                  dataKey="completed"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-lg bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-lg text-slate-100">Task Completion Status</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <defs>
                  {COLORS_MAP.map((colorPair, index) => (
                    <linearGradient
                      key={`gradTaskCompletion-${index}`}
                      id={`gradTaskCompletion-${index}`}
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="0%" stopColor={colorPair[0]} stopOpacity={1} />
                      <stop offset="100%" stopColor={colorPair[1]} stopOpacity={1} />
                    </linearGradient>
                  ))}
                </defs>
                <Pie
                  data={efficiencyData}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  innerRadius={40}
                  paddingAngle={3}
                  cornerRadius={5}
                  fill="#8884d8"
                  dataKey="value"
                  labelLine={false}
                  label={({ name, percent }) =>
                    percent > 0.05 ? `${name} (${(percent * 100).toFixed(0)}%)` : ''
                  }
                >
                  {efficiencyData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={`url(#gradTaskCompletion-${index % COLORS_MAP.length})`}
                      stroke="rgba(0,0,0,0.1)"
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #475569',
                    borderRadius: '8px',
                    color: '#f1f5f9',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
                  }}
                  labelStyle={{ color: '#f1f5f9' }}
                />
                <Legend wrapperStyle={{ paddingTop: '20px' }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-lg bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-lg text-slate-100">Activity Priority Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <defs>
                  {COLORS_MAP.map((colorPair, index) => (
                    <linearGradient
                      key={`gradPriorityDist-${index}`}
                      id={`gradPriorityDist-${index}`}
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="0%" stopColor={colorPair[0]} stopOpacity={1} />
                      <stop offset="100%" stopColor={colorPair[1]} stopOpacity={1} />
                    </linearGradient>
                  ))}
                </defs>
                <Pie
                  data={priorityData}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  innerRadius={0}
                  paddingAngle={3}
                  cornerRadius={5}
                  fill="#8884d8"
                  dataKey="value"
                  labelLine={false}
                  label={({ name, percent }) =>
                    percent > 0.05 ? `${name} (${(percent * 100).toFixed(0)}%)` : ''
                  }
                >
                  {priorityData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={`url(#gradPriorityDist-${index % COLORS_MAP.length})`}
                      stroke="rgba(0,0,0,0.1)"
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #475569',
                    borderRadius: '8px',
                    color: '#f1f5f9',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
                  }}
                />
                <Legend wrapperStyle={{ paddingTop: '20px' }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-lg bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-lg text-slate-100">Activity Type Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={typeData} layout="vertical">
                <defs>
                  {COLORS_MAP.map((colorPair, index) => (
                    <linearGradient
                      key={`gradActivityType-${index}`}
                      id={`gradActivityType-${index}`}
                      x1="0"
                      y1="0"
                      x2="1"
                      y2="0"
                    >
                      <stop offset="0%" stopColor={colorPair[0]} stopOpacity={0.6} />
                      <stop offset="100%" stopColor={colorPair[1]} stopOpacity={1} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="type"
                  tick={{ fontSize: 12, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                  dx={-10}
                  width={80}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #475569',
                    borderRadius: '8px',
                    color: '#f1f5f9',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
                  }}
                  labelStyle={{ color: '#f1f5f9' }}
                />
                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                <Bar
                  dataKey="total"
                  name="Total"
                  stackId="a"
                  fill="#3b82f6"
                  radius={[0, 4, 4, 0]}
                />
                <Bar
                  dataKey="completed"
                  name="Completed"
                  stackId="a"
                  fill="#10b981"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Productivity Insights */}
      <Card className="shadow-lg bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-100">
            <Lightbulb className="w-5 h-5 text-yellow-400" />
            Productivity Insights & Recommendations
          </CardTitle>
          <CardDescription className="text-slate-400">
            AI-generated recommendations based on your activity patterns.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {insights.map((insight, idx) => (
              <div
                key={idx}
                className={`p-4 rounded-lg border-2 ${insight.bgColor} ${insight.borderColor}`}
              >
                <p className={`text-sm font-medium ${insight.textColor}`}>{insight.message}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* New: Activities Per User (Fetched but not fully rendered in outline, showing example here) */}
      <Card className="shadow-lg bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-lg text-slate-100">
            Individual Performance by Team Member
          </CardTitle>
          <CardDescription className="text-slate-400">
            Activity volume and completion rate per assigned employee.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activitiesPerUser.length > 0 ? (
            <ResponsiveContainer width="100%" height={400}>
              <BarChart
                data={activitiesPerUser}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <defs>
                  <linearGradient id="gradTotal" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={1} />
                  </linearGradient>
                  <linearGradient id="gradCompleted" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#34d399" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={1} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 12, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                  dx={-10}
                  width={100}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #475569',
                    borderRadius: '8px',
                    color: '#f1f5f9',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
                  }}
                  labelStyle={{ color: '#f1f5f9' }}
                />
                <Legend wrapperStyle={{ color: '#f1f5f9', paddingTop: '10px' }} />
                <Bar
                  dataKey="totalActivities"
                  name="Total Activities"
                  fill="url(#gradTotal)"
                  radius={[0, 4, 4, 0]}
                />
                <Bar
                  dataKey="completedActivities"
                  name="Completed Activities"
                  fill="url(#gradCompleted)"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center py-8">
              <ActivityIcon className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400 font-medium">No assigned activities found</p>
              <p className="text-slate-500 text-sm mt-1">
                Activities need to be assigned to team members to appear here. Check that activities
                have an "Assigned To" value set.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
