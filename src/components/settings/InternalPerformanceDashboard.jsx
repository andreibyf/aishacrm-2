
import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, Users, Building, Star, Target, Activity, BrainCircuit, History, Clock, AlertCircle, CheckCircle, AlertTriangle, ListTodo } from 'lucide-react';
import { Contact, Account, Lead, Opportunity, Activity as ActivityEntity } from '@/api/entities';
import { toast } from "sonner";
import { Alert, AlertDescription } from '@/components/ui/alert';
import { timeApiCall } from '../utils/apiTimer';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { listPerformanceLogs } from "@/api/functions";
import { MetricCard, SystemHealthSummary, PerformanceGuide } from './PerformanceStatusCard';
import { THRESHOLDS } from './performanceThresholds';

export default function InternalPerformanceDashboard({ user }) {
  const [metrics, setMetrics] = useState({
    averageResponseTime: 0,
    errorRate: 0,
    totalApiCalls: 0,
    successfulApiCalls: 0,
    entityCounts: {
      contacts: 0,
      accounts: 0,
      leads: 0,
      opportunities: 0,
      activities: 0
    },
    recentErrors: [],
    rawLogs: [] // Added for the new live log viewer
  });
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);

  const loadMetrics = useCallback(async () => {
    setLoading(true);
    try {
      // Get tenant_id from user context
      const tenantId = user?.tenant_id || 'local-tenant-001';
      
      const [
        perfLogsResp, // Changed from perfLogs to perfLogsResp to handle object structure
        contactsData,
        accountsData,
        leadsData,
        opportunitiesData,
        activitiesData
      ] = await timeApiCall('dashboard.loadAllMetrics', () => Promise.all([
        // Use backend function instead of direct entity call to avoid Network Error
        listPerformanceLogs({ limit: 500, tenant_id: tenantId }),
        Contact.list({ tenant_id: tenantId }),
        Account.list({ tenant_id: tenantId }),
        Lead.list({ tenant_id: tenantId }),
        Opportunity.list({ tenant_id: tenantId }),
        ActivityEntity.list({ tenant_id: tenantId })
      ]));

      const perfLogs = Array.isArray(perfLogsResp?.data?.logs) ? perfLogsResp.data.logs : [];

      // --- Calculate REAL metrics from performance logs ---
      let avgResponseTime = 0;
      const totalCalls = perfLogs.length;
      const successfulCalls = perfLogs.filter((log) => log.status === 'success').length;
      const errorRate = totalCalls > 0 ? (totalCalls - successfulCalls) / totalCalls * 100 : 0;

      if (successfulCalls > 0) {
        const totalResponseTime = perfLogs
          .filter((log) => log.status === 'success')
          .reduce((acc, log) => acc + (Number(log.response_time_ms) || 0), 0); // Ensure response_time_ms is a number
        avgResponseTime = totalResponseTime / successfulCalls;
      }

      const realEntityCounts = {
        contacts: contactsData.length,
        accounts: accountsData.length,
        leads: leadsData.length,
        opportunities: opportunitiesData.length,
        activities: activitiesData.length
      };

      setMetrics({
        averageResponseTime: avgResponseTime,
        errorRate: errorRate,
        totalApiCalls: totalCalls,
        successfulApiCalls: successfulCalls,
        entityCounts: realEntityCounts,
        recentErrors: perfLogs.filter((log) => log.status === 'error').slice(0, 5),
        rawLogs: perfLogs.slice(0, 10) // Store the 10 most recent logs for the new viewer
      });

      setLastRefresh(new Date());
    } catch (error) {
      console.error("Error loading metrics:", error);
      toast.error("Failed to load dashboard metrics", { description: String(error?.message || error) }); // More resilient error message
      setMetrics({
        averageResponseTime: 0,
        errorRate: 100,
        totalApiCalls: 0,
        successfulApiCalls: 0,
        entityCounts: { contacts: "Error", accounts: "Error", leads: "Error", opportunities: "Error", activities: "Error" },
        recentErrors: [{ message: String(error?.message || error), timestamp: new Date().toISOString(), function_name: 'loadMetrics' }],
        rawLogs: []
      });
    } finally {
      setLoading(false);
    }
  }, [user]); // Add user as dependency since we use user.tenant_id

  useEffect(() => {
    loadMetrics();
  }, [loadMetrics]);

  const handleForceRecalculate = () => {
    toast.info("Recalculating performance metrics...");
    loadMetrics();
  };

  const formatNumber = (num, digits = 0) => {
    if (typeof num !== 'number') return num;
    return num.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
  };

  if (!user || user.role !== 'admin' && user.role !== 'superadmin') {
    return (
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-slate-100">Access Denied</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-400">You do not have permission to view this page.</p>
        </CardContent>
      </Card>);

  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-slate-100">System Performance Overview</h2>
        <div className="flex items-center gap-4">
          {lastRefresh && <span className="text-sm text-slate-400">Last updated: {lastRefresh.toLocaleTimeString()}</span>}
          <Button variant="outline" size="sm" onClick={handleForceRecalculate} disabled={loading} className="bg-slate-700 border-slate-600 hover:bg-slate-600">
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Refresh
          </Button>
        </div>
      </div>

      <Alert className="bg-green-900/30 border-green-700/50">
        <BrainCircuit className="h-4 w-4 text-green-400" />
        <AlertDescription className="text-green-500 text-sm [&_p]:leading-relaxed">
          All performance metrics are now based on **real, live data** captured from client-side API calls. Data is based on the last 500 logged events.
        </AlertDescription>
      </Alert>

      {loading ?
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) =>
            <Card key={i} className="bg-slate-800 border-slate-700 animate-pulse">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="h-4 bg-slate-700 rounded w-3/4"></div>
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-slate-700 rounded w-1/2"></div>
              </CardContent>
            </Card>
          )}
        </div> :

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Column 1 & 2: Main Metrics */}
          <div className="xl:col-span-2 space-y-6">
            {/* Overall System Health Summary */}
            <SystemHealthSummary metrics={metrics} />

            {/* Performance Metrics Cards with Color-Coded Status */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <MetricCard
                title="Avg. API Response"
                value={metrics.averageResponseTime}
                unit="ms"
                thresholds={THRESHOLDS.responseTime}
                icon={Clock}
                subtitle={`Based on ${formatNumber(metrics.successfulApiCalls)} successful calls`}
                description="Measures how quickly the API responds to requests. Lower is better."
              />
              <MetricCard
                title="API Error Rate"
                value={metrics.errorRate}
                unit="%"
                thresholds={THRESHOLDS.errorRate}
                isInverse={true}
                icon={AlertCircle}
                subtitle={`${formatNumber(metrics.totalApiCalls - metrics.successfulApiCalls)} errors from ${formatNumber(metrics.totalApiCalls)} calls`}
                description="Percentage of API requests that failed. Lower is better."
              />
              <Card className="bg-slate-800 border-slate-700">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-slate-400">Total API Calls</CardTitle>
                  <ListTodo className="h-4 w-4 text-slate-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-slate-200">
                    {formatNumber(metrics.totalApiCalls)}
                  </div>
                  <p className="text-xs text-slate-500">From the last 500 logged events</p>
                </CardContent>
              </Card>
              <Card className="bg-slate-800 border-slate-700">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-slate-400">Successful Calls</CardTitle>
                  <CheckCircle className="h-4 w-4 text-slate-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-500">
                    {formatNumber(metrics.successfulApiCalls)}
                  </div>
                  <p className="text-xs text-slate-500">From the last 500 logged events</p>
                </CardContent>
              </Card>
            </div>

            {/* Data Volume Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
              <Card className="bg-slate-800 border-slate-700">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-slate-400">Contacts</CardTitle>
                  <Users className="h-4 w-4 text-slate-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-slate-200">{formatNumber(metrics.entityCounts.contacts)}</div>
                </CardContent>
              </Card>
              <Card className="bg-slate-800 border-slate-700">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-slate-400">Accounts</CardTitle>
                  <Building className="h-4 w-4 text-slate-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-slate-200">{formatNumber(metrics.entityCounts.accounts)}</div>
                </CardContent>
              </Card>
              <Card className="bg-slate-800 border-slate-700">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-slate-400">Leads</CardTitle>
                  <Star className="h-4 w-4 text-slate-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-slate-200">{formatNumber(metrics.entityCounts.leads)}</div>
                </CardContent>
              </Card>
              <Card className="bg-slate-800 border-slate-700">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-slate-400">Opportunities</CardTitle>
                  <Target className="h-4 w-4 text-slate-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-slate-200">{formatNumber(metrics.entityCounts.opportunities)}</div>
                </CardContent>
              </Card>
              <Card className="bg-slate-800 border-slate-700">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-slate-400">Activities</CardTitle>
                  <Activity className="h-4 w-4 text-slate-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-slate-200">{formatNumber(metrics.entityCounts.activities)}</div>
                </CardContent>
              </Card>
            </div>

            {/* Recent API Errors */}
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-slate-100">
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                  Recent API Errors
                </CardTitle>
              </CardHeader>
              <CardContent>
                {metrics.recentErrors.length > 0 ?
                  <div className="space-y-2">
                    {metrics.recentErrors.map((error, index) =>
                      <div key={index} className="p-2 bg-red-900/20 rounded border border-red-700/40 text-sm">
                        <p className="text-red-500 text-xs font-mono">
                          <span className="font-semibold">{error.function_name || 'Unknown Function'}</span> - {new Date(error.created_date || error.timestamp).toLocaleString()}
                        </p>
                        <p className="text-red-400">{error.message}</p>
                      </div>
                    )}
                  </div> :

                  <div className="text-center py-4 text-slate-400">
                    <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-600" />
                    No recent errors logged.
                  </div>
                }
              </CardContent>
            </Card>
          </div>

          {/* Column 3: Performance Guide & Live Log Viewer */}
          <div className="space-y-6">
            {/* Performance Health Guide */}
            <PerformanceGuide />
            
            {/* Live Performance Log */}
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-slate-100">
                  <History className="w-5 h-5 text-blue-400" />
                  Live Performance Log
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-400 mb-4">Showing the 10 most recent API calls recorded in real-time.</p>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b-slate-700 hover:bg-slate-800">
                        <TableHead className="text-slate-300 text-xs">Function</TableHead>
                        <TableHead className="text-slate-300 text-right text-xs">Time</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {metrics.rawLogs.map((log, index) =>
                        <TableRow key={log.id || index} className="border-b-slate-700/50 hover:bg-slate-700/30">
                          <TableCell className="font-mono text-xs py-2 text-slate-300 max-w-[120px] truncate" title={log.function_name}>
                            {log.function_name}
                          </TableCell>
                          <TableCell className="text-right py-2">
                            <Badge
                              variant={log.status === 'success' ? 'default' : 'destructive'}
                              className={log.status === 'success' ?
                                'bg-green-800/50 text-green-300 border-green-700/50 text-xs' :
                                'bg-red-800/50 text-red-300 border-red-700/50 text-xs'
                              }>

                              {formatNumber(log.response_time_ms)}ms
                            </Badge>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
                {metrics.rawLogs.length === 0 &&
                  <div className="text-center py-4 text-slate-400">
                    <History className="w-8 h-8 mx-auto mb-2 text-slate-500" />
                    <p className="text-sm">No performance logs recorded yet.</p>
                    <p className="text-xs text-slate-500 mt-1">Navigate the app to generate data.</p>
                  </div>
                }
              </CardContent>
            </Card>
          </div>
        </div>
      }
    </div>);

}
