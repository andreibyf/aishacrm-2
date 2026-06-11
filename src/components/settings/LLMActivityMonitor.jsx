/**
 * LLM Activity Monitor
 *
 * Three tabs:
 *  1. Activity Log  — rolling buffer of individual LLM calls
 *  2. By Model      — per-model call counts, latency percentiles, token totals
 *  3. Audit Log     — Kafka-style req/resp metadata (no raw message content)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { BACKEND_URL } from '@/api/entities';
import {
  RefreshCw,
  Trash2,
  Filter,
  Activity,
  AlertCircle,
  CheckCircle,
  ArrowRightLeft,
  BarChart2,
  List,
} from 'lucide-react';

// ── Colour maps ──────────────────────────────────────────────────────────────

const PROVIDER_COLORS = {
  openai: 'bg-green-600',
  anthropic: 'bg-orange-600',
  groq: 'bg-purple-600',
  local: 'bg-blue-600',
  'litellm-virtual': 'bg-cyan-600',
  unknown: 'bg-gray-600',
};

const STATUS_COLORS = {
  success: 'bg-green-600',
  error: 'bg-red-600',
  failover: 'bg-yellow-600',
};

const STATUS_ICONS = {
  success: CheckCircle,
  error: AlertCircle,
  failover: ArrowRightLeft,
};

// ── Formatters ───────────────────────────────────────────────────────────────

function formatDuration(ms) {
  if (ms == null) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatTimestamp(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  if (isToday) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  return (
    d.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  );
}

function formatTokens(usage) {
  if (!usage) return '-';
  const { prompt_tokens, completion_tokens, total_tokens } = usage;
  if (total_tokens) return `${total_tokens}`;
  if (prompt_tokens || completion_tokens) return `${prompt_tokens || 0}/${completion_tokens || 0}`;
  return '-';
}

function latencyClass(ms) {
  if (ms == null) return '';
  if (ms > 5000) return 'text-red-400';
  if (ms > 3000) return 'text-yellow-400';
  return '';
}

function pct(value, total) {
  if (!total) return '0%';
  return `${Math.round((value / total) * 100)}%`;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function LLMActivityMonitor() {
  // ── Tab ──
  const [activeTab, setActiveTab] = useState('activity');

  // ── Activity Log state ──
  const [entries, setEntries] = useState([]);
  const [stats, setStats] = useState(null);
  const [filters, setFilters] = useState({ provider: '', capability: '', status: '' });
  const [showFilters, setShowFilters] = useState(false);
  const lastTimestamp = useRef(null);

  // ── By-Model state ──
  const [byModelData, setByModelData] = useState(null);

  // ── Audit Log state ──
  const [auditEntries, setAuditEntries] = useState([]);
  const [auditStats, setAuditStats] = useState(null);
  const [auditModels, setAuditModels] = useState([]);
  const [auditFilters, setAuditFilters] = useState({ model: '', status: '' });

  // ── Shared ──
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const refreshInterval = 3000;

  // ── Fetchers ─────────────────────────────────────────────────────────────

  const fetchActivity = useCallback(
    async (incremental = false) => {
      try {
        const params = new URLSearchParams();
        params.set('limit', '100');
        if (filters.provider) params.set('provider', filters.provider);
        if (filters.capability) params.set('capability', filters.capability);
        if (filters.status) params.set('status', filters.status);
        if (incremental && lastTimestamp.current) params.set('since', lastTimestamp.current);

        const res = await fetch(`${BACKEND_URL}/api/system/llm-activity?${params}`);
        if (!res.ok) throw new Error('Failed to fetch LLM activity');
        const data = await res.json();
        const newEntries = data.data || [];

        if (incremental && newEntries.length > 0) {
          setEntries((prev) => {
            const combined = [...newEntries, ...prev];
            const seen = new Set();
            return combined
              .filter((e) => {
                if (seen.has(e.id)) return false;
                seen.add(e.id);
                return true;
              })
              .slice(0, 200);
          });
        } else if (!incremental) {
          setEntries(newEntries);
        }

        if (newEntries.length > 0) lastTimestamp.current = newEntries[0].timestamp;
      } catch (err) {
        console.error('[LLMActivityMonitor] Fetch error:', err);
      }
    },
    [filters],
  );

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/system/llm-activity/stats`);
      if (!res.ok) throw new Error('Failed to fetch stats');
      const data = await res.json();
      setStats(data.data || null);
    } catch (err) {
      console.error('[LLMActivityMonitor] Stats error:', err);
    }
  }, []);

  const fetchByModel = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/system/llm-stats/by-model`);
      if (!res.ok) throw new Error('Failed to fetch by-model stats');
      const data = await res.json();
      setByModelData(data.data || null);
    } catch (err) {
      console.error('[LLMActivityMonitor] By-model error:', err);
    }
  }, []);

  const fetchAudit = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.set('limit', '100');
      if (auditFilters.model) params.set('model', auditFilters.model);
      if (auditFilters.status) params.set('status', auditFilters.status);

      const [auditRes, modelsRes] = await Promise.all([
        fetch(`${BACKEND_URL}/api/system/llm-audit?${params}`),
        fetch(`${BACKEND_URL}/api/system/llm-audit?limit=0`), // models come in the meta
      ]);
      if (!auditRes.ok) throw new Error('Failed to fetch audit log');
      const auditData = await auditRes.json();
      setAuditEntries(auditData.data || []);
      setAuditModels(auditData.models || []);
      setAuditStats(auditData.stats || null);
    } catch (err) {
      console.error('[LLMActivityMonitor] Audit error:', err);
    }
  }, [auditFilters]);

  const clearLogs = async () => {
    setLoading(true);
    try {
      await fetch(`${BACKEND_URL}/api/system/llm-activity`, { method: 'DELETE' });
      setEntries([]);
      lastTimestamp.current = null;
      await Promise.all([fetchStats(), fetchByModel()]);
    } catch (err) {
      console.error('[LLMActivityMonitor] Clear error:', err);
    } finally {
      setLoading(false);
    }
  };

  const clearAudit = async () => {
    setLoading(true);
    try {
      await fetch(`${BACKEND_URL}/api/system/llm-audit`, { method: 'DELETE' });
      setAuditEntries([]);
      setAuditStats(null);
    } catch (err) {
      console.error('[LLMActivityMonitor] Clear audit error:', err);
    } finally {
      setLoading(false);
    }
  };

  const refresh = useCallback(async () => {
    setLoading(true);
    lastTimestamp.current = null;
    await Promise.all([fetchActivity(false), fetchStats(), fetchByModel(), fetchAudit()]);
    setLoading(false);
  }, [fetchActivity, fetchStats, fetchByModel, fetchAudit]);

  // Initial load
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchActivity(true);
      fetchStats();
      fetchByModel();
      fetchAudit();
    }, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchActivity, fetchStats, fetchByModel, fetchAudit]);

  // Re-fetch audit when filters change
  useEffect(() => {
    fetchAudit();
  }, [fetchAudit]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* ── Stats overview (always visible) ─────────────────────────────── */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <Card className="bg-card/50">
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Total Logged</div>
              <div className="text-2xl font-bold">{stats.totalEntries}</div>
            </CardContent>
          </Card>
          <Card className="bg-card/50">
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Last 5 Min</div>
              <div className="text-2xl font-bold">{stats.last5Minutes}</div>
            </CardContent>
          </Card>
          <Card className="bg-card/50">
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Req/Min</div>
              <div className="text-2xl font-bold">
                {stats.requestsPerMinute != null ? stats.requestsPerMinute.toFixed(1) : '-'}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card/50">
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Avg Duration</div>
              <div className="text-2xl font-bold">{formatDuration(stats.avgDurationMs)}</div>
            </CardContent>
          </Card>
          <Card className="bg-card/50 col-span-2">
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground mb-1">By Status</div>
              <div className="flex flex-wrap gap-1">
                {stats.allTime?.byStatus &&
                  Object.entries(stats.allTime.byStatus).map(([status, count]) => (
                    <Badge
                      key={status}
                      className={`${STATUS_COLORS[status] || 'bg-gray-600'} text-white text-xs`}
                    >
                      {status}: {count}
                    </Badge>
                  ))}
              </div>
            </CardContent>
          </Card>
          {stats.tokenUsage?.allTime && (
            <>
              <Card className="bg-card/50 col-span-2">
                <CardContent className="p-3">
                  <div className="text-xs text-muted-foreground mb-1">Tokens (buffer)</div>
                  <div className="font-mono text-sm">
                    <span className="text-blue-400">
                      ↑{stats.tokenUsage.allTime.promptTokens?.toLocaleString()}
                    </span>
                    {' / '}
                    <span className="text-green-400">
                      ↓{stats.tokenUsage.allTime.completionTokens?.toLocaleString()}
                    </span>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-card/50 col-span-2">
                <CardContent className="p-3">
                  <div className="text-xs text-muted-foreground">Est. Cost</div>
                  <div className="text-lg font-bold text-yellow-400">
                    ${stats.tokenUsage.allTime.estimatedCostUSD?.toFixed(4) ?? '0.0000'}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}

      {/* ── Tab navigation ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-border pb-0">
        <div className="flex gap-0">
          {[
            { id: 'activity', label: 'Activity Log', icon: List },
            { id: 'by-model', label: 'By Model', icon: BarChart2 },
            { id: 'audit', label: 'Audit Log', icon: Activity },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Global controls */}
        <div className="flex items-center gap-2 pb-2">
          <div className="flex items-center gap-1.5">
            <Switch
              id="auto-refresh"
              checked={autoRefresh}
              onCheckedChange={setAutoRefresh}
              className="scale-75"
            />
            <Label htmlFor="auto-refresh" className="text-xs text-muted-foreground cursor-pointer">
              Auto
            </Label>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={loading}
            className="h-7 px-2 text-xs"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          {activeTab === 'activity' && (
            <Button
              variant="outline"
              size="sm"
              onClick={clearLogs}
              disabled={loading}
              className="h-7 px-2 text-xs text-red-400 hover:text-red-300"
            >
              <Trash2 className="w-3 h-3 mr-1" /> Clear
            </Button>
          )}
          {activeTab === 'audit' && (
            <Button
              variant="outline"
              size="sm"
              onClick={clearAudit}
              disabled={loading}
              className="h-7 px-2 text-xs text-red-400 hover:text-red-300"
            >
              <Trash2 className="w-3 h-3 mr-1" /> Clear
            </Button>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          TAB: Activity Log
      ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'activity' && (
        <>
          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="h-7 px-2 text-xs"
            >
              <Filter className="w-3 h-3 mr-1" />
              Filters {showFilters ? '▲' : '▼'}
            </Button>
            {(filters.provider || filters.capability || filters.status) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFilters({ provider: '', capability: '', status: '' })}
                className="h-7 px-2 text-xs text-muted-foreground"
              >
                Clear
              </Button>
            )}
            <span className="text-xs text-muted-foreground ml-auto">{entries.length} entries</span>
          </div>

          {showFilters && (
            <div className="flex gap-2 flex-wrap p-3 bg-muted/20 rounded-lg border border-border">
              {[
                {
                  key: 'provider',
                  label: 'Provider',
                  options: ['openai', 'anthropic', 'groq', 'local', 'litellm-virtual'],
                },
                {
                  key: 'capability',
                  label: 'Capability',
                  options: [
                    'chat_tools',
                    'json_strict',
                    'brain_read_only',
                    'brain_plan_actions',
                    'virtual',
                    'task_worker',
                  ],
                },
                { key: 'status', label: 'Status', options: ['success', 'error', 'failover'] },
              ].map(({ key, label, options }) => (
                <div key={key} className="flex items-center gap-1.5">
                  <Label className="text-xs">{label}:</Label>
                  <Select
                    value={filters[key] || 'all'}
                    onValueChange={(v) =>
                      setFilters((f) => ({ ...f, [key]: v === 'all' ? '' : v }))
                    }
                  >
                    <SelectTrigger className="h-7 w-36 text-xs">
                      <SelectValue placeholder={`All ${label}s`} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      {options.map((o) => (
                        <SelectItem key={o} value={o}>
                          {o}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          )}

          {/* Activity table */}
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Date/Time</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                    <th className="px-3 py-2 text-left font-medium">Provider</th>
                    <th className="px-3 py-2 text-left font-medium">Model</th>
                    <th className="px-3 py-2 text-left font-medium">Capability</th>
                    <th className="px-3 py-2 text-left font-medium">Intent</th>
                    <th className="px-3 py-2 text-left font-medium">Tools Called</th>
                    <th className="px-3 py-2 text-left font-medium">Node ID</th>
                    <th className="px-3 py-2 text-left font-medium">Tenant</th>
                    <th className="px-3 py-2 text-right font-medium">Duration</th>
                    <th className="px-3 py-2 text-right font-medium">Tokens</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {entries.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="px-3 py-8 text-center text-muted-foreground">
                        <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <div>No LLM activity recorded yet.</div>
                        <div className="text-xs mt-1">
                          Activity will appear here as AI features are used.
                        </div>
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
                            <Badge
                              className={`${STATUS_COLORS[entry.status] || 'bg-gray-600'} text-white text-xs`}
                            >
                              <StatusIcon className="w-3 h-3 mr-1" />
                              {entry.status}
                            </Badge>
                          </td>
                          <td className="px-3 py-2">
                            <Badge
                              className={`${PROVIDER_COLORS[entry.provider] || PROVIDER_COLORS.unknown} text-white text-xs`}
                            >
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
                            {entry.intent ? (
                              <Badge
                                variant="outline"
                                className="text-xs font-mono bg-blue-950/30 border-blue-600/50"
                              >
                                {entry.intent}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {entry.toolsCalled?.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {entry.toolsCalled.map((tool, idx) => (
                                  <Badge key={idx} variant="outline" className="text-xs font-mono">
                                    {tool}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <span className="font-mono text-xs text-muted-foreground">
                              {entry.nodeId || '-'}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <span className="font-mono text-xs text-muted-foreground">
                              {entry.tenantId?.slice(0, 8) || '-'}…
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <span className={`font-mono text-xs ${latencyClass(entry.durationMs)}`}>
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

          {/* Error panel */}
          {entries.some((e) => e.status === 'error' && e.error) && (
            <Card className="border-red-500/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500" />
                  Recent Errors
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {entries
                  .filter((e) => e.status === 'error' && e.error)
                  .slice(0, 5)
                  .map((e) => (
                    <div
                      key={e.id}
                      className="text-xs p-2 bg-red-950/30 rounded border border-red-900/50"
                    >
                      <div className="font-mono text-muted-foreground mb-1">
                        {formatTimestamp(e.timestamp)} | {e.provider}:{e.model} | {e.nodeId}
                      </div>
                      <div className="text-red-400">{e.error}</div>
                    </div>
                  ))}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB: By Model
      ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'by-model' && (
        <>
          {!byModelData || Object.keys(byModelData).length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <BarChart2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <div>No per-model data yet.</div>
              <div className="text-xs mt-1">Make some AI calls and refresh.</div>
            </div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Model</th>
                      <th className="px-3 py-2 text-right font-medium">Calls</th>
                      <th className="px-3 py-2 text-right font-medium">Errors</th>
                      <th className="px-3 py-2 text-right font-medium">Err %</th>
                      <th className="px-3 py-2 text-right font-medium">Avg</th>
                      <th className="px-3 py-2 text-right font-medium">P50</th>
                      <th className="px-3 py-2 text-right font-medium">P95</th>
                      <th className="px-3 py-2 text-right font-medium">P99</th>
                      <th className="px-3 py-2 text-right font-medium">Max</th>
                      <th className="px-3 py-2 text-right font-medium">Prompt tok</th>
                      <th className="px-3 py-2 text-right font-medium">Compl tok</th>
                      <th className="px-3 py-2 text-right font-medium">Total tok</th>
                      <th className="px-3 py-2 text-right font-medium">Est. cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {Object.entries(byModelData)
                      .sort(([, a], [, b]) => b.count - a.count)
                      .map(([model, m]) => (
                        <tr key={model} className="hover:bg-muted/30 transition-colors">
                          <td className="px-3 py-2">
                            <span className="font-mono font-medium">{model}</span>
                          </td>
                          <td className="px-3 py-2 text-right font-mono">{m.count}</td>
                          <td className="px-3 py-2 text-right font-mono">
                            <span
                              className={m.errors > 0 ? 'text-red-400' : 'text-muted-foreground'}
                            >
                              {m.errors}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            <span
                              className={
                                m.errorRate > 0.1
                                  ? 'text-red-400'
                                  : m.errorRate > 0
                                    ? 'text-yellow-400'
                                    : 'text-muted-foreground'
                              }
                            >
                              {(m.errorRate * 100).toFixed(1)}%
                            </span>
                          </td>
                          <td
                            className={`px-3 py-2 text-right font-mono ${latencyClass(m.latency.avg_ms)}`}
                          >
                            {formatDuration(m.latency.avg_ms)}
                          </td>
                          <td
                            className={`px-3 py-2 text-right font-mono ${latencyClass(m.latency.p50_ms)}`}
                          >
                            {formatDuration(m.latency.p50_ms)}
                          </td>
                          <td
                            className={`px-3 py-2 text-right font-mono ${latencyClass(m.latency.p95_ms)}`}
                          >
                            {formatDuration(m.latency.p95_ms)}
                          </td>
                          <td
                            className={`px-3 py-2 text-right font-mono ${latencyClass(m.latency.p99_ms)}`}
                          >
                            {formatDuration(m.latency.p99_ms)}
                          </td>
                          <td
                            className={`px-3 py-2 text-right font-mono ${latencyClass(m.latency.max_ms)}`}
                          >
                            {formatDuration(m.latency.max_ms)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-blue-400">
                            {m.tokens.prompt?.toLocaleString() ?? '-'}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-green-400">
                            {m.tokens.completion?.toLocaleString() ?? '-'}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                            {m.tokens.total?.toLocaleString() ?? '-'}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-yellow-400">
                            ${m.estimatedCostUSD?.toFixed(4) ?? '0.0000'}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Sample-count note */}
          {byModelData && Object.keys(byModelData).length > 0 && (
            <div className="text-xs text-muted-foreground text-right">
              Latency percentiles computed from last 200 samples per model. Resets on backend
              restart.
            </div>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB: Audit Log  (Kafka-style req/resp metadata)
      ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'audit' && (
        <>
          {/* Audit meta cards */}
          {auditStats && (
            <div className="flex gap-3 flex-wrap">
              <Card className="bg-card/50">
                <CardContent className="p-3">
                  <div className="text-xs text-muted-foreground">Ring size</div>
                  <div className="text-lg font-bold">
                    {auditStats.ringSize} / {auditStats.ringCap}
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-card/50">
                <CardContent className="p-3">
                  <div className="text-xs text-muted-foreground">File log</div>
                  <div className="text-sm font-medium">
                    {auditStats.fileEnabled ? (
                      <span className="text-green-400">enabled → {auditStats.filePath}</span>
                    ) : (
                      <span className="text-muted-foreground">disabled</span>
                    )}
                  </div>
                </CardContent>
              </Card>
              {auditStats.lastFileError && (
                <Card className="bg-card/50 border-red-500/50">
                  <CardContent className="p-3">
                    <div className="text-xs text-muted-foreground">Last file error</div>
                    <div className="text-xs text-red-400 font-mono">{auditStats.lastFileError}</div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Audit filters */}
          <div className="flex items-center gap-2 flex-wrap">
            {[
              { key: 'model', label: 'Model', options: auditModels },
              { key: 'status', label: 'Status', options: ['success', 'error'] },
            ].map(({ key, label, options }) => (
              <div key={key} className="flex items-center gap-1.5">
                <Label className="text-xs">{label}:</Label>
                <Select
                  value={auditFilters[key] || 'all'}
                  onValueChange={(v) =>
                    setAuditFilters((f) => ({ ...f, [key]: v === 'all' ? '' : v }))
                  }
                >
                  <SelectTrigger className="h-7 w-44 text-xs">
                    <SelectValue placeholder={`All ${label}s`} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {options.map((o) => (
                      <SelectItem key={o} value={o}>
                        {o}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
            <span className="text-xs text-muted-foreground ml-auto">
              {auditEntries.length} entries
            </span>
          </div>

          {/* Audit table */}
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Timestamp</th>
                    <th className="px-3 py-2 text-left font-medium">Model</th>
                    <th className="px-3 py-2 text-left font-medium">Provider</th>
                    <th className="px-3 py-2 text-left font-medium">Env</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                    <th className="px-3 py-2 text-right font-medium">Duration</th>
                    <th className="px-3 py-2 text-right font-medium">Msgs</th>
                    <th className="px-3 py-2 text-right font-medium">Req chars</th>
                    <th className="px-3 py-2 text-left font-medium">Req snippet</th>
                    <th className="px-3 py-2 text-left font-medium">Resp snippet</th>
                    <th className="px-3 py-2 text-right font-medium">Tok in/out</th>
                    <th className="px-3 py-2 text-left font-medium">Node</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {auditEntries.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="px-3 py-8 text-center text-muted-foreground">
                        <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <div>No audit entries yet.</div>
                        <div className="text-xs mt-1">
                          Entries are captured from litellmClient and taskWorkers. Enable{' '}
                          <code className="bg-muted px-1 rounded">LLM_AUDIT_ENABLED=true</code> for
                          NDJSON file logging.
                        </div>
                      </td>
                    </tr>
                  ) : (
                    auditEntries.map((entry) => {
                      const StatusIcon = STATUS_ICONS[entry.status] || Activity;
                      return (
                        <tr
                          key={entry.id}
                          className="hover:bg-muted/30 transition-colors align-top"
                        >
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className="font-mono text-muted-foreground">
                              {formatTimestamp(entry.ts)}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <span className="font-mono font-medium">{entry.model || '-'}</span>
                          </td>
                          <td className="px-3 py-2">
                            <Badge
                              className={`${PROVIDER_COLORS[entry.provider] || PROVIDER_COLORS.unknown} text-white text-xs`}
                            >
                              {entry.provider || '?'}
                            </Badge>
                          </td>
                          <td className="px-3 py-2">
                            <span className="font-mono text-muted-foreground">
                              {entry.env || '-'}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <Badge
                              className={`${STATUS_COLORS[entry.status] || 'bg-gray-600'} text-white text-xs`}
                            >
                              <StatusIcon className="w-3 h-3 mr-1" />
                              {entry.status}
                            </Badge>
                            {entry.error && (
                              <div
                                className="text-red-400 mt-0.5 font-mono text-xs truncate max-w-[120px]"
                                title={entry.error}
                              >
                                {entry.error}
                              </div>
                            )}
                          </td>
                          <td
                            className={`px-3 py-2 text-right font-mono ${latencyClass(entry.duration_ms)}`}
                          >
                            {formatDuration(entry.duration_ms)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                            {entry.req_msg_count ?? '-'}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                            {entry.req_chars != null ? entry.req_chars.toLocaleString() : '-'}
                          </td>
                          <td className="px-3 py-2 max-w-[200px]">
                            {entry.req_snippet ? (
                              <span
                                className="text-muted-foreground italic truncate block"
                                title={entry.req_snippet}
                              >
                                {entry.req_snippet}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="px-3 py-2 max-w-[200px]">
                            {entry.resp_snippet ? (
                              <span
                                className="text-blue-300 truncate block"
                                title={entry.resp_snippet}
                              >
                                {entry.resp_snippet}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-muted-foreground whitespace-nowrap">
                            {entry.usage ? (
                              <>
                                <span className="text-blue-400">
                                  {entry.usage.prompt_tokens ?? 0}
                                </span>
                                {' / '}
                                <span className="text-green-400">
                                  {entry.usage.completion_tokens ?? 0}
                                </span>
                              </>
                            ) : (
                              '-'
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <span className="font-mono text-muted-foreground text-xs">
                              {entry.node_id || '-'}
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
        </>
      )}
    </div>
  );
}
