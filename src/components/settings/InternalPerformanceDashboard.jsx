
import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, Users, Building, Star, Target, Activity, BrainCircuit, History, Clock, AlertCircle, CheckCircle, AlertTriangle, ListTodo, Shield, X } from 'lucide-react';
import { toast } from "sonner";
import { Alert, AlertDescription } from '@/components/ui/alert';
import { timeApiCall } from '../utils/apiTimer';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { MetricCard, SystemHealthSummary, PerformanceGuide } from './PerformanceStatusCard';
import { THRESHOLDS } from './performanceThresholds';
import { BACKEND_URL } from '@/api/entities';

export default function InternalPerformanceDashboard({ user }) {
  const [metrics, setMetrics] = useState({
    averageResponseTime: 0,
    errorRate: 0,
    totalApiCalls: 0,
    successfulApiCalls: 0,
    endpointMetrics: {
      contacts: { avg: 0, count: 0 },
      accounts: { avg: 0, count: 0 },
      leads: { avg: 0, count: 0 },
      opportunities: { avg: 0, count: 0 },
      activities: { avg: 0, count: 0 }
    },
    recentErrors: [],
    rawLogs: []
  });
  const [securityStatus, setSecurityStatus] = useState({
    blocked_ips: [],
    active_trackers: 0,
    redis_available: false
  });
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);

  const loadMetrics = useCallback(async () => {
    setLoading(true);
    try {
      // Build metrics URL: superadmin sees global metrics (no tenant filter)
      const isSuperAdmin = user?.role === 'superadmin';
      const tenantId = user?.tenant_id || import.meta.env.VITE_SYSTEM_TENANT_ID || 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
      const metricsUrl = isSuperAdmin
        ? `${BACKEND_URL}/api/metrics/performance?limit=500`
        : `${BACKEND_URL}/api/metrics/performance?tenant_id=${tenantId}&limit=500`;

      const [perfLogsResp, securityResp] = await timeApiCall(
        'dashboard.loadAllMetrics',
        () => Promise.all([
          fetch(metricsUrl).then(r => r.json()),
          fetch(`${BACKEND_URL}/api/security/status`).then(r => r.json()).catch(() => ({ data: { blocked_ips: [], active_trackers: 0 } }))
        ])
      );

      // Backend returns logs in data.logs and metrics in data.metrics
      const perfLogs = Array.isArray(perfLogsResp?.data?.logs) ? perfLogsResp.data.logs : [];
      const backendMetrics = perfLogsResp?.data?.metrics || {};

      // Calculate endpoint-specific metrics
      const endpointPatterns = {
        contacts: /\/api\/contacts/i,
        accounts: /\/api\/accounts/i,
        leads: /\/api\/leads/i,
        opportunities: /\/api\/opportunities/i,
        activities: /\/api\/activities/i
      };

      const endpointMetrics = {};
      Object.keys(endpointPatterns).forEach(key => {
        const endpointLogs = perfLogs.filter(log => 
          endpointPatterns[key].test(log.endpoint) && log.status_code < 400
        );
        const avgTime = endpointLogs.length > 0
          ? endpointLogs.reduce((sum, log) => sum + log.duration_ms, 0) / endpointLogs.length
          : 0;
        endpointMetrics[key] = {
          avg: Math.round(avgTime),
          count: endpointLogs.length
        };
      });

      // --- Use backend-calculated metrics ---
      const totalCalls = backendMetrics.totalCalls || perfLogs.length;
      const successfulCalls = backendMetrics.successCount || perfLogs.filter(log => log.status_code < 400).length;
      const errorRate = backendMetrics.errorRate || 0;
      const avgResponseTime = backendMetrics.avgResponseTime || 0;

      // Transform backend logs to match dashboard expectations
      const transformedLogs = perfLogs.map(log => ({
        ...log,
        function_name: `${log.method} ${log.endpoint}`,
        status: log.status_code < 400 ? 'success' : 'error',
        response_time_ms: log.duration_ms,
        timestamp: log.created_at
      }));

      setMetrics({
        averageResponseTime: avgResponseTime,
        errorRate: errorRate,
        totalApiCalls: totalCalls,
        successfulApiCalls: successfulCalls,
        endpointMetrics: endpointMetrics,
        recentErrors: transformedLogs.filter(log => log.status === 'error').slice(0, 5),
        rawLogs: transformedLogs.slice(0, 10)
      });

      // Set security status (blocked IPs)
      setSecurityStatus(securityResp?.data || { blocked_ips: [], active_trackers: 0, redis_available: false });

      setLastRefresh(new Date());
    } catch (error) {
      console.error("Error loading metrics:", error);
      toast.error("Failed to load dashboard metrics", { description: String(error?.message || error) }); // More resilient error message
      setMetrics({
        averageResponseTime: 0,
        errorRate: 100,
        totalApiCalls: 0,
        successfulApiCalls: 0,
        endpointMetrics: { contacts: { avg: 0, count: 0 }, accounts: { avg: 0, count: 0 }, leads: { avg: 0, count: 0 }, opportunities: { avg: 0, count: 0 }, activities: { avg: 0, count: 0 } },
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

  const handleUnblockIP = async (ip) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/security/unblock-ip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip, reason: 'Manually unblocked by admin' })
      });

      const result = await response.json();

      if (result.status === 'success') {
        toast.success(`IP ${ip} unblocked successfully`);
        loadMetrics(); // Refresh to show updated list
      } else {
        toast.error(`Failed to unblock IP: ${result.message}`);
      }
    } catch (error) {
      console.error('Error unblocking IP:', error);
      toast.error(`Error unblocking IP: ${error.message}`);
    }
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

            {/* Endpoint Performance Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
              <Card className="bg-slate-800 border-slate-700">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-slate-400">Contacts API</CardTitle>
                  <Users className="h-4 w-4 text-slate-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-slate-200">{formatNumber(metrics.endpointMetrics.contacts.avg)}ms</div>
                  <p className="text-xs text-slate-500 mt-1">{metrics.endpointMetrics.contacts.count} calls</p>
                </CardContent>
              </Card>
              <Card className="bg-slate-800 border-slate-700">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-slate-400">Accounts API</CardTitle>
                  <Building className="h-4 w-4 text-slate-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-slate-200">{formatNumber(metrics.endpointMetrics.accounts.avg)}ms</div>
                  <p className="text-xs text-slate-500 mt-1">{metrics.endpointMetrics.accounts.count} calls</p>
                </CardContent>
              </Card>
              <Card className="bg-slate-800 border-slate-700">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-slate-400">Leads API</CardTitle>
                  <Star className="h-4 w-4 text-slate-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-slate-200">{formatNumber(metrics.endpointMetrics.leads.avg)}ms</div>
                  <p className="text-xs text-slate-500 mt-1">{metrics.endpointMetrics.leads.count} calls</p>
                </CardContent>
              </Card>
              <Card className="bg-slate-800 border-slate-700">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-slate-400">Opportunities API</CardTitle>
                  <Target className="h-4 w-4 text-slate-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-slate-200">{formatNumber(metrics.endpointMetrics.opportunities.avg)}ms</div>
                  <p className="text-xs text-slate-500 mt-1">{metrics.endpointMetrics.opportunities.count} calls</p>
                </CardContent>
              </Card>
              <Card className="bg-slate-800 border-slate-700">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-slate-400">Activities API</CardTitle>
                  <Activity className="h-4 w-4 text-slate-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-slate-200">{formatNumber(metrics.endpointMetrics.activities.avg)}ms</div>
                  <p className="text-xs text-slate-500 mt-1">{metrics.endpointMetrics.activities.count} calls</p>
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
                      <div key={index} className="p-3 bg-red-900/20 rounded border border-red-700/40 text-sm">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-red-500 text-xs font-mono flex-1">
                            <span className="font-semibold">{error.function_name || 'Unknown Function'}</span>
                          </p>
                          <div className="flex items-center gap-2">
                            {/* Status Code Badge */}
                            <Badge 
                              variant="outline" 
                              className={`text-xs ${error.status_code >= 500 ? 'bg-red-700/50 text-red-200 border-red-600' : 'bg-yellow-700/50 text-yellow-200 border-yellow-600'}`}
                            >
                              {error.status_code || '???'}
                            </Badge>
                            {/* Duration */}
                            {error.duration_ms != null && (
                              <span className="text-slate-400 text-xs">{error.duration_ms}ms</span>
                            )}
                          </div>
                        </div>
                        <p className="text-slate-400 text-xs mb-1">{new Date(error.created_at || error.timestamp).toLocaleString()}</p>
                        {/* Error message - uses error_message from backend */}
                        {error.error_message ? (
                          <p className="text-red-400 mt-1 text-xs bg-red-950/30 px-2 py-1 rounded font-mono break-all">{error.error_message}</p>
                        ) : (
                          <p className="text-slate-500 mt-1 text-xs italic">No error message captured</p>
                        )}
                        {/* User email if available */}
                        {error.user_email && (
                          <p className="text-slate-500 text-xs mt-1">User: {error.user_email}</p>
                        )}
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

            {/* Blocked IPs (IDR System) */}
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-slate-100">
                  <Shield className="w-5 h-5 text-orange-500" />
                  Blocked IPs (Intrusion Detection)
                  <Badge variant="outline" className="ml-auto text-xs">
                    {securityStatus.redis_available ? 'Redis Active' : 'In-Memory Only'}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {securityStatus.blocked_ips && securityStatus.blocked_ips.length > 0 ? (
                  <div className="space-y-2">
                    {securityStatus.blocked_ips.map((blockedIP, index) => {
                      const expiresAt = blockedIP.expires_at !== 'unknown'
                        ? new Date(blockedIP.expires_at)
                        : null;
                      const expiresIn = blockedIP.expires_in_seconds > 0
                        ? `${Math.floor(blockedIP.expires_in_seconds / 60)}m ${blockedIP.expires_in_seconds % 60}s`
                        : 'Expired';

                      return (
                        <div key={index} className="p-3 bg-orange-900/20 rounded border border-orange-700/40 text-sm flex items-center justify-between">
                          <div>
                            <p className="text-orange-400 font-mono font-semibold">{blockedIP.ip}</p>
                            <p className="text-orange-500 text-xs mt-1">
                              Blocked: {blockedIP.blocked_at !== 'unknown' ? new Date(blockedIP.blocked_at).toLocaleString() : 'Unknown'}
                            </p>
                            <p className="text-orange-500 text-xs">
                              Expires: {expiresAt ? expiresAt.toLocaleString() : expiresIn}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleUnblockIP(blockedIP.ip)}
                            className="text-orange-400 hover:text-orange-300 hover:bg-orange-900/30"
                            title="Unblock this IP"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      );
                    })}
                    <p className="text-xs text-slate-500 mt-2">
                      Active suspicious activity trackers: {securityStatus.active_trackers}
                    </p>
                  </div>
                ) : (
                  <div className="text-center py-4 text-slate-400">
                    <Shield className="w-8 h-8 mx-auto mb-2 text-green-600" />
                    No IPs currently blocked by intrusion detection.
                  </div>
                )}
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
