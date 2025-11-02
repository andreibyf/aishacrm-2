import { useEffect, useState, useCallback } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  Database,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { useErrorLog } from "../shared/ErrorLogger";
import { useTenant } from "../shared/tenantContext";
import { BACKEND_URL } from '@/api/entities';

export default function SystemHealthDashboard({ onViewMore }) {
  const { errors, getCriticalErrors, clearErrors } = useErrorLog();
  const { selectedTenantId } = useTenant();
  const [backendStatus, setBackendStatus] = useState("checking");
  const [lastCheck, setLastCheck] = useState(null);
  const [metrics, setMetrics] = useState({ errorRate: 0, errorCount: 0, serverErrorCount: 0, logs: [] });
  const [rangeHours, setRangeHours] = useState(1); // time range for dashboard metrics

  const checkHealth = async () => {
    setBackendStatus("checking");
    try {
      const response = await fetch(`${BACKEND_URL}/health`);
      if (response.ok) {
        const data = await response.json();
        setBackendStatus(data.status === "ok" ? "healthy" : "unhealthy");
      } else {
        setBackendStatus("unhealthy");
      }
      setLastCheck(new Date());
    } catch (error) {
      console.error("Backend health check failed:", error);
      setBackendStatus("unhealthy");
      setLastCheck(new Date());
    }
  };

  const loadMetrics = useCallback(async () => {
    try {
      const tenantParam = selectedTenantId ? `&tenant_id=${encodeURIComponent(selectedTenantId)}` : "";
      const resp = await fetch(`${BACKEND_URL}/api/metrics/performance?hours=${rangeHours}&limit=200${tenantParam}`);
      if (resp.ok) {
        const result = await resp.json();
        const data = result.data || {};
        setMetrics({
          errorRate: data.metrics?.errorRate || 0,
          errorCount: data.metrics?.errorCount || 0,
          serverErrorCount: data.metrics?.serverErrorCount || 0,
          logs: Array.isArray(data.logs) ? data.logs : []
        });
      }
    } catch (e) {
      console.warn("Failed to load performance metrics:", e.message);
    }
  }, [selectedTenantId, rangeHours]);

  useEffect(() => {
    checkHealth();
    loadMetrics();
    const interval = setInterval(checkHealth, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [selectedTenantId, loadMetrics]);

  // recentErrors derived from server metrics below
  const criticalErrors = getCriticalErrors();

  const statusIcon = {
    healthy: <CheckCircle2 className="w-5 h-5 text-green-500" />,
    checking: <Clock className="w-5 h-5 text-yellow-500 animate-spin" />,
    unhealthy: <XCircle className="w-5 h-5 text-red-500" />,
  };

  const statusColor = {
    healthy: "bg-green-100 text-green-800 border-green-300",
    checking: "bg-yellow-100 text-yellow-800 border-yellow-300",
    unhealthy: "bg-red-100 text-red-800 border-red-300",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-100">System Health</h2>
        <div className="flex items-center gap-2">
          <Select value={String(rangeHours)} onValueChange={(v) => setRangeHours(Number(v))}>
            <SelectTrigger className="h-8 bg-slate-700 border-slate-600 text-slate-200">
              <SelectValue placeholder="Last 1 hour" />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
              <SelectItem value="1">Last 1 hour</SelectItem>
              <SelectItem value="24">Last 24 hours</SelectItem>
              <SelectItem value="168">Last 7 days</SelectItem>
            </SelectContent>
          </Select>
          <Button
          onClick={checkHealth}
          variant="outline"
          size="sm"
          className="bg-slate-700 border-slate-600 text-slate-200"
          disabled={backendStatus === "checking"}
        >
          <RefreshCw
            className={`w-4 h-4 mr-2 ${
              backendStatus === "checking" ? "animate-spin" : ""
            }`}
          />
          {backendStatus === "checking" ? "Checking..." : "Refresh"}
          </Button>
        </div>
      </div>

      {/* System Status */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-300 flex items-center gap-2">
              <Database className="w-4 h-4" />
              Backend Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              {statusIcon[backendStatus]}
              <Badge className={statusColor[backendStatus]}>
                {backendStatus === "healthy"
                  ? "Operational"
                  : backendStatus === "checking"
                  ? "Checking..."
                  : "Issues Detected"}
              </Badge>
            </div>
            {lastCheck && (
              <p className="text-xs text-slate-400 mt-2">
                Last checked: {lastCheck.toLocaleTimeString()}
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-300 flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Error Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-100">
              {metrics.errorCount}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              errors in last hour ({metrics.errorRate}% rate)
            </p>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Critical Issues
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-400">
              {criticalErrors.length}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              require attention
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Critical Errors */}
      {criticalErrors.length > 0 && (
        <Alert variant="destructive" className="bg-red-900/20 border-red-700">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Critical Issues Detected</AlertTitle>
          <AlertDescription>
            {criticalErrors.length}{" "}
            critical error(s) require immediate attention.
          </AlertDescription>
        </Alert>
      )}

      {/* Recent Errors (from performance logs) */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-slate-100">Recent Errors</CardTitle>
            {errors.length > 0 && (
              <Button
                onClick={clearErrors}
                variant="outline"
                size="sm"
                className="bg-slate-700 border-slate-600 text-slate-200"
              >
                Clear All
              </Button>
            )}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 hidden sm:inline">
                Scope: {selectedTenantId ? `Tenant ${selectedTenantId.substring(0,8)}…` : 'All Clients'}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="bg-slate-700 border-slate-600 text-slate-200"
                onClick={() => {
                  if (onViewMore) onViewMore();
                  else window.location.href = '/Settings?tab=system-logs';
                }}
              >
                View all logs
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {metrics.logs.filter(l => (l.status_code || 0) >= 400).length === 0
            ? (
              <div className="text-center py-8 text-slate-400">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-2 text-green-500" />
                <p>No errors logged</p>
              </div>
            )
            : (
              <div className="space-y-3">
                {metrics.logs.filter(l => (l.status_code || 0) >= 400).slice(0,5).map((log) => (
                  <div
                    key={log.id}
                    className="p-3 bg-slate-700/50 rounded-lg border border-slate-600"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className={(log.status_code || 0) >= 500 ? 'bg-red-600' : 'bg-yellow-600'}>
                            {(log.status_code || 0) >= 500 ? 'critical' : 'warning'}
                          </Badge>
                          <span className="text-sm font-medium text-slate-200">{log.method} {log.endpoint}</span>
                        </div>
                        <p className="text-sm text-slate-300">{log.error_message || `HTTP ${log.status_code}`}</p>
                        {log.user_email && (
                          <p className="text-xs text-slate-500 mt-1">User: {log.user_email}</p>
                        )}
                      </div>
                      <span className="text-xs text-slate-500">{new Date(log.created_at).toLocaleTimeString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
        </CardContent>
      </Card>
    </div>
  );
}
