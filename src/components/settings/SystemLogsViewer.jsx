import { useState, useEffect, useCallback } from "react";
import { useTenant } from '@/components/shared/tenantContext';
import { useConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Loader2, RefreshCw, Trash2, Search, PlusCircle, Download } from "lucide-react";
import { toast } from "sonner";
import { BACKEND_URL, SystemLog } from '@/api/entities';
import { resilientFetch } from '@/utils/resilientFetch';

export default function SystemLogsViewer() {
  const { selectedTenantId } = useTenant();
  const { ConfirmDialog: ConfirmDialogPortal, confirm } = useConfirmDialog();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [filterLevel, setFilterLevel] = useState('all');
  const [filterSource, setFilterSource] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [uniqueSources, setUniqueSources] = useState([]);
  const [timeRangeHours, setTimeRangeHours] = useState(24); // New: time range for API errors

  const loadLogs = useCallback(async () => {
    setLoading(true);
    const correlationId = `syslog-load-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    const tenantId = selectedTenantId || '6cb4c008-4847-426a-9a2e-918ad70e7b69';
    try {
      const tenantParam = tenantId ? `tenant_id=${encodeURIComponent(tenantId)}&` : '';
      const tenantUrl = `${BACKEND_URL}/api/system-logs?${tenantParam}limit=200&hours=${timeRangeHours}`;
      const systemUrl = `${BACKEND_URL}/api/system-logs?tenant_id=system&limit=200&hours=${timeRangeHours}`;
      const perfUrl = `${BACKEND_URL}/api/metrics/performance?hours=${timeRangeHours}&limit=500${tenantId ? `&tenant_id=${encodeURIComponent(tenantId)}` : ''}`;

      const [tenantRes, systemRes, perfRes] = await Promise.all([
        resilientFetch(tenantUrl, { timeoutMs: 7000, maxRetries: 2 }),
        resilientFetch(systemUrl, { timeoutMs: 7000, maxRetries: 2 }),
        resilientFetch(perfUrl, { timeoutMs: 7000, maxRetries: 1 })
      ]);

      if (!tenantRes.ok && !systemRes.ok) {
        // Instrument failure once
        try {
          await SystemLog.create({
            tenant_id: tenantId,
            level: 'ERROR',
            source: 'SystemLogsViewer',
            message: 'All system log fetch attempts failed',
            metadata: {
              correlation_id: correlationId,
              tenant_error: tenantRes.errorType,
              system_error: systemRes.errorType,
              perf_error: perfRes.errorType,
              tenant_attempts: tenantRes.attempts,
              system_attempts: systemRes.attempts,
              perf_attempts: perfRes.attempts
            }
          });
        } catch {/* ignore instrumentation failure */}
        toast.error(`Failed to load system logs (${tenantRes.errorType || systemRes.errorType || 'unknown'})`);
        setLogs([]);
        return;
      }

      let allLogs = [];

      // Tenant logs aggregation
      if (tenantRes.ok && tenantRes.data) {
        const d = tenantRes.data;
        const arr = Array.isArray(d?.data?.['system-logs']) ? d.data['system-logs'] : Array.isArray(d?.data) ? d.data : Array.isArray(d?.['system-logs']) ? d['system-logs'] : [];
        allLogs = [...allLogs, ...arr];
      }
      // System logs
      if (systemRes.ok && systemRes.data) {
        const sd = systemRes.data;
        const arr = Array.isArray(sd?.data?.['system-logs']) ? sd.data['system-logs'] : Array.isArray(sd?.data) ? sd.data : Array.isArray(sd?.['system-logs']) ? sd['system-logs'] : [];
        allLogs = [...allLogs, ...arr];
      }
      // Performance logs (API errors)
      if (perfRes.ok && perfRes.data) {
        const logs = perfRes.data?.data?.logs || [];
        const apiLogs = logs.filter(l => (l.status_code || 0) >= 400).map(l => ({
          id: `api-${l.id}`,
          tenant_id: l.tenant_id,
          level: (l.status_code || 0) >= 500 ? 'ERROR' : 'WARNING',
          message: `${l.method} ${l.endpoint} → ${l.status_code}${l.error_message ? ` - ${l.error_message}` : ''}`,
          source: 'API Request',
          user_email: l.user_email,
          created_at: l.created_at,
          metadata: {
            endpoint: l.endpoint,
            method: l.method,
            status_code: l.status_code,
            duration_ms: l.duration_ms,
            error_message: l.error_message,
            correlation_id: correlationId
          }
        }));
        allLogs = [...allLogs, ...apiLogs];
      }

      // Sort & filter
      allLogs.sort((a, b) => new Date(b.created_at || b.created_date) - new Date(a.created_at || a.created_date));
      const sources = [...new Set(allLogs.map(log => log.source || 'Unknown').filter(Boolean))];
      setUniqueSources(sources);
      if (filterLevel !== 'all') allLogs = allLogs.filter(l => l.level === filterLevel);
      if (filterSource !== 'all') allLogs = allLogs.filter(l => l.source === filterSource);
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        allLogs = allLogs.filter(l =>
          l.message?.toLowerCase().includes(term) ||
          l.source?.toLowerCase().includes(term) ||
          l.user_email?.toLowerCase().includes(term)
        );
      }
      setLogs(allLogs);
    } catch (error) {
      console.error('Failed to load logs:', error);
      toast.error('Failed to load system logs');
    } finally {
      setLoading(false);
    }
  }, [filterLevel, filterSource, searchTerm, selectedTenantId, timeRangeHours]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const handleClearLogs = async () => {
    const confirmed = await confirm({
      title: "Delete all logs?",
      description: `Are you sure you want to delete all ${logs.length} filtered log(s)? This will delete both system logs and API performance logs. This action cannot be undone.`,
      variant: "destructive",
      confirmText: "Delete All",
      cancelText: "Cancel"
    });
    if (!confirmed) return;

    setClearing(true);
    try {
      const tenantId = selectedTenantId || '6cb4c008-4847-426a-9a2e-918ad70e7b69';
      const levelQuery = filterLevel !== 'all' ? `&level=${encodeURIComponent(filterLevel)}` : '';
      const tenantQuery = tenantId && tenantId !== '6cb4c008-4847-426a-9a2e-918ad70e7b69' ? `tenant_id=${encodeURIComponent(tenantId)}&` : '';
      
      let totalDeleted = 0;
      
      // Delete system logs with time range filter
      const systemUrl = `${BACKEND_URL}/api/system-logs?${tenantQuery}hours=${timeRangeHours}${levelQuery}`;
      console.log('Clearing system logs with URL:', systemUrl);
      const systemResp = await fetch(systemUrl, {
        method: 'DELETE'
      });
      
      if (systemResp.ok) {
        const systemData = await systemResp.json();
        console.log('System logs response:', systemData);
        totalDeleted += systemData.data?.deleted_count || 0;
      }
      
      // Also delete performance logs (API errors) if they exist
      const perfTenantQuery = tenantId && tenantId !== '6cb4c008-4847-426a-9a2e-918ad70e7b69' ? `&tenant_id=${encodeURIComponent(tenantId)}` : '';
      const perfUrl = `${BACKEND_URL}/api/metrics/performance?hours=${timeRangeHours}${perfTenantQuery}`;
      console.log('Clearing performance logs with URL:', perfUrl);
      const perfResp = await fetch(perfUrl, {
        method: 'DELETE'
      });
      
      if (perfResp.ok) {
        const perfData = await perfResp.json();
        console.log('Performance logs response:', perfData);
        totalDeleted += perfData.data?.deleted_count || 0;
      }
      
      if (totalDeleted > 0) {
        toast.success(`Deleted ${totalDeleted} log(s)`);
      } else {
        toast.info('No logs matched the filter criteria');
      }
      
      await loadLogs();
    } catch (error) {
      console.error('Failed to clear logs:', error);
      toast.error(error.message || 'Failed to clear logs');
    } finally {
      setClearing(false);
    }
  };

  const handleAddTestLog = async () => {
    const tenantId = selectedTenantId || '6cb4c008-4847-426a-9a2e-918ad70e7b69';
    setCreating(true);
    try {
      const payload = {
        tenant_id: tenantId,
        level: filterLevel !== 'all' ? filterLevel : 'INFO',
        source: filterSource !== 'all' ? filterSource : 'SystemLogsViewer',
        message: `Test log created at ${new Date().toISOString()}`,
        user_email: 'admin@test.com',
        metadata: { ui: 'SystemLogsViewer', filterLevel, filterSource }
      };
      const resp = await fetch(`${BACKEND_URL}/api/system-logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!resp.ok) {
        throw new Error(`Failed to create test log: ${resp.status} ${resp.statusText}`);
      }
      toast.success('Test log added');
      await loadLogs();
    } catch (error) {
      console.error('Failed to add test log:', error);
      toast.error('Failed to add test log');
    } finally {
      setCreating(false);
    }
  };

  const getLevelBadgeColor = (level) => {
    switch (level) {
      case 'ERROR': return 'bg-red-600 text-white hover:bg-red-700';
      case 'WARNING': return 'bg-yellow-600 text-white hover:bg-yellow-700';
      case 'INFO': return 'bg-blue-600 text-white hover:bg-blue-700';
      case 'DEBUG': return 'bg-gray-600 text-white hover:bg-gray-700';
      default: return 'bg-slate-600 text-white hover:bg-slate-700';
    }
  };

  const handleExport = () => {
    const dataStr = JSON.stringify(logs, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `system-logs-${new Date().toISOString().slice(0,10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Logs exported');
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="text-sm text-slate-300 mb-2 block">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search logs..."
                  className="pl-10 bg-slate-700 border-slate-600 text-slate-200"
                />
              </div>
            </div>

            <div className="w-[180px]">
              <label className="text-sm text-slate-300 mb-2 block">Level</label>
              <Select value={filterLevel} onValueChange={setFilterLevel}>
                <SelectTrigger className="bg-slate-700 border-slate-600 text-slate-200">
                  <SelectValue placeholder="All levels" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="all">All Levels</SelectItem>
                  <SelectItem value="ERROR">Error</SelectItem>
                  <SelectItem value="WARNING">Warning</SelectItem>
                  <SelectItem value="INFO">Info</SelectItem>
                  <SelectItem value="DEBUG">Debug</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="w-[200px]">
              <label className="text-sm text-slate-300 mb-2 block">Source</label>
              <Select value={filterSource} onValueChange={setFilterSource}>
                <SelectTrigger className="bg-slate-700 border-slate-600 text-slate-200">
                  <SelectValue placeholder="All sources" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="all">All Sources</SelectItem>
                  {uniqueSources.map(source => (
                    <SelectItem key={source} value={source}>{source}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Time Range selector for API errors */}
            <div className="w-[180px]">
              <label className="text-sm text-slate-300 mb-2 block">Time Range</label>
              <Select value={String(timeRangeHours)} onValueChange={(v) => setTimeRangeHours(Number(v))}>
                <SelectTrigger className="bg-slate-700 border-slate-600 text-slate-200">
                  <SelectValue placeholder="Last 24 hours" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="1">Last 1 hour</SelectItem>
                  <SelectItem value="6">Last 6 hours</SelectItem>
                  <SelectItem value="24">Last 24 hours</SelectItem>
                  <SelectItem value="72">Last 3 days</SelectItem>
                  <SelectItem value="168">Last 7 days</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              variant="outline"
              onClick={loadLogs}
              disabled={loading}
              className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </Button>

            <Button
              onClick={handleAddTestLog}
              disabled={creating || loading}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {creating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <PlusCircle className="w-4 h-4 mr-2" />
                  Add Test Log
                </>
              )}
            </Button>

            <Button
              variant="destructive"
              onClick={handleClearLogs}
              disabled={loading || clearing || logs.length === 0}
              className="bg-red-600 hover:bg-red-700"
            >
              {clearing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Clearing...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Clear All
                </>
              )}
            </Button>

            <Button
              onClick={handleExport}
              disabled={loading || logs.length === 0}
              variant="outline"
              className="bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600"
            >
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Log Count */}
      <div className="flex items-center justify-between text-sm text-slate-400">
        <span>{logs.length} log{logs.length !== 1 ? 's' : ''} found</span>
        {(filterLevel !== 'all' || filterSource !== 'all' || searchTerm) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFilterLevel('all');
              setFilterSource('all');
              setSearchTerm('');
            }}
            className="text-blue-400 hover:text-blue-300"
          >
            Clear Filters
          </Button>
        )}
      </div>

      {/* Logs List */}
      <div className="space-y-2">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
            <span className="ml-3 text-slate-300">Loading logs...</span>
          </div>
        ) : logs.length === 0 ? (
          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="p-12 text-center">
              <p className="text-slate-400">No logs found</p>
              <p className="text-sm text-slate-500 mt-2">
                Logs will appear here as events occur in the application
              </p>
            </CardContent>
          </Card>
        ) : (
          logs.map((log) => (
            <Card key={log.id} className="bg-slate-800 border-slate-700 hover:border-slate-600 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className={getLevelBadgeColor(log.level)}>
                        {log.level}
                      </Badge>
                      <Badge variant="outline" className="bg-slate-700 text-slate-300 border-slate-600">
                        {log.source}
                      </Badge>
                      {log.metadata?.status_code && (
                        <Badge variant="outline" className={
                          log.metadata.status_code >= 500 
                            ? 'bg-red-900/30 text-red-400 border-red-700/50' 
                            : log.metadata.status_code >= 400
                              ? 'bg-yellow-900/30 text-yellow-400 border-yellow-700/50'
                              : 'bg-green-900/30 text-green-400 border-green-700/50'
                        }>
                          {log.metadata.status_code}
                        </Badge>
                      )}
                      <span className="text-xs text-slate-500">
                        {new Date(log.created_at || log.created_date).toLocaleString()}
                      </span>
                    </div>

                    <p className="text-slate-200 text-sm mb-2">{log.message}</p>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                      {log.user_email && (
                        <span>User: {log.user_email}</span>
                      )}
                      {log.tenant_id && (
                        <span>Tenant: {log.tenant_id.substring(0, 8)}...</span>
                      )}
                    </div>

                    {log.metadata && Object.keys(log.metadata).length > 0 && (
                      <details className="mt-2">
                        <summary className="text-xs text-blue-400 cursor-pointer hover:text-blue-300">
                          Show metadata
                        </summary>
                        <pre className="mt-2 p-2 bg-slate-900 rounded text-xs text-slate-300 overflow-x-auto">
                          {JSON.stringify(log.metadata, null, 2)}
                        </pre>
                      </details>
                    )}

                    {log.stack_trace && (
                      <details className="mt-2">
                        <summary className="text-xs text-red-400 cursor-pointer hover:text-red-300">
                          Show stack trace
                        </summary>
                        <pre className="mt-2 p-2 bg-slate-900 rounded text-xs text-red-300 overflow-x-auto">
                          {log.stack_trace}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
      <ConfirmDialogPortal />
    </div>
  );
}