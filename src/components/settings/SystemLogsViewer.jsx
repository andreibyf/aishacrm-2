import React, { useState, useEffect } from 'react';
import { SystemLog } from '@/api/entities';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Loader2, RefreshCw, Trash2, Search, Filter } from "lucide-react";
import { toast } from "sonner";

export default function SystemLogsViewer() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterLevel, setFilterLevel] = useState('all');
  const [filterSource, setFilterSource] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [uniqueSources, setUniqueSources] = useState([]);

  const loadLogs = async () => {
    setLoading(true);
    try {
      let allLogs = await SystemLog.list('-created_date', 200);
      
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
  };

  useEffect(() => {
    loadLogs();
  }, [filterLevel, filterSource, searchTerm]);

  const handleClearLogs = async () => {
    if (!confirm('Are you sure you want to delete all logs? This action cannot be undone.')) {
      return;
    }

    try {
      // Delete all logs (you might want to add a backend function for this)
      for (const log of logs) {
        await SystemLog.delete(log.id);
      }
      toast.success('All logs cleared');
      loadLogs();
    } catch (error) {
      console.error('Failed to clear logs:', error);
      toast.error('Failed to clear logs');
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
              variant="destructive"
              onClick={handleClearLogs}
              disabled={loading || logs.length === 0}
              className="bg-red-600 hover:bg-red-700"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Clear All
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
    </div>
  );
}