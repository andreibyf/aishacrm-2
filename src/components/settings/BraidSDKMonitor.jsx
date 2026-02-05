/**
 * Braid SDK Monitor
 * 
 * Dashboard for monitoring AI tool execution metrics, health scores,
 * and dependency graph visualization.
 */

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  Activity,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Zap,
  Database,
  GitBranch,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Server,
  ChevronRight,
  Loader2
} from 'lucide-react';
import { BACKEND_URL } from '@/api/entities';

// Helper to fetch with auth
async function fetchWithAuth(endpoint) {
  const token = localStorage.getItem('supabase_access_token') || 
                sessionStorage.getItem('supabase_access_token');
  
  const response = await fetch(`${BACKEND_URL}${endpoint}`, {
    credentials: 'include', // Include cookies for session auth
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  if (!response.ok) {
    // Try to parse error message from response
    let errorMessage = `API error: ${response.status}`;
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorData.message || errorMessage;
    } catch {
      // Ignore JSON parse errors
    }
    
    if (response.status === 401) {
      errorMessage = 'Authentication required. Please log in again.';
    } else if (response.status === 403) {
      errorMessage = 'Admin access required for this feature.';
    }
    
    throw new Error(errorMessage);
  }
  
  return response.json();
}

// Health status badge component
function HealthBadge({ status, score }) {
  const variants = {
    healthy: { color: 'bg-green-500/10 text-green-500 border-green-500/20', icon: CheckCircle2 },
    degraded: { color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20', icon: AlertTriangle },
    warning: { color: 'bg-orange-500/10 text-orange-500 border-orange-500/20', icon: AlertCircle },
    critical: { color: 'bg-red-500/10 text-red-500 border-red-500/20', icon: XCircle }
  };
  
  const variant = variants[status] || variants.healthy;
  const Icon = variant.icon;
  
  return (
    <Badge variant="outline" className={`${variant.color} gap-1`}>
      <Icon className="w-3 h-3" />
      {score !== undefined ? `${score}%` : status}
    </Badge>
  );
}

// Metric card component
function MetricCard({ title, value, subtitle, icon: Icon, trend, trendValue }) {
  return (
    <Card className="bg-card/50">
      <CardContent className="pt-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
          </div>
          <div className={`p-2 rounded-lg ${trend === 'up' ? 'bg-green-500/10' : trend === 'down' ? 'bg-red-500/10' : 'bg-muted'}`}>
            <Icon className={`w-5 h-5 ${trend === 'up' ? 'text-green-500' : trend === 'down' ? 'text-red-500' : 'text-muted-foreground'}`} />
          </div>
        </div>
        {trendValue && (
          <div className="flex items-center mt-2 text-xs">
            {trend === 'up' ? (
              <TrendingUp className="w-3 h-3 text-green-500 mr-1" />
            ) : (
              <TrendingDown className="w-3 h-3 text-red-500 mr-1" />
            )}
            <span className={trend === 'up' ? 'text-green-500' : 'text-red-500'}>{trendValue}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Tool row component for the table
function ToolRow({ tool, onClick }) {
  return (
    <div 
      className="flex items-center justify-between py-3 px-4 hover:bg-muted/50 cursor-pointer rounded-lg transition-colors"
      onClick={() => onClick(tool)}
    >
      <div className="flex items-center gap-3">
        <div className={`w-2 h-2 rounded-full ${
          (tool.healthStatus || tool.status) === 'healthy' ? 'bg-green-500' :
          (tool.healthStatus || tool.status) === 'degraded' ? 'bg-yellow-500' :
          (tool.healthStatus || tool.status) === 'warning' ? 'bg-orange-500' : 'bg-red-500'
        }`} />
        <div>
          <p className="font-medium text-sm">{(tool.name || tool.tool || 'Unknown').replace(/_/g, ' ')}</p>
          <p className="text-xs text-muted-foreground">{(tool.calls || tool.total || 0).toLocaleString()} calls</p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="text-sm">{(tool.successRate || 0).toFixed(1)}%</p>
          <p className="text-xs text-muted-foreground">{tool.avgLatencyMs || tool.avgLatency || 0}ms avg</p>
        </div>
        <HealthBadge status={tool.healthStatus || tool.status} score={tool.healthScore || tool.health} />
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
      </div>
    </div>
  );
}

// Category node for graph visualization
function CategoryNode({ category, tools, color }) {
  return (
    <div className="bg-card border rounded-lg p-3">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
        <span className="font-medium text-sm">{category}</span>
        <Badge variant="outline" className="ml-auto text-xs">{tools.length}</Badge>
      </div>
      <div className="space-y-1">
        {tools.slice(0, 5).map((tool, idx) => (
          <div key={tool.name || idx} className="text-xs text-muted-foreground truncate">
            {(tool.name || 'Unknown').replace(/_/g, ' ')}
          </div>
        ))}
        {tools.length > 5 && (
          <div className="text-xs text-muted-foreground">+{tools.length - 5} more</div>
        )}
      </div>
    </div>
  );
}

export default function BraidSDKMonitor() {
  const [activeTab, setActiveTab] = useState('realtime');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  
  // Data states
  const [realtimeMetrics, setRealtimeMetrics] = useState(null);
  const [toolMetrics, setToolMetrics] = useState(null);
  const [graphData, setGraphData] = useState(null);
  const [selectedTool, setSelectedTool] = useState(null);
  const [period, setPeriod] = useState('24h');
  
  // Fetch realtime metrics
  const fetchRealtime = useCallback(async () => {
    const data = await fetchWithAuth('/api/braid/metrics/realtime');
    setRealtimeMetrics(data);
  }, []);
  
  // Fetch tool metrics
  const fetchToolMetrics = useCallback(async () => {
    const data = await fetchWithAuth(`/api/braid/metrics/tools?period=${period}`);
    setToolMetrics(data);
  }, [period]);
  
  // Fetch graph data
  const fetchGraph = useCallback(async () => {
    const data = await fetchWithAuth('/api/braid/graph/categories');
    setGraphData(data);
  }, []);
  
  // Fetch tool impact when selected
  const fetchToolImpact = useCallback(async (tool) => {
    // Guard against undefined tool
    if (!tool) {
      console.warn('fetchToolImpact called with undefined tool');
      return;
    }
    
    const toolName = tool.name || tool.tool;
    if (!toolName) {
      console.warn('fetchToolImpact: tool has no name property');
      return;
    }
    
    // Immediately show the tool data we already have
    setSelectedTool({
      name: toolName,
      tool: toolName,
      ...tool,
    });
    
    // Then try to fetch additional impact data (optional)
    try {
      const data = await fetchWithAuth(`/api/braid/graph/tool/${toolName}/impact`);
      setSelectedTool(prev => ({ ...prev, ...data }));
    } catch (err) {
      console.warn('Could not fetch tool impact details:', err.message);
      // Don't clear selectedTool - keep the basic info visible
    }
  }, []);
  
  // Initial load
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        await Promise.all([fetchRealtime(), fetchToolMetrics(), fetchGraph()]);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [fetchRealtime, fetchToolMetrics, fetchGraph]);
  
  // Auto-refresh realtime every 30s
  useEffect(() => {
    const interval = setInterval(fetchRealtime, 30000);
    return () => clearInterval(interval);
  }, [fetchRealtime]);
  
  // Manual refresh
  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchRealtime(), fetchToolMetrics(), fetchGraph()]);
    setRefreshing(false);
  };
  
  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading Braid SDK metrics...</span>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <AlertCircle className="w-8 h-8 text-red-500 mb-2" />
        <p className="text-red-500 font-medium">Failed to load metrics</p>
        <p className="text-sm text-muted-foreground mt-1">{error}</p>
        <Button variant="outline" className="mt-4" onClick={handleRefresh}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }
  
  const rt = realtimeMetrics;
  const tm = toolMetrics;
  
  return (
    <div className="space-y-6">
      {/* Header with refresh */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">AI Tool Execution Metrics</h3>
          <p className="text-sm text-muted-foreground">
            Real-time monitoring of Braid SDK tool calls
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>
      
      {/* Real-time metrics cards */}
      {rt && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard
            title="Last Minute"
            value={rt.minute?.total || 0}
            subtitle="Tool calls"
            icon={Zap}
            trend={rt.minute?.total > 0 ? 'up' : undefined}
          />
          <MetricCard
            title="Success Rate"
            value={`${((rt.derived?.minuteSuccessRate || 1) * 100).toFixed(1)}%`}
            subtitle="Last minute"
            icon={CheckCircle2}
            trend={rt.derived?.minuteSuccessRate >= 0.95 ? 'up' : 'down'}
          />
          <MetricCard
            title="Cache Hit Rate"
            value={`${((rt.derived?.minuteCacheRate || 0) * 100).toFixed(0)}%`}
            subtitle="Saved API calls"
            icon={Database}
            trend={rt.derived?.minuteCacheRate > 0.3 ? 'up' : undefined}
          />
          <MetricCard
            title="Avg Latency"
            value={`${rt.derived?.minuteAvgLatencyMs || 0}ms`}
            subtitle="Response time"
            icon={Clock}
            trend={rt.derived?.minuteAvgLatencyMs < 500 ? 'up' : 'down'}
          />
        </div>
      )}
      
      {/* Tabs for different views */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="realtime" className="gap-2">
            <Activity className="w-4 h-4" />
            Live Stats
          </TabsTrigger>
          <TabsTrigger value="tools" className="gap-2">
            <Server className="w-4 h-4" />
            Tool Health
          </TabsTrigger>
          <TabsTrigger value="graph" className="gap-2">
            <GitBranch className="w-4 h-4" />
            Dependencies
          </TabsTrigger>
        </TabsList>
        
        {/* Live Stats Tab */}
        <TabsContent value="realtime" className="mt-4">
          <div className="grid md:grid-cols-2 gap-4">
            {/* Hourly Summary */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Last Hour Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Calls</span>
                  <span className="font-medium">{rt?.hour?.total?.toLocaleString() || 0}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Successful</span>
                  <span className="font-medium text-green-500">{rt?.hour?.success?.toLocaleString() || 0}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Failed</span>
                  <span className="font-medium text-red-500">{rt?.hour?.failed || 0}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Cache Hits</span>
                  <span className="font-medium text-blue-500">{rt?.hour?.cacheHits || 0}</span>
                </div>
                <div className="pt-2 border-t">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">Success Rate</span>
                    <span>{((rt?.derived?.hourSuccessRate || 1) * 100).toFixed(1)}%</span>
                  </div>
                  <Progress value={(rt?.derived?.hourSuccessRate || 1) * 100} className="h-2" />
                </div>
              </CardContent>
            </Card>
            
            {/* System Health */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">System Health</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {tm?.summary && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Overall Health</span>
                      <HealthBadge 
                        status={tm.summary.overallHealth >= 80 ? 'healthy' : tm.summary.overallHealth >= 60 ? 'degraded' : 'warning'} 
                        score={tm.summary.overallHealth} 
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="bg-green-500/10 rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-green-500">{tm.summary.healthyCount}</p>
                        <p className="text-xs text-muted-foreground">Healthy</p>
                      </div>
                      <div className="bg-yellow-500/10 rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-yellow-500">{tm.summary.degradedCount}</p>
                        <p className="text-xs text-muted-foreground">Degraded</p>
                      </div>
                      <div className="bg-orange-500/10 rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-orange-500">{tm.summary.warningCount || 0}</p>
                        <p className="text-xs text-muted-foreground">Warning</p>
                      </div>
                      <div className="bg-red-500/10 rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-red-500">{tm.summary.criticalCount}</p>
                        <p className="text-xs text-muted-foreground">Critical</p>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground text-center pt-2">
                      {tm.summary.totalTools} tools monitored
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        {/* Tool Health Tab */}
        <TabsContent value="tools" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Tool Performance ({period})</CardTitle>
                <div className="flex gap-1">
                  {['1h', '24h', '7d'].map(p => (
                    <Button
                      key={p}
                      variant={period === p ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setPeriod(p)}
                    >
                      {p}
                    </Button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="divide-y">
                {tm?.tools?.slice(0, 15).map((tool, idx) => (
                  <ToolRow 
                    key={tool.name || tool.tool || idx} 
                    tool={tool} 
                    onClick={(t) => fetchToolImpact(t)} 
                  />
                ))}
                {(!tm?.tools || tm.tools.length === 0) && (
                  <div className="text-center py-8 text-muted-foreground">
                    No tool data available yet. Start using AI tools to see metrics.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
          
          {/* Tool Detail Panel */}
          {selectedTool && (
            <Card className="mt-4">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{(selectedTool.tool || selectedTool.name || 'Unknown Tool').replace(/_/g, ' ')}</CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedTool(null)}>✕</Button>
                </div>
                <CardDescription>{selectedTool.category}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Success Rate</p>
                    <p className="text-xl font-bold">{(selectedTool.successRate || 0).toFixed(1)}%</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Total Calls</p>
                    <p className="text-xl font-bold">{(selectedTool.calls || selectedTool.total || 0).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Avg Latency</p>
                    <p className="text-xl font-bold">{selectedTool.avgLatencyMs || selectedTool.avgLatency || 0}ms</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Errors</p>
                    <p className="text-xl font-bold text-red-500">{selectedTool.errors || 0}</p>
                  </div>
                </div>
                
                {/* Error Details */}
                {selectedTool.errors > 0 && selectedTool.recentErrors && (
                  <div className="mt-4">
                    <p className="text-sm font-medium mb-2">Recent Errors</p>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {selectedTool.recentErrors.map((err, idx) => (
                        <div key={idx} className="text-xs bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded p-2">
                          <p className="font-mono text-red-600 dark:text-red-400">{err.message || err.error || 'Unknown error'}</p>
                          {err.timestamp && (
                            <p className="text-muted-foreground mt-1">{new Date(err.timestamp).toLocaleString()}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Show fallback message if no error details available */}
                {selectedTool.errors > 0 && !selectedTool.recentErrors && (
                  <div className="mt-4 text-sm text-muted-foreground bg-muted/50 rounded p-3">
                    <p>⚠️ This tool has {selectedTool.errors} error(s) but detailed error information is not available.</p>
                    <p className="mt-1">Check system logs or enable error tracking for more details.</p>
                  </div>
                )}
                
                <div className="grid grid-cols-3 gap-4 text-sm pt-4 border-t">
                  <div>
                    <p className="text-muted-foreground">Impact Score</p>
                    <p className="text-xl font-bold">{selectedTool.impactScore || 0}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Direct Deps</p>
                    <p className="text-xl font-bold">{selectedTool.dependencies?.direct?.length || 0}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Dependents</p>
                    <p className="text-xl font-bold">{selectedTool.dependents?.direct?.length || 0}</p>
                  </div>
                </div>
                
                {selectedTool.affectedChains?.length > 0 && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Used in Chains:</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedTool.affectedChains.map(chain => (
                        <Badge key={chain.name} variant="outline">
                          {chain.displayName} (step {chain.stepIndex + 1}/{chain.totalSteps})
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                
                {selectedTool.dependencies?.direct?.length > 0 && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Depends On:</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedTool.dependencies.direct.map((dep, idx) => (
                        <Badge key={dep || idx} variant="secondary">{(dep || 'Unknown').replace(/_/g, ' ')}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
        
        {/* Dependency Graph Tab */}
        <TabsContent value="graph" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Tool Categories</CardTitle>
              <CardDescription>
                {graphData?.totalTools || 0} tools across {graphData?.totalCategories || 0} categories
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {graphData?.categories && Object.entries(graphData.categories).map(([key, cat]) => (
                  <CategoryNode 
                    key={key} 
                    category={cat.name} 
                    tools={cat.tools || []} 
                    color={cat.color}
                  />
                ))}
              </div>
              
              <div className="mt-6 pt-4 border-t">
                <p className="text-sm text-muted-foreground mb-4">Category Legend:</p>
                <div className="flex flex-wrap gap-3">
                  {graphData?.categories && Object.entries(graphData.categories).map(([key, cat]) => (
                    <div key={key} className="flex items-center gap-2 text-xs">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
                      <span>{cat.name}</span>
                      <span className="text-muted-foreground">({cat.toolCount})</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
