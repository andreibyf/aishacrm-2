import React, { useState, useEffect, useCallback } from 'react';
import { SystemLog } from '@/api/entities';
import { useTenant } from '@/components/shared/tenantContext';
import { useConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Loader2, RefreshCw, Trash2, Search, PlusCircle } from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = import.meta.env.VITE_AISHACRM_BACKEND_URL || 'http://localhost:3001';

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

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      // Try backend first (for local dev with Supabase Cloud)
      // Note: backend mounts this router at /api/system-logs (dash), not /api/system/logs
      const tenantId = selectedTenantId || 'local-tenant-001';
      const response = await fetch(`${BACKEND_URL}/api/system-logs?tenant_id=${encodeURIComponent(tenantId)}&limit=200`);

      if (!response.ok) {
        throw new Error('Backend not available, trying Base44...');
      }

      const data = await response.json();
      // Backend returns { status: 'success', data: { 'system-logs': [...] } }
      // Normalize to an array of logs for the UI.
      let allLogs = [];
      if (data && data.status === 'success' && data.data) {
        if (Array.isArray(data.data['system-logs'])) {
          allLogs = data.data['system-logs'];
        } else if (Array.isArray(data.data)) {
          allLogs = data.data;
        }
      } else if (Array.isArray(data)) {
        allLogs = data;
      }
      
      // If backend returns empty, try Base44 as fallback
      if (!allLogs || allLogs.length === 0) {
        console.log('No logs from backend, trying Base44...');
        allLogs = await SystemLog.list('-created_date', 200);
      }
      
      // Extract unique sources
      const sources = [...new Set(allLogs.map(log => log.source).filter(Boolean))];
      setUniqueSources(sources);

      // Apply filters
      if (filterLevel !== 'all') {
        allLogs = allLogs.filter(log => log.level === filterLevel);
      }
      
      if (filterSource !== 'all') {
        allLogs = allLogs.filter(log => log.source === filterSource);
      }

      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        allLogs = allLogs.filter(log => 
          log.message?.toLowerCase().includes(term) ||
          log.source?.toLowerCase().includes(term) ||
          log.user_email?.toLowerCase().includes(term)
        );
      }

      setLogs(allLogs);
    } catch (error) {
      console.error('Failed to load logs:', error);
      toast.error('Failed to load system logs');
    } finally {
      setLoading(false);
    }
  }, [filterLevel, filterSource, searchTerm, selectedTenantId]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const handleClearLogs = async () => {
    const confirmed = await confirm({
      title: "Delete all logs?",
      description: "Are you sure you want to delete all logs? This action cannot be undone.",
      variant: "destructive",
      confirmText: "Delete All",
      cancelText: "Cancel"
    });
    if (!confirmed) return;

    setClearing(true);
    try {
      // Prefer backend bulk delete for speed
      const tenantId = selectedTenantId || 'local-tenant-001';
      const levelQuery = filterLevel !== 'all' ? `&level=${encodeURIComponent(filterLevel)}` : '';
      const resp = await fetch(`${BACKEND_URL}/api/system-logs?tenant_id=${encodeURIComponent(tenantId)}${levelQuery}` , {
        method: 'DELETE'
      });
      if (!resp.ok) {
        // Fallback: per-item delete via entity wrapper
        for (const log of logs) {
          await SystemLog.delete(log.id);
        }
      }
      toast.success('Logs cleared');
      await loadLogs();
    } catch (error) {
      console.error('Failed to clear logs:', error);
      toast.error('Failed to clear logs');
    } finally {
      setClearing(false);
    }
  };

  const handleAddTestLog = async () => {
    const tenantId = selectedTenantId || 'local-tenant-001';
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
                      <span className="text-xs text-slate-500">
                        {new Date(log.created_date).toLocaleString()}
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