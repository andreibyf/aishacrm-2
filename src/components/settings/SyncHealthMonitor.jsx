
import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Activity, 
  CheckCircle, 
  AlertCircle, 
  Clock, 
  TrendingUp,
  RefreshCw,
  Loader2 // Added Loader2 import
} from "lucide-react";
import { SyncHealth } from "@/api/entities";
import { formatDistanceToNow } from "date-fns";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar
} from "recharts";

export default function SyncHealthMonitor({ tenantId = null }) {
  const [healthLogs, setHealthLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  // Removed stats state as it's no longer used in the new UI

  const loadHealthData = useCallback(async () => {
    setLoading(true);
    try {
      // Load last 30 sync health records
      const filter = tenantId ? { tenant_id: tenantId } : {};
      const logs = await SyncHealth.filter(filter, '-start_time', 30);
      setHealthLogs(logs);

      // Removed statistics calculation as it's no longer used
    } catch (error) {
      console.error("Failed to load sync health data:", error);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    loadHealthData();
  }, [loadHealthData]);

  const getStatusBadge = (status) => {
    let classes = "";
    switch (status) {
      case 'completed': classes = 'bg-emerald-900/30 text-emerald-400 border-emerald-700/50'; break;
      case 'partial': classes = 'bg-yellow-900/30 text-yellow-400 border-yellow-700/50'; break;
      case 'failed': classes = 'bg-red-900/30 text-red-400 border-red-700/50'; break;
      case 'running': classes = 'bg-blue-900/30 text-blue-400 border-blue-700/50'; break;
      default: classes = 'bg-slate-700 text-slate-300 border-slate-600'; break;
    }
    return <Badge variant="outline" className={classes}>{status}</Badge>;
  };

  // Removed chartData preparation as charts are no longer used

  return (
    <div className="space-y-6">
      <Alert className="bg-blue-900/30 border-blue-700/50">
        <Activity className="h-4 w-4 text-blue-400" />
        <AlertDescription className="text-blue-300">
          Monitor automated data synchronization jobs and their health status across all tenants.
        </AlertDescription>
      </Alert>

      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-100">
            <RefreshCw className="w-5 h-5 text-emerald-400" />
            Recent Sync Operations
          </CardTitle>
          <CardDescription className="text-slate-400">
            Last 10 synchronization jobs
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
            </div>
          ) : healthLogs.length === 0 ? (
            <div className="text-center p-8 text-slate-400">
              No sync operations recorded yet
            </div>
          ) : (
            <div className="space-y-3">
              {healthLogs.slice(0, 10).map((log) => ( // Limiting to last 10 as per CardDescription
                <div key={log.id} className="p-4 bg-slate-900 rounded-lg border border-slate-700">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="bg-slate-700 text-slate-300 border-slate-600">
                          {log.mode || "N/A"} {/* Using log.mode instead of log.sync_type */}
                        </Badge>
                        {getStatusBadge(log.status)}
                      </div>
                      <div className="mt-2 text-sm text-slate-300">
                        {log.records_updated || 0} records updated
                        {/* Assuming records_processed maps to records_updated as per entity structure */}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        Duration: {log.duration_ms ? `${log.duration_ms}ms` : 'N/A'} | {new Date(log.start_time).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  {log.error_count > 0 && (
                    <Alert className="mt-3 bg-red-900/30 border-red-700/50">
                      <AlertCircle className="h-4 w-4 text-red-400" />
                      <AlertDescription className="text-red-300">
                        {log.error_count} error(s) occurred during sync
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
