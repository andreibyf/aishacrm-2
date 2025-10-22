import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { 
  Activity, 
  AlertCircle, 
  CheckCircle2, 
  XCircle, 
  Clock,
  RefreshCw,
  TrendingUp,
  Database
} from "lucide-react";
import { useErrorLog } from "../shared/ErrorLogger";
import { checkBackendStatus } from "@/api/functions";

export default function SystemHealthDashboard() {
  const { errors, getRecentErrors, getCriticalErrors, clearErrors } = useErrorLog();
  const [backendStatus, setBackendStatus] = useState('checking');
  const [lastCheck, setLastCheck] = useState(null);

  const checkHealth = async () => {
    setBackendStatus('checking');
    try {
      await checkBackendStatus({});
      setBackendStatus('healthy');
      setLastCheck(new Date());
    } catch (error) {
      setBackendStatus('unhealthy');
      setLastCheck(new Date());
    }
  };

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 60000); // Check every minute
    return () => clearInterval(interval);
  }, []);

  const recentErrors = getRecentErrors(5);
  const criticalErrors = getCriticalErrors();

  const statusIcon = {
    healthy: <CheckCircle2 className="w-5 h-5 text-green-500" />,
    checking: <Clock className="w-5 h-5 text-yellow-500 animate-spin" />,
    unhealthy: <XCircle className="w-5 h-5 text-red-500" />
  };

  const statusColor = {
    healthy: 'bg-green-100 text-green-800 border-green-300',
    checking: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    unhealthy: 'bg-red-100 text-red-800 border-red-300'
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-100">System Health</h2>
        <Button onClick={checkHealth} variant="outline" size="sm" className="bg-slate-700 border-slate-600 text-slate-200">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
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
                {backendStatus === 'healthy' ? 'Operational' : 
                 backendStatus === 'checking' ? 'Checking...' : 'Issues Detected'}
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
              {errors.length}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              errors in last hour
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
            {criticalErrors.length} critical error(s) require immediate attention.
          </AlertDescription>
        </Alert>
      )}

      {/* Recent Errors */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-slate-100">Recent Errors</CardTitle>
            {errors.length > 0 && (
              <Button onClick={clearErrors} variant="outline" size="sm" className="bg-slate-700 border-slate-600 text-slate-200">
                Clear All
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {recentErrors.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <CheckCircle2 className="w-12 h-12 mx-auto mb-2 text-green-500" />
              <p>No errors logged</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentErrors.map((error) => (
                <div key={error.id} className="p-3 bg-slate-700/50 rounded-lg border border-slate-600">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={
                          error.severity === 'critical' ? 'bg-red-600' :
                          error.severity === 'warning' ? 'bg-yellow-600' :
                          'bg-slate-600'
                        }>
                          {error.severity}
                        </Badge>
                        <span className="text-sm font-medium text-slate-200">{error.component}</span>
                      </div>
                      <p className="text-sm text-slate-300">{error.message}</p>
                      {error.actionable && (
                        <p className="text-xs text-blue-400 mt-1">
                          → {error.actionable}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-slate-500">
                      {new Date(error.timestamp).toLocaleTimeString()}
                    </span>
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