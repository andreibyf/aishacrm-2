
import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity as ActivityIcon, Clock, CheckCircle, Calendar, Zap, Lightbulb } from "lucide-react"; // Added Lightbulb and Renamed Activity to ActivityIcon to avoid conflict
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend
} from "recharts";
import { startOfWeek, format, subWeeks, isThisWeek, isToday } from "date-fns";
import { Activity, User } from "@/api/entities"; // Assuming User is also exported from here

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

export default function ProductivityAnalytics({ tenantFilter }) {
  const [activities, setActivities] = useState([]);
  const [activitiesPerUser, setActivitiesPerUser] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchProductivityData = async () => {
      setIsLoading(true);
      try {
        // Assuming Activity and User from "@/api/entities" have a similar .filter method as the mocks
        const [rawActivities, users] = await Promise.all([
          Activity.filter(tenantFilter),
          User.filter(tenantFilter)
        ]);

        setActivities(rawActivities); // Set the main activities state for overall calculations

        // Process data for activitiesPerUser
        const userMap = users.reduce((acc, user) => {
          acc[user.id] = user.name;
          return acc;
        }, {});

        const activitiesByUser = rawActivities.reduce((acc, activity) => {
          if (!activity.userId) return acc; // Skip if no user ID
          if (!acc[activity.userId]) {
            acc[activity.userId] = {
              name: userMap[activity.userId] || `Unknown User (${activity.userId})`,
              total: 0,
              completed: 0,
            };
          }
          acc[activity.userId].total++;
          if (activity.status === 'completed') {
            acc[activity.userId].completed++;
          }
          return acc;
        }, {});

        const processedActivitiesPerUser = Object.entries(activitiesByUser).map(([userId, data]) => ({
          userId: userId,
          name: data.name,
          totalActivities: data.total,
          completedActivities: data.completed,
          completionRate: data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0,
        }));
        setActivitiesPerUser(processedActivitiesPerUser);

      } catch (error) {
        console.error("Failed to fetch productivity data:", error);
        setActivities([]); // Clear activities on error
        setActivitiesPerUser([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProductivityData();
  }, [tenantFilter]);

  // Calculate key productivity metrics
  const completedActivities = activities.filter(act => act.status === 'completed');
  const completionRate = activities.length > 0 ? (completedActivities.length / activities.length) * 100 : 0;
  const todaysActivities = activities.filter(act => act.due_date && isToday(new Date(act.due_date)));
  const thisWeekActivities = activities.filter(act => act.due_date && isThisWeek(new Date(act.due_date)));

  // Activity type distribution
  const getActivityTypeData = () => {
    const types = {};
    activities.forEach(activity => {
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
      completionRate: data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0
    }));
  };

  // Weekly activity trends
  const getWeeklyActivityTrend = () => {
    const weeklyData = [];
    // Go back 7 weeks from the current week
    for (let i = 7; i >= 0; i--) {
      const weekStart = startOfWeek(subWeeks(new Date(), i), { weekStartsOn: 1 }); // Monday start
      // To get activities strictly within a week, define weekEnd as the start of the next week
      const weekEnd = startOfWeek(subWeeks(new Date(), i - 1), { weekStartsOn: 1 }); 
      const weekName = format(weekStart, 'MMM dd'); // Display the start date of the week
      
      const weekActivities = activities.filter(activity => {
        const actCreatedDate = new Date(activity.created_date);
        return actCreatedDate >= weekStart && actCreatedDate < weekEnd;
      });

      const completed = weekActivities.filter(act => act.status === 'completed').length;
      
      weeklyData.push({
        week: weekName,
        activities: weekActivities.length,
        completed: completed,
        completionRate: weekActivities.length > 0 ? Math.round((completed / weekActivities.length) * 100) : 0
      });
    }
    return weeklyData;
  };

  // Priority distribution
  const getPriorityDistribution = () => {
    const priorities = {};
    activities.forEach(activity => {
      const priority = activity.priority || 'normal';
      priorities[priority] = (priorities[priority] || 0) + 1;
    });
    return Object.entries(priorities).map(([name, value]) => ({ name, value }));
  };

  // Activity efficiency metrics
  const getEfficiencyMetrics = () => {
    const metrics = {
      onTime: 0,
      late: 0,
      upcoming: 0
    };

    activities.forEach(activity => {
      if (!activity.due_date) return;
      
      const dueDate = new Date(activity.due_date);
      const now = new Date();
      
      if (activity.status === 'completed' && dueDate >= now) { // Completed on or before due date
        metrics.onTime++;
      } else if (activity.status === 'completed' && dueDate < now) { // Completed but late
        metrics.late++; // Count as late even if completed
      } else if (activity.status !== 'completed' && dueDate < now) { // Not completed and overdue
        metrics.late++;
      } else if (activity.status !== 'completed' && dueDate >= now) { // Not completed and upcoming
        metrics.upcoming++;
      }
    });

    return [
      { name: 'On Time', value: metrics.onTime },
      { name: 'Overdue', value: metrics.late },
      { name: 'Upcoming', value: metrics.upcoming }
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
    const highestWeek = weeklyData.reduce((max, week) =>
      (week.completionRate === undefined ? -1 : week.completionRate) > (max.completionRate === undefined ? -1 : max.completionRate) ? week : max,
      { completionRate: -1 } // Initial value for max.completionRate if all are undefined
    );
    if (highestWeek.week && highestWeek.completionRate !== -1) {
      stats.highestCompletionDate = highestWeek.week;
    }
  }

  if (typeData.length > 0) {
    const mostProductive = typeData.reduce((max, type) =>
      (type.completionRate === undefined ? -1 : type.completionRate) > (max.completionRate === undefined ? -1 : max.completionRate) ? type : max,
      { completionRate: -1 }
    );
    if (mostProductive.type && mostProductive.completionRate !== -1) {
      stats.mostProductiveType = mostProductive.type;
    }
  }

  const overdueEntry = efficiencyData.find(e => e.name === 'Overdue');
  if (overdueEntry) {
    stats.overdueCount = overdueEntry.value;
  }

  const insights = [
    {
      type: 'completion',
      bgColor: 'bg-blue-50',
      textColor: 'text-blue-900',
      borderColor: 'border-blue-200',
      message: stats.highestCompletionDate
        ? `Your highest completion rate was during the week of ${stats.highestCompletionDate}. Schedule important tasks during these periods.`
        : 'Track your activities to see completion patterns.'
    },
    {
      type: 'improvement',
      bgColor: 'bg-green-50',
      textColor: 'text-green-900',
      borderColor: 'border-green-200',
      message: stats.completionRate < 70 
        ? `Your completion rate of ${stats.completionRate.toFixed(1)}% needs improvement. Consider reducing task volume or extending deadlines.`
        : `Great job! Your ${stats.completionRate.toFixed(1)}% completion rate shows strong execution.`
    },
    {
      type: 'focus',
      bgColor: 'bg-purple-50',
      textColor: 'text-purple-900',
      borderColor: 'border-purple-200',
      message: stats.mostProductiveType !== 'N/A'
        ? `Most productive activity type: "${stats.mostProductiveType}". Focus more energy on high-performing tasks.`
        : 'Complete more activities to identify your most productive task types.'
    },
    {
      type: 'deadline',
      bgColor: 'bg-amber-50',
      textColor: 'text-amber-900',
      borderColor: 'border-amber-200',
      message: stats.overdueCount > 0
        ? `You have ${stats.overdueCount} overdue tasks. Consider using time-blocking and setting realistic deadlines to improve efficiency.`
        : 'No overdue tasks! Your deadline management is excellent.'
    }
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
                <p className="text-2xl font-bold text-slate-100">{activities.length}</p>
              </div>
              <ActivityIcon className="w-8 h-8 text-blue-400" /> {/* Changed to ActivityIcon */}
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
                <p className="text-sm font-medium text-slate-400">Today's Tasks</p>
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
                <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                <XAxis 
                  dataKey="week" 
                  tick={{ fontSize: 12, fill: '#94a3b8' }}
                />
                <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1e293b', 
                    border: '1px solid #475569', 
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                    color: '#f1f5f9'
                  }}
                />
                <Line type="monotone" dataKey="activities" stroke="#3b82f6" strokeWidth={2} name="Total" />
                <Line type="monotone" dataKey="completed" stroke="#10b981" strokeWidth={2} name="Completed" />
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
                <Pie
                  data={efficiencyData}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {efficiencyData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px', color: '#f1f5f9' }} />
                <Legend wrapperStyle={{ paddingTop: '20px', color: '#f1f5f9' }} />
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
              <BarChart data={priorityData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px', color: '#f1f5f9' }} />
                <Bar dataKey="value" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-lg bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-lg text-slate-100">Activity Type Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {typeData.map((type, index) => (
                <div key={type.type} className="flex items-center justify-between p-3 bg-slate-700 rounded-lg">
                  <div className="flex-1">
                    <p className="font-medium text-slate-200 capitalize">{type.type}</p>
                    <p className="text-sm text-slate-400">
                      {type.total} total • {type.completed} completed
                    </p>
                  </div>
                  <Badge 
                    variant={type.completionRate > 80 ? "default" : type.completionRate > 60 ? "secondary" : "outline"}
                    className="ml-4 bg-slate-600 text-slate-200 border-slate-500"
                  >
                    {type.completionRate}% done
                  </Badge>
                </div>
              ))}
            </div>
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
            Insights are based on tenant ID: {tenantFilter?.tenantId || 'N/A'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {insights.map((insight, idx) => (
              <div
                key={idx}
                className={`p-4 rounded-lg border-2 ${insight.bgColor} ${insight.borderColor}`}
              >
                <p className={`text-sm font-medium ${insight.textColor}`}>
                  {insight.message}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* New: Activities Per User (Fetched but not fully rendered in outline, showing example here) */}
      <Card className="shadow-lg bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-lg text-slate-100">Individual User Performance (within tenant)</CardTitle>
          <CardDescription className="text-slate-400">Breakdown of total and completed activities per user.</CardDescription>
        </CardHeader>
        <CardContent>
          {activitiesPerUser.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={activitiesPerUser}
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '8px', color: '#f1f5f9' }} />
                <Legend wrapperStyle={{ color: '#f1f5f9' }} />
                <Bar dataKey="totalActivities" fill="#3b82f6" name="Total Activities" />
                <Bar dataKey="completedActivities" fill="#10b981" name="Completed Activities" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-slate-400">No user data available for this tenant.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
