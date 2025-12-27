/**
 * LLM Activity Monitor
 * 
 * Real-time view of all LLM calls showing:
 * - Tenant ID, Capability, Provider, Model, Node ID
 * - Status, Duration, Token Usage
 * - Auto-refresh with polling
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { BACKEND_URL } from "@/api/entities";
import {
  RefreshCw,
  Trash2,
  Filter,
  Activity,
  AlertCircle,
  CheckCircle,
  ArrowRightLeft,
} from "lucide-react";

const PROVIDER_COLORS = {
  openai: "bg-green-600",
  anthropic: "bg-orange-600",
  groq: "bg-purple-600",
  local: "bg-blue-600",
  unknown: "bg-gray-600",
};

const STATUS_COLORS = {
  success: "bg-green-600",
  error: "bg-red-600",
  failover: "bg-yellow-600",
};

const STATUS_ICONS = {
  success: CheckCircle,
  error: AlertCircle,
  failover: ArrowRightLeft,
};

function formatDuration(ms) {
  if (!ms) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatTimestamp(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  
  // Show date if not today, otherwise just time
  if (isToday) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + 
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatTokens(usage) {
  if (!usage) return "-";
  const { prompt_tokens, completion_tokens, total_tokens } = usage;
  if (total_tokens) return `${total_tokens} tokens`;
  if (prompt_tokens || completion_tokens) {
    return `${prompt_tokens || 0}/${completion_tokens || 0}`;
  }
  return "-";
}

export default function LLMActivityMonitor() {
  const [entries, setEntries] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(3000);
  const [filters, setFilters] = useState({
    provider: "",
    capability: "",
    status: "",
  });
  const [showFilters, setShowFilters] = useState(false);
  const lastTimestamp = useRef(null);

  const fetchActivity = useCallback(async (incremental = false) => {
    try {
      const params = new URLSearchParams();
      params.set("limit", "100");
      
      if (filters.provider) params.set("provider", filters.provider);
      if (filters.capability) params.set("capability", filters.capability);
      if (filters.status) params.set("status", filters.status);
      
      // Incremental fetch: only get entries since last fetch
      if (incremental && lastTimestamp.current) {
        params.set("since", lastTimestamp.current);
      }
      
      const response = await fetch(`${BACKEND_URL}/api/system/llm-activity?${params}`);
      if (!response.ok) throw new Error("Failed to fetch LLM activity");
      
      const data = await response.json();
      const newEntries = data.data || [];
      
      if (incremental && newEntries.length > 0) {
        // Merge new entries at the top
        setEntries((prev) => {
          const combined = [...newEntries, ...prev];
          // Dedupe by id and limit to 200 entries
          const seen = new Set();
          return combined.filter((e) => {
            if (seen.has(e.id)) return false;
            seen.add(e.id);
            return true;
          }).slice(0, 200);
        });
      } else if (!incremental) {
        setEntries(newEntries);
      }
      
      // Update last timestamp for incremental fetches
      if (newEntries.length > 0) {
        lastTimestamp.current = newEntries[0].timestamp;
      }
    } catch (err) {
      console.error("[LLMActivityMonitor] Fetch error:", err);
    }
  }, [filters]);

  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/system/llm-activity/stats`);
      if (!response.ok) throw new Error("Failed to fetch LLM stats");
      
      const data = await response.json();
      setStats(data.data || null);
    } catch (err) {
      console.error("[LLMActivityMonitor] Stats error:", err);
    }
  }, []);

  const clearLogs = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${BACKEND_URL}/api/system/llm-activity`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to clear logs");
      
      setEntries([]);
      lastTimestamp.current = null;
      await fetchStats();
    } catch (err) {
      console.error("[LLMActivityMonitor] Clear error:", err);
    } finally {
      setLoading(false);
    }
  };

  const refresh = useCallback(async () => {
    setLoading(true);
    lastTimestamp.current = null;
    await Promise.all([fetchActivity(false), fetchStats()]);
    setLoading(false);
  }, [fetchActivity, fetchStats]);

  // Initial load
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Auto-refresh polling
  useEffect(() => {
    if (!autoRefresh) return;
    
    const interval = setInterval(() => {
      fetchActivity(true);
      fetchStats();
    }, refreshInterval);
    
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, fetchActivity, fetchStats]);

  return (
    <div className="space-y-4">
      {/* Stats Overview */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <Card className="bg-card/50">
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Total Logged</div>
              <div className="text-xl font-bold">{stats.totalEntries}</div>
            </CardContent>
          </Card>
          <Card className="bg-card/50">
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Last 5 Min</div>
              <div className="text-xl font-bold">{stats.last5Minutes}</div>
            </CardContent>
          </Card>
          <Card className="bg-card/50">
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Req/Min</div>
              <div className="text-xl font-bold">{stats.requestsPerMinute}</div>
            </CardContent>
          </Card>
          <Card className="bg-card/50">
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Avg Duration</div>
              <div className="text-xl font-bold">{formatDuration(stats.avgDurationMs)}</div>
            </CardContent>
          </Card>
          <Card className="bg-card/50">
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">By Provider</div>
              <div className="flex flex-wrap gap-1 mt-1">
                {Object.entries(stats.byProvider || {}).map(([p, count]) => (
                  <Badge key={p} variant="outline" className="text-xs">
                    {p}: {count}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card/50">
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">By Status</div>
              <div className="flex flex-wrap gap-1 mt-1">
                {Object.entries(stats.byStatus || {}).map(([s, count]) => (
                  <Badge key={s} variant="outline" className={`text-xs ${s === "error" ? "border-red-500" : s === "failover" ? "border-yellow-500" : ""}`}>
                    {s}: {count}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card/50">
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Tokens (5 min)</div>
              <div className="text-xl font-bold">
                {stats.tokenUsage?.last5Minutes?.totalTokens?.toLocaleString() || 0}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {stats.tokenUsage?.last5Minutes?.promptTokens?.toLocaleString() || 0} in / {stats.tokenUsage?.last5Minutes?.completionTokens?.toLocaleString() || 0} out
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card/50">
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Tokens (buffer)</div>
              <div className="text-xl font-bold">
                {stats.tokenUsage?.allTime?.totalTokens?.toLocaleString() || 0}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {stats.tokenUsage?.allTime?.entriesInBuffer || 0} entries
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Switch
            id="auto-refresh"
            checked={autoRefresh}
            onCheckedChange={setAutoRefresh}
          />
          <Label htmlFor="auto-refresh" className="text-sm">
            Auto-refresh
          </Label>
          {autoRefresh && (
            <span className="text-xs text-muted-foreground">
              ({refreshInterval / 1000}s)
            </span>
          )}
        </div>
        
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
        
        <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)}>
          <Filter className="w-4 h-4 mr-1" />
          Filters
        </Button>
        
        <Button variant="outline" size="sm" onClick={clearLogs} disabled={loading}>
          <Trash2 className="w-4 h-4 mr-1" />
          Clear Logs
        </Button>
        
        <div className="flex-1" />
        
        <div className="text-sm text-muted-foreground">
          {entries.length} entries
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="flex flex-wrap gap-3 p-3 bg-muted/30 rounded-lg">
          <div className="flex items-center gap-2">
            <Label className="text-xs">Provider:</Label>
            <Select
              value={filters.provider}
              onValueChange={(v) => setFilters((f) => ({ ...f, provider: v === "all" ? "" : v }))}
            >
              <SelectTrigger className="w-32 h-8">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="openai">OpenAI</SelectItem>
                <SelectItem value="anthropic">Anthropic</SelectItem>
                <SelectItem value="groq">Groq</SelectItem>
                <SelectItem value="local">Local</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex items-center gap-2">
            <Label className="text-xs">Capability:</Label>
            <Select
              value={filters.capability}
              onValueChange={(v) => setFilters((f) => ({ ...f, capability: v === "all" ? "" : v }))}
            >
              <SelectTrigger className="w-36 h-8">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="chat_tools">chat_tools</SelectItem>
                <SelectItem value="chat_light">chat_light</SelectItem>
                <SelectItem value="json_strict">json_strict</SelectItem>
                <SelectItem value="brain_read_only">brain_read_only</SelectItem>
                <SelectItem value="brain_plan_actions">brain_plan_actions</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex items-center gap-2">
            <Label className="text-xs">Status:</Label>
            <Select
              value={filters.status}
              onValueChange={(v) => setFilters((f) => ({ ...f, status: v === "all" ? "" : v }))}
            >
              <SelectTrigger className="w-28 h-8">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="error">Error</SelectItem>
                <SelectItem value="failover">Failover</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFilters({ provider: "", capability: "", status: "" });
              refresh();
            }}
          >
            Reset
          </Button>
        </div>
      )}

      {/* Activity Log Table */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Date/Time</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-left font-medium">Provider</th>
                <th className="px-3 py-2 text-left font-medium">Model</th>
                <th className="px-3 py-2 text-left font-medium">Capability</th>
                <th className="px-3 py-2 text-left font-medium">Node ID</th>
                <th className="px-3 py-2 text-left font-medium">Tenant</th>
                <th className="px-3 py-2 text-right font-medium">Duration</th>
                <th className="px-3 py-2 text-right font-medium">Tokens</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                    <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <div>No LLM activity recorded yet.</div>
                    <div className="text-xs mt-1">Activity will appear here as AI features are used.</div>
                  </td>
                </tr>
              ) : (
                entries.map((entry) => {
                  const StatusIcon = STATUS_ICONS[entry.status] || Activity;
                  return (
                    <tr key={entry.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="font-mono text-xs text-muted-foreground">
                          {formatTimestamp(entry.timestamp)}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <Badge className={`${STATUS_COLORS[entry.status] || "bg-gray-600"} text-white text-xs`}>
                          <StatusIcon className="w-3 h-3 mr-1" />
                          {entry.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        <Badge className={`${PROVIDER_COLORS[entry.provider] || PROVIDER_COLORS.unknown} text-white text-xs`}>
                          {entry.provider}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        <span className="font-mono text-xs">{entry.model}</span>
                      </td>
                      <td className="px-3 py-2">
                        <span className="text-xs">{entry.capability}</span>
                      </td>
                      <td className="px-3 py-2">
                        <span className="font-mono text-xs text-muted-foreground">
                          {entry.nodeId || "-"}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span className="font-mono text-xs text-muted-foreground">
                          {entry.tenantId?.slice(0, 8) || "-"}...
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className={`font-mono text-xs ${entry.durationMs > 3000 ? "text-yellow-500" : entry.durationMs > 5000 ? "text-red-500" : ""}`}>
                          {formatDuration(entry.durationMs)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className="font-mono text-xs text-muted-foreground">
                          {formatTokens(entry.usage)}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Error Details (if any errors visible) */}
      {entries.some((e) => e.status === "error" && e.error) && (
        <Card className="border-red-500/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-500" />
              Recent Errors
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {entries
              .filter((e) => e.status === "error" && e.error)
              .slice(0, 5)
              .map((e) => (
                <div key={e.id} className="text-xs p-2 bg-red-950/30 rounded border border-red-900/50">
                  <div className="font-mono text-muted-foreground mb-1">
                    {formatTimestamp(e.timestamp)} | {e.provider}:{e.model} | {e.nodeId}
                  </div>
                  <div className="text-red-400">{e.error}</div>
                </div>
              ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
